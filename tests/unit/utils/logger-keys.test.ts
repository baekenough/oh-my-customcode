/**
 * Tier-1 check: every logger message key used in `src/` is registered in BOTH locale tables (#1771)
 *
 * `getMessage()` in `src/utils/logger.ts` silently degrades to the raw key when a key is missing
 * from the active locale table, so users see `config.invalid_preserve_path` instead of a message
 * and the call's params are dropped. Nothing coupled the call sites to the tables, so keys were
 * added at call sites over many releases without being registered.
 *
 * Detector (static text scan, comments stripped, string contents masked when locating calls):
 *   1. find the logger import of a file (`import { info as logInfo } from '../utils/logger.js'` or
 *      `import * as log from ...`), mapping local names to `debug|info|warn|error|success`;
 *   2. find every call of those names (`(?<![.\w$])name(`, or `ns.name(` for namespace imports);
 *   3. read the first argument. A plain string (or template without `${}`) directly followed by
 *      `,` or `)` is a literal key; everything else (variable, concatenation, template with a
 *      substitution, no argument) is reported as `non-literal` and never skipped silently;
 *   4. a literal key must look like `area.name` (`KEY_SHAPE`), else it is reported as `not-a-key`
 *      (a sentence used as a key only works through the fallback and is never translated);
 *   5. a literal key is looked up behaviorally through the public logger API (no export of the
 *      private `MESSAGES` table is needed): print it at `error` level with the locale under test
 *      and compare against the raw key. Both `en` and `ko` are checked.
 *
 * Regex literals (`/^["']|["']$/g`) are recognized by the lexer (expression-start heuristic, see
 * `regexEnd`) so a quote inside one cannot derail string masking; a per-file guard test compares the
 * extractor with an independent naive count to catch any remaining lexer drift (#1769).
 *
 * Known limitations: calls through an aliased variable (`const l = info`) are not seen; only `src/**\/*.ts` is
 * scanned (`src/utils/logger.ts` itself is excluded). The check is level-agnostic by construction,
 * so debug-only keys are covered too.
 *
 * Not asserted on purpose: that every table key is used (some are unused today) and the table size
 * (`logger.test.ts` adds keys to the process-wide table through `addMessages`).
 */

import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createLogger,
  getLoggerOptions,
  type LoggerOptions,
  error as logError,
} from '../../../src/utils/logger.js';

// ---------------------------------------------------------------------------
// Lexical helpers (copied from child-process-mock-hygiene.test.ts; not imported across tests)
// ---------------------------------------------------------------------------

/** If a string/template literal starts at `index`, return the position after its closing quote; else `index`. */
function stringEnd(code: string, index: number): number {
  const quote = code.charAt(index);
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return index;
  }
  let i = index + 1;
  while (i < code.length && code.charAt(i) !== quote) {
    i += code.charAt(i) === '\\' ? 2 : 1;
  }
  return Math.min(i + 1, code.length);
}

/** Words after which a `/` begins a regex literal rather than a division */
const REGEX_PRECEDING_WORDS: ReadonlySet<string> = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'else',
  'do',
  'void',
  'delete',
  'throw',
  'new',
  'yield',
  'await',
]);

/** Characters after which a `/` is in expression-start position (so it opens a regex literal) */
const REGEX_PRECEDING_CHARS = '(,=:[!&|?{};}';

/** True when the `/` at `index` sits in an expression-start position. */
function isRegexPosition(code: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code.charAt(i))) {
    i--;
  }
  if (i < 0) {
    return true; // start of file (leading whitespace skipped)
  }
  const prev = code.charAt(i);
  if (REGEX_PRECEDING_CHARS.includes(prev)) {
    return true;
  }
  let start = i;
  while (start >= 0 && /[\w$]/.test(code.charAt(start))) {
    start--;
  }
  return REGEX_PRECEDING_WORDS.has(code.slice(start + 1, i + 1));
}

/** Position of the closing `/` of a regex body starting at `from`, or -1 (newline / end of input). */
function regexBodyClose(code: string, from: number): number {
  let i = from;
  let inClass = false;
  while (i < code.length && code.charAt(i) !== '\n') {
    const ch = code.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '/' && !inClass) {
      return i;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === ']') {
      inClass = false;
    }
    i++;
  }
  return -1;
}

/**
 * If a regex literal starts at `index`, return the position after its closing `/` and flags; else
 * `index`. A `/` in expression-start position opens a regex that runs to the next unescaped `/`
 * outside a character class (`[...]`); a newline before the close means it was not a regex.
 */
function regexEnd(code: string, index: number): number {
  if (code.charAt(index) !== '/') {
    return index;
  }
  const next = code.charAt(index + 1);
  if (next === '/' || next === '*' || next === '' || !isRegexPosition(code, index)) {
    return index;
  }
  const close = regexBodyClose(code, index + 1);
  if (close === -1) {
    return index;
  }
  let end = close + 1;
  while (end < code.length && /[a-z]/i.test(code.charAt(end))) {
    end++;
  }
  return end;
}

/** If a comment starts at `index`, return the position after its end; else `index`. */
function commentEnd(code: string, index: number): number {
  const pair = code.slice(index, index + 2);
  if (pair === '//') {
    const newline = code.indexOf('\n', index);
    return newline === -1 ? code.length : newline;
  }
  if (pair === '/*') {
    const close = code.indexOf('*/', index + 2);
    return close === -1 ? code.length : close + 2;
  }
  return index;
}

/**
 * Replace comments with spaces (newlines are preserved so line numbers stay valid).
 * A `//` inside a string or template literal is not treated as a comment.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const commentStop = commentEnd(source, i);
    if (commentStop > i) {
      out += source.slice(i, commentStop).replace(/[^\n]/g, ' ');
      i = commentStop;
      continue;
    }
    const regexStop = regexEnd(source, i);
    if (regexStop > i) {
      out += source.slice(i, regexStop);
      i = regexStop;
      continue;
    }
    const stringStop = stringEnd(source, i);
    if (stringStop > i) {
      out += source.slice(i, stringStop);
      i = stringStop;
      continue;
    }
    out += source.charAt(i);
    i++;
  }
  return out;
}

/** Blank out string/template contents (quotes and newlines kept) so calls inside strings are not seen. */
function maskStrings(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const regexStop = regexEnd(code, i);
    if (regexStop > i) {
      out += code.slice(i, regexStop).replace(/[^\n]/g, ' ');
      i = regexStop;
      continue;
    }
    const stringStop = stringEnd(code, i);
    if (stringStop > i) {
      const literal = code.slice(i, stringStop);
      out += `${literal.charAt(0)}${literal.slice(1, -1).replace(/[^\n]/g, ' ')}${literal.slice(-1)}`;
      i = stringStop;
      continue;
    }
    out += code.charAt(i);
    i++;
  }
  return out;
}

function lineOf(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (code.charAt(i) === '\n') {
      line++;
    }
  }
  return line;
}

function skipSpaces(code: string, index: number): number {
  let i = index;
  while (i < code.length && /\s/.test(code.charAt(i))) {
    i++;
  }
  return i;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

type KeyFunction = 'debug' | 'info' | 'warn' | 'error' | 'success';

const KEY_FUNCTIONS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error', 'success']);

function isKeyFunction(name: string): name is KeyFunction {
  return KEY_FUNCTIONS.has(name);
}

/** `area.name` / `area.sub_name`; sentences and bare words are not keys */
const KEY_SHAPE = /^[a-z][a-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

const LOGGER_IMPORT =
  /import\s*(?:\{([^}]*)\}|\*\s*as\s+([A-Za-z_$][\w$]*))\s*from\s*['"](?:\.\.?\/)+(?:utils\/)?logger(?:\.js)?['"]/g;

const SPECIFIER = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;

interface LoggerBindings {
  /** local name -> imported logger function */
  named: Map<string, KeyFunction>;
  /** local names of `import * as NS` */
  namespaces: string[];
}

/** Parse one import specifier (`info` or `info as logInfo`); null for type-only or non-key imports. */
function parseSpecifier(raw: string): { local: string; imported: KeyFunction } | null {
  const parsed = SPECIFIER.exec(raw.trim());
  const imported = parsed?.[1] ?? '';
  if (parsed === null || !isKeyFunction(imported)) {
    return null; // also skips `type X` (does not match SPECIFIER)
  }
  return { local: parsed[2] ?? imported, imported };
}

function collectBindings(code: string): LoggerBindings {
  const bindings: LoggerBindings = { named: new Map(), namespaces: [] };
  for (const match of code.matchAll(LOGGER_IMPORT)) {
    if (match[2] !== undefined) {
      bindings.namespaces.push(match[2]);
      continue;
    }
    for (const raw of (match[1] ?? '').split(',')) {
      const specifier = parseSpecifier(raw);
      if (specifier !== null) {
        bindings.named.set(specifier.local, specifier.imported);
      }
    }
  }
  return bindings;
}

export interface LogKeyCall {
  level: KeyFunction;
  /** 1-based line of the call */
  line: number;
  kind: 'literal' | 'non-literal';
  /** Literal key body, or the first ~60 characters of a non-literal argument */
  key: string;
}

/** Parse the first argument of a call whose open paren ends just before `from`. */
function parseFirstArg(code: string, from: number): Pick<LogKeyCall, 'kind' | 'key'> {
  const start = skipSpaces(code, from);
  const first = code.charAt(start);
  if (first === "'" || first === '"' || first === '`') {
    const after = stringEnd(code, start);
    const body = code.slice(start + 1, after - 1);
    const closed = after - 1 > start && code.charAt(after - 1) === first;
    const plain = !(first === '`' && body.includes('${'));
    const terminator = code.charAt(skipSpaces(code, after));
    if (closed && plain && (terminator === ',' || terminator === ')')) {
      return { kind: 'literal', key: body };
    }
  }
  return {
    kind: 'non-literal',
    key: code
      .slice(start, start + 60)
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

/** Every logger call with its first-argument classification, in source order. */
export function extractLogKeyCalls(source: string): LogKeyCall[] {
  const code = stripComments(source);
  const bindings = collectBindings(code);
  const masked = maskStrings(code);
  const calls: LogKeyCall[] = [];

  const collect = (opener: RegExp, level: (match: RegExpExecArray) => KeyFunction): void => {
    let match: RegExpExecArray | null = opener.exec(masked);
    while (match !== null) {
      const arg = parseFirstArg(code, match.index + match[0].length);
      calls.push({ level: level(match), line: lineOf(masked, match.index), ...arg });
      match = opener.exec(masked);
    }
  };

  for (const [local, imported] of bindings.named) {
    collect(new RegExp(`(?<![.\\w$])${escapeRegExp(local)}\\s*\\(`, 'g'), () => imported);
  }
  for (const namespace of bindings.namespaces) {
    const opener = new RegExp(
      `(?<![.\\w$])${escapeRegExp(namespace)}\\s*\\.\\s*(debug|info|warn|error|success)\\s*\\(`,
      'g'
    );
    collect(opener, (match) => (match[1] ?? 'info') as KeyFunction);
  }
  return calls.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// Behavioral lookup through the public logger API
// ---------------------------------------------------------------------------

type Locale = LoggerOptions['locale'];

const LOCALES: ReadonlyArray<Locale> = ['en', 'ko'];

/**
 * True when `key` has a message in `locale`'s table. Prints the key at `error` level (always
 * shown, so the level of the real call site does not matter) and compares against the raw key.
 * Logger options and `console.error` are restored in `finally`.
 */
function isRegistered(key: string, locale: Locale): boolean {
  const saved = getLoggerOptions();
  const spy = spyOn(console, 'error').mockImplementation(() => {});
  try {
    createLogger({ locale, level: 'error', colors: false, timestamps: false, prefix: undefined });
    logError(key);
    const printed = spy.mock.calls.at(-1)?.[0];
    if (typeof printed !== 'string') {
      throw new Error(`logger printed nothing for key "${key}"`);
    }
    return printed !== `[ERROR] ${key}`;
  } finally {
    spy.mockRestore();
    createLogger({ ...saved, prefix: saved.prefix, timestamps: saved.timestamps });
  }
}

// ---------------------------------------------------------------------------
// Classification and allowlist
// ---------------------------------------------------------------------------

export type FindingReason = 'missing-en' | 'missing-ko' | 'not-a-key' | 'non-literal';

export interface KeyFinding {
  file: string;
  line: number;
  key: string;
  reason: FindingReason;
}

export type RegistrationLookup = (key: string, locale: Locale) => boolean;

/** Turn extracted calls into findings: non-literal, malformed, and unregistered keys per locale. */
export function classifyCalls(
  file: string,
  calls: ReadonlyArray<LogKeyCall>,
  lookup: RegistrationLookup = isRegistered
): KeyFinding[] {
  const findings: KeyFinding[] = [];
  for (const call of calls) {
    const base = { file, line: call.line, key: call.key };
    if (call.kind === 'non-literal') {
      findings.push({ ...base, reason: 'non-literal' });
    } else if (!KEY_SHAPE.test(call.key)) {
      findings.push({ ...base, reason: 'not-a-key' });
    } else {
      for (const locale of LOCALES) {
        if (!lookup(call.key, locale)) {
          findings.push({ ...base, reason: `missing-${locale}` });
        }
      }
    }
  }
  return findings;
}

export interface AllowedKey {
  /** Key (or non-literal argument text) as reported by the scanner */
  key: string;
  /** Why this key may stay unregistered. Must be non-empty. */
  reason: string;
}

/**
 * Exemptions from the invariant. Intentionally EMPTY: every logger key used in src must be
 * registered in both locale tables. Do not add entries to make a red scan green; register the
 * key in `src/utils/logger.ts` (en + ko) instead.
 */
export const ALLOWED_KEYS: ReadonlyArray<AllowedKey> = [];

/** Problems with the allowlist itself: entries without a reason, and stale entries. */
export function findAllowlistProblems(
  allowlist: ReadonlyArray<AllowedKey>,
  findings: ReadonlyArray<{ key: string }>
): string[] {
  const problems: string[] = [];
  for (const entry of allowlist) {
    if (entry.reason.trim() === '') {
      problems.push(`no-reason: ${entry.key}`);
    }
    if (!findings.some((f) => f.key === entry.key)) {
      problems.push(`stale: ${entry.key}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Unit fixtures (inline strings, positive/negative pairs)
// ---------------------------------------------------------------------------

const LOGGER_IMPORT_LINE = "import { warn } from '../utils/logger.js';";

/** Compact `level:key` view of the extractor result */
function summarize(source: string): string[] {
  return extractLogKeyCalls(source).map((c) => `${c.level}:${c.kind}:${c.key}`);
}

describe('extractLogKeyCalls (fixtures)', () => {
  it('extracts a literal key with level and line (positive)', () => {
    const src = [LOGGER_IMPORT_LINE, "warn('fake.missing_key', { a: 'b' });"].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([
      { level: 'warn', line: 2, kind: 'literal', key: 'fake.missing_key' },
    ]);
  });

  it('extracts double-quoted and substitution-free template literal keys (positive)', () => {
    const src = [
      "import { info, debug } from '../utils/logger.js';",
      'info("fake.double");',
      'debug(`fake.template`);',
    ].join('\n');
    expect(summarize(src)).toEqual(['info:literal:fake.double', 'debug:literal:fake.template']);
  });

  it('extracts a key from a multi-line call (positive)', () => {
    const src = [LOGGER_IMPORT_LINE, 'warn(', "  'fake.multi_line',", '  { path: p }', ');'].join(
      '\n'
    );
    expect(extractLogKeyCalls(src)).toEqual([
      { level: 'warn', line: 2, kind: 'literal', key: 'fake.multi_line' },
    ]);
  });

  it('extracts calls through an aliased import and maps them to the imported level (positive)', () => {
    const src = [
      "import { info as logInfo, success } from '../../utils/logger.js';",
      "logInfo('fake.aliased_key');",
      "success('fake.success_key');",
    ].join('\n');
    expect(summarize(src)).toEqual([
      'info:literal:fake.aliased_key',
      'success:literal:fake.success_key',
    ]);
  });

  it('extracts calls through a namespace import (positive)', () => {
    const src = [
      "import * as logger from '../utils/logger.js';",
      "logger.error('fake.namespace_key');",
    ].join('\n');
    expect(summarize(src)).toEqual(['error:literal:fake.namespace_key']);
  });

  it('extracts several calls in source order with correct lines (positive)', () => {
    const src = [
      "import { debug, warn } from './utils/logger.js';",
      '',
      "warn('fake.second');",
      "debug('fake.first');",
    ].join('\n');
    expect(extractLogKeyCalls(src).map((c) => [c.line, c.key])).toEqual([
      [3, 'fake.second'],
      [4, 'fake.first'],
    ]);
  });

  it('reports a variable argument as non-literal instead of skipping it (positive)', () => {
    const src = [LOGGER_IMPORT_LINE, 'warn(someVar, { a: 1 });'].join('\n');
    expect(summarize(src)).toEqual(['warn:non-literal:someVar, { a: 1 });']);
  });

  it('reports a template literal with a substitution as non-literal (positive)', () => {
    const src = [LOGGER_IMPORT_LINE, `warn(\`fake.\${name}\`);`].join('\n');
    expect(extractLogKeyCalls(src).map((c) => c.kind)).toEqual(['non-literal']);
  });

  it('reports concatenation, conditionals and zero-argument calls as non-literal (positive)', () => {
    const concat = [LOGGER_IMPORT_LINE, "warn('fake.' + name);"].join('\n');
    const conditional = [LOGGER_IMPORT_LINE, "warn(ok ? 'fake.a' : 'fake.b');"].join('\n');
    const empty = [LOGGER_IMPORT_LINE, 'warn();'].join('\n');
    for (const src of [concat, conditional, empty]) {
      expect(extractLogKeyCalls(src).map((c) => c.kind)).toEqual(['non-literal']);
    }
  });

  it('ignores a key mentioned in line and block comments (negative)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "// warn('fake.line_comment');",
      '/*',
      " * warn('fake.block_comment');",
      ' */',
      'const x = 1;',
    ].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });

  it('ignores a call that only appears inside a string (negative)', () => {
    const src = [LOGGER_IMPORT_LINE, 'const s = "warn(\'fake.in_string\')";'].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });

  it('does not treat // inside a string as a comment', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "const url = 'http://example.com'; warn('fake.after_url');",
    ].join('\n');
    expect(summarize(src)).toEqual(['warn:literal:fake.after_url']);
  });

  it('finds a call after the regex literal /^["\']|["\']$/g (updater.ts pattern, positive)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "const trimQuotes = (v: string) => v.replace(/^[\"']|[\"']$/g, '');",
      "warn('fake.after_regex');",
    ].join('\n');
    expect(summarize(src)).toEqual(['warn:literal:fake.after_regex']);
  });

  it('does not treat a division as a regex literal (negative)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "const ratio = a / b; const other = c / d; const s = 'x'; warn('fake.after_division');",
      "const half = (a + b) / 2; warn('fake.after_paren_division');",
    ].join('\n');
    expect(summarize(src)).toEqual([
      'warn:literal:fake.after_division',
      'warn:literal:fake.after_paren_division',
    ]);
  });

  it('handles a quote inside a regex character class and an escaped slash (positive)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "const a = /[\"'/]x/.test(v); warn('fake.after_class');",
      "const b = /a\\/b'/u.test(v); warn('fake.after_escape');",
    ].join('\n');
    expect(summarize(src)).toEqual([
      'warn:literal:fake.after_class',
      'warn:literal:fake.after_escape',
    ]);
  });

  it('does not see a logger call inside a regex literal (negative)', () => {
    const src = [LOGGER_IMPORT_LINE, "const re = /warn\\('fake.in_regex'\\)/;"].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });

  it('ignores console methods, member calls and unrelated functions (negative)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "console.warn('fake.console');",
      "obj.warn('fake.member');",
      "myWarn('fake.prefixed');",
    ].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });

  it('ignores a file without the logger import even if it defines warn (negative)', () => {
    const src = ["import { warn } from 'node:console';", "warn('fake.other_logger');"].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });

  it('ignores logger functions that do not take message keys and type-only imports (negative)', () => {
    const src = [
      "import { raw, progress, type LogLevel } from '../utils/logger.js';",
      "import type { warn } from '../utils/logger.js';",
      "raw('info', 'fake.raw');",
      "progress(1, 2, 'fake.progress');",
      "warn('fake.type_only');",
    ].join('\n');
    expect(extractLogKeyCalls(src)).toEqual([]);
  });
});

describe('classifyCalls (fixtures)', () => {
  const lookup: RegistrationLookup = (key, locale) =>
    key === 'fake.both' || (key === 'fake.en_only' && locale === 'en');
  const calls = (...keys: string[]): LogKeyCall[] =>
    keys.map((key, i) => ({ level: 'info', line: i + 1, kind: 'literal', key }));

  it('accepts a key registered in both locales (negative)', () => {
    expect(classifyCalls('f.ts', calls('fake.both'), lookup)).toEqual([]);
  });

  it('reports a key missing in both locales once per locale (positive)', () => {
    expect(classifyCalls('f.ts', calls('fake.none'), lookup).map((f) => f.reason)).toEqual([
      'missing-en',
      'missing-ko',
    ]);
  });

  it('reports a key registered only in en as missing-ko (positive)', () => {
    expect(classifyCalls('f.ts', calls('fake.en_only'), lookup)).toEqual([
      { file: 'f.ts', line: 1, key: 'fake.en_only', reason: 'missing-ko' },
    ]);
  });

  it('reports a sentence used as a key as not-a-key without a locale lookup (positive)', () => {
    const findings = classifyCalls('f.ts', calls('A sentence used as key'), () => true);
    expect(findings.map((f) => f.reason)).toEqual(['not-a-key']);
  });

  it('reports non-literal calls (positive)', () => {
    const findings = classifyCalls(
      'f.ts',
      [{ level: 'warn', line: 7, kind: 'non-literal', key: 'someVar' }],
      () => true
    );
    expect(findings).toEqual([{ file: 'f.ts', line: 7, key: 'someVar', reason: 'non-literal' }]);
  });
});

describe('isRegistered (behavioral lookup fixtures)', () => {
  const before = getLoggerOptions();

  afterEach(() => {
    createLogger({ ...before, prefix: before.prefix, timestamps: before.timestamps });
  });

  it('finds a table key in en and ko (negative)', () => {
    expect(isRegistered('update.failed', 'en')).toBe(true);
    expect(isRegistered('update.failed', 'ko')).toBe(true);
  });

  it('does not find an unknown key in either locale (positive)', () => {
    expect(isRegistered('fake.missing_key', 'en')).toBe(false);
    expect(isRegistered('fake.missing_key', 'ko')).toBe(false);
  });

  it('leaves logger options unchanged', () => {
    isRegistered('update.failed', 'ko');
    expect(getLoggerOptions()).toEqual(before);
  });
});

describe('findAllowlistProblems (meta-test fixtures)', () => {
  const findings = [{ key: 'fake.still_missing' }];

  it('accepts an entry with a reason that still matches a finding (negative)', () => {
    const entry = { key: 'fake.still_missing', reason: 'tracked in #0' };
    expect(findAllowlistProblems([entry], findings)).toEqual([]);
  });

  it('reports a stale entry that no longer matches any finding (positive)', () => {
    const entry = { key: 'fake.registered_now', reason: 'old' };
    expect(findAllowlistProblems([entry], findings)).toEqual(['stale: fake.registered_now']);
  });

  it('reports an entry with an empty reason (positive)', () => {
    const entry = { key: 'fake.still_missing', reason: '  ' };
    expect(findAllowlistProblems([entry], findings)).toEqual(['no-reason: fake.still_missing']);
  });
});

// ---------------------------------------------------------------------------
// Repository scan (git-tracked src files)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const LOGGER_PATH = 'src/utils/logger.ts';

function listTrackedSourceFiles(): string[] {
  // A parent's absolute index can select a different corpus despite cwd.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  // Use Bun.spawnSync, not child_process, so module mocks cannot affect the scan
  const result = Bun.spawnSync(['git', 'ls-files', '--', 'src'], { cwd: REPO_ROOT, env });
  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  }
  return result.stdout
    .toString()
    .split('\n')
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => file !== LOGGER_PATH); // defines the functions; has no logger import
}

interface RepoScan {
  scanned: number;
  calls: number;
  /** All findings, before the allowlist is applied */
  findings: KeyFinding[];
}

function scanRepository(): RepoScan {
  const findings: KeyFinding[] = [];
  let scanned = 0;
  let calls = 0;
  for (const file of listTrackedSourceFiles()) {
    const fullPath = join(REPO_ROOT, file);
    if (!existsSync(fullPath)) {
      continue; // tracked but deleted in the working tree
    }
    scanned++;
    const extracted = extractLogKeyCalls(readFileSync(fullPath, 'utf-8'));
    calls += extracted.length;
    findings.push(...classifyCalls(file, extracted));
  }
  return { scanned, calls, findings };
}

/** `key (first file:line)` per distinct key, sorted — the input list for registering keys */
function distinctOffenders(findings: ReadonlyArray<KeyFinding>): string[] {
  const first = new Map<string, KeyFinding>();
  for (const f of findings) {
    if (!first.has(f.key)) {
      first.set(f.key, f);
    }
  }
  return [...first.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => `${f.key} (${f.file}:${f.line})`);
}

describe('logger message keys (repository scan)', () => {
  it('scans this repository source corpus even with inherited Git state', () => {
    expect(listTrackedSourceFiles()).toContain('src/utils/fs.ts');
  });

  const scan = scanRepository();
  const active = scan.findings.filter((f) => !ALLOWED_KEYS.some((a) => a.key === f.key));

  const expectNoFindings = (reason: FindingReason, advice: string): void => {
    const offenders = active.filter((f) => f.reason === reason);
    expect(scan.scanned).toBeGreaterThan(0);
    expect(scan.calls).toBeGreaterThan(0);
    expect(
      distinctOffenders(offenders),
      `${offenders.length} call site(s) / ${new Set(offenders.map((f) => f.key)).size} distinct key(s) [${reason}] (#1771). ${advice}`
    ).toEqual([]);
  };

  it('every logger key used in src is registered in the en table', () => {
    expectNoFindings('missing-en', 'Register the key in MESSAGES.en of src/utils/logger.ts.');
  });

  it('every logger key used in src is registered in the ko table', () => {
    expectNoFindings('missing-ko', 'Register the key in MESSAGES.ko of src/utils/logger.ts.');
  });

  it('every logger call in src uses a literal key shaped like area.name', () => {
    const offenders = active.filter((f) => f.reason === 'non-literal' || f.reason === 'not-a-key');
    expect(scan.scanned).toBeGreaterThan(0);
    expect(
      offenders.map((f) => `${f.file}:${f.line} ${f.key} [${f.reason}]`),
      'logger calls must pass a literal registered key (a variable, concatenation, or sentence cannot be checked)'
    ).toEqual([]);
  });

  it('the allowlist has no entries without a reason and no stale entries', () => {
    expect(findAllowlistProblems(ALLOWED_KEYS, scan.findings)).toEqual([]);
  });
});

/**
 * Independent naive count of `debug|info|warn|error|success('...` openers (standalone name, not a
 * member call) on lines that are not comment lines. Deliberately shares no lexer code with the
 * extractor, so a masking/stripping bug in one is exposed by disagreement with the other.
 */
function naiveLiteralCallCount(source: string): number {
  const opener = /(?<![.\w$])(?:debug|info|warn|error|success)\(\s*['"]/g;
  let count = 0;
  let inBlock = false;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (inBlock) {
      inBlock = !trimmed.includes('*/');
      continue;
    }
    if (trimmed.startsWith('//')) {
      continue;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      continue;
    }
    count += line.match(opener)?.length ?? 0;
  }
  return count;
}

/** Per tracked src file whose extractor count (quote-led first argument) differs from the naive one. */
function extractorDisagreements(): string[] {
  const out: string[] = [];
  for (const file of listTrackedSourceFiles()) {
    const fullPath = join(REPO_ROOT, file);
    if (!existsSync(fullPath)) {
      continue;
    }
    const source = readFileSync(fullPath, 'utf-8');
    const extracted = extractLogKeyCalls(source).length;
    const naive = naiveLiteralCallCount(source);
    if (extracted !== naive) {
      out.push(`${file}: extractor=${extracted} naive=${naive}`);
    }
  }
  return out;
}

describe('extractor vs naive count (per-file guard, #1769)', () => {
  it('fixture: a regex literal with quotes does not hide a later call (guard sees agreement)', () => {
    const src = [
      LOGGER_IMPORT_LINE,
      "const t = (v: string) => v.replace(/^[\"']|[\"']$/g, '');",
      "warn('fake.after_regex');",
    ].join('\n');
    expect(extractLogKeyCalls(src).length).toBe(naiveLiteralCallCount(src));
  });

  it('every tracked src file: extracted logger calls equal the naive call count', () => {
    expect(
      extractorDisagreements(),
      'the extractor lexer lost or invented calls in these files (masking drift); fix the lexer, not the guard'
    ).toEqual([]);
  });
});

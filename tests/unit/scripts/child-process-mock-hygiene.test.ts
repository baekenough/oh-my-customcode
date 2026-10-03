/**
 * Tier-1 hygiene check: leaked `mock.module()` targets (#1760, widened by #1772)
 *
 * Bun's `mock.module()` persists across file boundaries within one process and is NOT undone
 * by `mock.restore()`. A test file that mocks a module without re-registering the real module
 * in `afterAll` leaks the mock into every file that runs later, so failures show up only in
 * the full suite and only in some orders. A "capture the original, then restore" pattern is
 * itself invalid if the capture happens after an earlier file already leaked, so the invariant
 * must hold for every mock in the suite (Adversarial M1).
 *
 * Invariant (every `mock.module(<spec>)` target in every tracked test file):
 *   1. capture the real module BEFORE the first installing mock:
 *        const realX = { ...(await import(SPEC)) };
 *   2. re-register the captured value inside an `afterAll(...)` call:
 *        afterAll(() => { mock.module(SPEC, () => realX); });
 *
 * The scan is a static text scan (comments stripped, string-aware). Fail-closed rules:
 *   - a first argument that is neither a plain string literal nor a bare identifier is reported
 *     (`dynamic-spec` for a template literal with a substitution, `unparsable-spec` for
 *     concatenation, `join(...)`, `require.resolve(...)`, ...) and never skipped silently (R6);
 *   - restores performed in `afterEach` or through a helper function (`afterAll(restoreAll)`)
 *     are NOT recognised and are reported as `no-restore`. These are known, intentional
 *     false positives: the inline `afterAll` pattern above is the only supported form.
 * Known false negative: an aliased `mock.module` (`const m = mock.module`) is not seen.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export interface MockViolation {
  /** 1-based line of the first mock registration without restore */
  line: number;
}

export type ViolationReason = 'no-capture' | 'no-restore' | 'dynamic-spec' | 'unparsable-spec';

export interface ModuleMockViolation {
  /** Spec key: `node:` prefix stripped, `<ident:NAME>` for identifiers, `<dynamic>`/`<unparsable>` */
  spec: string;
  /** 1-based line of the first installing mock (or of the unparsable call) */
  line: number;
  reason: ViolationReason;
}

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
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const commentStop = commentEnd(source, i);
    if (commentStop > i) {
      out += source.slice(i, commentStop).replace(/[^\n]/g, ' ');
      i = commentStop;
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

/** Position after the closing paren matching the open paren just before `from`. Parens inside strings are ignored. */
function closingParenEnd(code: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < code.length && depth > 0) {
    const stringStop = stringEnd(code, i);
    if (stringStop > i) {
      i = stringStop;
      continue;
    }
    const ch = code.charAt(i);
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    i++;
  }
  return i;
}

/** Paren ranges [start, end) of every `afterAll(` call */
function findAfterAllRanges(code: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const opener = /\bafterAll\s*\(/g;
  let match: RegExpExecArray | null = opener.exec(code);
  while (match !== null) {
    ranges.push([match.index, closingParenEnd(code, match.index + match[0].length)]);
    match = opener.exec(code);
  }
  return ranges;
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

function normalizeSpec(spec: string): string {
  return spec.startsWith('node:') ? spec.slice('node:'.length) : spec;
}

type SpecKind = 'literal' | 'identifier' | 'dynamic' | 'unparsable';

interface SpecArg {
  kind: SpecKind;
  key: string;
  /** Index of the `,` or `)` that terminates the first argument */
  end: number;
}

const IDENTIFIER_AT = /[A-Za-z_$][\w$]*/y;

/**
 * Parse the first argument of a call whose open paren ends just before `from`.
 * Anything that is not a plain string literal, a template literal without substitutions,
 * or a bare identifier directly followed by `,` or `)` is `unparsable` (fail-closed, R6).
 */
function parseSpecArg(code: string, from: number): SpecArg {
  const unparsable: SpecArg = { kind: 'unparsable', key: '<unparsable>', end: from };
  const start = skipSpaces(code, from);
  const first = code.charAt(start);
  let kind: SpecKind;
  let key: string;
  let after: number;
  if (first === "'" || first === '"' || first === '`') {
    after = stringEnd(code, start);
    const body = code.slice(start + 1, after - 1);
    const dynamic = first === '`' && body.includes('${');
    kind = dynamic ? 'dynamic' : 'literal';
    key = dynamic ? '<dynamic>' : normalizeSpec(body);
  } else {
    IDENTIFIER_AT.lastIndex = start;
    const ident = IDENTIFIER_AT.exec(code);
    if (ident === null) {
      return unparsable;
    }
    after = start + ident[0].length;
    kind = 'identifier';
    key = `<ident:${ident[0]}>`;
  }
  const end = skipSpaces(code, after);
  const terminator = code.charAt(end);
  return terminator === ',' || terminator === ')' ? { kind, key, end } : unparsable;
}

interface MockCall {
  index: number;
  line: number;
  arg: SpecArg;
  /** Identifier returned by a `() => NAME` factory, else null */
  returned: string | null;
  /** True when the call lies inside an `afterAll(...)` range */
  restore: boolean;
}

function returnedIdentifier(code: string, commaIndex: number): string | null {
  if (code.charAt(commaIndex) !== ',') {
    return null;
  }
  const factory = /,\s*\(\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/y;
  factory.lastIndex = commaIndex;
  return factory.exec(code)?.[1] ?? null;
}

function collectMockCalls(code: string): MockCall[] {
  const ranges = findAfterAllRanges(code);
  const calls: MockCall[] = [];
  const opener = /\bmock\.module\s*\(/g;
  let match: RegExpExecArray | null = opener.exec(code);
  while (match !== null) {
    const index = match.index;
    const arg = parseSpecArg(code, index + match[0].length);
    calls.push({
      index,
      line: lineOf(code, index),
      arg,
      returned: returnedIdentifier(code, arg.end),
      restore: ranges.some(([start, end]) => index > start && index < end),
    });
    match = opener.exec(code);
  }
  return calls;
}

interface Capture {
  index: number;
  name: string;
  key: string;
}

/** `NAME = { ...(await import(SPEC)) }` captures (const/let and parens optional) */
function collectCaptures(code: string): Capture[] {
  const captures: Capture[] = [];
  const opener = /\b([A-Za-z_$][\w$]*)\s*=\s*\{\s*\.\.\.\s*\(?\s*await\s+import\(/g;
  let match: RegExpExecArray | null = opener.exec(code);
  while (match !== null) {
    const arg = parseSpecArg(code, match.index + match[0].length);
    if (arg.kind === 'literal' || arg.kind === 'identifier') {
      captures.push({ index: match.index, name: match[1] ?? '', key: arg.key });
    }
    match = opener.exec(code);
  }
  return captures;
}

/** Evaluate "no restore at all" first, then "no capture before the mock", then restore linkage. */
function restoreFailure(
  spec: string,
  first: MockCall,
  restores: MockCall[],
  captures: Capture[]
): 'no-restore' | 'no-capture' | null {
  if (restores.length === 0) {
    return 'no-restore';
  }
  const names = new Set(
    captures.filter((c) => c.key === spec && c.index < first.index).map((c) => c.name)
  );
  if (names.size === 0) {
    return 'no-capture';
  }
  const linked = restores.some((r) => r.returned !== null && names.has(r.returned));
  return linked ? null : 'no-restore';
}

/**
 * Report every `mock.module(<spec>)` target that is not captured before mocking and
 * re-registered with the captured value inside `afterAll`. One violation per spec.
 */
export function findModuleMockViolations(source: string): ModuleMockViolation[] {
  const code = stripComments(source);
  const captures = collectCaptures(code);
  const violations: ModuleMockViolation[] = [];
  const bySpec = new Map<string, MockCall[]>();

  for (const call of collectMockCalls(code)) {
    if (call.arg.kind === 'dynamic' || call.arg.kind === 'unparsable') {
      const reason = call.arg.kind === 'dynamic' ? 'dynamic-spec' : 'unparsable-spec';
      violations.push({ spec: call.arg.key, line: call.line, reason });
      continue;
    }
    bySpec.set(call.arg.key, [...(bySpec.get(call.arg.key) ?? []), call]);
  }

  for (const [spec, calls] of bySpec) {
    const first = calls.find((c) => !c.restore);
    if (first === undefined) {
      continue; // restore-only: nothing installed in this file
    }
    const reason = restoreFailure(
      spec,
      first,
      calls.filter((c) => c.restore),
      captures
    );
    if (reason !== null) {
      violations.push({ spec, line: first.line, reason });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

/**
 * Backward-compatible #1760 view: violations for `child_process` / `node:child_process` only.
 */
export function findUnrestoredChildProcessMocks(source: string): MockViolation[] {
  return findModuleMockViolations(source)
    .filter((v) => v.spec === 'child_process')
    .map((v) => ({ line: v.line }));
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export interface AllowedUnrestored {
  /** Repo-relative path of the test file */
  file: string;
  /** Spec key as reported by the scanner (`node:` prefix stripped) */
  spec: string;
  /** Why this (file, spec) pair may stay unrestored. Must be non-empty. */
  reason: string;
}

/**
 * Exemptions from the invariant. Intentionally EMPTY: every current mock target is a shared
 * `src/` module or a Node builtin, so no legitimate exemption exists. Do not add entries to
 * make a red scan green; fix the leaking file instead (capture + `afterAll` re-register).
 */
export const ALLOWED_UNRESTORED: ReadonlyArray<AllowedUnrestored> = [];

interface RepoViolation extends ModuleMockViolation {
  file: string;
}

/** Problems with the allowlist itself: entries without a reason, and stale entries. */
export function findAllowlistProblems(
  allowlist: ReadonlyArray<AllowedUnrestored>,
  violations: ReadonlyArray<{ file: string; spec: string }>
): string[] {
  const problems: string[] = [];
  for (const entry of allowlist) {
    if (entry.reason.trim() === '') {
      problems.push(`no-reason: ${entry.file} ${entry.spec}`);
    }
    const stillViolates = violations.some((v) => v.file === entry.file && v.spec === entry.spec);
    if (!stillViolates) {
      problems.push(`stale: ${entry.file} ${entry.spec}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Unit fixtures (inline strings, positive/negative pairs)
// ---------------------------------------------------------------------------

/** Compact `spec:reason` view of the scanner result */
function summarize(source: string): string[] {
  return findModuleMockViolations(source).map((v) => `${v.spec}:${v.reason}`);
}

describe('findModuleMockViolations (fixtures)', () => {
  it('reports a mock without any afterAll restore (positive)', () => {
    const src = ["mock.module('../src/core/x.js', () => ({}));"].join('\n');
    expect(findModuleMockViolations(src)).toEqual([
      { spec: '../src/core/x.js', line: 1, reason: 'no-restore' },
    ]);
  });

  it('reports when afterAll exists but does not re-register this spec (positive)', () => {
    const src = [
      "const realX = { ...(await import('../src/core/x.js')) };",
      "mock.module('../src/core/x.js', () => ({}));",
      'afterAll(() => {',
      '  cleanup();',
      '});',
    ].join('\n');
    expect(summarize(src)).toEqual(['../src/core/x.js:no-restore']);
  });

  it('reports a restore without a prior capture (positive)', () => {
    const src = [
      "mock.module('../src/core/x.js', () => ({}));",
      'afterAll(() => {',
      "  mock.module('../src/core/x.js', () => realX);",
      '});',
    ].join('\n');
    expect(summarize(src)).toEqual(['../src/core/x.js:no-capture']);
  });

  it('reports a restore that returns something other than the capture (positive)', () => {
    const src = [
      "const realX = { ...(await import('../src/core/x.js')) };",
      "mock.module('../src/core/x.js', () => ({ a: 1 }));",
      'afterAll(() => {',
      "  mock.module('../src/core/x.js', () => ({}));",
      '});',
    ].join('\n');
    expect(summarize(src)).toEqual(['../src/core/x.js:no-restore']);
  });

  it('reports a capture placed textually after the first mock (positive)', () => {
    const src = [
      "mock.module('../src/core/x.js', () => ({}));",
      "const realX = { ...(await import('../src/core/x.js')) };",
      'afterAll(() => {',
      "  mock.module('../src/core/x.js', () => realX);",
      '});',
    ].join('\n');
    expect(summarize(src)).toEqual(['../src/core/x.js:no-capture']);
  });

  it('reports only the unrestored spec when two specs are mocked (positive)', () => {
    const src = [
      "const realA = { ...(await import('../src/core/a.js')) };",
      "mock.module('../src/core/a.js', () => ({}));",
      "mock.module('../src/core/b.js', () => ({}));",
      'afterAll(() => {',
      "  mock.module('../src/core/a.js', () => realA);",
      '});',
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([
      { spec: '../src/core/b.js', line: 3, reason: 'no-restore' },
    ]);
  });

  it('reports a template-literal spec with a substitution as dynamic-spec (positive)', () => {
    const src = `mock.module(\`../src/core/\${name}.js\`, () => ({}));`;
    expect(summarize(src)).toEqual(['<dynamic>:dynamic-spec']);
  });

  it('fails closed on non-literal, non-identifier specs instead of skipping (R6, positive)', () => {
    const concat = "mock.module('../src/core/' + name + '.js', () => ({}));";
    const joined = "mock.module(join(base, 'x.js'), () => ({}));";
    const resolved = "mock.module(require.resolve('../src/core/x.js'), () => ({}));";
    const meta = "mock.module(import.meta.resolve('../src/core/x.js'), () => ({}));";
    for (const src of [concat, joined, resolved, meta]) {
      expect(summarize(src)).toEqual(['<unparsable>:unparsable-spec']);
    }
  });

  it('documents afterEach and helper restores as fail-safe false positives (positive)', () => {
    const inAfterEach = [
      "const realX = { ...(await import('../src/core/x.js')) };",
      "mock.module('../src/core/x.js', () => ({}));",
      'afterEach(() => {',
      "  mock.module('../src/core/x.js', () => realX);",
      '});',
    ].join('\n');
    const viaHelper = [
      "const realX = { ...(await import('../src/core/x.js')) };",
      "mock.module('../src/core/x.js', () => ({}));",
      'function restoreAll() {',
      "  mock.module('../src/core/x.js', () => realX);",
      '}',
      'afterAll(restoreAll);',
    ].join('\n');
    expect(summarize(inAfterEach)).toEqual(['../src/core/x.js:no-restore']);
    expect(summarize(viaHelper)).toEqual(['../src/core/x.js:no-restore']);
  });

  it('accepts capture plus afterAll re-registration of a literal spec (negative)', () => {
    const src = [
      "const realX = { ...(await import('../src/core/x.js')) };",
      "mock.module('../src/core/x.js', () => ({ a: 1 }));",
      'afterAll(() => {',
      "  mock.module('../src/core/x.js', () => realX);",
      '});',
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([]);
  });

  it('accepts an identifier spec captured in beforeAll and restored in afterAll (negative)', () => {
    const src = [
      "const RTK_MODULE = '../src/core/rtk.js';",
      'let realRtk: Record<string, unknown>;',
      'beforeAll(async () => {',
      '  realRtk = { ...(await import(RTK_MODULE)) };',
      '});',
      'it("x", () => {',
      '  mock.module(RTK_MODULE, () => ({}));',
      '});',
      'afterAll(() => {',
      '  mock.module(RTK_MODULE, () => realRtk);',
      '});',
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([]);
  });

  it('treats node: and bare builtin specifiers as the same module (negative)', () => {
    const src = [
      "const realCp = { ...(await import('node:child_process')) };",
      "mock.module('child_process', () => ({}));",
      'afterAll(() => {',
      "  mock.module('node:child_process', () => realCp);",
      '});',
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([]);
  });

  it('ignores mentions in line and block comments (negative)', () => {
    const src = [
      "// mock.module('node:child_process', () => ({}))",
      '/*',
      " * mock.module('../src/core/x.js', () => ({}))",
      ' */',
      'const x = 1;',
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([]);
  });

  it('ignores a restore-only afterAll with no installing mock (negative)', () => {
    const src = ['afterAll(() => {', "  mock.module('../src/core/x.js', () => realX);", '});'].join(
      '\n'
    );
    expect(findModuleMockViolations(src)).toEqual([]);
  });

  it('does not treat // inside a string as a comment', () => {
    const src = [
      "const url = 'http://example.com';",
      "mock.module('../src/core/x.js', () => ({}));",
    ].join('\n');
    expect(findModuleMockViolations(src)).toEqual([
      { spec: '../src/core/x.js', line: 2, reason: 'no-restore' },
    ]);
  });
});

describe('findUnrestoredChildProcessMocks (child_process view, fixtures)', () => {
  it('reports a child_process mock without afterAll restore (positive)', () => {
    const src = [
      "import { mock } from 'bun:test';",
      '',
      "mock.module('node:child_process', () => ({ execSync: () => '' }));",
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 3 }]);
  });

  it('reports the bare "child_process" specifier and double quotes (positive)', () => {
    const src = 'mock.module("child_process", () => ({}));';
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 1 }]);
  });

  it('reports when afterAll exists but does not re-register the module (positive)', () => {
    const src = [
      "mock.module('node:child_process', () => ({}));",
      'afterAll(() => {',
      '  cleanup();',
      '});',
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 1 }]);
  });

  it('accepts a mock that re-registers the module inside afterAll (negative)', () => {
    const src = [
      "const real = { ...(await import('node:child_process')) };",
      "mock.module('node:child_process', () => ({ execSync: () => '' }));",
      'afterAll(() => {',
      "  mock.module('node:child_process', () => real);",
      '});',
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([]);
  });

  it('ignores mocks of other modules (negative)', () => {
    const src = "mock.module('../../../src/core/updater.js', () => ({}));";
    expect(findUnrestoredChildProcessMocks(src)).toEqual([]);
  });
});

describe('findAllowlistProblems (meta-test fixtures)', () => {
  const violations = [{ file: 'tests/a.test.ts', spec: '../src/x.js' }];

  it('accepts an entry with a reason that still matches a violation (negative)', () => {
    const entry = { file: 'tests/a.test.ts', spec: '../src/x.js', reason: 'separate process' };
    expect(findAllowlistProblems([entry], violations)).toEqual([]);
  });

  it('reports a stale entry that no longer matches any violation (positive)', () => {
    const entry = { file: 'tests/gone.test.ts', spec: '../src/x.js', reason: 'old' };
    expect(findAllowlistProblems([entry], violations)).toEqual([
      'stale: tests/gone.test.ts ../src/x.js',
    ]);
  });

  it('reports an entry with an empty reason (positive)', () => {
    const entry = { file: 'tests/a.test.ts', spec: '../src/x.js', reason: '  ' };
    expect(findAllowlistProblems([entry], violations)).toEqual([
      'no-reason: tests/a.test.ts ../src/x.js',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Repository scan (git-tracked test files)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SELF_PATH = 'tests/unit/scripts/child-process-mock-hygiene.test.ts';

const TEST_FILE_PATTERNS: RegExp[] = [
  /^tests\/.*\.[jt]sx?$/,
  /^packages\/[^/]+\/src\/(?:.*\/)?__tests__\/.*\.[jt]sx?$/,
];

function listTrackedTestFiles(): string[] {
  // Use Bun.spawnSync, not child_process, so module mocks cannot affect the scan
  const result = Bun.spawnSync(['git', 'ls-files', '--', 'tests', 'packages'], {
    cwd: REPO_ROOT,
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  }
  return result.stdout
    .toString()
    .split('\n')
    .filter((file) => file.length > 0)
    .filter((file) => file !== SELF_PATH) // this file's own fixture strings are excluded
    .filter((file) => TEST_FILE_PATTERNS.some((pattern) => pattern.test(file)));
}

interface RepoScan {
  scanned: number;
  /** All violations, before the allowlist is applied */
  violations: RepoViolation[];
}

function scanRepository(): RepoScan {
  const violations: RepoViolation[] = [];
  let scanned = 0;
  for (const file of listTrackedTestFiles()) {
    const fullPath = join(REPO_ROOT, file);
    if (!existsSync(fullPath)) {
      continue; // tracked but deleted in the working tree
    }
    scanned++;
    for (const violation of findModuleMockViolations(readFileSync(fullPath, 'utf-8'))) {
      violations.push({ file, ...violation });
    }
  }
  return { scanned, violations };
}

function formatOffenders(violations: ReadonlyArray<RepoViolation>): string {
  return violations.map((v) => `${v.file}:${v.line} ${v.spec} [${v.reason}]`).join(', ');
}

describe('module mock hygiene (repository scan)', () => {
  const scan = scanRepository();

  it('every child_process module mock is restored in afterAll', () => {
    const offenders = scan.violations.filter((v) => v.spec === 'child_process');
    expect(scan.scanned).toBeGreaterThan(0);
    expect(
      offenders.map((v) => `${v.file}:${v.line}`),
      `node:child_process module mock registered without capture + afterAll restore (#1760): ${formatOffenders(offenders)}`
    ).toEqual([]);
  });

  it('every mock.module target is captured before mocking and restored in afterAll', () => {
    const offenders = scan.violations.filter(
      (v) => !ALLOWED_UNRESTORED.some((a) => a.file === v.file && a.spec === v.spec)
    );
    expect(scan.scanned).toBeGreaterThan(0);
    expect(
      offenders.map((v) => `${v.file}:${v.line} ${v.spec} [${v.reason}]`),
      `mock.module target leaks across files (#1772). Fix: capture \`const realX = { ...(await import(SPEC)) }\` before mocking and call \`afterAll(() => { mock.module(SPEC, () => realX); })\`: ${formatOffenders(offenders)}`
    ).toEqual([]);
  });

  it('the allowlist has no entries without a reason and no stale entries', () => {
    expect(findAllowlistProblems(ALLOWED_UNRESTORED, scan.violations)).toEqual([]);
  });
});

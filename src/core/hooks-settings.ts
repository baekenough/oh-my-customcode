/**
 * hooks.json → CC settings `hooks` block converter (#1623).
 *
 * `.claude/hooks/hooks.json` is a human-authored declarative source; it is NOT one of
 * the 4 paths Claude Code actually loads hooks from (`~/.claude/settings.json`,
 * `.claude/settings.json`, `.claude/settings.local.json`, enterprise managed policy —
 * see `hook-wiring-research.md` §A/§B). This module converts hooks.json's `matcher` DSL
 * (a boolean-expression grammar supporting `tool == "X"`, `tool_input.<field> matches
 * "<regex>"`, `mcp_tool_name matches "<regex>"`, `&&`, `||`, `!(...)`) into the CC
 * official schema, where `matcher` is a plain regex tested against the tool name only.
 *
 * Matcher DSL entries fall into three buckets after AST analysis:
 *
 * 1. Pure `tool == "X"` (optionally OR'd) — mechanical: matcher becomes `X` or `X|Y`.
 * 2. Pure `mcp_tool_name matches "..."` (optionally OR'd) — mechanical: the regex
 *    fragments already ARE valid tool-name regexes (MCP tool names look like
 *    `mcp__server__tool`), so they are joined with `|` and used directly as matcher.
 * 3. `tool == "X" && tool_input.<field> matches "<regex>"` (optionally with more
 *    `&&`/`!()` on the tool_input side) — CC's matcher cannot express the tool_input
 *    condition. Two strategies, decided per-entry by reading the underlying hook
 *    script (see CLASSIFICATION_TABLE below):
 *      (a) drop-condition — the script ALREADY re-parses stdin and re-checks the same
 *          condition itself (e.g. destructive-git-guard.sh re-greps tool_input.command).
 *          Widening the matcher to the tool name alone is safe and simpler.
 *      (b) wrap-guard — the script does NOT re-check the condition (it acts
 *          unconditionally once invoked). The converter wraps the original command in a
 *          stdin-guard: read stdin once, test the translated jq condition, execute the
 *          original command only if it holds, otherwise pass stdin through unchanged
 *          (matches the "실행 불가/조건 불충족 시 무음 통과" advisory principle).
 *
 * Any matcher expression this module cannot parse or classify falls back conservatively
 * (see `analyzeMatcher` and `convertEntry`) and is surfaced via `warnings` rather than
 * silently mis-converted (R020 "attempt ≠ outcome" / R016 "text ≠ wiring").
 */

import { dirname } from 'node:path';
import { ensureDirectory, readJsonFile, readTextFile, writeTextFile } from '../utils/fs.js';

// ---------------------------------------------------------------------------
// Raw hooks.json shape
// ---------------------------------------------------------------------------

export interface RawHookCommand {
  type: string;
  command?: string;
  prompt?: string;
  continueOnBlock?: boolean;
  [key: string]: unknown;
}

export interface RawHookEntry {
  matcher?: string;
  hooks: RawHookCommand[];
  description?: string;
}

export interface RawHooksJson {
  $schema?: string;
  hooks: Record<string, RawHookEntry[]>;
}

// ---------------------------------------------------------------------------
// CC settings.json `hooks` block shape (output)
// ---------------------------------------------------------------------------

export interface SettingsHookCommand {
  type: string;
  command?: string;
  prompt?: string;
  continueOnBlock?: boolean;
  [key: string]: unknown;
}

export interface SettingsHookEntry {
  matcher?: string;
  hooks: SettingsHookCommand[];
  description?: string;
}

export type SettingsHooksBlock = Record<string, SettingsHookEntry[]>;

// ---------------------------------------------------------------------------
// Matcher DSL tokenizer + recursive-descent parser
// ---------------------------------------------------------------------------

type MatcherToken =
  | { type: 'STRING'; value: string }
  | { type: 'IDENT'; value: string }
  | { type: 'OP'; value: '&&' | '||' | '!' | '(' | ')' | '==' | 'matches' };

const IDENT_CHAR = /[A-Za-z0-9_.]/;
const IDENT_START = /[A-Za-z_]/;

interface TokenizeStep {
  token: MatcherToken;
  next: number;
}

/** Matches `(`, `)`, or `!` — single-character operator tokens. */
function consumeSingleCharOp(input: string, i: number): TokenizeStep | null {
  const ch = input[i];
  if (ch === '(' || ch === ')' || ch === '!') {
    return { token: { type: 'OP', value: ch }, next: i + 1 };
  }
  return null;
}

/** Matches `&&`, `||`, or `==` — two-character operator tokens. */
function consumeTwoCharOp(input: string, i: number): TokenizeStep | null {
  const two = input.slice(i, i + 2);
  if (two === '&&' || two === '||' || two === '==') {
    return { token: { type: 'OP', value: two }, next: i + 2 };
  }
  return null;
}

/** Consumes a `"..."` string literal (with `\`-escaping) starting at `input[i] === '"'`. */
function consumeStringLiteral(input: string, i: number): TokenizeStep {
  const n = input.length;
  let j = i + 1;
  let value = '';
  while (j < n && input[j] !== '"') {
    if (input[j] === '\\' && j + 1 < n) {
      value += input[j + 1];
      j += 2;
    } else {
      value += input[j];
      j++;
    }
  }
  if (j >= n) {
    throw new Error(`unterminated string literal in matcher expression: ${input}`);
  }
  return { token: { type: 'STRING', value }, next: j + 1 };
}

/** Consumes an identifier/dotted-path starting at `IDENT_START.test(input[i])`; the `matches` keyword is special-cased into an OP token. */
function consumeIdentifierOrKeyword(input: string, i: number): TokenizeStep {
  const n = input.length;
  let j = i;
  while (j < n && IDENT_CHAR.test(input[j])) j++;
  const word = input.slice(i, j);
  const token: MatcherToken =
    word === 'matches' ? { type: 'OP', value: 'matches' } : { type: 'IDENT', value: word };
  return { token, next: j };
}

function tokenizeMatcher(input: string): MatcherToken[] {
  const tokens: MatcherToken[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    const twoCharOp = consumeTwoCharOp(input, i);
    if (twoCharOp) {
      tokens.push(twoCharOp.token);
      i = twoCharOp.next;
      continue;
    }

    const singleCharOp = consumeSingleCharOp(input, i);
    if (singleCharOp) {
      tokens.push(singleCharOp.token);
      i = singleCharOp.next;
      continue;
    }

    if (ch === '"') {
      const literal = consumeStringLiteral(input, i);
      tokens.push(literal.token);
      i = literal.next;
      continue;
    }

    if (IDENT_START.test(ch)) {
      const ident = consumeIdentifierOrKeyword(input, i);
      tokens.push(ident.token);
      i = ident.next;
      continue;
    }

    throw new Error(`unexpected character '${ch}' at offset ${i} in matcher expression: ${input}`);
  }
  return tokens;
}

export type MatcherAstNode =
  | { kind: 'and'; left: MatcherAstNode; right: MatcherAstNode }
  | { kind: 'or'; left: MatcherAstNode; right: MatcherAstNode }
  | { kind: 'not'; child: MatcherAstNode }
  | { kind: 'toolEq'; tool: string }
  | { kind: 'fieldMatch'; field: string; pattern: string };

class MatcherParser {
  private pos = 0;
  constructor(private readonly tokens: MatcherToken[]) {}

  parse(): MatcherAstNode {
    const node = this.parseOr();
    if (this.pos !== this.tokens.length) {
      throw new Error(`trailing tokens after position ${this.pos} in matcher expression`);
    }
    return node;
  }

  private peek(): MatcherToken | undefined {
    return this.tokens[this.pos];
  }

  private next(): MatcherToken {
    const t = this.tokens[this.pos];
    if (!t) throw new Error('unexpected end of matcher expression');
    this.pos++;
    return t;
  }

  private expectOp(value: string): void {
    const t = this.next();
    if (t.type !== 'OP' || t.value !== value) {
      throw new Error(`expected '${value}', got ${JSON.stringify(t)}`);
    }
  }

  private parseOr(): MatcherAstNode {
    let left = this.parseAnd();
    while (this.peek()?.type === 'OP' && this.peek()?.value === '||') {
      this.next();
      const right = this.parseAnd();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): MatcherAstNode {
    let left = this.parseUnary();
    while (this.peek()?.type === 'OP' && this.peek()?.value === '&&') {
      this.next();
      const right = this.parseUnary();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private parseUnary(): MatcherAstNode {
    if (this.peek()?.type === 'OP' && this.peek()?.value === '!') {
      this.next();
      this.expectOp('(');
      const inner = this.parseOr();
      this.expectOp(')');
      return { kind: 'not', child: inner };
    }
    return this.parseAtom();
  }

  private parseAtom(): MatcherAstNode {
    if (this.peek()?.type === 'OP' && this.peek()?.value === '(') {
      this.next();
      const inner = this.parseOr();
      this.expectOp(')');
      return inner;
    }
    const identTok = this.next();
    if (identTok.type !== 'IDENT') {
      throw new Error(`expected identifier, got ${JSON.stringify(identTok)}`);
    }
    const opTok = this.next();
    if (opTok.type !== 'OP' || (opTok.value !== '==' && opTok.value !== 'matches')) {
      throw new Error(`expected '==' or 'matches' after identifier '${identTok.value}'`);
    }
    const strTok = this.next();
    if (strTok.type !== 'STRING') {
      throw new Error(`expected string literal after '${opTok.value}'`);
    }
    if (opTok.value === '==') {
      if (identTok.value !== 'tool') {
        throw new Error(
          `unsupported '==' comparison on field '${identTok.value}' (only 'tool' is supported)`
        );
      }
      return { kind: 'toolEq', tool: strTok.value };
    }
    return { kind: 'fieldMatch', field: identTok.value, pattern: strTok.value };
  }
}

export function parseMatcherExpr(raw: string): MatcherAstNode {
  const tokens = tokenizeMatcher(raw);
  if (tokens.length === 0) {
    throw new Error('empty matcher expression');
  }
  return new MatcherParser(tokens).parse();
}

// ---------------------------------------------------------------------------
// AST analysis helpers
// ---------------------------------------------------------------------------

function isToolOnly(node: MatcherAstNode): boolean {
  switch (node.kind) {
    case 'toolEq':
      return true;
    case 'and':
    case 'or':
      return isToolOnly(node.left) && isToolOnly(node.right);
    case 'not':
      return isToolOnly(node.child);
    case 'fieldMatch':
      return false;
  }
}

function collectToolNames(node: MatcherAstNode): string[] {
  switch (node.kind) {
    case 'toolEq':
      return [node.tool];
    case 'and':
    case 'or':
      return [...collectToolNames(node.left), ...collectToolNames(node.right)];
    default:
      return [];
  }
}

function flattenAnd(node: MatcherAstNode): MatcherAstNode[] {
  if (node.kind === 'and') {
    return [...flattenAnd(node.left), ...flattenAnd(node.right)];
  }
  return [node];
}

/**
 * Attempts to read a node as a pure OR-tree of `fieldMatch` leaves on a single field
 * (e.g. `mcp_tool_name matches "A" || mcp_tool_name matches "B"`). Returns the joined
 * alternation regex, or null if the node contains anything else (AND, NOT, a different
 * field, or a toolEq leaf).
 */
function tryPureOrFieldRegex(node: MatcherAstNode, field: string): string | null {
  if (node.kind === 'fieldMatch') {
    return node.field === field ? node.pattern : null;
  }
  if (node.kind === 'or') {
    const left = tryPureOrFieldRegex(node.left, field);
    const right = tryPureOrFieldRegex(node.right, field);
    if (left === null || right === null) return null;
    return `${left}|${right}`;
  }
  return null;
}

export interface MatcherAnalysis {
  /** Regex to use as CC's `matcher` value (tool name regex, or a bare MCP tool-name regex). */
  toolRegex: string;
  /** Remaining tool_input/mcp_tool_name condition CC's matcher cannot express, if any. */
  fieldNode: MatcherAstNode | null;
}

/**
 * Best-effort fallback tool-name extraction for matcher strings that fail full AST
 * parsing/analysis. Used only when {@link analyzeMatcher} cannot classify the
 * expression via the grammar above — keeps the converter degrading gracefully instead
 * of throwing on hooks.json edits that drift from the currently-supported subset.
 */
function fallbackExtractToolNames(raw: string): string[] {
  const names = new Set<string>();
  const re = /tool\s*==\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = re.exec(raw)) !== null) {
    names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Handles the mixed `tool == "X" && tool_input.<field> matches "<regex>"` case (Case 3
 * of {@link analyzeMatcher}): splits the top-level AND chain into tool-identity
 * clause(s) and tool_input condition clause(s), falling back to a raw-string tool-name
 * scrape if no top-level `tool == "X"` clause is present at all. Extracted from
 * `analyzeMatcher` purely to keep that function's branching shallow — behavior unchanged.
 */
function analyzeMixedAndExpr(ast: MatcherAstNode, raw: string): MatcherAnalysis {
  const parts = flattenAnd(ast);
  const toolParts = parts.filter(isToolOnly);
  const fieldParts = parts.filter((p) => !isToolOnly(p));

  if (toolParts.length === 0) {
    const names = fallbackExtractToolNames(raw);
    if (names.length === 0) {
      throw new Error(
        `cannot extract a tool matcher from expression (no top-level tool==X clause): ${raw}`
      );
    }
    return { toolRegex: names.join('|'), fieldNode: null };
  }

  const tools = Array.from(new Set(toolParts.flatMap(collectToolNames)));
  const toolRegex = tools.join('|') || '*';

  if (fieldParts.length === 0) {
    return { toolRegex, fieldNode: null };
  }

  const fieldNode = fieldParts.reduce(
    (acc, part) =>
      acc === null ? part : ({ kind: 'and', left: acc, right: part } as MatcherAstNode),
    null as MatcherAstNode | null
  ) as MatcherAstNode;

  return { toolRegex, fieldNode };
}

/** Matches a bare single-word matcher value (no `==`/`matches`/boolean operators) — see
 * the literal-matcher branch in {@link analyzeMatcher} below for why this needs a
 * dedicated fast path rather than falling through to the boolean-expression parser. */
const BARE_LITERAL_MATCHER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Analyzes a hooks.json matcher DSL string into the CC-compatible tool regex plus any
 * residual tool_input/mcp_tool_name condition CC cannot express directly.
 *
 * Throws only for expressions where NOT EVEN a best-effort tool-name fallback can be
 * derived (e.g. a matcher with no `tool == "X"` substring at all) — callers should
 * catch and treat this as "cannot auto-convert", per the module-level docs.
 */
export function analyzeMatcher(raw: string | undefined): MatcherAnalysis {
  if (raw === undefined || raw === '*' || raw.trim() === '') {
    return { toolRegex: '*', fieldNode: null };
  }

  // Literal event-source matcher (e.g. SessionStart's "startup"/"resume"/"clear"/
  // "compact") — these are plain string values CC compares directly, not boolean
  // matcher expressions. The grammar below (`parseAtom`) always requires an operator
  // (`==`/`matches`) after a leading identifier, so a bare word deterministically fails
  // parsing with "unexpected end of matcher expression" (#1626) — pass it through
  // unconverted instead of routing it into the tool-matcher expression parser.
  if (BARE_LITERAL_MATCHER.test(raw)) {
    return { toolRegex: raw, fieldNode: null };
  }

  let ast: MatcherAstNode;
  try {
    ast = parseMatcherExpr(raw);
  } catch (err) {
    const names = fallbackExtractToolNames(raw);
    if (names.length === 0) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `unparseable matcher expression and no fallback tool name found: ${raw} (${message})`
      );
    }
    return { toolRegex: names.join('|'), fieldNode: null };
  }

  // Case 1: pure `tool == "X"` (optionally OR'd) — mechanical conversion.
  if (isToolOnly(ast)) {
    const tools = Array.from(new Set(collectToolNames(ast)));
    return { toolRegex: tools.join('|') || '*', fieldNode: null };
  }

  // Case 2: pure `mcp_tool_name matches "..."` OR-tree — the regex fragments already
  // serve as valid tool-name regexes for MCP tools.
  const mcpRegex = tryPureOrFieldRegex(ast, 'mcp_tool_name');
  if (mcpRegex !== null) {
    return { toolRegex: mcpRegex, fieldNode: null };
  }

  // Case 3: mixed AND of tool==X part(s) + tool_input condition part(s).
  return analyzeMixedAndExpr(ast, raw);
}

// ---------------------------------------------------------------------------
// fieldNode -> jq boolean expression compiler
// ---------------------------------------------------------------------------

/**
 * Compiles a residual tool_input/mcp_tool_name condition into a jq boolean-test
 * program, evaluated against the raw PreToolUse/PostToolUse hook input JSON on stdin.
 */
export function fieldNodeToJq(node: MatcherAstNode): string {
  switch (node.kind) {
    case 'and':
      return `(${fieldNodeToJq(node.left)} and ${fieldNodeToJq(node.right)})`;
    case 'or':
      return `(${fieldNodeToJq(node.left)} or ${fieldNodeToJq(node.right)})`;
    case 'not':
      return `(${fieldNodeToJq(node.child)} | not)`;
    case 'fieldMatch': {
      // `node.field` is already fully qualified (e.g. "tool_input.command"), except
      // for the special "mcp_tool_name" pseudo-field, which maps to `.tool_name` on
      // the hook input JSON.
      const jqPath = node.field === 'mcp_tool_name' ? '.tool_name' : `.${node.field}`;
      return `((${jqPath} // "") | test(${JSON.stringify(node.pattern)}))`;
    }
    case 'toolEq':
      // Tool identity is already enforced by CC's matcher; treat as a no-op here.
      return 'true';
  }
}

// ---------------------------------------------------------------------------
// Shell-safe wrapping of the original command in a stdin guard
// ---------------------------------------------------------------------------

/** Produces a POSIX-shell single-quoted literal safe for any input (handles embedded `'`). */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Wraps `originalCommand` in a stdin-guard: reads stdin once, tests `jqCond` against it
 * via jq, and only runs the original command (re-fed the same stdin) if the condition
 * holds. On a false/errored jq test, stdin is passed through unchanged — matching the
 * hooks.json advisory principle of silent passthrough when a condition is not met.
 *
 * Deliberately NOT the literal `sh -c '... && ... || true'` one-liner form: several
 * original commands contain unescaped single quotes (e.g. `jq -r '.tool_input.command'`)
 * that would break a naive single-quoted `sh -c` wrapper. This achieves the same
 * "guard, then run, else passthrough" shape without nested-quoting fragility, since the
 * hook runner already executes the `command` string directly as shell source (existing
 * hooks.json entries embed full multi-line `#!/bin/bash` scripts the same way).
 *
 * The original command body is embedded VERBATIM (byte-identical, no re-indentation) so
 * that its own comments/here-docs/quoting are never disturbed by the wrap.
 */
export function buildGuardedCommand(jqCond: string, originalCommand: string): string {
  const quotedCond = shellSingleQuote(jqCond);
  return [
    'input=$(cat)',
    `if printf '%s' "$input" | jq -e ${quotedCond} >/dev/null 2>&1; then`,
    '  printf \'%s\' "$input" | (',
    originalCommand,
    '  )',
    'else',
    '  printf \'%s\' "$input"',
    'fi',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Per-entry classification table (the 12 tool_input-compound DSL entries)
// ---------------------------------------------------------------------------

export type HookDecision = 'drop-condition' | 'wrap-guard';

export interface ClassificationEntry {
  event: string;
  description: string;
  decision: HookDecision;
  reason: string;
}

/**
 * Classification is keyed by (event, description) rather than the matcher string,
 * because several entries within the same event share an identical compound matcher
 * (e.g. PostToolUse has two `tool == "Edit" && tool_input.file_path matches "\\.(py)$"`
 * entries — ruff-format and ty-check — with different descriptions). Descriptions are
 * unique per entry in the current hooks.json (verified against all 58 entries).
 *
 * Decisions were made by reading each underlying script body, not by guessing — see
 * the `## DSL 12건 (a)/(b) 판정 표` section of the delivered report for the read-based
 * evidence per entry.
 */
export const CLASSIFICATION_TABLE: ClassificationEntry[] = [
  {
    event: 'PreToolUse',
    description: 'Block dev servers outside tmux - ensures you can access logs',
    decision: 'wrap-guard',
    reason:
      'inline script unconditionally `exit 1`-blocks on ANY match once invoked; it never re-parses tool_input.command, so widening the matcher to bare "Bash" would block every Bash call',
  },
  {
    event: 'PreToolUse',
    description: 'Reminder to use tmux for long-running commands',
    decision: 'wrap-guard',
    reason:
      'inline script only checks `[ -z "$TMUX" ]`; it never re-checks tool_input.command against the npm/pnpm/yarn/bun/cargo/docker/pytest/vitest/playwright pattern, so widening the matcher would nag on every Bash call',
  },
  {
    event: 'PreToolUse',
    description: 'Pause before git push to review changes',
    decision: 'wrap-guard',
    reason:
      'inline script unconditionally prints the pause prompt once invoked; it never re-checks tool_input.command for "git push", so widening the matcher would pause on every Bash call',
  },
  {
    event: 'PreToolUse',
    description: 'Block creation of random .md files - keeps docs consolidated',
    decision: 'drop-condition',
    reason:
      'inline script re-parses tool_input.file_path via jq and re-tests both the `\\.(md|txt)$` and the README/CLAUDE/AGENT/SKILL exclusion with its own [[ =~ ]] checks before blocking — the matcher condition is fully redundant with the script body',
  },
  {
    event: 'PreToolUse',
    description: 'Warn before destructive git commands — advisory recovery guidance (R001/R021)',
    decision: 'drop-condition',
    reason:
      'destructive-git-guard.sh re-parses tool_input.command via jq/python3 and re-greps for each destructive git subcommand (reset --hard, clean -f*, restore, checkout -- ., branch -D) itself before warning — matcher condition is redundant',
  },
  {
    event: 'PreToolUse',
    description:
      'Block rule file deletion — requires individual user confirmation per rule (R001 safety)',
    decision: 'drop-condition',
    reason:
      'rule-deletion-guard.sh explicitly re-checks `tool != "Bash"` (passthrough) and re-greps tool_input.command for rm/git rm/mv/unlink AND a .claude/rules path before blocking — matcher condition is redundant',
  },
  {
    event: 'PostToolUse',
    description: 'Auto-format JS/TS files with Prettier after edits',
    decision: 'wrap-guard',
    reason:
      'inline script only checks file existence (`[ -f "$file_path" ]`); it never re-checks the .ts/.tsx/.js/.jsx extension, so widening the matcher to bare "Edit" would run prettier on every edited file regardless of type',
  },
  {
    event: 'PostToolUse',
    description: 'TypeScript check after editing .ts/.tsx files',
    decision: 'wrap-guard',
    reason:
      'inline script never re-checks the .ts/.tsx extension before walking up for tsconfig.json and invoking tsc — widening the matcher would run a TS project check after editing non-TS files',
  },
  {
    event: 'PostToolUse',
    description: 'Warn about console.log statements after edits',
    decision: 'wrap-guard',
    reason:
      'inline script greps the edited file for `console\\.log` unconditionally on file existence; it never re-checks the .ts/.tsx/.js/.jsx extension, so widening the matcher would run this grep on every edited file type',
  },
  {
    event: 'PostToolUse',
    description: 'Auto-format Go files with gofmt after edits',
    decision: 'wrap-guard',
    reason:
      'inline script never re-checks the .go extension before invoking gofmt -w; running gofmt on a non-Go file would error/corrupt output',
  },
  {
    event: 'PostToolUse',
    description: 'Auto-format and lint Python files with ruff after edits',
    decision: 'wrap-guard',
    reason:
      'inline script never re-checks the .py extension before invoking ruff format/check --fix; running ruff on a non-Python file would error',
  },
  {
    event: 'PostToolUse',
    description: 'Type check Python files with ty after edits',
    decision: 'wrap-guard',
    reason:
      'inline script never re-checks the .py extension before invoking `ty check`; running a Python type checker on a non-Python file would error',
  },
];

function findClassification(
  event: string,
  description: string | undefined
): ClassificationEntry | undefined {
  if (description === undefined) return undefined;
  return CLASSIFICATION_TABLE.find((c) => c.event === event && c.description === description);
}

/** Heuristic: does this command body itself act as a hard block (`exit 1`/`exit 2`)? */
function looksHardBlock(command: string): boolean {
  return /\bexit\s+[12]\b/.test(command);
}

// ---------------------------------------------------------------------------
// Entry / document conversion
// ---------------------------------------------------------------------------

/**
 * Converts one raw hook command. Returns `null` when the command must be conservatively
 * EXCLUDED from the converted output (only for the hard-block-and-untranslatable edge
 * case — see the `looksHardBlock` branch below); every other path returns a command.
 */
export function convertHookCommand(
  cmd: RawHookCommand,
  fieldNode: MatcherAstNode | null,
  decision: HookDecision | 'auto',
  warnCollector: { push: (msg: string) => void },
  context: string
): SettingsHookCommand | null {
  if (fieldNode === null || decision === 'drop-condition') {
    // Either nothing to guard, or the script already self-guards: pass command through.
    return { ...cmd };
  }

  if (cmd.type !== 'command' || typeof cmd.command !== 'string') {
    warnCollector.push(
      `hooks: ${context} — cannot wrap a non-command hook (type="${cmd.type}") with a stdin guard; condition dropped, hook now fires unconditionally on matcher match`
    );
    return { ...cmd };
  }

  let jqCond: string;
  try {
    jqCond = fieldNodeToJq(fieldNode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (looksHardBlock(cmd.command)) {
      warnCollector.push(
        `hooks: ${context} — could not translate condition to jq (${message}); hook looks hard-block (exit 1/2) so it was conservatively EXCLUDED from the converted settings — manual review required`
      );
      return null;
    }
    warnCollector.push(
      `hooks: ${context} — could not translate condition to jq (${message}); relaxed to unconditional firing (advisory hook, over-firing preferred over silent drop)`
    );
    return { ...cmd };
  }

  return {
    ...cmd,
    command: buildGuardedCommand(jqCond, cmd.command),
  };
}

export function convertHooksEntry(
  event: string,
  entry: RawHookEntry,
  warnCollector: { push: (msg: string) => void }
): SettingsHookEntry | null {
  const context = `${event} / "${entry.description ?? '(no description)'}"`;

  let analysis: MatcherAnalysis;
  try {
    analysis = analyzeMatcher(entry.matcher);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnCollector.push(
      `hooks: ${context} — matcher could not be auto-converted, entry EXCLUDED: ${message}`
    );
    return null;
  }

  let decision: HookDecision | 'auto' = 'auto';
  if (analysis.fieldNode !== null) {
    const classification = findClassification(event, entry.description);
    if (classification) {
      decision = classification.decision;
    } else {
      // Unclassified complex entry (not in the 12-entry table, e.g. a future addition):
      // default to wrap-guard, the safer choice (preserves original scoping rather than
      // silently widening it), and flag for manual classification review.
      decision = 'wrap-guard';
      warnCollector.push(
        `hooks: ${context} — has a tool_input condition not present in CLASSIFICATION_TABLE; defaulted to wrap-guard (safer) — add an explicit classification entry after reading the script`
      );
    }
  }

  const convertedHooks = entry.hooks
    .map((cmd) => convertHookCommand(cmd, analysis.fieldNode, decision, warnCollector, context))
    .filter((cmd): cmd is SettingsHookCommand => cmd !== null);

  if (convertedHooks.length === 0) {
    return null;
  }

  const out: SettingsHookEntry = { hooks: convertedHooks };
  if (analysis.toolRegex !== '*') {
    out.matcher = analysis.toolRegex;
  } else if (entry.matcher !== undefined) {
    // Preserve an explicit "*" matcher (non-tool events use this convention).
    out.matcher = '*';
  }
  if (entry.description !== undefined) {
    out.description = entry.description;
  }
  return out;
}

export interface ConvertHooksJsonResult {
  hooks: SettingsHooksBlock;
  warnings: string[];
}

export function convertHooksJson(hooksJson: RawHooksJson): ConvertHooksJsonResult {
  const warnings: string[] = [];
  const warnCollector = { push: (msg: string) => warnings.push(msg) };
  const result: SettingsHooksBlock = {};

  for (const [event, entries] of Object.entries(hooksJson.hooks ?? {})) {
    const convertedEntries: SettingsHookEntry[] = [];
    for (const entry of entries) {
      const converted = convertHooksEntry(event, entry, warnCollector);
      if (converted) convertedEntries.push(converted);
    }
    if (convertedEntries.length > 0) {
      result[event] = convertedEntries;
    }
  }

  return { hooks: result, warnings };
}

// ---------------------------------------------------------------------------
// File-level merge entry point (installer.ts contract, #1623)
// ---------------------------------------------------------------------------

export interface MergeHooksResult {
  warnings: string[];
}

/**
 * Reads `hooksJsonPath`, converts its `hooks` block to CC's settings schema, and merges
 * the result into `settingsPath` as the `hooks` key — replacing any prior omcustom-
 * managed `hooks` value while preserving every other existing top-level key
 * (statusLine, permissions, outputStyle, user-added keys, etc.).
 *
 * If `settingsPath` does not exist or is not valid JSON, it is treated as `{}` (a fresh
 * settings file is created holding only the converted `hooks` key).
 */
export async function mergeHooksIntoSettings(
  settingsPath: string,
  hooksJsonPath: string
): Promise<MergeHooksResult> {
  const hooksJson = await readJsonFile<RawHooksJson>(hooksJsonPath);
  const { hooks, warnings } = convertHooksJson(hooksJson);

  let settings: Record<string, unknown> = {};
  try {
    const existingRaw = await readTextFile(settingsPath);
    settings = JSON.parse(existingRaw) as Record<string, unknown>;
  } catch {
    settings = {};
  }

  settings.hooks = hooks;

  await ensureDirectory(dirname(settingsPath));
  await writeTextFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  return { warnings };
}

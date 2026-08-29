/**
 * Tests for hooks.json -> CC settings `hooks` block conversion (#1623).
 *
 * Ownership boundary: this file exercises hooks-settings.ts's own conversion/merge
 * logic (matcher DSL parsing, jq translation, classification table, file merge). It
 * does NOT re-test installer.ts's call-site wiring (invocation, warning propagation,
 * skip conditions) — that belongs to installer-hooks-settings.test.ts, which mocks this
 * module entirely (R023 verification-code duplication anti-pattern).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  analyzeMatcher,
  buildGuardedCommand,
  CLASSIFICATION_TABLE,
  type ClassificationEntry,
  convertHooksJson,
  fieldNodeToJq,
  type MatcherAstNode,
  mergeHooksIntoSettings,
  parseMatcherExpr,
  type RawHooksJson,
} from '../../../src/core/hooks-settings.js';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const HOOKS_JSON_PATH = join(REPO_ROOT, '.claude/hooks/hooks.json');
const TEMPLATES_HOOKS_JSON_PATH = join(REPO_ROOT, 'templates/.claude/hooks/hooks.json');

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs `bash -c command`, piping `stdinInput`. Mirrors hooks-scripts.test.ts's runner. */
function runBashCommand(command: string, stdinInput: string): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const child = spawn('bash', ['-c', command], { cwd: tmpdir() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

async function loadRealHooksJson(): Promise<RawHooksJson> {
  const raw = await readFile(HOOKS_JSON_PATH, 'utf-8');
  return JSON.parse(raw) as RawHooksJson;
}

function countSourceEntries(hooksJson: RawHooksJson): number {
  return Object.values(hooksJson.hooks).reduce((sum, entries) => sum + entries.length, 0);
}

function findRawEntry(hooksJson: RawHooksJson, event: string, description: string) {
  const entries = hooksJson.hooks[event] ?? [];
  const entry = entries.find((e) => e.description === description);
  if (!entry) throw new Error(`fixture error: no raw entry found for ${event} / "${description}"`);
  return entry;
}

// -------------------------------------------------------------------
// Matcher DSL parsing
// -------------------------------------------------------------------

describe('parseMatcherExpr / analyzeMatcher', () => {
  it('treats "*" and undefined as the star matcher', () => {
    expect(analyzeMatcher('*')).toEqual({ toolRegex: '*', fieldNode: null });
    expect(analyzeMatcher(undefined)).toEqual({ toolRegex: '*', fieldNode: null });
  });

  it('converts a single tool == "X" matcher', () => {
    const result = analyzeMatcher('tool == "Write"');
    expect(result.toolRegex).toBe('Write');
    expect(result.fieldNode).toBeNull();
  });

  it('converts an OR of tool == "X" into an alternation regex', () => {
    const result = analyzeMatcher('tool == "Write" || tool == "Edit"');
    expect(result.toolRegex).toBe('Write|Edit');
    expect(result.fieldNode).toBeNull();
  });

  it('converts a pure mcp_tool_name OR-tree into a direct alternation regex', () => {
    const result = analyzeMatcher(
      'mcp_tool_name matches "mcp__playwright__.*" || mcp_tool_name matches "mcp__claude-in-chrome__.*"'
    );
    expect(result.toolRegex).toBe('mcp__playwright__.*|mcp__claude-in-chrome__.*');
    expect(result.fieldNode).toBeNull();
  });

  it('splits a compound tool + tool_input.field matcher into toolRegex + fieldNode', () => {
    const result = analyzeMatcher('tool == "Bash" && tool_input.command matches "git push"');
    expect(result.toolRegex).toBe('Bash');
    expect(result.fieldNode).not.toBeNull();
    expect(result.fieldNode).toEqual({
      kind: 'fieldMatch',
      field: 'tool_input.command',
      pattern: 'git push',
    });
  });

  it('parses the AND + NOT(OR) shape used by the random-.md-file blocker matcher', () => {
    const raw =
      'tool == "Write" && tool_input.file_path matches "\\\\.(md|txt)$" && !(tool_input.file_path matches "README\\\\.md|CLAUDE\\\\.md")';
    const result = analyzeMatcher(raw);
    expect(result.toolRegex).toBe('Write');
    expect(result.fieldNode).not.toBeNull();
    // fieldNode should be an AND of (matches, NOT(matches))
    expect(result.fieldNode?.kind).toBe('and');
  });

  it('falls back to a best-effort tool name extraction on unparseable expressions', () => {
    // Malformed trailing garbage after a valid tool==X clause the tokenizer chokes on.
    const result = analyzeMatcher('tool == "Write" ###');
    expect(result.toolRegex).toBe('Write');
    expect(result.fieldNode).toBeNull();
  });

  it('throws when neither full parsing nor fallback extraction can find a tool name', () => {
    expect(() => analyzeMatcher('###totally unparseable###')).toThrow();
  });

  it('parseMatcherExpr rejects a bare comparison on an unsupported field', () => {
    expect(() => parseMatcherExpr('tool_output.status == "ok"')).toThrow();
  });
});

// -------------------------------------------------------------------
// fieldNode -> jq compiler
// -------------------------------------------------------------------

describe('fieldNodeToJq', () => {
  it('compiles a single fieldMatch leaf', () => {
    const node: MatcherAstNode = {
      kind: 'fieldMatch',
      field: 'tool_input.command',
      pattern: 'git push',
    };
    expect(fieldNodeToJq(node)).toBe('((.tool_input.command // "") | test("git push"))');
  });

  it('compiles mcp_tool_name to .tool_name', () => {
    const node: MatcherAstNode = {
      kind: 'fieldMatch',
      field: 'mcp_tool_name',
      pattern: 'mcp__x__.*',
    };
    expect(fieldNodeToJq(node)).toBe('((.tool_name // "") | test("mcp__x__.*"))');
  });

  it('compiles AND / OR / NOT combinators', () => {
    const a: MatcherAstNode = {
      kind: 'fieldMatch',
      field: 'tool_input.file_path',
      pattern: '\\.md$',
    };
    const b: MatcherAstNode = {
      kind: 'fieldMatch',
      field: 'tool_input.file_path',
      pattern: 'README',
    };
    const andNode: MatcherAstNode = { kind: 'and', left: a, right: { kind: 'not', child: b } };
    const jq = fieldNodeToJq(andNode);
    expect(jq).toContain(' and ');
    expect(jq).toContain('| not');

    const orNode: MatcherAstNode = { kind: 'or', left: a, right: b };
    expect(fieldNodeToJq(orNode)).toContain(' or ');
  });

  it('produces a jq program that actually evaluates correctly (positive/negative pair)', async () => {
    const node: MatcherAstNode = {
      kind: 'fieldMatch',
      field: 'tool_input.command',
      pattern: 'git push',
    };
    const jq = fieldNodeToJq(node);

    const positive = await runBashCommand(
      `jq -e ${JSON.stringify(jq).replace(/^"|"$/g, "'")}`,
      JSON.stringify({ tool_input: { command: 'git push origin main' } })
    );
    // Fallback simpler invocation avoiding quoting ambiguity: use printf + jq directly.
    const positiveDirect = await runBashCommand(
      `printf '%s' "$(cat)" | jq -e '${jq.replace(/'/g, `'"'"'`)}'`,
      JSON.stringify({ tool_input: { command: 'git push origin main' } })
    );
    expect(positiveDirect.exitCode).toBe(0);

    const negativeDirect = await runBashCommand(
      `printf '%s' "$(cat)" | jq -e '${jq.replace(/'/g, `'"'"'`)}'`,
      JSON.stringify({ tool_input: { command: 'git status' } })
    );
    expect(negativeDirect.exitCode).not.toBe(0);
    // Sanity: the first (unused) computation above still ran without crashing the test.
    expect(typeof positive.exitCode).toBe('number');
  });
});

// -------------------------------------------------------------------
// buildGuardedCommand — execution-based positive/negative pair verification
// -------------------------------------------------------------------

describe('buildGuardedCommand', () => {
  it('runs the original command when the jq condition holds, and passes stdin through unchanged otherwise', async () => {
    const jqCond = '((.tool_input.command // "") | test("git push"))';
    const originalCommand = 'echo MARKER_FIRED >&2; cat';
    const guarded = buildGuardedCommand(jqCond, originalCommand);

    const positiveInput = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const positive = await runBashCommand(guarded, positiveInput);
    expect(positive.stderr).toContain('MARKER_FIRED');
    expect(positive.stdout).toBe(positiveInput);

    const negativeInput = JSON.stringify({ tool_input: { command: 'ls -la' } });
    const negative = await runBashCommand(guarded, negativeInput);
    expect(negative.stderr).not.toContain('MARKER_FIRED');
    expect(negative.stdout).toBe(negativeInput);
  });

  it('safely wraps a command containing embedded single quotes', async () => {
    const jqCond = '((.tool_input.file_path // "") | test("\\\\.py$"))';
    const originalCommand = `file_path=$(cat | jq -r '.tool_input.file_path // ""'); echo "GOT:$file_path"`;
    const guarded = buildGuardedCommand(jqCond, originalCommand);

    const input = JSON.stringify({ tool_input: { file_path: 'foo.py' } });
    const result = await runBashCommand(guarded, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('GOT:foo.py');
  });

  it('passes stdin through unchanged when jq itself errors (silent passthrough principle)', async () => {
    const guarded = buildGuardedCommand('this is not valid jq (((', 'echo SHOULD_NOT_RUN >&2');
    const input = JSON.stringify({ foo: 'bar' });
    const result = await runBashCommand(guarded, input);
    expect(result.stderr).not.toContain('SHOULD_NOT_RUN');
    expect(result.stdout).toBe(input);
  });
});

// -------------------------------------------------------------------
// convertHooksJson against the real repo hooks.json
// -------------------------------------------------------------------

describe('convertHooksJson (real .claude/hooks/hooks.json)', () => {
  it('converts every source entry with zero warnings (classification table is complete)', async () => {
    const hooksJson = await loadRealHooksJson();
    const sourceCount = countSourceEntries(hooksJson);

    // Redundant fixed assertion: catches unnoticed drift in hooks.json entry count.
    // Update this literal (and re-verify the 12-entry classification table) if
    // hooks.json intentionally gains/loses entries.
    expect(sourceCount).toBe(58);

    const { hooks, warnings } = convertHooksJson(hooksJson);
    expect(warnings).toEqual([]);

    const convertedCount = Object.values(hooks).reduce((sum, entries) => sum + entries.length, 0);
    expect(convertedCount).toBe(sourceCount);

    // Per-event entry counts must match 1:1 (no entry silently dropped).
    for (const [event, entries] of Object.entries(hooksJson.hooks)) {
      expect(hooks[event]?.length ?? 0).toBe(entries.length);
    }
  });

  it('produces JSON-serializable, schema-shaped output for every entry', async () => {
    const hooksJson = await loadRealHooksJson();
    const { hooks } = convertHooksJson(hooksJson);

    // Round-trips through JSON without throwing / losing data.
    const roundTripped = JSON.parse(JSON.stringify(hooks));
    expect(roundTripped).toEqual(hooks);

    for (const entries of Object.values(hooks)) {
      for (const entry of entries) {
        expect(Array.isArray(entry.hooks)).toBe(true);
        expect(entry.hooks.length).toBeGreaterThan(0);
        for (const cmd of entry.hooks) {
          expect(typeof cmd.type).toBe('string');
          if (cmd.type === 'command') {
            expect(typeof cmd.command).toBe('string');
          }
        }
      }
    }
  });

  it('the templates/ mirror of hooks.json converts identically to the root copy', async () => {
    const rootRaw = await readFile(HOOKS_JSON_PATH, 'utf-8');
    const templatesRaw = await readFile(TEMPLATES_HOOKS_JSON_PATH, 'utf-8');
    expect(templatesRaw).toBe(rootRaw); // R017 multi-copy consistency precondition

    const rootConverted = convertHooksJson(JSON.parse(rootRaw));
    const templatesConverted = convertHooksJson(JSON.parse(templatesRaw));
    expect(templatesConverted).toEqual(rootConverted);
  });

  describe.each(
    CLASSIFICATION_TABLE
  )('classified entry: $event / "$description"', (classification: ClassificationEntry) => {
    it(`is converted per its "${classification.decision}" decision`, async () => {
      const hooksJson = await loadRealHooksJson();
      const rawEntry = findRawEntry(hooksJson, classification.event, classification.description);
      const { hooks } = convertHooksJson(hooksJson);
      const convertedEntry = (hooks[classification.event] ?? []).find(
        (e) => e.description === classification.description
      );
      expect(convertedEntry).toBeDefined();
      if (!convertedEntry) return;

      // Matcher must never leak the DSL's tool_input syntax into CC's regex matcher.
      expect(convertedEntry.matcher ?? '').not.toContain('tool_input');
      expect(convertedEntry.matcher ?? '').not.toContain('==');

      const originalCommand = rawEntry.hooks[0]?.command;
      const convertedCommand = convertedEntry.hooks[0]?.command;
      expect(typeof originalCommand).toBe('string');
      expect(typeof convertedCommand).toBe('string');

      if (classification.decision === 'drop-condition') {
        // Script already self-guards: command must be byte-identical, unwrapped.
        expect(convertedCommand).toBe(originalCommand);
      } else {
        // wrap-guard: command must differ (guarded) but still contain the full
        // original command body verbatim, and the guard machinery.
        expect(convertedCommand).not.toBe(originalCommand);
        expect(convertedCommand as string).toContain('jq -e');
        expect(convertedCommand as string).toContain(originalCommand as string);
      }
    });
  });
});

// -------------------------------------------------------------------
// mergeHooksIntoSettings — file-level merge behavior
// -------------------------------------------------------------------

describe('mergeHooksIntoSettings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-hooks-settings-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('replaces the hooks key while preserving pre-existing settings.json keys', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    const hooksJsonPath = join(tempDir, 'hooks.json');

    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          permissions: { allow: ['Bash(git:*)'], defaultMode: 'bypassPermissions' },
          statusLine: { type: 'command', command: '.claude/statusline.sh' },
          outputStyle: 'korean-engineer',
        },
        null,
        2
      ),
      'utf-8'
    );
    await writeFile(hooksJsonPath, await readFile(HOOKS_JSON_PATH, 'utf-8'), 'utf-8');

    const result = await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings).toEqual([]);

    const merged = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(merged.permissions.allow).toEqual(['Bash(git:*)']);
    expect(merged.statusLine.command).toBe('.claude/statusline.sh');
    expect(merged.outputStyle).toBe('korean-engineer');
    expect(merged.hooks).toBeDefined();
    expect(Object.keys(merged.hooks).length).toBeGreaterThan(0);
  });

  it('creates a fresh settings file (containing only hooks) when the target does not yet exist', async () => {
    const settingsPath = join(tempDir, 'settings.local.json');
    const hooksJsonPath = join(tempDir, 'hooks.json');
    await writeFile(hooksJsonPath, await readFile(HOOKS_JSON_PATH, 'utf-8'), 'utf-8');

    const result = await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    expect(result.warnings).toEqual([]);

    const merged = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(merged.hooks).toBeDefined();
  });

  it('ensures the settings directory exists before writing', async () => {
    const settingsPath = join(tempDir, 'nested', 'dir', 'settings.local.json');
    const hooksJsonPath = join(tempDir, 'hooks.json');
    await writeFile(hooksJsonPath, await readFile(HOOKS_JSON_PATH, 'utf-8'), 'utf-8');

    await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    const merged = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(merged.hooks).toBeDefined();
  });

  it('is idempotent across repeated merges', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    const hooksJsonPath = join(tempDir, 'hooks.json');
    await mkdir(join(tempDir), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ customUserKey: 'preserved' }), 'utf-8');
    await writeFile(hooksJsonPath, await readFile(HOOKS_JSON_PATH, 'utf-8'), 'utf-8');

    await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    const first = JSON.parse(await readFile(settingsPath, 'utf-8'));

    await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    const second = JSON.parse(await readFile(settingsPath, 'utf-8'));

    expect(second.hooks).toEqual(first.hooks);
    expect(second.customUserKey).toBe('preserved');
  });

  it('treats an invalid/malformed existing settings file as empty rather than throwing', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    const hooksJsonPath = join(tempDir, 'hooks.json');
    await writeFile(settingsPath, '{ not valid json', 'utf-8');
    await writeFile(hooksJsonPath, await readFile(HOOKS_JSON_PATH, 'utf-8'), 'utf-8');

    const result = await mergeHooksIntoSettings(settingsPath, hooksJsonPath);
    expect(result.warnings).toEqual([]);
    const merged = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(merged.hooks).toBeDefined();
  });
});

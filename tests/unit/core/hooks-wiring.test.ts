/**
 * Hook wiring regression tests (#1767).
 *
 * Defect: hook commands in hooks.json / settings.json referenced `.claude/hooks/...`
 * relative to the session cwd. When a leaked `cd` moved the session cwd off the repo root,
 * every hook failed with exit 127 (non-blocking), so all guards silently failed open.
 *
 * Contract under test:
 *   1. settings.json `hooks` stays in sync with the converter output of hooks.json.
 *   2. No hook command references `.claude/hooks/` cwd-relatively; each is anchored with
 *      `${CLAUDE_PROJECT_DIR:-.}`.
 *   3. Mid-session scripts (PreToolUse/PostToolUse) locate the repo root themselves and do
 *      not depend on cwd.
 *
 * Nothing here writes to tracked files (the converter runs against temp copies).
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeHooksIntoSettings } from '../../../src/core/hooks-settings.js';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

// biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell expansion matched verbatim, not a JS template
const ANCHOR = '${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/';

interface WiringPair {
  label: string;
  hooksJson: string;
  settingsJson: string;
}

const PAIRS: WiringPair[] = [
  {
    label: 'root',
    hooksJson: join(REPO_ROOT, '.claude/hooks/hooks.json'),
    settingsJson: join(REPO_ROOT, '.claude/settings.json'),
  },
  {
    label: 'templates',
    hooksJson: join(REPO_ROOT, 'templates/.claude/hooks/hooks.json'),
    settingsJson: join(REPO_ROOT, 'templates/.claude/settings.json'),
  },
];

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** True when a command references `.claude/hooks/` relative to cwd (not anchored/absolute). */
export function hasCwdRelativeHookRef(command: string): boolean {
  return /(^|[\s"'`(;&|])(\.\/)?\.claude\/hooks\//.test(command);
}

/** True when a command references `.claude/hooks/` at all. */
function referencesHooksDir(command: string): boolean {
  return command.includes('.claude/hooks/');
}

/** Recursively collect every string-valued `command` field. */
function collectCommands(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectCommands(item, out);
    }
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'command' && typeof value === 'string') {
        out.push(value);
      } else {
        collectCommands(value, out);
      }
    }
  }
  return out;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Commands that reference `.claude/hooks/` without the CLAUDE_PROJECT_DIR anchor. */
function findUnanchoredHookCommands(commands: string[]): string[] {
  return commands.filter(
    (cmd) => referencesHooksDir(cmd) && (hasCwdRelativeHookRef(cmd) || !cmd.includes(ANCHOR))
  );
}

function assertNoOffenders(label: string, source: string, commands: string[]): void {
  const offenders = findUnanchoredHookCommands(commands);
  if (offenders.length > 0) {
    throw new Error(
      `${label}: ${offenders.length} cwd-relative hook command(s) in ${source} ` +
        `(of ${commands.length} total); expected anchor "${ANCHOR}". ` +
        `First offenders: ${JSON.stringify(offenders.slice(0, 3))}`
    );
  }
}

interface SpawnOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Run a script by absolute path with a given cwd/env, bounded by a timeout. */
function runScript(
  scriptPath: string,
  stdinJson: unknown,
  cwd: string,
  projectDir: string | null
): SpawnOutcome {
  const env: Record<string, string | undefined> = { ...process.env };
  // Explicitly drop any CLAUDE_PROJECT_DIR inherited from CC / the developer shell.
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir !== null) {
    env.CLAUDE_PROJECT_DIR = projectDir;
  }
  const result = Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd,
    env,
    stdin: new TextEncoder().encode(JSON.stringify(stdinJson)),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15_000,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

// -------------------------------------------------------------------
// Case 1: drift guard (settings.json hooks == converter(hooks.json))
// -------------------------------------------------------------------

describe('hooks wiring: settings.json hooks block matches converter output', () => {
  let scratch = '';

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'omcustom-hooks-wiring-'));
  });

  afterAll(() => {
    if (scratch) {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  for (const pair of PAIRS) {
    it(`${pair.label}: tracked settings.json hooks deep-equals converter output (run: bun run build)`, async () => {
      const copy = join(scratch, `${pair.label}-settings.json`);
      copyFileSync(pair.settingsJson, copy);

      const { warnings } = await mergeHooksIntoSettings(copy, pair.hooksJson);
      expect(warnings).toEqual([]);

      const tracked = readJson(pair.settingsJson) as { hooks?: unknown };
      const regenerated = readJson(copy) as { hooks?: unknown };
      expect(tracked.hooks).toEqual(regenerated.hooks);
    });
  }
});

// -------------------------------------------------------------------
// Case 2: no cwd-relative hook commands
// -------------------------------------------------------------------

describe('hooks wiring: cwd-relative detection predicate', () => {
  it.each([
    'bash .claude/hooks/scripts/x.sh',
    'bash ./.claude/hooks/scripts/x.sh',
    '.claude/hooks/scripts/omcustom-auto-update.sh',
  ])('flags cwd-relative command: %s', (command) => {
    expect(hasCwdRelativeHookRef(command)).toBe(true);
  });

  it.each([
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell expansion matched verbatim, not a JS template
    'bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/x.sh"',
    'echo hello && true',
  ])('does not flag: %s', (command) => {
    expect(hasCwdRelativeHookRef(command)).toBe(false);
  });
});

describe('hooks wiring: no cwd-relative hook commands (#1767)', () => {
  for (const pair of PAIRS) {
    it(`${pair.label} hooks.json: every .claude/hooks command is CLAUDE_PROJECT_DIR-anchored`, () => {
      assertNoOffenders(pair.label, 'hooks.json', collectCommands(readJson(pair.hooksJson)));
    });

    it(`${pair.label} settings.json: every .claude/hooks command is CLAUDE_PROJECT_DIR-anchored`, () => {
      assertNoOffenders(pair.label, 'settings.json', collectCommands(readJson(pair.settingsJson)));
    });
  }
});

// -------------------------------------------------------------------
// Case 3: script-internal paths must not depend on cwd
// -------------------------------------------------------------------

const SCHEMA_VALIDATOR = join(REPO_ROOT, '.claude/hooks/scripts/schema-validator.sh');
const SKILL_COUNT_REMINDER = join(REPO_ROOT, '.claude/hooks/skill-count-reminder.sh');
const SUBDIR_CWD = join(REPO_ROOT, 'src');

// Input the validator's Bash branch warns about ONLY when the schema file was located.
const DANGEROUS_BASH_INPUT = {
  tool_name: 'Bash',
  tool_input: { command: 'sudo rm -rf /etc' },
};

const SKILL_EDIT_INPUT = {
  tool_name: 'Write',
  tool_input: { file_path: `${REPO_ROOT}/.claude/skills/example-skill/SKILL.md` },
};

function actualSkillCount(): number {
  const result = Bun.spawnSync({
    cmd: ['find', '.claude/skills', '-name', 'SKILL.md'],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15_000,
  });
  return result.stdout
    .toString()
    .split('\n')
    .filter((line) => line.length > 0).length;
}

describe('hooks wiring: mid-session scripts locate the repo root themselves (#1767)', () => {
  it('fixture sanity: subdirectory cwd and schema file exist', () => {
    expect(existsSync(SUBDIR_CWD)).toBe(true);
    expect(existsSync(join(REPO_ROOT, '.claude/schemas/tool-inputs.json'))).toBe(true);
    expect(actualSkillCount()).toBeGreaterThan(0);
  });

  describe('schema-validator.sh (observable: [Schema] advisory emitted = schema file found)', () => {
    it('control: repo-root cwd, no CLAUDE_PROJECT_DIR -> advisory emitted', () => {
      const r = runScript(SCHEMA_VALIDATOR, DANGEROUS_BASH_INPUT, REPO_ROOT, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('[Schema]');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR deleted -> still validates', () => {
      const r = runScript(SCHEMA_VALIDATOR, DANGEROUS_BASH_INPUT, SUBDIR_CWD, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('[Schema]');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<repo root> -> validates', () => {
      const r = runScript(SCHEMA_VALIDATOR, DANGEROUS_BASH_INPUT, SUBDIR_CWD, REPO_ROOT);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('[Schema]');
    });
  });

  describe('skill-count-reminder.sh (observable: reported count equals find at repo root)', () => {
    it('control: repo-root cwd, no CLAUDE_PROJECT_DIR -> correct count', () => {
      const r = runScript(SKILL_COUNT_REMINDER, SKILL_EDIT_INPUT, REPO_ROOT, null);
      expect(r.stderr).toContain(`Current skill count: ${actualSkillCount()}`);
      expect(r.exitCode).toBe(0);
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR deleted -> correct count', () => {
      const r = runScript(SKILL_COUNT_REMINDER, SKILL_EDIT_INPUT, SUBDIR_CWD, null);
      expect(r.stderr).toContain(`Current skill count: ${actualSkillCount()}`);
      expect(r.exitCode).toBe(0);
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<repo root> -> correct count', () => {
      const r = runScript(SKILL_COUNT_REMINDER, SKILL_EDIT_INPUT, SUBDIR_CWD, REPO_ROOT);
      expect(r.stderr).toContain(`Current skill count: ${actualSkillCount()}`);
      expect(r.exitCode).toBe(0);
    });
  });
});

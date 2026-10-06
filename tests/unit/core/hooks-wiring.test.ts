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
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeHooksIntoSettings } from '../../../src/core/hooks-settings.js';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

// runScript/runIsolatedScript await synchronous children before this file teardown.
afterAll(() => {
  rmSync(`/tmp/.claude-session-fixes-${process.pid}`, { force: true });
  rmSync(`/tmp/.claude-env-status-${process.pid}`, { force: true });
});

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

// -------------------------------------------------------------------
// Case 4 (C-T1, #1770): SessionStart scripts resolve the project root from CLAUDE_PROJECT_DIR
// -------------------------------------------------------------------

describe('hooks wiring: SessionStart scripts honor CLAUDE_PROJECT_DIR from a subdirectory cwd (#1770)', () => {
  const CLAUDE_MD_REINJECT = join(REPO_ROOT, '.claude/hooks/scripts/claude-md-reinject.sh');
  const ADAPTIVE_HARNESS_SCAN = join(REPO_ROOT, '.claude/hooks/scripts/adaptive-harness-scan.sh');
  const STALE_TODO_SCANNER = join(REPO_ROOT, '.claude/hooks/scripts/stale-todo-scanner.sh');

  const REINJECT_MARKER = 'FIXTURE-ROOT-CLAUDE-MD-MARKER-1770';
  const CWD_ONLY_MARKER = 'CWD-ONLY-CLAUDE-MD-MARKER-1770';
  const hasJq = Bun.which('jq') !== null;

  let fixtureRoot = '';
  let fixtureSub = '';
  let plainCwd = ''; // non-git tmp dir with its own files (fallback-to-cwd negative cases)
  let plainEmptyCwd = ''; // non-git tmp dir with no project files at all

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t1-root-'));
    fixtureSub = join(fixtureRoot, 'packages', 'deep');
    mkdirSync(fixtureSub, { recursive: true });

    // reinject fixture
    writeFileSync(join(fixtureRoot, 'CLAUDE.md'), `# Fixture\n\n${REINJECT_MARKER}\n`);

    // stale-todo fixture: 1 pending item, ancient date
    writeFileSync(
      join(fixtureRoot, 'TODO.md'),
      '# TODO\n\n> Last updated: 2020-01-01\n\n- [ ] only pending item\n- [x] done item\n'
    );

    // adaptive fixture: profile older than package.json -> "may be stale"
    mkdirSync(join(fixtureRoot, '.claude'), { recursive: true });
    const profile = join(fixtureRoot, '.claude/project-profile.yaml');
    writeFileSync(profile, 'name: fixture\n');
    utimesSync(profile, new Date('2001-01-01T00:00:00Z'), new Date('2001-01-01T00:00:00Z'));
    writeFileSync(join(fixtureRoot, 'package.json'), '{"name":"fixture"}\n');

    // negative-case cwd with its own (different) files; tmpdir is not inside a git repo
    plainCwd = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t1-plain-'));
    writeFileSync(join(plainCwd, 'CLAUDE.md'), `# Plain\n\n${CWD_ONLY_MARKER}\n`);
    writeFileSync(
      join(plainCwd, 'TODO.md'),
      '# TODO\n\n> Last updated: 2020-01-01\n\n- [ ] a\n- [ ] b\n- [ ] c\n'
    );
    plainEmptyCwd = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t1-empty-'));
  });

  afterAll(() => {
    for (const dir of [fixtureRoot, plainCwd, plainEmptyCwd]) {
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function additionalContext(stdout: string): string {
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput?: { additionalContext?: string };
    };
    return parsed.hookSpecificOutput?.additionalContext ?? '';
  }

  describe('claude-md-reinject.sh (observable: additionalContext carries fixture CLAUDE.md)', () => {
    it.skipIf(!hasJq)('control: fixture-root cwd, var unset -> fixture content', () => {
      // fixtureRoot is not a git repo, so the fallback resolves to pwd == fixtureRoot
      const r = runScript(CLAUDE_MD_REINJECT, { source: 'compact' }, fixtureRoot, null);
      expect(r.exitCode).toBe(0);
      expect(additionalContext(r.stdout)).toContain(REINJECT_MARKER);
    });

    it.skipIf(!hasJq)(
      'subdirectory cwd, CLAUDE_PROJECT_DIR=<fixture root> -> fixture content',
      () => {
        const r = runScript(CLAUDE_MD_REINJECT, { source: 'compact' }, fixtureSub, fixtureRoot);
        expect(r.exitCode).toBe(0);
        expect(additionalContext(r.stdout)).toContain(REINJECT_MARKER);
      }
    );

    it.skipIf(!hasJq)('negative: var unset, non-git cwd -> falls back to cwd CLAUDE.md', () => {
      const r = runScript(CLAUDE_MD_REINJECT, { source: 'compact' }, plainCwd, null);
      expect(r.exitCode).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(CWD_ONLY_MARKER);
      expect(ctx).not.toContain(REINJECT_MARKER);
      expect(r.stderr).not.toContain('No such file');
    });

    it.skipIf(!hasJq)('negative: var unset, non-git cwd without CLAUDE.md -> silent', () => {
      const r = runScript(CLAUDE_MD_REINJECT, { source: 'compact' }, plainEmptyCwd, null);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr).not.toContain('No such file');
    });
  });

  describe('stale-todo-scanner.sh (observable: stderr reports fixture TODO.md counts)', () => {
    it('control: fixture-root cwd, var unset -> fixture TODO.md', () => {
      const r = runScript(STALE_TODO_SCANNER, {}, fixtureRoot, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('TODO.md: last updated');
      expect(r.stderr).toContain('Pending items: 1');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<fixture root> -> fixture TODO.md', () => {
      const r = runScript(STALE_TODO_SCANNER, {}, fixtureSub, fixtureRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('TODO.md: last updated');
      expect(r.stderr).toContain('Pending items: 1');
    });

    it('negative: var unset, non-git cwd -> falls back to cwd TODO.md, no cd error', () => {
      const r = runScript(STALE_TODO_SCANNER, {}, plainCwd, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('Pending items: 3');
      expect(r.stderr).not.toContain('Pending items: 1');
      expect(r.stderr).not.toContain('No such file');
    });
  });

  describe('adaptive-harness-scan.sh (observable: staleness verdict comes from the fixture root)', () => {
    it('control: fixture-root cwd, var unset -> profile stale (package.json newer)', () => {
      const r = runScript(ADAPTIVE_HARNESS_SCAN, {}, fixtureRoot, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('Project profile may be stale');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<fixture root> -> uses fixture profile', () => {
      const r = runScript(ADAPTIVE_HARNESS_SCAN, {}, fixtureSub, fixtureRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('Project profile may be stale');
      expect(r.stderr).not.toContain('No project profile found');
    });

    it('negative: var unset, non-git cwd without profile -> falls back to cwd, no file error', () => {
      const r = runScript(ADAPTIVE_HARNESS_SCAN, {}, plainEmptyCwd, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('No project profile found');
      expect(r.stderr).not.toContain('No such file');
    });
  });
});

// -------------------------------------------------------------------
// Case 5 (C-T2, #1770): session-autofix / session-env-check / omcustom-auto-update anchor to ROOT
// -------------------------------------------------------------------

describe('hooks wiring: session-autofix / session-env-check / omcustom-auto-update honor CLAUDE_PROJECT_DIR (#1770 C-T2)', () => {
  const SESSION_AUTOFIX = join(REPO_ROOT, '.claude/hooks/scripts/session-autofix.sh');
  const SESSION_ENV_CHECK = join(REPO_ROOT, '.claude/hooks/scripts/session-env-check.sh');
  const OMCUSTOM_AUTO_UPDATE = join(REPO_ROOT, '.claude/hooks/scripts/omcustom-auto-update.sh');
  const TEMPLATE_AUTO_UPDATE = join(
    REPO_ROOT,
    'templates/.claude/hooks/scripts/omcustom-auto-update.sh'
  );

  const ROOT_LINE =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell text matched verbatim, not a JS template
    'ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"';
  const GUARDED_CD = '{ [ -d "$ROOT" ] && cd "$ROOT"; } 2>/dev/null || true';

  let fixtureRoot = '';
  let fixtureSub = '';
  let fixtureHome = '';
  let plainCwd = ''; // non-git tmp dir with its own files (fallback-to-cwd negative cases)
  let lockedDir = ''; // mode-000 dir used as CLAUDE_PROJECT_DIR (guarded-cd case)
  let missingDir = ''; // path that does not exist

  const PASS_THROUGH = { hook_event_name: 'SessionStart', source: 'startup' };

  /** Like runScript, but also isolates HOME and accepts extra env (HOME is never the real one). */
  function runIsolated(
    scriptPath: string,
    cwd: string,
    projectDir: string | null,
    extraEnv: Record<string, string> = {}
  ): SpawnOutcome {
    const env: Record<string, string | undefined> = { ...process.env, ...extraEnv };
    delete env.CLAUDE_PROJECT_DIR;
    if (projectDir !== null) {
      env.CLAUDE_PROJECT_DIR = projectDir;
    }
    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath],
      cwd,
      env,
      stdin: new TextEncoder().encode(JSON.stringify(PASS_THROUGH)),
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

  function writeAgent(root: string, name: string, skills: string[]): void {
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    writeFileSync(
      join(root, '.claude', 'agents', `${name}.md`),
      `---\nname: ${name}\nskills: [${skills.join(', ')}]\n---\n\nbody\n`
    );
  }

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t2-root-'));
    fixtureSub = join(fixtureRoot, 'packages', 'deep');
    mkdirSync(fixtureSub, { recursive: true });
    fixtureHome = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t2-home-'));
    plainCwd = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t2-plain-'));
    lockedDir = mkdtempSync(join(tmpdir(), 'omcustom-hooks-c-t2-locked-'));
    missingDir = join(fixtureRoot, 'does-not-exist');

    // autofix fixture: one broken skill reference at the fixture root, two in the plain cwd
    writeAgent(fixtureRoot, 'a', ['ghost-skill']);
    writeAgent(plainCwd, 'b', ['ghost-one', 'ghost-two']);

    // env-check fixture: installed 0.0.1 at the fixture root, 1.0.0 in the plain cwd;
    // cache (read from the isolated HOME) says latest is 9.9.9
    writeFileSync(join(fixtureRoot, '.omcustomrc.json'), '{"version": "0.0.1"}\n');
    writeFileSync(join(plainCwd, '.omcustomrc.json'), '{"version": "1.0.0"}\n');
    mkdirSync(join(fixtureHome, '.oh-my-customcode'), { recursive: true });
    writeFileSync(
      join(fixtureHome, '.oh-my-customcode', 'self-update-cache.json'),
      '{"checkedAt": "2026-01-01T00:00:00Z", "latestVersion": "9.9.9"}\n'
    );

    chmodSync(lockedDir, 0o000);
  });

  afterAll(() => {
    // restore permissions before cleanup
    if (lockedDir) {
      chmodSync(lockedDir, 0o700);
    }
    for (const dir of [fixtureRoot, fixtureHome, plainCwd, lockedDir]) {
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  describe('session-autofix.sh (observable: broken-refs count + log location)', () => {
    it('control: fixture-root cwd, var unset -> fixture agent reported', () => {
      const r = runIsolated(SESSION_AUTOFIX, fixtureRoot, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('1 broken skill reference');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<fixture root> -> fixture agent, log under ROOT', () => {
      const r = runIsolated(SESSION_AUTOFIX, fixtureSub, fixtureRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('1 broken skill reference');
      expect(existsSync(join(fixtureRoot, '.claude', 'outputs', 'session-fixes'))).toBe(true);
      expect(existsSync(join(fixtureSub, '.claude'))).toBe(false);
    });

    it('negative: var unset, non-git cwd -> falls back to cwd agents, no cd error', () => {
      const r = runIsolated(SESSION_AUTOFIX, plainCwd, null);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('2 broken skill reference');
      expect(r.stderr).not.toContain('1 broken skill reference');
      expect(r.stderr).not.toContain('No such file');
    });

    it('guard: CLAUDE_PROJECT_DIR points at a missing dir -> exit 0, cwd fallback', () => {
      const r = runIsolated(SESSION_AUTOFIX, plainCwd, missingDir);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('2 broken skill reference');
      expect(r.stderr).not.toContain('No such file');
    });

    it('guard: CLAUDE_PROJECT_DIR points at a mode-000 dir -> exit 0, no cd error leaked', () => {
      const r = runIsolated(SESSION_AUTOFIX, plainCwd, lockedDir);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toContain('Permission denied');
    });
  });

  describe('session-env-check.sh (observable: [Update Check] reads .omcustomrc.json from ROOT)', () => {
    const home = (): Record<string, string> => ({ HOME: fixtureHome });

    it('control: fixture-root cwd, var unset -> update available for fixture version', () => {
      const r = runIsolated(SESSION_ENV_CHECK, fixtureRoot, null, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('v9.9.9 available (current: v0.0.1)');
    });

    it('subdirectory cwd, CLAUDE_PROJECT_DIR=<fixture root> -> fixture .omcustomrc.json', () => {
      const r = runIsolated(SESSION_ENV_CHECK, fixtureSub, fixtureRoot, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('v9.9.9 available (current: v0.0.1)');
    });

    it('subdirectory cwd, var unset, non-git -> project file NOT found (documents the defect shape)', () => {
      const r = runIsolated(SESSION_ENV_CHECK, fixtureSub, null, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('oh-my-customcode not detected in this project');
    });

    it('negative: var unset, non-git cwd -> falls back to cwd .omcustomrc.json, no cd error', () => {
      const r = runIsolated(SESSION_ENV_CHECK, plainCwd, null, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('v9.9.9 available (current: v1.0.0)');
      expect(r.stderr).not.toContain('current: v0.0.1');
      expect(r.stderr).not.toContain('No such file');
    });

    it('guard: CLAUDE_PROJECT_DIR points at a missing dir -> exit 0 under set -e, cwd fallback', () => {
      const r = runIsolated(SESSION_ENV_CHECK, plainCwd, missingDir, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('current: v1.0.0');
      expect(r.stderr).not.toContain('No such file');
    });

    it('guard: CLAUDE_PROJECT_DIR points at a mode-000 dir -> exit 0 under set -e', () => {
      const r = runIsolated(SESSION_ENV_CHECK, plainCwd, lockedDir, home());
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toContain('Permission denied');
    });
  });

  describe('omcustom-auto-update.sh (static: network/prompt paths are not exercised)', () => {
    const skip = { OMCUSTOM_SKIP_AUTO_UPDATE: 'true' };

    for (const [label, path] of [
      ['root', OMCUSTOM_AUTO_UPDATE],
      ['templates', TEMPLATE_AUTO_UPDATE],
    ] as const) {
      it(`${label} copy: ROOT + guarded cd precede the first .omcustomrc.json read`, () => {
        const src = readFileSync(path, 'utf-8');
        const rootIdx = src.indexOf(ROOT_LINE);
        const cdIdx = src.indexOf(GUARDED_CD);
        const firstRead = src.indexOf('[ -f ".omcustomrc.json" ]');
        expect(rootIdx).toBeGreaterThan(-1);
        expect(cdIdx).toBeGreaterThan(rootIdx);
        expect(firstRead).toBeGreaterThan(cdIdx);
      });
    }

    it('templates copy is identical to the root copy', () => {
      expect(readFileSync(TEMPLATE_AUTO_UPDATE, 'utf-8')).toBe(
        readFileSync(OMCUSTOM_AUTO_UPDATE, 'utf-8')
      );
    });

    it('subdirectory cwd + var=<fixture root> + skip flag -> exit 0, stdin passed through', () => {
      const r = runIsolated(OMCUSTOM_AUTO_UPDATE, fixtureSub, fixtureRoot, skip);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(PASS_THROUGH);
      expect(r.stderr).not.toContain('No such file');
    });

    it('negative: var unset, non-git cwd + skip flag -> exit 0, no cd error', () => {
      const r = runIsolated(OMCUSTOM_AUTO_UPDATE, plainCwd, null, skip);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(PASS_THROUGH);
      expect(r.stderr).not.toContain('No such file');
    });

    it('guard: missing dir and mode-000 dir as CLAUDE_PROJECT_DIR -> exit 0, pass-through', () => {
      for (const dir of [missingDir, lockedDir]) {
        const r = runIsolated(OMCUSTOM_AUTO_UPDATE, plainCwd, dir, skip);
        expect(r.exitCode).toBe(0);
        expect(JSON.parse(r.stdout)).toEqual(PASS_THROUGH);
        expect(r.stderr).not.toContain('No such file');
        expect(r.stderr).not.toContain('Permission denied');
      }
    });
  });
});

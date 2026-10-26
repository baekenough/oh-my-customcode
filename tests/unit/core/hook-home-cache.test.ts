/**
 * Hook self-update cache path vs. invalid HOME (#1775).
 *
 * omcustom-auto-update.sh and session-env-check.sh used to build the cache path as
 * "$HOME/.oh-my-customcode", so HOME="" resolved to "/.oh-my-customcode". Contract: when HOME is
 * unset, empty or not absolute, both hooks skip the cache entirely (no read, no write, no mkdir).
 * This deliberately differs from the TS resolver (src/utils/home.ts), which falls back to the
 * OS/passwd home; the shell hooks must not do that (tests would touch the real home).
 *
 * Every spawned script gets a temp or invalid HOME; npm/timeout are stubbed via PATH so nothing
 * reaches the network. Nothing here reads or writes the real user's home.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../../..');
const AUTO_UPDATE = join(REPO_ROOT, '.claude/hooks/scripts/omcustom-auto-update.sh');
const ENV_CHECK = join(REPO_ROOT, '.claude/hooks/scripts/session-env-check.sh');
const INPUT = JSON.stringify({ event: 'session_start' });

let tmp: string;
let projectDir: string; // non-git, has .omcustomrc.json version 1.0.0
let binDir: string; // stub npm + timeout
let npmLog: string;
let gitProjectDir: string; // temp `git init` repo with one commit + .omcustomrc.json

function run(
  script: string,
  home: string | null,
  extra: string[] = [],
  project: string = projectDir
): { rc: number | null; stdout: string; stderr: string } {
  const env: Record<string, string> = {
    PATH: `${binDir}:/usr/bin:/bin:/sbin:/opt/homebrew/bin`, // /sbin: macOS md5
    CLAUDE_PROJECT_DIR: project,
    TMPDIR: tmp,
  };
  if (home !== null) env.HOME = home;
  const r = spawnSync('/bin/bash', [...extra, script], {
    input: INPUT,
    env,
    cwd: project,
    encoding: 'utf-8',
    timeout: 30000,
  });
  return { rc: r.status, stdout: r.stdout, stderr: r.stderr };
}

function makeHomeWithCache(content: string): string {
  const home = mkdtempSync(join(tmp, 'home-'));
  mkdirSync(join(home, '.oh-my-customcode'), { recursive: true });
  writeFileSync(join(home, '.oh-my-customcode', 'self-update-cache.json'), content);
  return home;
}

function snapshot(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map(String).sort();
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'omcc-hook-home-cache-'));
  projectDir = join(tmp, 'project');
  binDir = join(tmp, 'bin');
  npmLog = join(tmp, 'npm.log');
  mkdirSync(projectDir);
  mkdirSync(binDir);
  writeFileSync(join(projectDir, '.omcustomrc.json'), '{"version": "1.0.0"}\n');
  gitProjectDir = join(tmp, 'gitproject');
  mkdirSync(gitProjectDir);
  writeFileSync(join(gitProjectDir, '.omcustomrc.json'), '{"version": "1.0.0"}\n');
  const git = (...args: string[]) =>
    spawnSync('git', args, {
      cwd: gitProjectDir,
      env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: tmp, GIT_CONFIG_NOSYSTEM: '1' },
      encoding: 'utf-8',
    });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'init');
  // Stub npm: records the call, reports latest = 1.0.0 (same as installed -> "up to date").
  writeFileSync(join(binDir, 'npm'), `#!/bin/bash\necho "$*" >> "${npmLog}"\necho 1.0.0\n`);
  // Stub timeout: drop the duration argument and run the command.
  writeFileSync(join(binDir, 'timeout'), '#!/bin/bash\nshift\nexec "$@"\n');
  chmodSync(join(binDir, 'npm'), 0o755);
  chmodSync(join(binDir, 'timeout'), 0o755);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  // session-env-check.sh writes /tmp/.claude-env-status-$PPID; $PPID is this process.
  rmSync(`/tmp/.claude-env-status-${process.pid}`, { force: true });
});

const INVALID_HOMES: Array<[string, string | null]> = [
  ['HOME=""', ''],
  ['HOME unset', null],
  ['HOME=relative/dir', 'relative/dir'],
];

describe('omcustom-auto-update.sh cache with invalid HOME (#1775)', () => {
  for (const [label, home] of INVALID_HOMES) {
    it(`${label}: rc 0, cache skipped, no /.oh-my-customcode access, nothing created`, () => {
      const before = snapshot(tmp);
      const r = run(AUTO_UPDATE, home, ['-x']);
      expect(r.rc).toBe(0);
      expect(r.stdout.trim()).toBe(INPUT);
      expect(r.stderr).not.toContain('.oh-my-customcode');
      expect(existsSync('/.oh-my-customcode')).toBe(false);
      // relative HOME must not have created a relative dir under cwd either
      expect(existsSync(join(projectDir, 'relative'))).toBe(false);
      expect(existsSync(join(projectDir, '.oh-my-customcode'))).toBe(false);
      // only the npm stub log may appear (the fetch path is otherwise unchanged)
      const created = snapshot(tmp).filter((p) => !before.includes(p));
      expect(created.every((p) => p === 'npm.log')).toBe(true);
    });
  }

  it('positive: valid temp HOME, no cache -> fetch via npm and cache written under that HOME', () => {
    const home = mkdtempSync(join(tmp, 'home-'));
    const r = run(AUTO_UPDATE, home);
    expect(r.rc).toBe(0);
    const cache = join(home, '.oh-my-customcode', 'self-update-cache.json');
    expect(existsSync(cache)).toBe(true);
    const data = JSON.parse(readFileSync(cache, 'utf-8'));
    expect(data.version).toBe('1.0.0');
    expect(data.source).toBe('npm-registry');
  });

  it('positive: valid temp HOME with fresh cache -> cache hit, npm not called', () => {
    const now = Math.floor(Date.now() / 1000);
    const home = makeHomeWithCache(
      `{"version": "1.0.0", "timestamp": ${now}, "source": "npm-registry"}`
    );
    rmSync(npmLog, { force: true });
    const r = run(AUTO_UPDATE, home);
    expect(r.rc).toBe(0);
    expect(existsSync(npmLog)).toBe(false);
  });
});

describe('session-env-check.sh cache with invalid HOME (#1775)', () => {
  for (const [label, home] of INVALID_HOMES) {
    it(`${label}: rc 0, cache skipped (no-cache), no /.oh-my-customcode access`, () => {
      const r = run(ENV_CHECK, home, ['-x']);
      expect(r.rc).toBe(0);
      expect(r.stdout.trim()).toBe(INPUT);
      expect(r.stderr).not.toContain('.oh-my-customcode/');
      expect(r.stderr).not.toContain('available (current:');
      expect(existsSync('/.oh-my-customcode')).toBe(false);
      expect(existsSync(join(projectDir, '.oh-my-customcode'))).toBe(false);
      const status = readFileSync(`/tmp/.claude-env-status-${process.pid}`, 'utf-8');
      expect(status).toContain('omcustom_update=no-cache');
    });
  }

  it('positive: valid temp HOME with newer cached version -> update available', () => {
    const home = makeHomeWithCache('{"latestVersion": "9.9.9"}');
    const r = run(ENV_CHECK, home);
    expect(r.rc).toBe(0);
    expect(r.stderr).toContain('v9.9.9 available (current: v1.0.0)');
  });
});

describe('session-env-check.sh session-state write with invalid HOME, inside a git repo (#1775)', () => {
  for (const [label, home] of INVALID_HOMES) {
    it(`${label}: rc 0, no session-state dir created, rest of hook continues`, () => {
      const before = snapshot(tmp);
      const r = run(ENV_CHECK, home, [], gitProjectDir);
      expect(r.rc).toBe(0);
      expect(r.stdout.trim()).toBe(INPUT);
      expect(r.stderr).toContain('Session Environment Check');
      expect(existsSync('/.claude')).toBe(false);
      expect(existsSync(join(gitProjectDir, 'relative'))).toBe(false);
      expect(snapshot(tmp)).toEqual(before);
    });
  }

  it('positive: temp absolute HOME -> session-state written under it', () => {
    const home = mkdtempSync(join(tmp, 'home-'));
    const r = run(ENV_CHECK, home, [], gitProjectDir);
    expect(r.rc).toBe(0);
    const dir = join(home, '.claude', 'session-state');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((f) => f.endsWith('.last-head'));
    expect(files.length).toBe(1);
    expect(readFileSync(join(dir, files[0]), 'utf-8').trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});

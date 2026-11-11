/**
 * E2E tests for how `omcustom init` wires the self-update (#1946): `--skip-self` and the global
 * `--skip-version-check` reach the skip decision, and the self-update runs before the preflight.
 * The real CLI entry runs in a subprocess; tests/fixtures/stub-cli-self-update-preload.ts keeps the
 * real skip logic but stops `autoSelfUpdate` before npm, and tests/fixtures/stub-installer-preload.ts
 * stops the installer, so nothing is installed or downloaded.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn as spawnChild } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';

const projectRoot = join(import.meta.dir, '../..');
const cliPath = join(projectRoot, 'src/cli/index.ts');
const selfUpdatePreload = join(projectRoot, 'tests/fixtures/stub-cli-self-update-preload.ts');
const installerPreload = join(projectRoot, 'tests/fixtures/stub-installer-preload.ts');

describe('E2E: omcustom init self-update wiring', () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-selfupdate-project-'));
    homeDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-selfupdate-home-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  async function runCli(
    args: string[],
    envOverrides: Record<string, string> = {}
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: homeDir,
      ...envOverrides,
    };
    // A CI or skip variable inherited from the machine would hide the wiring under test
    for (const name of ['CI', 'GITHUB_ACTIONS', 'TF_BUILD', 'OMCUSTOM_SKIP_SELF_UPDATE']) {
      if (!(name in envOverrides)) delete env[name];
    }
    const proc = spawn({
      cmd: [
        process.execPath,
        '--preload',
        installerPreload,
        '--preload',
        selfUpdatePreload,
        cliPath,
        ...args,
      ],
      cwd: projectDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: env as Record<string, string>,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }

  function selfUpdateCall(stdout: string): {
    command: string;
    skipOption: boolean;
    skipped: boolean;
  } {
    const line = stdout.split('\n').find((l) => l.startsWith('AUTO_SELF_UPDATE='));
    expect(line).toBeDefined();
    return JSON.parse((line as string).slice('AUTO_SELF_UPDATE='.length));
  }

  it('runs the self-update for init and does not skip it by default', async () => {
    const { exitCode, stdout } = await runCli(['init', '--yes', '--lang', 'en']);

    expect(exitCode).toBe(0);
    expect(selfUpdateCall(stdout)).toEqual({ command: 'init', skipOption: false, skipped: false });
  });

  it('init --skip-self reaches the skip decision', async () => {
    const { exitCode, stdout } = await runCli(['init', '--yes', '--lang', 'en', '--skip-self']);

    expect(exitCode).toBe(0);
    expect(selfUpdateCall(stdout)).toEqual({ command: 'init', skipOption: true, skipped: true });
  });

  it('the global --skip-version-check reaches the skip decision', async () => {
    const { exitCode, stdout } = await runCli([
      '--skip-version-check',
      'init',
      '--yes',
      '--lang',
      'en',
    ]);

    expect(exitCode).toBe(0);
    expect(selfUpdateCall(stdout)).toEqual({ command: 'init', skipOption: true, skipped: true });
  });

  it('OMCUSTOM_SKIP_SELF_UPDATE=true and CI=1 skip it', async () => {
    for (const env of [{ OMCUSTOM_SKIP_SELF_UPDATE: 'true' }, { CI: '1' }]) {
      const { exitCode, stdout } = await runCli(['init', '--yes', '--lang', 'en'], env);

      expect(exitCode).toBe(0);
      expect(selfUpdateCall(stdout).skipped).toBe(true);
    }
  });

  it('runs the self-update before the preflight check', async () => {
    const { stdout } = await runCli(['init', '--yes', '--lang', 'en']);

    const selfUpdateAt = stdout.indexOf('AUTO_SELF_UPDATE=');
    const preflightAt = stdout.indexOf('PREFLIGHT_RUN');
    expect(selfUpdateAt).toBeGreaterThanOrEqual(0);
    expect(preflightAt).toBeGreaterThan(selfUpdateAt);
  });

  it('init continues with one notice when the self-update throws', async () => {
    const { exitCode, stdout, stderr } = await runCli(['init', '--yes', '--lang', 'en'], {
      STUB_SELF_UPDATE_THROW: '1',
    });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('boom from self-update');
    expect(stderr).toContain('npm install -g oh-my-customcode@latest');
    expect(stdout).toContain('INSTALL_OPTIONS=');
  });

  it('init --help lists --skip-self', async () => {
    const { exitCode, stdout } = await runCli(['init', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('--skip-self');
  });
});

/**
 * Ctrl+C during the self-update's `npm view` (#1948): the real CLI entry (no self-update stub)
 * runs against a fake `npm` on PATH; a group SIGINT while `npm view` sleeps must end the CLI with
 * exit code 130 and must not continue (no `npm root -g`, no installer, no project work).
 */
describe('E2E: Ctrl+C during the self-update lookup', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'omcustom-e2e-sigint-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function interruptCli(args: string[]) {
    const started = join(scratch, 'view-started');
    const continued = join(scratch, 'continued');
    const binDir = join(scratch, 'bin');
    const projectDir = join(scratch, 'project');
    const homeDir = join(scratch, 'home');
    for (const dir of [binDir, projectDir, homeDir]) {
      await Bun.write(join(dir, '.keep'), '');
    }
    writeFileSync(
      join(binDir, 'npm'),
      `#!/bin/sh
case "$1" in
  view) : > ${JSON.stringify(started)}; sleep 2; echo '"9.9.9"' ;;
  root) : > ${JSON.stringify(continued)}; echo /nonexistent/global/root ;;
  *) exit 1 ;;
esac
`
    );
    await chmod(join(binDir, 'npm'), 0o755);

    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: homeDir,
      PATH: `${binDir}:${process.env.PATH}`,
    };
    for (const name of ['CI', 'GITHUB_ACTIONS', 'TF_BUILD', 'OMCUSTOM_SKIP_SELF_UPDATE']) {
      delete env[name];
    }
    const child = spawnChild(process.execPath, ['--preload', installerPreload, cliPath, ...args], {
      cwd: projectDir,
      env: env as Record<string, string>,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child.on('exit', (code, signal) => resolve({ code, signal }))
    );
    try {
      for (let i = 0; i < 200 && !existsSync(started); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(existsSync(started)).toBe(true);
      process.kill(-(child.pid as number), 'SIGINT');
      const result = await exited;
      await new Promise((r) => setTimeout(r, 2200)); // let the orphaned `sleep` end
      return { ...result, stdout, continued: existsSync(continued) };
    } finally {
      try {
        process.kill(-(child.pid as number), 'SIGKILL');
      } catch {
        // already gone (ESRCH)
      }
    }
  }

  it('init: exits 130 and does not continue into the install', async () => {
    const out = await interruptCli(['init', '--yes', '--lang', 'en']);

    expect(out.signal).toBeNull();
    expect(out.code).toBe(130);
    expect(out.continued).toBe(false);
    expect(out.stdout).not.toContain('INSTALL_OPTIONS=');
  }, 30000);

  it('update: exits 130 and does not continue into the update work', async () => {
    const out = await interruptCli(['update']);

    expect(out.signal).toBeNull();
    expect(out.code).toBe(130);
    expect(out.continued).toBe(false);
  }, 30000);
});

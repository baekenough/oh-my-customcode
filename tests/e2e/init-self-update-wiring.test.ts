/**
 * E2E tests for how `omcustom init` wires the self-update (#1946): `--skip-self` and the global
 * `--skip-version-check` reach the skip decision, and the self-update runs before the preflight.
 * The real CLI entry runs in a subprocess; tests/fixtures/stub-cli-self-update-preload.ts keeps the
 * real skip logic but stops `autoSelfUpdate` before npm, and tests/fixtures/stub-installer-preload.ts
 * stops the installer, so nothing is installed or downloaded.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
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
      OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP: '1',
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

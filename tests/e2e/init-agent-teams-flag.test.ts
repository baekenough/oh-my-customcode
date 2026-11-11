/**
 * E2E tests for the `omcustom init` CLI wiring of --no-agent-teams (#1934) and the version in
 * the init banner. The real CLI entry runs in a subprocess with `src/core/installer.ts` swapped
 * for a stub (tests/fixtures/stub-installer-preload.ts) that only prints the options it
 * received, so nothing is installed and no npm / Codex command runs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';
import packageJson from '../../package.json';

const projectRoot = join(import.meta.dir, '../..');
const cliPath = join(projectRoot, 'src/cli/index.ts');
const preloadPath = join(projectRoot, 'tests/fixtures/stub-installer-preload.ts');

describe('E2E: omcustom init --no-agent-teams', () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-init-project-'));
    homeDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-init-home-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  async function runCli(
    ...args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = spawn({
      cmd: [process.execPath, '--preload', preloadPath, cliPath, '--skip-version-check', ...args],
      cwd: projectDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: homeDir,
        CI: 'true',
        OMCUSTOM_SKIP_SELF_UPDATE: 'true',
      },
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }

  function installOptions(stdout: string): Record<string, unknown> {
    const line = stdout.split('\n').find((l) => l.startsWith('INSTALL_OPTIONS='));
    expect(line).toBeDefined();
    return JSON.parse((line as string).slice('INSTALL_OPTIONS='.length));
  }

  it('enables agentTeams for the installer by default', async () => {
    const { exitCode, stdout } = await runCli('init', '--yes', '--lang', 'en');

    expect(exitCode).toBe(0);
    expect(installOptions(stdout).agentTeams).toBe(true);
  });

  it('passes agentTeams: false to the installer with --no-agent-teams', async () => {
    const { exitCode, stdout } = await runCli('init', '--yes', '--lang', 'en', '--no-agent-teams');

    expect(exitCode).toBe(0);
    expect(installOptions(stdout).agentTeams).toBe(false);
  });

  it('prints the CLI version in the init banner', async () => {
    const { exitCode, stdout } = await runCli('init', '--yes', '--lang', 'en');

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`v${packageJson.version}`);
  });

  it('lists --no-agent-teams in init --help', async () => {
    const { exitCode, stdout } = await runCli('init', '--help');

    expect(exitCode).toBe(0);
    expect(stdout).toContain('--no-agent-teams');
    expect(stdout).toContain('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS');
  });
});

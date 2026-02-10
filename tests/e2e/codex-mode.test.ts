/**
 * E2E tests for Codex mode workflows
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';

// Set 30s timeout for E2E tests (CI environments are slower)
describe('E2E: Codex mode', { timeout: 30000 }, () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(() => {
    const projectRoot = join(import.meta.dir, '../..');
    cliPath = join(projectRoot, 'src/cli/index.ts');
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-codex-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(tmpdir());
    await rm(tempDir, { recursive: true, force: true });
  });

  async function runCli(
    ...args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = spawn({
      cmd: ['bun', 'run', cliPath, ...args],
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const timeout = 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ]);

      return { exitCode, stdout, stderr };
    } catch (error) {
      try {
        proc.kill();
      } catch {
        // Ignore kill errors
      }
      throw error;
    }
  }

  async function pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  it('should initialize Codex layout with --provider codex', async () => {
    const result = await runCli('init', '--provider', 'codex');

    expect(result.exitCode).toBe(0);
    expect(await pathExists(join(tempDir, 'AGENTS.md'))).toBe(true);
    expect(await pathExists(join(tempDir, '.codex'))).toBe(true);
    expect(await pathExists(join(tempDir, '.codex', 'rules'))).toBe(true);
    expect(await pathExists(join(tempDir, '.codex', 'agents'))).toBe(true);
    expect(await pathExists(join(tempDir, '.codex', 'skills'))).toBe(true);
  });

  it('should run doctor in Codex mode', async () => {
    await runCli('init', '--provider', 'codex');

    const result = await runCli('doctor', '--provider', 'codex');

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('AGENTS.md');
  });
});

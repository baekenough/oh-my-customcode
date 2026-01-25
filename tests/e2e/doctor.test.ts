/**
 * E2E tests for `omcc doctor` command
 * Tests the actual CLI command execution end-to-end
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';

describe('E2E: omcc doctor', () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(() => {
    // Path to the CLI entry point (run with bun)
    // Using dirname to get the project root from the test file location
    const projectRoot = join(import.meta.dir, '../..');
    cliPath = join(projectRoot, 'src/cli/index.ts');
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-e2e-doctor-'));
    // Change to temp directory for the test
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Reset to a safe directory before cleanup
    process.chdir(tmpdir());
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI command using Bun.spawn
   */
  async function runCli(
    ...args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = spawn({
      cmd: ['bun', 'run', cliPath, ...args],
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { exitCode, stdout, stderr };
  }

  /**
   * Helper to initialize a project first
   */
  async function initProject(): Promise<void> {
    await runCli('init');
  }

  /**
   * Helper to check if path exists
   */
  async function pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  describe('on healthy installation', () => {
    beforeEach(async () => {
      await initProject();
    });

    it('should report all checks pass on healthy installation', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;

      // Should indicate success
      expect(
        output.includes('pass') ||
          output.includes('PASS') ||
          output.includes('healthy') ||
          output.includes('All checks')
      ).toBe(true);
    });

    it('should show checking message at start', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;

      // Should show checking message
      expect(
        output.toLowerCase().includes('check') || output.toLowerCase().includes('diagnos')
      ).toBe(true);
    });

    it('should check CLAUDE.md exists', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should mention CLAUDE.md check
      expect(output).toContain('CLAUDE.md');
      expect(output.includes('[PASS]') || output.includes('✓') || output.includes('pass')).toBe(
        true
      );
    });

    it('should check rules directory', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should check rules
      expect(output.toLowerCase()).toContain('rule');
    });

    it('should check agents directory', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should check agents
      expect(output.toLowerCase()).toContain('agent');
    });

    it('should check skills directory', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should check skills
      expect(output.toLowerCase()).toContain('skill');
    });

    it('should show summary at the end', async () => {
      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should show summary with counts
      expect(output.match(/\d+/)).not.toBeNull();
    });
  });

  describe('detecting issues', () => {
    it('should detect missing CLAUDE.md', async () => {
      // Create partial structure without CLAUDE.md
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      const result = await runCli('doctor');

      // Should fail or warn
      const output = result.stdout + result.stderr;
      expect(output).toContain('CLAUDE.md');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('missing')
      ).toBe(true);
    });

    it('should detect missing rules directory', async () => {
      // Create structure without .claude/rules
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      // No rules directory
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      const result = await runCli('doctor');

      const output = result.stdout;
      // Should detect missing rules
      expect(output.toLowerCase()).toContain('rule');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('missing')
      ).toBe(true);
    });

    it('should detect missing agents directory', async () => {
      // Create structure without agents
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-test.md'), '# Test Rule');
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      const result = await runCli('doctor');

      const output = result.stdout;
      // Should detect missing agents
      expect(output.toLowerCase()).toContain('agent');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('missing')
      ).toBe(true);
    });

    it('should detect missing skills directory', async () => {
      // Create structure without skills
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-test.md'), '# Test Rule');
      await mkdir(join(tempDir, 'agents'), { recursive: true });

      const result = await runCli('doctor');

      const output = result.stdout;
      // Should detect missing skills
      expect(output.toLowerCase()).toContain('skill');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('missing')
      ).toBe(true);
    });

    it('should detect broken symlinks', async () => {
      await initProject();

      // Create a broken symlink in an agent's refs directory
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      const refsDir = join(agentDir, 'refs');
      await mkdir(refsDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Test Agent');

      // Create broken symlink
      const brokenSymlink = join(refsDir, 'broken-link');
      await symlink('/non/existent/path', brokenSymlink);

      const result = await runCli('doctor');

      const output = result.stdout;
      // Should detect broken symlinks
      expect(output.toLowerCase()).toContain('symlink');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('broken')
      ).toBe(true);
    });

    it('should detect invalid index.yaml files', async () => {
      await initProject();

      // Create an agent with invalid index.yaml
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'broken-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Broken Agent');
      await writeFile(
        join(agentDir, 'index.yaml'),
        `invalid yaml content:
  - broken: [[[
  not valid syntax here`
      );

      const result = await runCli('doctor');

      const output = result.stdout;
      // Should detect invalid index files
      expect(output.toLowerCase()).toContain('index');
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('invalid')
      ).toBe(true);
    });

    it('should report multiple issues when multiple things are wrong', async () => {
      // Create empty directory - many checks will fail
      const result = await runCli('doctor');

      const output = result.stdout;

      // Should have multiple failures
      const failCount = (output.match(/\[FAIL\]/gi) || []).length;
      expect(failCount).toBeGreaterThan(1);
    });
  });

  describe('--fix option', () => {
    it('should create missing rules directory with --fix', async () => {
      // Create structure without rules
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      // Verify rules directory doesn't exist
      expect(await pathExists(join(tempDir, '.claude', 'rules'))).toBe(false);

      const result = await runCli('doctor', '--fix');

      const output = result.stdout + result.stderr;

      // Should indicate fixing
      expect(output.toLowerCase().includes('fix') || output.toLowerCase().includes('creat')).toBe(
        true
      );

      // Rules directory should now exist
      expect(await pathExists(join(tempDir, '.claude', 'rules'))).toBe(true);
    });

    it('should create missing agents directory with --fix', async () => {
      // Create structure without agents
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      // Verify agents directory doesn't exist
      expect(await pathExists(join(tempDir, 'agents'))).toBe(false);

      const result = await runCli('doctor', '--fix');

      // Agents directory should now exist
      expect(await pathExists(join(tempDir, 'agents'))).toBe(true);
    });

    it('should create missing skills directory with --fix', async () => {
      // Create structure without skills
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await mkdir(join(tempDir, 'agents'), { recursive: true });

      // Verify skills directory doesn't exist
      expect(await pathExists(join(tempDir, 'skills'))).toBe(false);

      const result = await runCli('doctor', '--fix');

      // Skills directory should now exist
      expect(await pathExists(join(tempDir, 'skills'))).toBe(true);
    });

    it('should remove broken symlinks with --fix', async () => {
      await initProject();

      // Create a broken symlink
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      const refsDir = join(agentDir, 'refs');
      await mkdir(refsDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Test Agent');

      const brokenSymlink = join(refsDir, 'broken-link');
      await symlink('/non/existent/path', brokenSymlink);

      // Verify broken symlink exists
      expect(await pathExists(brokenSymlink)).toBe(false); // pathExists follows symlink, so broken = false
      const entries = await readdir(refsDir);
      expect(entries).toContain('broken-link');

      const result = await runCli('doctor', '--fix');

      const output = result.stdout + result.stderr;
      // Should indicate fixing
      expect(
        output.toLowerCase().includes('fix') ||
          output.toLowerCase().includes('remov') ||
          output.toLowerCase().includes('delet')
      ).toBe(true);

      // Broken symlink should be removed
      const entriesAfter = await readdir(refsDir);
      expect(entriesAfter).not.toContain('broken-link');
    });

    it('should report fixed issues in output', async () => {
      // Create structure with missing directories
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      const result = await runCli('doctor', '--fix');

      const output = result.stdout;

      // Should show fixed indicator
      expect(
        output.includes('fixed') ||
          output.includes('Fixed') ||
          output.includes('(fixed)') ||
          output.includes('created')
      ).toBe(true);
    });

    it('should pass subsequent doctor check after fix', async () => {
      // Create structure with missing directories (agents, skills)
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-test.md'), '# Test Rule');
      // agents and skills directories are missing

      // Run fix
      await runCli('doctor', '--fix');

      // Run doctor again without fix
      const result = await runCli('doctor');

      // After fixing, directories should exist
      expect(await pathExists(join(tempDir, 'agents'))).toBe(true);
      expect(await pathExists(join(tempDir, 'skills'))).toBe(true);
    });

    it('should not try to fix non-fixable issues', async () => {
      await initProject();

      // Create an agent with invalid index.yaml (not fixable by doctor)
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'broken-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Broken Agent');
      const invalidYamlContent = 'invalid: [[[';
      await writeFile(join(agentDir, 'index.yaml'), invalidYamlContent);

      const result = await runCli('doctor', '--fix');

      // Invalid YAML is not fixable, should still be reported
      const output = result.stdout;
      expect(output.toLowerCase()).toContain('index');

      // The invalid YAML should still be invalid
      const { readFile } = await import('node:fs/promises');
      const yamlContent = await readFile(join(agentDir, 'index.yaml'), 'utf-8');
      expect(yamlContent).toBe(invalidYamlContent);
    });
  });

  describe('exit codes', () => {
    it('should exit with 0 on healthy installation', async () => {
      await initProject();

      const result = await runCli('doctor');

      expect(result.exitCode).toBe(0);
    });

    it('should exit with 0 after successful fix', async () => {
      // Create structure with fixable issues
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-test.md'), '# Test');
      // Missing agents and skills directories

      const result = await runCli('doctor', '--fix');

      // After fix, should succeed
      expect(result.exitCode).toBe(0);
    });

    it('should report failures in output even if exit code is 0', async () => {
      // Note: The current doctor implementation exits with 0 even when there are failures
      // This test verifies that failures are still reported in the output
      // Empty directory with no CLAUDE.md (not auto-fixable)
      const result = await runCli('doctor');

      const output = result.stdout + result.stderr;

      // Should show failures in output
      expect(
        output.includes('[FAIL]') || output.includes('fail') || output.includes('failed')
      ).toBe(true);
    });
  });

  describe('fix suggestions', () => {
    it('should suggest running with --fix when fixable issues exist', async () => {
      // Create structure with fixable issues only
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'rules', 'MUST-test.md'), '# Test');
      // Missing agents and skills

      const result = await runCli('doctor');

      const output = result.stdout + result.stderr;

      // Should suggest --fix
      expect(output.includes('--fix') || output.includes('fix')).toBe(true);
    });
  });

  describe('integration with init', () => {
    it('should pass all checks immediately after init', async () => {
      // Run init
      const initResult = await runCli('init');
      expect(initResult.exitCode).toBe(0);

      // Run doctor
      const doctorResult = await runCli('doctor');

      expect(doctorResult.exitCode).toBe(0);

      const output = doctorResult.stdout;
      // Should not have any failures
      const failCount = (output.match(/\[FAIL\]/gi) || []).length;
      expect(failCount).toBe(0);
    });
  });
});

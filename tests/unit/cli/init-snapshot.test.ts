import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InitOptions } from '../../../src/cli/init.js';
import { installFromSnapshot } from '../../../src/core/snapshot.js';

describe('installFromSnapshot', () => {
  let targetDir: string;
  let snapshotDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'omcustom-snapshot-target-'));
    snapshotDir = await mkdtemp(join(tmpdir(), 'omcustom-snapshot-src-'));
  });

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true });
    await rm(snapshotDir, { recursive: true, force: true });
  });

  async function createMinimalSnapshot(dir: string): Promise<void> {
    const claudeDir = join(dir, '.claude');
    await mkdir(join(claudeDir, 'agents'), { recursive: true });
    await mkdir(join(claudeDir, 'rules'), { recursive: true });
    await writeFile(join(claudeDir, 'agents', 'sample-agent.md'), '# sample-agent\n');
    await writeFile(join(claudeDir, 'rules', 'MUST-sample.md'), '# Sample Rule\n');
  }

  describe('success cases', () => {
    it('succeeds with a valid snapshot', async () => {
      await createMinimalSnapshot(snapshotDir);

      const options: InitOptions = {};
      const result = await installFromSnapshot(targetDir, snapshotDir, options);

      expect(result.success).toBe(true);
      expect(result.message).toContain(snapshotDir);
    });

    it('copies .claude/ directory from snapshot', async () => {
      await createMinimalSnapshot(snapshotDir);

      await installFromSnapshot(targetDir, snapshotDir, {});

      const agentPath = join(targetDir, '.claude', 'agents', 'sample-agent.md');
      const agentStat = await stat(agentPath);
      expect(agentStat.isFile()).toBe(true);

      const content = await readFile(agentPath, 'utf-8');
      expect(content).toContain('sample-agent');
    });

    it('copies guides/ if present in snapshot', async () => {
      await createMinimalSnapshot(snapshotDir);
      const guidesDir = join(snapshotDir, 'guides');
      await mkdir(join(guidesDir, 'typescript'), { recursive: true });
      await writeFile(join(guidesDir, 'typescript', 'README.md'), '# TypeScript Guide\n');

      await installFromSnapshot(targetDir, snapshotDir, {});

      const guideFile = join(targetDir, 'guides', 'typescript', 'README.md');
      const guideStat = await stat(guideFile);
      expect(guideStat.isFile()).toBe(true);
    });

    it('does not create guides/ in target when snapshot has none', async () => {
      await createMinimalSnapshot(snapshotDir);

      await installFromSnapshot(targetDir, snapshotDir, {});

      const guidesDir = join(targetDir, 'guides');
      let guidesExist = false;
      try {
        await stat(guidesDir);
        guidesExist = true;
      } catch {
        guidesExist = false;
      }
      expect(guidesExist).toBe(false);
    });

    it('copies CLAUDE.md if present in snapshot', async () => {
      await createMinimalSnapshot(snapshotDir);
      await writeFile(join(snapshotDir, 'CLAUDE.md'), '# Team CLAUDE.md\n');

      await installFromSnapshot(targetDir, snapshotDir, {});

      const entryFile = join(targetDir, 'CLAUDE.md');
      const content = await readFile(entryFile, 'utf-8');
      expect(content).toContain('Team CLAUDE.md');
    });

    it('does not create CLAUDE.md in target when snapshot has none', async () => {
      await createMinimalSnapshot(snapshotDir);
      // No CLAUDE.md in snapshot

      await installFromSnapshot(targetDir, snapshotDir, {});

      let entryExists = false;
      try {
        await stat(join(targetDir, 'CLAUDE.md'));
        entryExists = true;
      } catch {
        entryExists = false;
      }
      expect(entryExists).toBe(false);
    });
  });

  describe('failure cases', () => {
    it('fails with non-existent snapshot path', async () => {
      const nonExistentPath = join(tmpdir(), `does-not-exist-omcustom-${Date.now()}`);
      const options: InitOptions = {};
      const result = await installFromSnapshot(targetDir, nonExistentPath, options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Snapshot path not found');
      expect(result.errors?.[0]).toContain(nonExistentPath);
    });

    it('fails when snapshot directory is missing .claude/', async () => {
      // snapshotDir exists but has no .claude/ subdirectory
      await writeFile(join(snapshotDir, 'README.md'), '# Some project\n');

      const result = await installFromSnapshot(targetDir, snapshotDir, {});

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Invalid snapshot');
      expect(result.errors?.[0]).toContain('.claude');
    });
  });

  describe('backup behavior', () => {
    it('backs up existing .claude/ when installation is present and force is not set', async () => {
      // Pre-install an existing .claude/ in target
      const existingClaudeDir = join(targetDir, '.claude', 'agents');
      await mkdir(existingClaudeDir, { recursive: true });
      await writeFile(join(existingClaudeDir, 'old-agent.md'), '# Old Agent\n');

      await createMinimalSnapshot(snapshotDir);

      await installFromSnapshot(targetDir, snapshotDir, {});

      // A backup directory should have been created
      const entries = await readdir(targetDir);
      const backupEntry = entries.find((e) => e.startsWith('.claude-backup-'));
      expect(backupEntry).toBeDefined();

      // The backup should contain the original old-agent.md
      const backupAgentPath = join(targetDir, backupEntry ?? '', 'agents', 'old-agent.md');
      const backupStat = await stat(backupAgentPath);
      expect(backupStat.isFile()).toBe(true);
    });

    it('skips backup when force is true', async () => {
      // Pre-install an existing .claude/ in target
      const existingClaudeDir = join(targetDir, '.claude', 'agents');
      await mkdir(existingClaudeDir, { recursive: true });
      await writeFile(join(existingClaudeDir, 'old-agent.md'), '# Old Agent\n');

      await createMinimalSnapshot(snapshotDir);

      await installFromSnapshot(targetDir, snapshotDir, { force: true });

      // No backup directory should have been created
      const entries = await readdir(targetDir);
      const backupEntry = entries.find((e) => e.startsWith('.claude-backup-'));
      expect(backupEntry).toBeUndefined();
    });
  });

  describe('error catch behavior (lines 134-141)', () => {
    it('returns failure result when cp throws during installation (Error instance)', async () => {
      await createMinimalSnapshot(snapshotDir);

      // Place a regular file at the destination path where cp expects to write a directory.
      // cp(src_dir, dest_file, { recursive: true }) fails with EEXIST/ENOTDIR on all platforms,
      // which triggers the outer catch block (lines 134-141).
      await writeFile(join(targetDir, '.claude'), 'not-a-directory');

      const result = await installFromSnapshot(targetDir, snapshotDir, {});

      expect(result.success).toBe(false);
      // i18next is not initialized in tests — message will be undefined (i18n.t returns undefined)
      // We only verify the error structure, not the i18n message string.
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      // The error message should be a non-empty string from the Error instance
      expect(typeof result.errors?.[0]).toBe('string');
      expect((result.errors?.[0] ?? '').length).toBeGreaterThan(0);
    });
  });
});

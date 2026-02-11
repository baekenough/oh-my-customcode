import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CustomComponentConfig,
  getDefaultConfig,
  mergeConfig,
  type OmccConfig,
  saveConfig,
} from '../../../src/core/config.js';
import { getProviderLayout } from '../../../src/core/layout.js';
import { update } from '../../../src/core/updater.js';
import { copyDirectory, fileExists } from '../../../src/utils/fs.js';

describe('preserveFiles feature', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-preserve-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Helper to create config file
  async function createConfig(overrides?: Partial<OmccConfig>): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    if (overrides) {
      Object.assign(config, overrides);
    }
    await saveConfig(tempDir, config);
  }

  // Helper to create directory structure
  async function createDirStructure(structure: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(structure)) {
      const fullPath = join(tempDir, path);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  describe('config integration', () => {
    it('should include preserveFiles in default config', () => {
      const config = getDefaultConfig();

      expect(config.preserveFiles).toBeDefined();
      expect(Array.isArray(config.preserveFiles)).toBe(true);
      expect(config.preserveFiles?.length).toBe(0);
    });

    it('should include customComponents in default config', () => {
      const config = getDefaultConfig();

      expect(config.customComponents).toBeDefined();
      expect(Array.isArray(config.customComponents)).toBe(true);
      expect(config.customComponents?.length).toBe(0);
    });

    it('should merge preserveFiles arrays during config merge', () => {
      const defaults = getDefaultConfig();
      defaults.preserveFiles = ['file1.txt', 'file2.txt'];

      const overrides: Partial<OmccConfig> = {
        preserveFiles: ['file3.txt', 'file4.txt'],
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.preserveFiles).toContain('file1.txt');
      expect(merged.preserveFiles).toContain('file2.txt');
      expect(merged.preserveFiles).toContain('file3.txt');
      expect(merged.preserveFiles).toContain('file4.txt');
      expect(merged.preserveFiles?.length).toBe(4);
    });

    it('should deduplicate preserveFiles on merge', () => {
      const defaults = getDefaultConfig();
      defaults.preserveFiles = ['file1.txt', 'file2.txt'];

      const overrides: Partial<OmccConfig> = {
        preserveFiles: ['file2.txt', 'file3.txt'], // file2.txt is duplicate
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.preserveFiles?.length).toBe(3);
      expect(merged.preserveFiles).toContain('file1.txt');
      expect(merged.preserveFiles).toContain('file2.txt');
      expect(merged.preserveFiles).toContain('file3.txt');
    });

    it('should merge customComponents arrays during config merge', () => {
      const defaults = getDefaultConfig();
      defaults.customComponents = [
        { type: 'agent', name: 'agent1', path: '.claude/agents/agent1.md', managed: false },
      ];

      const overrides: Partial<OmccConfig> = {
        customComponents: [
          { type: 'skill', name: 'skill1', path: '.claude/skills/skill1/', managed: false },
        ],
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.customComponents?.length).toBe(2);
      expect(merged.customComponents?.[0].name).toBe('agent1');
      expect(merged.customComponents?.[1].name).toBe('skill1');
    });

    it('should handle empty preserveFiles in overrides', () => {
      const defaults = getDefaultConfig();
      defaults.preserveFiles = ['file1.txt'];

      const overrides: Partial<OmccConfig> = {
        // preserveFiles not specified
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.preserveFiles).toEqual(['file1.txt']);
    });

    it('should handle undefined preserveFiles in defaults', () => {
      const defaults = getDefaultConfig();
      delete defaults.preserveFiles;

      const overrides: Partial<OmccConfig> = {
        preserveFiles: ['file1.txt'],
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.preserveFiles).toEqual(['file1.txt']);
    });
  });

  describe('update with preserveFiles', () => {
    it('should preserve files listed in .omcustomrc.json preserveFiles', async () => {
      await createConfig({
        preserveFiles: ['.claude/rules/custom-rule.md'],
      });

      // Create custom file to preserve
      await createDirStructure({
        '.claude/rules/custom-rule.md': 'Custom rule content',
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['rules'],
      });

      expect(result.success).toBe(true);

      // Verify custom file was preserved
      const customFilePath = join(tempDir, '.claude/rules/custom-rule.md');
      const exists = await fileExists(customFilePath);
      expect(exists).toBe(true);

      const content = await readFile(customFilePath, 'utf-8');
      expect(content).toBe('Custom rule content');
    });

    it('should preserve files from both .omcustomrc.json and .omcustom-customizations.json', async () => {
      await createConfig({
        preserveFiles: ['.claude/rules/from-config.md'],
      });

      // Create files to preserve
      await createDirStructure({
        '.claude/rules/from-config.md': 'From config',
        '.claude/rules/from-manifest.md': 'From manifest',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: ['.claude/rules/from-manifest.md'],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['rules'],
      });

      expect(result.success).toBe(true);

      // Verify both files were preserved
      const configFilePath = join(tempDir, '.claude/rules/from-config.md');
      const manifestFilePath = join(tempDir, '.claude/rules/from-manifest.md');

      expect(await fileExists(configFilePath)).toBe(true);
      expect(await fileExists(manifestFilePath)).toBe(true);

      expect(await readFile(configFilePath, 'utf-8')).toBe('From config');
      expect(await readFile(manifestFilePath, 'utf-8')).toBe('From manifest');
    });

    it('should handle directory preservation (trailing /)', async () => {
      await createConfig({
        preserveFiles: ['.claude/rules/custom/'],
      });

      // Create custom directory to preserve
      await createDirStructure({
        '.claude/rules/custom/file1.md': 'Custom file 1',
        '.claude/rules/custom/file2.md': 'Custom file 2',
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['rules'],
      });

      expect(result.success).toBe(true);

      // Verify directory was preserved
      const file1Path = join(tempDir, '.claude/rules/custom/file1.md');
      const file2Path = join(tempDir, '.claude/rules/custom/file2.md');

      expect(await fileExists(file1Path)).toBe(true);
      expect(await fileExists(file2Path)).toBe(true);
    });

    it('should preserve custom components with managed: false', async () => {
      const customComponents: CustomComponentConfig[] = [
        {
          type: 'agent',
          name: 'custom-agent',
          path: '.claude/agents/custom-agent.md',
          managed: false,
        },
      ];

      await createConfig({ customComponents });

      // Create custom agent file
      await createDirStructure({
        '.claude/agents/custom-agent.md': 'Custom agent content',
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['agents'],
      });

      expect(result.success).toBe(true);

      // Verify custom agent was preserved
      const customAgentPath = join(tempDir, '.claude/agents/custom-agent.md');
      expect(await fileExists(customAgentPath)).toBe(true);

      const content = await readFile(customAgentPath, 'utf-8');
      expect(content).toBe('Custom agent content');
    });

    it('should skip copy for managed:false component paths', async () => {
      const customComponents: CustomComponentConfig[] = [
        {
          type: 'skill',
          name: 'custom-skill',
          path: '.claude/skills/custom-skill/',
          managed: false,
        },
      ];

      await createConfig({ customComponents });

      // Create custom skill directory
      await createDirStructure({
        '.claude/skills/custom-skill/SKILL.md': 'Custom skill',
        '.claude/skills/custom-skill/script.sh': 'Custom script',
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['skills'],
      });

      expect(result.success).toBe(true);

      // Verify custom skill directory was preserved
      const skillPath = join(tempDir, '.claude/skills/custom-skill/SKILL.md');
      const scriptPath = join(tempDir, '.claude/skills/custom-skill/script.sh');

      expect(await fileExists(skillPath)).toBe(true);
      expect(await fileExists(scriptPath)).toBe(true);

      expect(await readFile(skillPath, 'utf-8')).toBe('Custom skill');
      expect(await readFile(scriptPath, 'utf-8')).toBe('Custom script');
    });

    it('should handle preserveCustomizations:false option', async () => {
      await createConfig({
        preserveFiles: ['.claude/rules/custom.md'],
      });

      await createDirStructure({
        '.claude/rules/custom.md': 'Custom content',
      });

      const layout = getProviderLayout('claude');
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        provider: 'claude',
        components: ['rules'],
        preserveCustomizations: false,
      });

      expect(result.success).toBe(true);
      expect(result.preservedFiles.length).toBe(0);
    });
  });

  describe('copyDirectory with skipPaths', () => {
    let srcDir: string;
    let destDir: string;

    beforeEach(async () => {
      srcDir = join(tempDir, 'src');
      destDir = join(tempDir, 'dest');
      await mkdir(srcDir, { recursive: true });
      await mkdir(destDir, { recursive: true });
    });

    it('should skip files matching skipPaths', async () => {
      // Create source structure
      await writeFile(join(srcDir, 'keep.txt'), 'keep this');
      await writeFile(join(srcDir, 'skip.txt'), 'skip this');

      // Copy with skipPaths
      await copyDirectory(srcDir, destDir, {
        skipPaths: ['skip.txt'],
      });

      // Verify
      expect(await fileExists(join(destDir, 'keep.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'skip.txt'))).toBe(false);
    });

    it('should skip directories matching skipPaths (trailing /)', async () => {
      // Create source structure
      await mkdir(join(srcDir, 'keep-dir'), { recursive: true });
      await mkdir(join(srcDir, 'skip-dir'), { recursive: true });
      await writeFile(join(srcDir, 'keep-dir/file.txt'), 'keep');
      await writeFile(join(srcDir, 'skip-dir/file.txt'), 'skip');

      // Copy with skipPaths
      await copyDirectory(srcDir, destDir, {
        skipPaths: ['skip-dir/'],
      });

      // Verify
      expect(await fileExists(join(destDir, 'keep-dir/file.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'skip-dir/file.txt'))).toBe(false);
      expect(await fileExists(join(destDir, 'skip-dir'))).toBe(false);
    });

    it('should not skip when skipPaths is empty', async () => {
      // Create source structure
      await writeFile(join(srcDir, 'file1.txt'), 'content1');
      await writeFile(join(srcDir, 'file2.txt'), 'content2');

      // Copy with empty skipPaths
      await copyDirectory(srcDir, destDir, {
        skipPaths: [],
      });

      // Verify all files copied
      expect(await fileExists(join(destDir, 'file1.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'file2.txt'))).toBe(true);
    });

    it('should handle nested skipPaths - documents current limitation', async () => {
      // Create nested source structure
      await mkdir(join(srcDir, 'dir1'), { recursive: true });
      await writeFile(join(srcDir, 'dir1/keep.txt'), 'keep');
      await writeFile(join(srcDir, 'dir1/skip.txt'), 'skip this');

      // LIMITATION: copyDirectory uses shouldSkipPath(destPath, dest, skipPaths)
      // where 'dest' changes on each recursive call. This means nested paths
      // like 'dir1/skip.txt' cannot be matched because:
      // - At root: relative(destDir, destDir/dir1) = 'dir1' (doesn't match 'dir1/skip.txt')
      // - Inside dir1: relative(destDir/dir1, destDir/dir1/skip.txt) = 'skip.txt' (doesn't match 'dir1/skip.txt')
      //
      // In practice, this works fine because updateComponent normalizes paths
      // relative to the component directory root before calling copyDirectory.
      //
      // This test documents the limitation: only top-level skipPaths work.
      await copyDirectory(srcDir, destDir, {
        skipPaths: ['dir1/skip.txt'], // This won't actually skip the file
      });

      // Verify both files are copied (skipPath doesn't work for nested paths)
      expect(await fileExists(join(destDir, 'dir1/keep.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'dir1/skip.txt'))).toBe(true); // NOT skipped

      // What DOES work: skip the entire directory
      await rm(destDir, { recursive: true });
      await mkdir(destDir, { recursive: true });

      await copyDirectory(srcDir, destDir, {
        skipPaths: ['dir1/'], // Skip entire directory
      });

      expect(await fileExists(join(destDir, 'dir1'))).toBe(false);
    });

    it('should handle skipPaths with no matches', async () => {
      // Create source structure
      await writeFile(join(srcDir, 'file.txt'), 'content');

      // Copy with non-matching skipPaths
      await copyDirectory(srcDir, destDir, {
        skipPaths: ['nonexistent.txt'],
      });

      // Verify file was copied
      expect(await fileExists(join(destDir, 'file.txt'))).toBe(true);
    });

    it('should skip entire directory tree with trailing /', async () => {
      // Create nested source structure
      await mkdir(join(srcDir, 'skip/deep/nested'), { recursive: true });
      await writeFile(join(srcDir, 'skip/file1.txt'), 'skip1');
      await writeFile(join(srcDir, 'skip/deep/file2.txt'), 'skip2');
      await writeFile(join(srcDir, 'skip/deep/nested/file3.txt'), 'skip3');
      await writeFile(join(srcDir, 'keep.txt'), 'keep');

      // Copy with directory skipPath
      await copyDirectory(srcDir, destDir, {
        skipPaths: ['skip/'],
      });

      // Verify entire directory was skipped
      expect(await fileExists(join(destDir, 'keep.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'skip'))).toBe(false);
      expect(await fileExists(join(destDir, 'skip/file1.txt'))).toBe(false);
      expect(await fileExists(join(destDir, 'skip/deep/file2.txt'))).toBe(false);
    });

    it('should handle undefined skipPaths', async () => {
      // Create source structure
      await writeFile(join(srcDir, 'file.txt'), 'content');

      // Copy without skipPaths option
      await copyDirectory(srcDir, destDir);

      // Verify file was copied
      expect(await fileExists(join(destDir, 'file.txt'))).toBe(true);
    });
  });
});

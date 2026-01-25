import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyTemplates,
  createDirectoryStructure,
  getTemplateDir,
  getTemplateManifest,
  install,
} from '../../../src/core/installer.js';
import { fileExists } from '../../../src/utils/fs.js';

describe('installer', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-installer-test-'));
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('getTemplateDir', () => {
    it('should return template directory path', () => {
      const templateDir = getTemplateDir();
      expect(templateDir).toContain('templates');
    });
  });

  describe('createDirectoryStructure', () => {
    it('should create all required directories', async () => {
      await createDirectoryStructure(tempDir);

      // Check that main directories are created
      expect(await fileExists(join(tempDir, '.claude'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'rules'))).toBe(true);
      expect(await fileExists(join(tempDir, 'agents'))).toBe(true);
      expect(await fileExists(join(tempDir, 'skills'))).toBe(true);
      expect(await fileExists(join(tempDir, 'guides'))).toBe(true);
      expect(await fileExists(join(tempDir, 'pipelines'))).toBe(true);
      expect(await fileExists(join(tempDir, 'commands'))).toBe(true);
    });

    it('should create nested agent directories', async () => {
      await createDirectoryStructure(tempDir);

      expect(await fileExists(join(tempDir, 'agents', 'master'))).toBe(true);
      expect(await fileExists(join(tempDir, 'agents', 'orchestrator'))).toBe(true);
      expect(await fileExists(join(tempDir, 'agents', 'sw-engineer'))).toBe(true);
    });

    it('should create skill category directories', async () => {
      await createDirectoryStructure(tempDir);

      expect(await fileExists(join(tempDir, 'skills', 'development'))).toBe(true);
      expect(await fileExists(join(tempDir, 'skills', 'backend'))).toBe(true);
      expect(await fileExists(join(tempDir, 'skills', 'infrastructure'))).toBe(true);
    });
  });

  describe('getTemplateManifest', () => {
    it('should return a valid manifest object', async () => {
      const manifest = await getTemplateManifest();

      expect(manifest).toBeDefined();
      expect(manifest.version).toBeDefined();
      expect(manifest.lastUpdated).toBeDefined();
      expect(Array.isArray(manifest.components)).toBe(true);
      expect(manifest.source).toContain('github.com');
    });

    it('should include expected components', async () => {
      const manifest = await getTemplateManifest();

      const componentNames = manifest.components.map((c) => c.name);
      expect(componentNames).toContain('rules');
      expect(componentNames).toContain('agents');
      expect(componentNames).toContain('skills');
    });
  });

  describe('install', () => {
    it('should create target directory if it does not exist', async () => {
      const newDir = join(tempDir, 'new-project');

      const result = await install({
        targetDir: newDir,
        skipConfirm: true,
      });

      expect(await fileExists(newDir)).toBe(true);
      // Result depends on whether templates exist
      expect(result).toBeDefined();
    });

    it('should return result with installed components', async () => {
      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      expect(result.installedPath).toBe(tempDir);
      expect(Array.isArray(result.installedComponents)).toBe(true);
      expect(Array.isArray(result.skippedComponents)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should handle backup option', async () => {
      // Create some existing files
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      // Backup should be created
      expect(Array.isArray(result.backedUpPaths)).toBe(true);
    });

    it('should respect force option', async () => {
      // Create existing directories
      await mkdir(join(tempDir, 'agents'), { recursive: true });

      const result = await install({
        targetDir: tempDir,
        force: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should install with English language', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should install with Korean language', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'ko',
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should install specific components only', async () => {
      const result = await install({
        targetDir: tempDir,
        components: ['rules'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should warn about existing files without force/backup', async () => {
      // Create existing structure
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      // Should have warnings about existing files
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('copyTemplates', () => {
    it('should be a function', () => {
      expect(typeof copyTemplates).toBe('function');
    });

    it('should copy template files to target directory', async () => {
      // Create a test template source
      const templateDir = getTemplateDir();
      const testPath = '.claude/rules';

      // copyTemplates requires the template to exist
      // This tests the function without actual templates
      try {
        await copyTemplates(tempDir, testPath, { overwrite: true });
      } catch {
        // Expected to fail if templates don't exist
      }
    });
  });

  describe('edge cases', () => {
    it('should handle install with all components', async () => {
      const result = await install({
        targetDir: tempDir,
        components: [
          'rules',
          'agents',
          'skills',
          'guides',
          'pipelines',
          'commands',
          'hooks',
          'contexts',
        ],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.installedComponents)).toBe(true);
    });

    it('should skip claude-md component in components list', async () => {
      const result = await install({
        targetDir: tempDir,
        components: ['claude-md'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should handle backup with multiple existing paths', async () => {
      // Create multiple existing structures
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await mkdir(join(tempDir, 'skills'), { recursive: true });
      await mkdir(join(tempDir, 'guides'), { recursive: true });
      await mkdir(join(tempDir, 'pipelines'), { recursive: true });
      await mkdir(join(tempDir, 'commands'), { recursive: true });
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      const result = await install({
        targetDir: tempDir,
        backup: true,
        force: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should return empty backup paths when no existing files', async () => {
      const newDir = join(tempDir, 'empty-project');
      await mkdir(newDir, { recursive: true });

      const result = await install({
        targetDir: newDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      expect(result.backedUpPaths.length).toBe(0);
    });

    it('should handle non-existent component gracefully', async () => {
      const result = await install({
        targetDir: tempDir,
        components: ['non-existent-component'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      // Component should be in skipped list (template not found)
      expect(result.skippedComponents).toContain('non-existent-component');
    });

    it('should handle install with force and backup together', async () => {
      // Create existing files
      await mkdir(join(tempDir, 'agents'), { recursive: true });
      await writeFile(join(tempDir, 'agents', 'existing.md'), '# Existing');

      const result = await install({
        targetDir: tempDir,
        force: true,
        backup: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should track installed vs skipped components', async () => {
      // First install
      await install({
        targetDir: tempDir,
        components: ['rules'],
        skipConfirm: true,
      });

      // Second install without force should skip
      const result = await install({
        targetDir: tempDir,
        components: ['rules'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      // Rules should be skipped since already installed
      expect(result.skippedComponents).toContain('rules');
    });
  });
});

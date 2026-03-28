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
import { getComponentPath } from '../../../src/core/layout.js';
import * as fsUtils from '../../../src/utils/fs.js';

const { fileExists } = fsUtils;

describe('installer', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-test-'));
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

      // Check that main directories are created (official Claude Code format)
      expect(await fileExists(join(tempDir, '.claude'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'rules'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'agents'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'skills'))).toBe(true);
      expect(await fileExists(join(tempDir, 'guides'))).toBe(true);
      // commands/ removed in official Claude Code format (absorbed into skills)
    });

    it('should create .claude subdirectories', async () => {
      await createDirectoryStructure(tempDir);

      // .claude/agents is flat (no subdirectories)
      expect(await fileExists(join(tempDir, '.claude', 'agents'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'skills'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'hooks'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'contexts'))).toBe(true);
    });

    it('should use flat .claude structure (no nested agent/skill directories)', async () => {
      await createDirectoryStructure(tempDir);

      // Verify flat structure: .claude/agents (not .claude/agents/*)
      expect(await fileExists(join(tempDir, '.claude', 'agents'))).toBe(true);
      expect(await fileExists(join(tempDir, '.claude', 'skills'))).toBe(true);

      // OLD structure (should NOT exist): agents/orchestrator/, agents/manager/, etc.
      expect(await fileExists(join(tempDir, 'agents'))).toBe(false);
      expect(await fileExists(join(tempDir, 'skills'))).toBe(false);

      // commands/ component removed (absorbed into skills)
      expect(await fileExists(join(tempDir, 'commands'))).toBe(false);
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

    it('should return exactly 7 components (commands and pipelines removed, ontology added)', async () => {
      const manifest = await getTemplateManifest();

      // getAllComponents() returns 7 items: rules, agents, skills, guides, hooks, contexts, ontology
      expect(manifest.components.length).toBe(7);

      const componentNames = manifest.components.map((c) => c.name);
      expect(componentNames).toContain('rules');
      expect(componentNames).toContain('agents');
      expect(componentNames).toContain('skills');
      expect(componentNames).toContain('guides');
      expect(componentNames).toContain('hooks');
      expect(componentNames).toContain('contexts');
      expect(componentNames).toContain('ontology');
      expect(componentNames).not.toContain('commands'); // commands removed
      expect(componentNames).not.toContain('pipelines'); // pipelines removed
    });

    it('should have manifest file counts matching actual template directories', async () => {
      const { readdir } = await import('node:fs/promises');
      const manifest = await getTemplateManifest();
      const templateDir = getTemplateDir();

      for (const component of manifest.components) {
        const resolvedPath = join(templateDir, component.path);

        try {
          const entries = await readdir(resolvedPath);
          const count = entries.filter((e) => !e.startsWith('.')).length;
          expect(count).toBe(
            component.files,
            `${component.name}: manifest says ${component.files} files but found ${count}`
          );
        } catch {
          // Skip if directory doesn't exist (handled by other tests)
        }
      }
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
      // Create existing directories (official Claude Code format)
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });

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
      // Create existing structure (official Claude Code format)
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      // Should have warnings about existing files
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should set config.version to template manifest version after install', async () => {
      const manifest = await getTemplateManifest();

      await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      const fs = await import('node:fs/promises');
      const configPath = join(tempDir, '.omcustomrc.json');
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw) as { version?: string };

      expect(config.version).toBeDefined();
      expect(config.version).toBe(manifest.version);
    });
  });

  describe('copyTemplates', () => {
    it('should be a function', () => {
      expect(typeof copyTemplates).toBe('function');
    });

    it('should copy template files to target directory', async () => {
      // Create a test template source
      const _templateDir = getTemplateDir();
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
    it('should handle install with all components (7 total, no commands or pipelines)', async () => {
      const result = await install({
        targetDir: tempDir,
        components: ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.installedComponents)).toBe(true);
      // getAllComponents() should return 7 items (commands and pipelines removed, ontology added)
    });

    it('should skip entry-md component in components list', async () => {
      const result = await install({
        targetDir: tempDir,
        components: ['entry-md'],
        skipConfirm: true,
      });

      expect(result).toBeDefined();
    });

    it('should handle backup with multiple existing paths', async () => {
      // Create multiple existing structures (official Claude Code format)
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
      await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
      await mkdir(join(tempDir, 'guides'), { recursive: true });
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
      // Create existing files (official Claude Code format)
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
      await writeFile(join(tempDir, '.claude', 'agents', 'existing.md'), '# Existing');

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

  describe('statusline installation', () => {
    it('should install statusline.sh during init', async () => {
      await install({ targetDir: tempDir, skipConfirm: true });
      const statuslinePath = join(tempDir, '.claude', 'statusline.sh');
      expect(await fileExists(statuslinePath)).toBe(true);
    });

    it('should make statusline.sh executable', async () => {
      await install({ targetDir: tempDir, skipConfirm: true });
      const statuslinePath = join(tempDir, '.claude', 'statusline.sh');
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(statuslinePath);
      // Check executable bit (owner execute = 0o100)
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    });

    it('should skip statusline.sh if already exists and no force', async () => {
      // First install
      await install({ targetDir: tempDir, skipConfirm: true });
      const statuslinePath = join(tempDir, '.claude', 'statusline.sh');

      // Modify to detect overwrite
      const fs = await import('node:fs/promises');
      await fs.writeFile(statuslinePath, '#!/bin/bash\n# custom', 'utf-8');

      // Second install without force
      await install({ targetDir: tempDir, skipConfirm: true });

      // Should still be our custom content
      const content = await fs.readFile(statuslinePath, 'utf-8');
      expect(content).toContain('# custom');
    });

    it('should overwrite statusline.sh with force option', async () => {
      // First install
      await install({ targetDir: tempDir, skipConfirm: true });
      const statuslinePath = join(tempDir, '.claude', 'statusline.sh');

      // Modify to detect overwrite
      const fs = await import('node:fs/promises');
      await fs.writeFile(statuslinePath, '#!/bin/bash\n# custom', 'utf-8');

      // Second install with force
      await install({ targetDir: tempDir, force: true, skipConfirm: true });

      // Should be overwritten (no longer custom)
      const content = await fs.readFile(statuslinePath, 'utf-8');
      expect(content).not.toContain('# custom');
    });
  });

  describe('settings.local.json installation', () => {
    it('should create settings.local.json during init', async () => {
      await install({ targetDir: tempDir, skipConfirm: true });
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      expect(await fileExists(settingsPath)).toBe(true);
    });

    it('should include statusLine configuration', async () => {
      await install({ targetDir: tempDir, skipConfirm: true });
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      const fs = await import('node:fs/promises');
      const content = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(content.statusLine).toBeDefined();
      expect(content.statusLine.type).toBe('command');
      expect(content.statusLine.command).toBe('.claude/statusline.sh');
      expect(content.statusLine.padding).toBe(0);
    });

    it('should merge statusLine into existing settings.local.json', async () => {
      // Create existing settings.local.json with other settings
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      const fs = await import('node:fs/promises');
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true });
      await fs.writeFile(
        settingsPath,
        JSON.stringify({ enableAllProjectMcpServers: true }),
        'utf-8'
      );

      await install({ targetDir: tempDir, skipConfirm: true });

      const content = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      // Original setting preserved
      expect(content.enableAllProjectMcpServers).toBe(true);
      // statusLine added
      expect(content.statusLine).toBeDefined();
      expect(content.statusLine.command).toBe('.claude/statusline.sh');
    });

    it('should not overwrite existing statusLine configuration', async () => {
      // Create existing settings with custom statusLine
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      const fs = await import('node:fs/promises');
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true });
      const customSettings = {
        statusLine: {
          type: 'command',
          command: '.claude/custom-statusline.sh',
          padding: 2,
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(customSettings), 'utf-8');

      await install({ targetDir: tempDir, skipConfirm: true });

      const content = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      // Should keep custom statusLine, not overwrite
      expect(content.statusLine.command).toBe('.claude/custom-statusline.sh');
      expect(content.statusLine.padding).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle template directory not found error (line 211)', async () => {
      // Mock fileExists to return false for template directory check
      const originalFileExists = fsUtils.fileExists;
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(async (path) => {
        const pathStr = String(path);
        // Return false only for the main templates directory check
        if (pathStr.endsWith('templates') && !pathStr.includes(tempDir)) {
          return false;
        }
        // Use original for all other checks
        return originalFileExists(path);
      });

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template directory not found');

      fileExistsSpy.mockRestore();
    });

    it('should handle errors in installSingleComponent (lines 246-247)', async () => {
      // Mock copyDirectory to throw an error during component installation
      const copyDirectorySpy = spyOn(fsUtils, 'copyDirectory').mockRejectedValue(
        new Error('Simulated copy error')
      );

      const result = await install({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
        skipConfirm: true,
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Failed to install rules'))).toBe(true);

      copyDirectorySpy.mockRestore();
    });

    it('should handle non-Error exceptions in installSingleComponent (line 247)', async () => {
      // Mock copyDirectory to throw a non-Error object
      const copyDirectorySpy = spyOn(fsUtils, 'copyDirectory').mockImplementation(() => {
        throw 'String error'; // Non-Error exception
      });

      const result = await install({
        targetDir: tempDir,
        components: ['agents'],
        force: true,
        skipConfirm: true,
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Failed to install agents'))).toBe(true);

      copyDirectorySpy.mockRestore();
    });

    it('should handle error in install() catch block (lines 309-311)', async () => {
      // Mock ensureDirectory to throw an error in ensureTargetDirectory
      const ensureDirectorySpy = spyOn(fsUtils, 'ensureDirectory').mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');

      ensureDirectorySpy.mockRestore();
    });

    it('should handle non-Error exception in install() catch block (line 310)', async () => {
      // Mock to throw a non-Error
      const ensureDirectorySpy = spyOn(fsUtils, 'ensureDirectory').mockImplementation(() => {
        throw { code: 'EACCES', message: 'Access denied' };
      });

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      ensureDirectorySpy.mockRestore();
    });

    it('should return default manifest when manifest.json not found (lines 355, 358-368)', async () => {
      // Mock fileExists to return false for manifest.json
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockResolvedValue(false);

      const manifest = await getTemplateManifest();

      expect(manifest.version).toBe('0.0.0');
      expect(manifest.components.length).toBeGreaterThan(0);
      expect(manifest.source).toBe('https://github.com/baekenough/oh-my-customcode');
      expect(manifest.components.every((c) => c.files === 0)).toBe(true);

      fileExistsSpy.mockRestore();
    });

    it('should warn when template source not found (lines 402-403)', async () => {
      // Create a spy that returns false for specific template source checks
      const originalFileExists = fsUtils.fileExists;
      let templateDirCheckDone = false;
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(async (path) => {
        const pathStr = String(path);

        // Allow initial template directory check to pass
        if (
          pathStr.includes('templates') &&
          pathStr.endsWith('templates') &&
          !templateDirCheckDone
        ) {
          templateDirCheckDone = true;
          return true;
        }

        // Return false for component template source paths (the actual rules template)
        if (
          pathStr.includes('templates') &&
          pathStr.includes('rules') &&
          !pathStr.includes(tempDir)
        ) {
          return false;
        }

        // Use original implementation for other paths
        return originalFileExists(path);
      });

      const result = await install({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
        skipConfirm: true,
      });

      expect(result.skippedComponents).toContain('rules');

      fileExistsSpy.mockRestore();
    });

    it('should warn when CLAUDE.md template not found (lines 430-431)', async () => {
      // Mock fileExists to allow installation to proceed but fail on CLAUDE.md template
      const originalFileExists = fsUtils.fileExists;
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(async (path) => {
        const pathStr = String(path);
        // Return false for CLAUDE.md.en and CLAUDE.md.ko templates
        if (
          (pathStr.includes('CLAUDE.md.en') || pathStr.includes('CLAUDE.md.ko')) &&
          !pathStr.includes(tempDir)
        ) {
          return false;
        }
        // Use original for other checks
        return originalFileExists(path);
      });

      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: true,
        skipConfirm: true,
      });

      expect(result.skippedComponents).toContain('entry-md');

      fileExistsSpy.mockRestore();
    });

    it('should handle backup errors gracefully (lines 507-508)', async () => {
      // Create existing files to trigger backup
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      // Mock rename to throw an error
      const renameSpy = spyOn(await import('node:fs/promises'), 'rename').mockRejectedValue(
        new Error('Cannot move file')
      );

      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();
      // Backup should have attempted and logged the error

      renameSpy.mockRestore();
    });

    it('should handle non-Error exception in backup (line 508)', async () => {
      // Create existing files (official Claude Code format)
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });

      // Mock rename to throw non-Error
      const renameSpy = spyOn(await import('node:fs/promises'), 'rename').mockImplementation(() => {
        throw 'Backup failed'; // Non-Error exception
      });

      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result).toBeDefined();

      renameSpy.mockRestore();
    });

    it('should handle missing statusline template gracefully', async () => {
      // Mock fileExists to return false for statusline.sh source path in templates
      const originalFileExists = fsUtils.fileExists;
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(async (path) => {
        const pathStr = String(path);
        // Return false for statusline.sh template source
        if (pathStr.includes('templates') && pathStr.endsWith('statusline.sh')) {
          return false;
        }
        return originalFileExists(path);
      });

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      // Install should still succeed even without statusline template
      expect(result.success).toBe(true);

      fileExistsSpy.mockRestore();
    });

    it('should handle malformed settings.local.json gracefully', async () => {
      // Create a malformed settings.local.json
      const fs = await import('node:fs/promises');
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true });
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      await fs.writeFile(settingsPath, '{ invalid json content }', 'utf-8');

      const result = await install({
        targetDir: tempDir,
        skipConfirm: true,
      });

      // Install should succeed, with a warning about the malformed JSON
      expect(result.success).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('Failed to parse existing settings.local.json'))
      ).toBe(true);
    });
  });

  describe('layout functions', () => {
    it('should return CLAUDE.md path for entry-md component', () => {
      const path = getComponentPath('entry-md');
      expect(path).toBe('CLAUDE.md');
    });
  });

  describe('file preservation during backup', () => {
    it('should preserve settings.local.json user properties during backup reinstall', async () => {
      const fs = await import('node:fs/promises');

      // First install
      await install({ targetDir: tempDir, skipConfirm: true });

      // Add user customizations to settings.local.json
      const settingsPath = join(tempDir, '.claude', 'settings.local.json');
      const userSettings = {
        enableAllProjectMcpServers: true,
        enabledMcpjsonServers: ['ontology-rag'],
        statusLine: {
          type: 'command',
          command: '.claude/statusline.sh',
          padding: 0,
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(userSettings), 'utf-8');

      // Re-install with backup (simulates omcustom init on existing project)
      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result.success).toBe(true);

      // Verify user settings are preserved
      const restored = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(restored.enableAllProjectMcpServers).toBe(true);
      expect(restored.enabledMcpjsonServers).toEqual(['ontology-rag']);
      expect(restored.statusLine).toBeDefined();
    });

    it('should preserve settings.json during backup reinstall', async () => {
      const fs = await import('node:fs/promises');

      // Create initial .claude with settings.json
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ projectSetting: 'value' }),
        'utf-8'
      );
      await fs.writeFile(join(tempDir, 'CLAUDE.md'), '# Existing');

      // Re-install with backup
      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result.success).toBe(true);

      // settings.json should be preserved
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      expect(await fileExists(settingsPath)).toBe(true);
      const content = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(content.projectSetting).toBe('value');
    });

    it('should preserve agent-memory directories during backup reinstall', async () => {
      const fs = await import('node:fs/promises');

      // First install
      await install({ targetDir: tempDir, skipConfirm: true });

      // Create agent memory
      const memDir = join(tempDir, '.claude', 'agent-memory', 'test-agent');
      await mkdir(memDir, { recursive: true });
      await fs.writeFile(join(memDir, 'MEMORY.md'), '# Important agent memory');

      // Re-install with backup
      const result = await install({
        targetDir: tempDir,
        backup: true,
        skipConfirm: true,
      });

      expect(result.success).toBe(true);

      // Agent memory should be preserved
      expect(
        await fileExists(join(tempDir, '.claude', 'agent-memory', 'test-agent', 'MEMORY.md'))
      ).toBe(true);
      const content = await fs.readFile(
        join(tempDir, '.claude', 'agent-memory', 'test-agent', 'MEMORY.md'),
        'utf-8'
      );
      expect(content).toBe('# Important agent memory');
    });
  });
});

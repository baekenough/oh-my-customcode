import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanupPreservation,
  deepMerge,
  extractCriticalFiles,
  isProtectedFile,
  mergeJsonFile,
  restoreCriticalFiles,
} from '../../../src/core/file-preservation.js';
import * as fsUtils from '../../../src/utils/fs.js';
import { fileExists, readJsonFile } from '../../../src/utils/fs.js';

describe('file-preservation', () => {
  let tempDir: string;
  let rootDir: string;
  let preserveDir: string;
  let consoleSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-preserve-test-'));
    rootDir = join(tempDir, '.claude');
    preserveDir = join(tempDir, 'preserve');
    await mkdir(rootDir, { recursive: true });
    await mkdir(preserveDir, { recursive: true });
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('extractCriticalFiles', () => {
    it('should extract settings.json when it exists', async () => {
      await writeFile(join(rootDir, 'settings.json'), JSON.stringify({ projectSettings: true }));

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.extractedFiles).toContain('settings.json');
      expect(await fileExists(join(preserveDir, 'settings.json'))).toBe(true);
    });

    it('should extract settings.local.json when it exists', async () => {
      await writeFile(
        join(rootDir, 'settings.local.json'),
        JSON.stringify({
          enableAllProjectMcpServers: true,
          statusLine: { type: 'command', command: '.claude/statusline.sh' },
        })
      );

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.extractedFiles).toContain('settings.local.json');
      const preserved = await readJsonFile<Record<string, unknown>>(
        join(preserveDir, 'settings.local.json')
      );
      expect(preserved.enableAllProjectMcpServers).toBe(true);
    });

    it('should extract agent-memory directory', async () => {
      const memDir = join(rootDir, 'agent-memory', 'test-agent');
      await mkdir(memDir, { recursive: true });
      await writeFile(join(memDir, 'MEMORY.md'), '# Test memory');

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.extractedDirs).toContain('agent-memory');
      expect(await fileExists(join(preserveDir, 'agent-memory', 'test-agent', 'MEMORY.md'))).toBe(
        true
      );
    });

    it('should extract agent-memory-local directory', async () => {
      const memDir = join(rootDir, 'agent-memory-local', 'local-agent');
      await mkdir(memDir, { recursive: true });
      await writeFile(join(memDir, 'MEMORY.md'), '# Local memory');

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.extractedDirs).toContain('agent-memory-local');
    });

    it('should handle missing files gracefully', async () => {
      // No files exist in rootDir
      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.extractedFiles).toHaveLength(0);
      expect(result.extractedDirs).toHaveLength(0);
      expect(result.failures).toHaveLength(0);
    });

    it('should accept additional files to preserve', async () => {
      await writeFile(join(rootDir, 'custom-config.json'), '{"custom": true}');

      const result = await extractCriticalFiles(rootDir, preserveDir, ['custom-config.json']);

      expect(result.extractedFiles).toContain('custom-config.json');
    });

    it('should record failure when copyFile throws during file extraction (lines 125-127)', async () => {
      // Create source file so fileExists returns true
      await writeFile(join(rootDir, 'settings.json'), '{"key": "value"}');

      // Make copyFile throw
      const copyFileSpy = spyOn(fsUtils, 'copyFile').mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some((f) => f.path === 'settings.json')).toBe(true);

      copyFileSpy.mockRestore();
    });

    it('should record failure when copyDirectory throws during dir extraction (lines 150-152)', async () => {
      // Create source directory so fileExists returns true
      const memDir = join(rootDir, 'agent-memory');
      await mkdir(memDir, { recursive: true });

      // Make copyDirectory throw
      const copyDirSpy = spyOn(fsUtils, 'copyDirectory').mockRejectedValue(
        new Error('Copy failed')
      );

      const result = await extractCriticalFiles(rootDir, preserveDir);

      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some((f) => f.path === 'agent-memory')).toBe(true);

      copyDirSpy.mockRestore();
    });
  });

  describe('restoreCriticalFiles', () => {
    it('should restore files after installation', async () => {
      // Setup: preserved settings.json
      await writeFile(join(preserveDir, 'settings.json'), JSON.stringify({ userSetting: true }));

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: ['settings.json'],
        extractedDirs: [],
        failures: [],
      };

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.restoredFiles).toContain('settings.json');
      expect(await fileExists(join(rootDir, 'settings.json'))).toBe(true);
    });

    it('should deep merge JSON files with existing installed files', async () => {
      // Template installed a new settings.local.json with statusLine
      await writeFile(
        join(rootDir, 'settings.local.json'),
        JSON.stringify({
          statusLine: { type: 'command', command: '.claude/statusline.sh', padding: 0 },
        })
      );

      // Preserved user settings.local.json with MCP config
      await writeFile(
        join(preserveDir, 'settings.local.json'),
        JSON.stringify({
          enableAllProjectMcpServers: true,
          enabledMcpjsonServers: ['ontology-rag'],
          statusLine: { type: 'command', command: '.claude/custom-statusline.sh', padding: 2 },
        })
      );

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: ['settings.local.json'],
        extractedDirs: [],
        failures: [],
      };

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.restoredFiles).toContain('settings.local.json');

      const merged = await readJsonFile<Record<string, unknown>>(
        join(rootDir, 'settings.local.json')
      );
      // User settings preserved (takes precedence)
      expect(merged.enableAllProjectMcpServers).toBe(true);
      expect(merged.enabledMcpjsonServers).toEqual(['ontology-rag']);
      // User's custom statusLine preserved over template
      expect((merged.statusLine as Record<string, unknown>).command).toBe(
        '.claude/custom-statusline.sh'
      );
    });

    it('should restore directories', async () => {
      const memDir = join(preserveDir, 'agent-memory', 'test-agent');
      await mkdir(memDir, { recursive: true });
      await writeFile(join(memDir, 'MEMORY.md'), '# Preserved memory');

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: [],
        extractedDirs: ['agent-memory'],
        failures: [],
      };

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.restoredDirs).toContain('agent-memory');
      expect(await fileExists(join(rootDir, 'agent-memory', 'test-agent', 'MEMORY.md'))).toBe(true);
    });

    it('should copy preserved JSON when no target exists', async () => {
      await writeFile(join(preserveDir, 'settings.json'), JSON.stringify({ preserved: true }));

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: ['settings.json'],
        extractedDirs: [],
        failures: [],
      };

      // rootDir exists but has no settings.json
      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.restoredFiles).toContain('settings.json');
      const restored = await readJsonFile<Record<string, unknown>>(join(rootDir, 'settings.json'));
      expect(restored.preserved).toBe(true);
    });

    it('should restore non-JSON files using copyFile (line 220 else branch)', async () => {
      // Create a non-JSON preserved file
      await writeFile(join(preserveDir, 'custom.txt'), 'custom content');

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: ['custom.txt'],
        extractedDirs: [],
        failures: [],
      };

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.restoredFiles).toContain('custom.txt');
      expect(await fileExists(join(rootDir, 'custom.txt'))).toBe(true);
    });

    it('should record failure when file restoration throws (lines 225-227)', async () => {
      // Create preserved file
      await writeFile(join(preserveDir, 'custom.txt'), 'content');

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: ['custom.txt'],
        extractedDirs: [],
        failures: [],
      };

      // Make copyFile throw during restoration
      const copyFileSpy = spyOn(fsUtils, 'copyFile').mockRejectedValue(new Error('Write failed'));

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some((f) => f.path === 'custom.txt')).toBe(true);
      expect(result.restoredFiles).not.toContain('custom.txt');

      copyFileSpy.mockRestore();
    });

    it('should record failure when directory restoration throws (lines 244-246)', async () => {
      const memDir = join(preserveDir, 'agent-memory');
      await mkdir(memDir, { recursive: true });

      const preservation = {
        tempDir: preserveDir,
        extractedFiles: [],
        extractedDirs: ['agent-memory'],
        failures: [],
      };

      // Make copyDirectory throw during restoration
      const copyDirSpy = spyOn(fsUtils, 'copyDirectory').mockRejectedValue(
        new Error('Dir copy failed')
      );

      const result = await restoreCriticalFiles(rootDir, preservation);

      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some((f) => f.path === 'agent-memory')).toBe(true);
      expect(result.restoredDirs).not.toContain('agent-memory');

      copyDirSpy.mockRestore();
    });
  });

  describe('deepMerge', () => {
    it('should merge flat objects with source priority', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const target = { outer: { a: 1, b: 2 } };
      const source = { outer: { b: 3, c: 4 } };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );

      expect(result).toEqual({ outer: { a: 1, b: 3, c: 4 } });
    });

    it('should replace arrays (not concatenate)', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );

      expect(result).toEqual({ items: [4, 5] });
    });

    it('should handle null values', () => {
      const target = { a: 1, b: null };
      const source = { a: null, c: 3 };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );

      expect(result).toEqual({ a: null, b: null, c: 3 });
    });

    it('should handle real settings.local.json merge scenario', () => {
      const templateSettings = {
        statusLine: {
          type: 'command',
          command: '.claude/statusline.sh',
          padding: 0,
        },
      };

      const userSettings = {
        enableAllProjectMcpServers: true,
        enabledMcpjsonServers: ['ontology-rag'],
        statusLine: {
          type: 'command',
          command: '.claude/custom-statusline.sh',
          padding: 2,
        },
      };

      const result = deepMerge(
        templateSettings as Record<string, unknown>,
        userSettings as Record<string, unknown>
      );

      expect(result.enableAllProjectMcpServers).toBe(true);
      expect(result.enabledMcpjsonServers).toEqual(['ontology-rag']);
      expect((result.statusLine as Record<string, unknown>).command).toBe(
        '.claude/custom-statusline.sh'
      );
      expect((result.statusLine as Record<string, unknown>).padding).toBe(2);
    });
  });

  describe('mergeJsonFile', () => {
    it('should merge preserved and target JSON files', async () => {
      const preservedPath = join(preserveDir, 'test.json');
      const targetPath = join(rootDir, 'test.json');

      await writeFile(preservedPath, JSON.stringify({ user: true, shared: 'user' }));
      await writeFile(targetPath, JSON.stringify({ template: true, shared: 'template' }));

      await mergeJsonFile(preservedPath, targetPath);

      const result = await readJsonFile<Record<string, unknown>>(targetPath);
      expect(result.user).toBe(true);
      expect(result.template).toBe(true);
      expect(result.shared).toBe('user'); // User takes precedence
    });

    it('should copy preserved file if target does not exist', async () => {
      const preservedPath = join(preserveDir, 'test.json');
      const targetPath = join(rootDir, 'test.json');

      await writeFile(preservedPath, JSON.stringify({ onlyUser: true }));

      await mergeJsonFile(preservedPath, targetPath);

      const result = await readJsonFile<Record<string, unknown>>(targetPath);
      expect(result.onlyUser).toBe(true);
    });
  });

  describe('cleanupPreservation', () => {
    it('should remove the temp directory', async () => {
      const cleanDir = join(tempDir, 'to-clean');
      await mkdir(cleanDir, { recursive: true });
      await writeFile(join(cleanDir, 'file.txt'), 'content');

      await cleanupPreservation(cleanDir);

      expect(await fileExists(cleanDir)).toBe(false);
    });

    it('should handle non-existent directory gracefully', async () => {
      // Should not throw
      await cleanupPreservation(join(tempDir, 'non-existent'));
    });
  });

  describe('isProtectedFile', () => {
    it('should protect CLAUDE.md', () => {
      expect(isProtectedFile('CLAUDE.md')).toBe(true);
    });

    it('should protect AGENTS.md', () => {
      expect(isProtectedFile('AGENTS.md')).toBe(true);
    });

    it('should protect CLAUDE.md when nested under a path', () => {
      expect(isProtectedFile('some/dir/CLAUDE.md')).toBe(true);
    });

    it('should protect MUST-*.md rule files', () => {
      expect(isProtectedFile('rules/MUST-safety.md')).toBe(true);
      expect(isProtectedFile('rules/MUST-permissions.md')).toBe(true);
      expect(isProtectedFile('rules/MUST-agent-design.md')).toBe(true);
      expect(isProtectedFile('.claude/rules/MUST-orchestrator-coordination.md')).toBe(true);
    });

    it('should NOT protect SHOULD-*.md rule files', () => {
      expect(isProtectedFile('rules/SHOULD-interaction.md')).toBe(false);
      expect(isProtectedFile('rules/SHOULD-hud-statusline.md')).toBe(false);
    });

    it('should NOT protect MAY-*.md rule files', () => {
      expect(isProtectedFile('rules/MAY-optimization.md')).toBe(false);
    });

    it('should NOT protect regular agent files', () => {
      expect(isProtectedFile('agents/lang-golang-expert.md')).toBe(false);
    });

    it('should NOT protect skill files', () => {
      expect(isProtectedFile('skills/dev-review/SKILL.md')).toBe(false);
    });

    it('should NOT protect arbitrary markdown files', () => {
      expect(isProtectedFile('README.md')).toBe(false);
      expect(isProtectedFile('docs/guide.md')).toBe(false);
    });
  });
});

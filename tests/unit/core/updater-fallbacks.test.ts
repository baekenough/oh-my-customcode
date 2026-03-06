/**
 * Tests for updater.ts fallback code paths that require mocking fs utilities.
 * These tests cover:
 *   - getLatestVersion() returning '0.0.0' when manifest.json does not exist (lines 565-566)
 *   - updateEntryDoc() warning when entry template is not found (lines 364-365)
 *   - removeDeprecatedFiles() when deprecated-files.json does not exist (line 733)
 *   - removeDeprecatedFiles() when files array is empty (line 739)
 *   - removeDeprecatedFiles() when a file entry has an invalid path (lines 753-757)
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Import fs utilities to spy on
import * as fsUtils from '../../../src/utils/fs.js';

// Track which file paths should appear non-existent
const overrideNonExistentPaths = new Set<string>();

// Keep reference to original fileExists
const originalFileExists = fsUtils.fileExists;

// Keep reference to original readJsonFile
const originalReadJsonFile = fsUtils.readJsonFile;

// Dynamic imports
const { checkForUpdates, update } = await import('../../../src/core/updater.js');
const { getDefaultConfig, saveConfig } = await import('../../../src/core/config.js');
const { getProviderLayout } = await import('../../../src/core/layout.js');
const { resolveTemplatePath } = await import('../../../src/utils/fs.js');

describe('updater fallback paths', () => {
  let tempDir: string;
  let fileExistsSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-updater-fallback-test-'));
    overrideNonExistentPaths.clear();

    // Spy on fileExists to control which paths appear non-existent
    fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(
      async (path: string): Promise<boolean> => {
        if (overrideNonExistentPaths.has(path)) {
          return false;
        }
        return originalFileExists(path);
      }
    );
  });

  afterEach(async () => {
    overrideNonExistentPaths.clear();
    fileExistsSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createConfig(version = '0.1.0', componentVersions?: Record<string, string>) {
    const config = getDefaultConfig();
    config.version = version;
    config.installedAt = '2025-01-01T00:00:00Z';
    if (componentVersions) {
      config.componentVersions = componentVersions;
    }
    await saveConfig(tempDir, config);
  }

  describe('getLatestVersion() fallback (lines 565-566)', () => {
    it('should return 0.0.0 when manifest.json does not exist', async () => {
      // Make manifest path appear non-existent
      const layout = getProviderLayout();
      const manifestPath = resolveTemplatePath(layout.manifestFile);
      overrideNonExistentPaths.add(manifestPath);

      await createConfig('0.1.0');

      const result = await checkForUpdates(tempDir);

      // When manifest doesn't exist, getLatestVersion() returns '0.0.0'
      expect(result.latestVersion).toBe('0.0.0');
      expect(result.checkedAt).toBeDefined();
    });

    it('should report no updates when config matches 0.0.0 fallback version', async () => {
      const layout = getProviderLayout();
      const manifestPath = resolveTemplatePath(layout.manifestFile);
      overrideNonExistentPaths.add(manifestPath);

      // Config version is 0.0.0 (same as fallback)
      await createConfig('0.0.0', {
        rules: '0.0.0',
        agents: '0.0.0',
        skills: '0.0.0',
        guides: '0.0.0',
        hooks: '0.0.0',
        contexts: '0.0.0',
        ontology: '0.0.0',
      });

      const result = await checkForUpdates(tempDir);

      expect(result.latestVersion).toBe('0.0.0');
      expect(result.currentVersion).toBe('0.0.0');
      expect(result.hasUpdates).toBe(false);
    });
  });

  describe('updateEntryDoc() template not found (lines 364-365)', () => {
    it('should warn and return early when entry template does not exist', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Make the entry template appear non-existent
      const entryBaseName = layout.entryFile.replace('.md', '');
      const templateName = `${entryBaseName}.md.en`;
      const templatePath = resolveTemplatePath(templateName);
      overrideNonExistentPaths.add(templatePath);

      // Full update (no components = triggers updateEntryDoc)
      const result = await update({
        targetDir: tempDir,
      });

      // Should succeed even when template is missing (graceful degradation)
      expect(result.success).toBe(true);
      // Entry doc should NOT be created since template was missing
      const entryPath = join(tempDir, layout.entryFile);
      const entryExists = await originalFileExists(entryPath);
      expect(entryExists).toBe(false);
    });
  });

  describe('removeDeprecatedFiles() fallback paths', () => {
    let readJsonFileSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      readJsonFileSpy?.mockRestore();
    });

    it('should return empty array when deprecated-files.json does not exist', async () => {
      await createConfig('0.1.0');

      // Make deprecated-files.json appear non-existent
      const manifestPath = resolveTemplatePath('deprecated-files.json');
      overrideNonExistentPaths.add(manifestPath);

      const result = await update({
        targetDir: tempDir,
      });

      // Should succeed with no removed files
      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles).toEqual([]);
    });

    it('should return empty array when deprecated-files.json has empty files array', async () => {
      await createConfig('0.1.0');

      // Mock readJsonFile to return empty files manifest
      readJsonFileSpy = spyOn(fsUtils, 'readJsonFile').mockImplementation(
        async <T>(path: string): Promise<T> => {
          if (path.endsWith('deprecated-files.json')) {
            return { description: 'empty', files: [] } as unknown as T;
          }
          return originalReadJsonFile<T>(path);
        }
      );

      const result = await update({
        targetDir: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles).toEqual([]);
    });

    it('should skip files with invalid paths in deprecated-files.json', async () => {
      await createConfig('0.1.0');

      // Mock readJsonFile to return manifest with invalid path
      readJsonFileSpy = spyOn(fsUtils, 'readJsonFile').mockImplementation(
        async <T>(path: string): Promise<T> => {
          if (path.endsWith('deprecated-files.json')) {
            return {
              description: 'test',
              files: [
                {
                  path: '../../../etc/passwd',
                  reason: 'malicious path',
                  since: '0.0.1',
                },
              ],
            } as unknown as T;
          }
          return originalReadJsonFile<T>(path);
        }
      );

      const result = await update({
        targetDir: tempDir,
      });

      // Should succeed but skip the invalid path
      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles).toEqual([]);
    });
  });
});

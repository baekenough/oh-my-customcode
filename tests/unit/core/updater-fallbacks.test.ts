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
import * as childProcess from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../../../package.json';
import * as codexInstaller from '../../../src/core/codex-installer.js';

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

  describe('release correction manifest failures', () => {
    const originalCliVersion = packageJson.version;
    let manifestSpy: ReturnType<typeof spyOn> | undefined;

    afterEach(() => {
      packageJson.version = originalCliVersion;
      manifestSpy?.mockRestore();
      manifestSpy = undefined;
      expect(packageJson.version).toBe(originalCliVersion);
    });

    it.each([
      'missing',
      'mismatch',
      'null',
      'array',
      'invalid-json',
      'read-failure',
      'second-read',
    ])('fails closed before backups or writes for %s manifest', async (fixture) => {
      packageJson.version = '1.1.107';
      await createConfig('2.0.0');
      await mkdir(join(tempDir, '.claude/rules'), { recursive: true });
      const userPath = join(tempDir, '.claude/rules/recovery-user.md');
      await writeFile(userPath, 'unchanged custom bytes\n');
      const configPath = join(tempDir, '.omcustomrc.json');
      const beforeConfig = await readFile(configPath);
      const beforeUser = await readFile(userPath);
      const beforeEntries = await readdir(tempDir);
      const manifestPath = resolveTemplatePath(getProviderLayout().manifestFile);
      let manifestReads = 0;
      if (fixture === 'missing') overrideNonExistentPaths.add(manifestPath);
      const manifestResponses: Record<string, () => unknown> = {
        missing: () => ({ version: '1.1.107' }),
        mismatch: () => ({ version: '1.1.106' }),
        null: () => null,
        array: () => [],
        'invalid-json': () => JSON.parse('{invalid'),
        'read-failure': () => {
          throw new Error('owned manifest read failure');
        },
        'second-read': () => ({ version: manifestReads > 1 ? '1.1.106' : '1.1.107' }),
      };
      manifestSpy = spyOn(fsUtils, 'readJsonFile').mockImplementation(
        async <T>(path: string): Promise<T> => {
          if (path !== manifestPath) return originalReadJsonFile<T>(path);
          manifestReads++;
          return manifestResponses[fixture]() as T;
        }
      );
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
        forceOverwriteAll: true,
        backup: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.backedUpPaths).toEqual([]);
      expect(result.updatedComponents).toEqual([]);
      expect(await readFile(configPath)).toEqual(beforeConfig);
      expect(await readFile(userPath)).toEqual(beforeUser);
      expect(await readdir(tempDir)).toEqual(beforeEntries);
      expect(await readdir(join(tempDir, '.claude/rules'))).toEqual(['recovery-user.md']);
      expect(await originalFileExists(join(tempDir, '.omcustom.lock.json'))).toBe(false);
      expect(codexCheckSpy).not.toHaveBeenCalled();
      expect(codexInstallSpy).not.toHaveBeenCalled();
      expect(manifestReads).toBe(fixture === 'missing' ? 0 : fixture === 'second-read' ? 2 : 1);
      if (fixture === 'second-read') expect(result.error).toContain('Version correction prevented');
    });
  });

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

// Every updater invocation uses a local spy; no external CLI or installer is launched.
let codexCheckSpy: ReturnType<typeof spyOn>;
let codexInstallSpy: ReturnType<typeof spyOn>;
let networkSpy: ReturnType<typeof spyOn>;
let syncCommandSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  networkSpy = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('network forbidden in updater fixture')
  );
  syncCommandSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
    throw new Error('external synchronous command forbidden');
  });
  codexCheckSpy = spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true);
  codexInstallSpy = spyOn(codexInstaller, 'installCodex').mockReturnValue(false);
});
afterEach(() => {
  const networkCalls = networkSpy.mock.calls.length;
  const syncCommandCalls = syncCommandSpy.mock.calls.length;
  networkSpy.mockRestore();
  syncCommandSpy.mockRestore();
  codexCheckSpy.mockRestore();
  codexInstallSpy.mockRestore();
  expect(networkCalls).toBe(0);
  expect(syncCommandCalls).toBe(0);
});

describe('update RTK ownership fallback and containment', () => {
  let project: string;
  let scratch: string;
  const wrapper = '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs';
  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'omcustom-update-rtk-containment-'));
    project = join(scratch, 'project');
    await mkdir(project);
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    await mkdir(join(project, wrapper, '..'), { recursive: true });
  });
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  for (const oldLock of [
    '{ corrupt',
    JSON.stringify({ lockfileVersion: 99, files: {} }),
    JSON.stringify({ lockfileVersion: 1, files: {} }),
  ]) {
    it(`preserves unknown RTK bytes for old lock ${oldLock}`, async () => {
      await writeFile(join(project, wrapper), 'user data');
      await writeFile(join(project, '.omcustom.lock.json'), oldLock);
      const result = await update({ targetDir: project, components: ['skills'] });
      expect(result.success).toBe(true);
      expect(await readFile(join(project, wrapper), 'utf8')).toBe('user data');
      expect(result.rtkRetirement?.removed).toEqual([]);
      expect(result.rtkRetirement?.preserved.some((entry) => entry.path === wrapper)).toBe(true);
      const next = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
      expect(next.files[wrapper]).toBeUndefined();
      expect(Object.keys(next.files).length).toBeGreaterThan(0);
    });
  }

  it('preserves RTK bytes when prior ownership cannot be read', async () => {
    await writeFile(join(project, wrapper), 'user data');
    await mkdir(join(project, '.omcustom.lock.json'));
    const result = await update({ targetDir: project, components: ['skills'] });
    expect(await readFile(join(project, wrapper), 'utf8')).toBe('user data');
    expect(result.rtkRetirement?.removed).toEqual([]);
    expect(result.rtkRetirement?.preserved.some((entry) => entry.path === wrapper)).toBe(true);
    expect((await lstat(join(project, '.omcustom.lock.json'))).isDirectory()).toBe(true);
  });

  for (const target of ['internal', 'external', 'dangling'] as const) {
    it(`never unlinks a ${target} RTK target symlink or modifies its owned sentinel`, async () => {
      const sentinel =
        target === 'internal'
          ? join(project, '.claude/skills/sentinel.cjs')
          : join(scratch, 'sentinel.cjs');
      const content = 'protected sentinel';
      if (target !== 'dangling') await writeFile(sentinel, content);
      await symlink(sentinel, join(project, wrapper));
      const { createHash } = await import('node:crypto');
      await writeFile(
        join(project, '.omcustom.lock.json'),
        JSON.stringify({
          lockfileVersion: 1,
          generatorVersion: '0.1.0',
          templateVersion: '0.1.0',
          generatedAt: '2025-01-01T00:00:00Z',
          files: {
            [wrapper]: {
              templateHash: createHash('sha256').update(content).digest('hex'),
              size: content.length,
              component: 'skills',
            },
          },
        })
      );
      const result = await update({ targetDir: project, components: ['skills'] });
      expect(result.rtkRetirement?.removed).toEqual([]);
      expect(result.rtkRetirement?.preserved).toContainEqual({
        path: wrapper,
        reason: 'not a regular owned file',
      });
      expect((await lstat(join(project, wrapper))).isSymbolicLink()).toBe(true);
      if (target !== 'dangling') expect(await readFile(sentinel, 'utf8')).toBe(content);
    });
  }
  it('preserves a regular RTK file whose parent resolves outside the project', async () => {
    const outside = join(scratch, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'rtk-wrapper.cjs'), 'outside sentinel');
    await rm(join(project, wrapper, '..'), { recursive: true });
    await symlink(outside, join(project, wrapper, '..'));
    const result = await update({ targetDir: project, components: ['rules'] });
    expect(result.success).toBe(true);
    // Rules-only control must not even select RTK retirement.
    expect(result.rtkRetirement?.removed ?? []).toEqual([]);
    const selected = await update({ targetDir: project, components: ['skills'], force: true });
    expect(selected.rtkRetirement?.removed).toEqual([]);
    expect(selected.rtkRetirement?.preserved).toContainEqual({
      path: wrapper,
      reason: 'resolved path escapes project',
    });
    expect(await readFile(join(outside, 'rtk-wrapper.cjs'), 'utf8')).toBe('outside sentinel');
  });
});

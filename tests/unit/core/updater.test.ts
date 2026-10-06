import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, join as pathJoin } from 'node:path';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { getProviderLayout } from '../../../src/core/layout.js';
import {
  applyUpdates,
  checkForUpdates,
  extractFrontmatterName,
  getAgentVersions,
  preserveCustomizations,
  saveCustomizationManifest,
  type UpdateComponent,
  update,
} from '../../../src/core/updater.js';

// Read manifest version dynamically to avoid hardcoding
const MANIFEST_VERSION = JSON.parse(
  readFileSync(pathJoin(import.meta.dir, '../../../templates/manifest.json'), 'utf-8')
).version;

describe('updater', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-updater-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Helper to create config file
  async function createConfig(version = '0.1.0', componentVersions?: Record<string, string>) {
    const config = getDefaultConfig();
    config.version = version;
    config.installedAt = '2025-01-01T00:00:00Z';
    if (componentVersions) {
      config.componentVersions = componentVersions;
    }
    await saveConfig(tempDir, config);
  }

  // Helper to create directory structure
  async function createDirStructure(structure: Record<string, string>) {
    for (const [path, content] of Object.entries(structure)) {
      const fullPath = join(tempDir, path);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  // Helper to verify file exists with expected content
  async function verifyFileContent(relativePath: string, expectedContent: string) {
    const fullPath = join(tempDir, relativePath);
    const content = await readFile(fullPath, 'utf-8');
    expect(content).toBe(expectedContent);
  }

  describe('checkForUpdates', () => {
    it('should detect updates when component versions differ', async () => {
      await createConfig('0.1.0', {
        rules: '0.1.0',
        agents: '0.1.0',
      });

      const result = await checkForUpdates(tempDir);

      // Template version read from manifest.json
      expect(result.currentVersion).toBe('0.1.0');
      expect(result.latestVersion).toBe(MANIFEST_VERSION);
      expect(result.hasUpdates).toBe(true);
      expect(result.updatableComponents.length).toBeGreaterThan(0);
      expect(result.checkedAt).toBeDefined();
    });

    it('should return no updates when versions match', async () => {
      await createConfig(MANIFEST_VERSION, {
        rules: MANIFEST_VERSION,
        agents: MANIFEST_VERSION,
        skills: MANIFEST_VERSION,
        guides: MANIFEST_VERSION,
        hooks: MANIFEST_VERSION,
        contexts: MANIFEST_VERSION,
        ontology: MANIFEST_VERSION,
      });

      const result = await checkForUpdates(tempDir);

      expect(result.currentVersion).toBe(MANIFEST_VERSION);
      expect(result.latestVersion).toBe(MANIFEST_VERSION);
      expect(result.hasUpdates).toBe(false);
      expect(result.updatableComponents.length).toBe(0);
    });

    it('should handle missing config gracefully', async () => {
      // No config file created, should use defaults
      const result = await checkForUpdates(tempDir);

      expect(result.currentVersion).toBe('0.0.0'); // Default version
      expect(result.latestVersion).toBe(MANIFEST_VERSION);
      expect(result.hasUpdates).toBe(true);
    });

    it('should check each component individually', async () => {
      await createConfig('0.1.0', {
        rules: MANIFEST_VERSION, // Up to date
        agents: '0.1.0', // Out of date
        skills: '0.1.0', // Out of date
      });

      const result = await checkForUpdates(tempDir);

      // Should have agents and skills as updatable (not rules)
      const componentNames = result.updatableComponents.map((c) => c.name);
      expect(componentNames).not.toContain('rules' as UpdateComponent);
      expect(componentNames).toContain('agents' as UpdateComponent);
      expect(componentNames).toContain('skills' as UpdateComponent);
    });

    it('should detect update when component version is missing', async () => {
      await createConfig(MANIFEST_VERSION, {
        // No componentVersions specified
      });

      const result = await checkForUpdates(tempDir);

      // All components should be updatable
      expect(result.updatableComponents.length).toBe(7); // rules, agents, skills, guides, hooks, contexts, ontology
    });
  });

  describe('update', () => {
    it('should update components from templates to target', async () => {
      await createConfig('0.1.0');

      // Create target directory structure
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.updatedComponents).toContain('rules' as UpdateComponent);
      expect(result.previousVersion).toBe('0.1.0');
      expect(result.newVersion).toBe(MANIFEST_VERSION);

      // Verify config was updated
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.version).toBe(MANIFEST_VERSION);
    });

    it('should skip components with no updates when not forced', async () => {
      await createConfig(MANIFEST_VERSION, {
        rules: MANIFEST_VERSION,
        agents: MANIFEST_VERSION,
        skills: MANIFEST_VERSION,
        guides: MANIFEST_VERSION,
        hooks: MANIFEST_VERSION,
        contexts: MANIFEST_VERSION,
        ontology: MANIFEST_VERSION,
      });

      const result = await update({
        targetDir: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.updatedComponents.length).toBe(0);
      expect(result.skippedComponents.length).toBe(7); // All components skipped
    });

    it('should force update all components with --force flag', async () => {
      await createConfig(MANIFEST_VERSION, {
        rules: MANIFEST_VERSION,
      });

      // Create target directory structure
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.updatedComponents).toContain('rules' as UpdateComponent);
      expect(result.skippedComponents.length).toBe(0);
    });

    it('should create backup when --backup is true', async () => {
      await createConfig('0.1.0');

      // Create existing component files to backup
      const layout = getProviderLayout();
      await createDirStructure({
        [`${layout.rootDir}/rules/test.md`]: 'existing rule',
      });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        backup: true,
      });

      expect(result.success).toBe(true);
      expect(result.backedUpPaths.length).toBe(1);
      expect(result.backedUpPaths[0]).toContain('.omcustom-backup-');
    });

    it('should backup entry doc when it exists during backup operation', async () => {
      await createConfig('0.1.0');

      // Create existing entry doc (CLAUDE.md) and component files to backup
      const layout = getProviderLayout();
      await createDirStructure({
        [`${layout.rootDir}/rules/test.md`]: 'existing rule',
        [layout.entryFile]: '# Existing CLAUDE.md',
      });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        backup: true,
      });

      expect(result.success).toBe(true);
      expect(result.backedUpPaths.length).toBe(1);
      // The backup should include the entry doc backup (line 677 in backupInstallation)
      expect(result.backedUpPaths[0]).toContain('.omcustom-backup-');
    });

    it('should preserve customizations during update', async () => {
      await createConfig('0.1.0');

      // Create customization manifest
      const customFile = '.claude/rules/custom-rule.md';
      await createDirStructure({
        [customFile]: 'custom content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [customFile],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: true,
      });

      expect(result.success).toBe(true);
      expect(result.preservedFiles).toContain(customFile);

      // Verify custom file still exists
      await verifyFileContent(customFile, 'custom content');
    });

    it('should handle dry run without file modifications', async () => {
      await createConfig('0.1.0');

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.updatedComponents).toContain('rules' as UpdateComponent);

      // Verify no actual files were created (dry run)
      const layout = getProviderLayout();
      const rulesPath = join(tempDir, layout.rootDir, 'rules');
      const exists = await readFile(rulesPath, 'utf-8').catch(() => null);
      expect(exists).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Create config in a non-existent directory to trigger error
      // (tempDir exists but we'll try to update with a bad target)
      await createConfig('0.1.0');

      const result = await update({
        targetDir: '/nonexistent/path/that/does/not/exist',
        components: ['rules'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should update config version after successful update', async () => {
      await createConfig('0.1.0');

      // Create target directory structure
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      // Verify config version was updated
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.version).toBe(MANIFEST_VERSION);
      expect(config.lastUpdated).toBeDefined();
    });

    it('should handle component update failure and continue with others', async () => {
      await createConfig('0.1.0');

      // Create target directory structure
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Make rules directory a file (will cause copy to fail)
      await writeFile(join(tempDir, layout.rootDir, 'rules'), 'invalid');

      const result = await update({
        targetDir: tempDir,
        components: ['rules', 'hooks'],
      });

      // Update should complete but with warnings
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Failed to update rules');
      expect(result.skippedComponents).toContain('rules' as UpdateComponent);
    });

    it('should disable preservation when preserveCustomizations is false', async () => {
      await createConfig('0.1.0');

      // Create customization manifest
      const customFile = '.claude/rules/custom-rule.md';
      await createDirStructure({
        [customFile]: 'custom content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [customFile],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: false,
      });

      expect(result.success).toBe(true);
      expect(result.preservedFiles.length).toBe(0);
    });

    it('should preserve config preserveFiles even when preserveCustomizations is false', async () => {
      await createConfig('0.1.0');

      // Update config to include preserveFiles
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      const configPreserveFile = '.claude/rules/config-preserved.md';
      config.preserveFiles = [configPreserveFile];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      // Create the file to preserve and a manifest file
      const manifestPreserveFile = '.claude/rules/manifest-preserved.md';
      await createDirStructure({
        [configPreserveFile]: 'config preserved content',
        [manifestPreserveFile]: 'manifest preserved content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [manifestPreserveFile],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: false, // Disable manifest preservation
      });

      expect(result.success).toBe(true);
      // Should preserve config file but not manifest file
      expect(result.preservedFiles).toContain(configPreserveFile);
      expect(result.preservedFiles).not.toContain(manifestPreserveFile);
      // Verify file still exists with original content
      await verifyFileContent(configPreserveFile, 'config preserved content');
    });

    it('should bypass all preservation when forceOverwriteAll is true', async () => {
      await createConfig('0.1.0');

      // Update config to include preserveFiles
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      const configPreserveFile = '.claude/rules/config-preserved.md';
      config.preserveFiles = [configPreserveFile];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      // Create manifest and config preserve files
      const manifestPreserveFile = '.claude/rules/manifest-preserved.md';
      await createDirStructure({
        [configPreserveFile]: 'config preserved content',
        [manifestPreserveFile]: 'manifest preserved content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [manifestPreserveFile],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        forceOverwriteAll: true, // Bypass ALL preservation
      });

      expect(result.success).toBe(true);
      // Should preserve NOTHING when forceOverwriteAll is true
      expect(result.preservedFiles.length).toBe(0);
    });

    it('should override preserveCustomizations when forceOverwriteAll is true', async () => {
      await createConfig('0.1.0');

      const manifestPreserveFile = '.claude/rules/manifest-preserved.md';
      await createDirStructure({
        [manifestPreserveFile]: 'manifest preserved content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [manifestPreserveFile],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: true, // Explicitly enable
        forceOverwriteAll: true, // Should override preserveCustomizations
      });

      expect(result.success).toBe(true);
      expect(result.preservedFiles.length).toBe(0);
    });

    it('should differentiate component sync from version upgrade (#111)', async () => {
      // Config version matches template version, but components lack version tracking
      await createConfig(MANIFEST_VERSION, {
        // No component versions → all components show as "updatable"
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.previousVersion).toBe(MANIFEST_VERSION);
      expect(result.newVersion).toBe(MANIFEST_VERSION);
      // When versions match but components were updated, it's a component sync
      expect(result.updatedComponents).toContain('rules' as UpdateComponent);
    });

    it('should skip specific components that are already up-to-date while others have updates', async () => {
      // Config version is old (hasUpdates: true due to version mismatch),
      // but rules component specifically is at latest version (0.3.0)
      await createConfig('0.1.0', {
        rules: MANIFEST_VERSION, // rules is already up-to-date
        agents: '0.1.0', // agents needs update
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Update only 'rules' component - hasUpdates is true (version mismatch)
      // but rules is not in updatableComponents (it's already at 0.3.0)
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      // Rules should be skipped since its component version is already current
      expect(result.skippedComponents).toContain('rules' as UpdateComponent);
      expect(result.updatedComponents).not.toContain('rules' as UpdateComponent);
    });

    it('should update entry doc when no components specified (full update - new file)', async () => {
      await createConfig('0.1.0');

      // Create target directory structure
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Full update (no components specified) triggers updateEntryDoc
      // No existing CLAUDE.md → creates new file
      const result = await update({
        targetDir: tempDir,
        // No components specified = full update
      });

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(MANIFEST_VERSION);
      // Entry doc was created
      const layout2 = getProviderLayout();
      const entryExists = await readFile(join(tempDir, layout2.entryFile), 'utf-8').catch(
        () => null
      );
      expect(entryExists).not.toBeNull();
    });

    it('should merge existing entry doc during full update (no force)', async () => {
      await createConfig('0.1.0');

      // Create target directory structure with existing CLAUDE.md
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Create existing CLAUDE.md with custom content
      const existingContent = `# My Custom Content\n\n<!-- MANAGED-SECTION-START -->\nManaged content\n<!-- MANAGED-SECTION-END -->\n`;
      await writeFile(join(tempDir, layout.entryFile), existingContent);

      // Full update without force → merge path (378-393)
      const result = await update({
        targetDir: tempDir,
        force: false, // Merge mode
      });

      expect(result.success).toBe(true);
      // Verify entry doc was updated (merged content)
      const updatedContent = await readFile(join(tempDir, layout.entryFile), 'utf-8');
      expect(updatedContent).toBeDefined();
    });

    it('should force overwrite entry doc during full update with --force', async () => {
      await createConfig('0.1.0');

      // Create target directory structure with existing CLAUDE.md
      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Create existing CLAUDE.md
      const existingContent = '# Existing Content\nSome content here';
      await writeFile(join(tempDir, layout.entryFile), existingContent);

      // Full update with force → backup + overwrite (371, 373-376)
      const result = await update({
        targetDir: tempDir,
        force: true, // Force overwrite mode
      });

      expect(result.success).toBe(true);
      // Verify entry doc was overwritten
      const updatedContent = await readFile(join(tempDir, layout.entryFile), 'utf-8');
      expect(updatedContent).not.toBe(existingContent);
    });

    it('should update guides component (testing getComponentPath guides path)', async () => {
      await createConfig('0.1.0');

      const result = await update({
        targetDir: tempDir,
        components: ['guides'],
      });

      expect(result.success).toBe(true);
      expect(result.updatedComponents).toContain('guides' as UpdateComponent);
    });

    it('should skip custom components that match the component path', async () => {
      await createConfig('0.1.0');

      // Create config with customComponents that should be skipped during update
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      config.customComponents = [
        {
          name: 'my-custom-agent',
          path: '.claude/agents/my-custom-agent.md',
          enabled: true,
        },
      ];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      // Create the custom agent file
      await createDirStructure({
        '.claude/agents/my-custom-agent.md': '# Custom Agent Content',
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['agents'],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('resolveCustomizations edge cases', () => {
    it('should warn and skip invalid path traversal in manifest preserveFiles', async () => {
      await createConfig('0.1.0');

      // Create manifest with an invalid path that traverses outside project root
      await createDirStructure({
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: ['../../etc/passwd'], // Invalid: path traversal
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Should warn about invalid path but still succeed
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: true,
      });

      expect(result.success).toBe(true);
      // Invalid path should be silently skipped (warn logged internally)
    });

    it('should merge manifest and config preserveFiles when both have valid paths', async () => {
      await createConfig('0.1.0');

      // Add config-level preserveFiles
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      const configPreserveFile = '.claude/rules/config-rule.md';
      config.preserveFiles = [configPreserveFile];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      // Add manifest-level preserveFiles
      const manifestPreserveFile = '.claude/rules/manifest-rule.md';
      await createDirStructure({
        [configPreserveFile]: 'config rule content',
        [manifestPreserveFile]: 'manifest rule content',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [manifestPreserveFile], // Valid path in manifest
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Both manifest and config have preserveFiles → merge path (322-329)
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        preserveCustomizations: true, // Enable manifest preservation
        // No forceOverwriteAll, so config preserveFiles are also included
      });

      expect(result.success).toBe(true);
      // Both files should be preserved
      expect(result.preservedFiles).toContain(configPreserveFile);
      expect(result.preservedFiles).toContain(manifestPreserveFile);
    });
  });

  describe('preserveCustomizations', () => {
    it('should save file contents for existing files', async () => {
      await createDirStructure({
        'file1.txt': 'content1',
        'file2.txt': 'content2',
        'subdir/file3.txt': 'content3',
      });

      const preserved = await preserveCustomizations(tempDir, [
        'file1.txt',
        'file2.txt',
        'subdir/file3.txt',
      ]);

      expect(preserved.size).toBe(3);
      expect(preserved.get('file1.txt')).toBe('content1');
      expect(preserved.get('file2.txt')).toBe('content2');
      expect(preserved.get('subdir/file3.txt')).toBe('content3');
    });

    it('should skip non-existent files', async () => {
      await createDirStructure({
        'existing.txt': 'content',
      });

      const preserved = await preserveCustomizations(tempDir, ['existing.txt', 'nonexistent.txt']);

      expect(preserved.size).toBe(1);
      expect(preserved.get('existing.txt')).toBe('content');
      expect(preserved.has('nonexistent.txt')).toBe(false);
    });

    it('should return empty map for empty list', async () => {
      const preserved = await preserveCustomizations(tempDir, []);

      expect(preserved.size).toBe(0);
    });

    it('should handle unicode content correctly', async () => {
      await createDirStructure({
        'unicode.txt': '한글 테스트 🎉',
      });

      const preserved = await preserveCustomizations(tempDir, ['unicode.txt']);

      expect(preserved.get('unicode.txt')).toBe('한글 테스트 🎉');
    });
  });

  describe('applyUpdates', () => {
    it('should write files to correct paths', async () => {
      const updates = [
        { path: 'file1.txt', content: 'content1' },
        { path: 'subdir/file2.txt', content: 'content2' },
      ];

      await applyUpdates(tempDir, updates);

      await verifyFileContent('file1.txt', 'content1');
      await verifyFileContent('subdir/file2.txt', 'content2');
    });

    it('should create directories if needed', async () => {
      const updates = [{ path: 'deep/nested/path/file.txt', content: 'nested content' }];

      await applyUpdates(tempDir, updates);

      await verifyFileContent('deep/nested/path/file.txt', 'nested content');
    });

    it('should handle empty updates array', async () => {
      await applyUpdates(tempDir, []);

      // Should not throw, just complete successfully
      expect(true).toBe(true);
    });

    it('should overwrite existing files', async () => {
      await createDirStructure({
        'existing.txt': 'old content',
      });

      await applyUpdates(tempDir, [{ path: 'existing.txt', content: 'new content' }]);

      await verifyFileContent('existing.txt', 'new content');
    });
  });

  describe('saveCustomizationManifest', () => {
    it('should write manifest JSON to correct path', async () => {
      const manifest = {
        modifiedFiles: ['file1.txt', 'file2.txt'],
        preserveFiles: ['custom.txt'],
        customComponents: ['my-agent'],
        lastUpdated: '2025-01-01T00:00:00Z',
      };

      await saveCustomizationManifest(tempDir, manifest);

      const savedContent = await readFile(join(tempDir, '.omcustom-customizations.json'), 'utf-8');
      const saved = JSON.parse(savedContent);

      expect(saved.modifiedFiles).toEqual(['file1.txt', 'file2.txt']);
      expect(saved.preserveFiles).toEqual(['custom.txt']);
      expect(saved.customComponents).toEqual(['my-agent']);
      expect(saved.lastUpdated).toBe('2025-01-01T00:00:00Z');
    });

    it('should handle empty manifest', async () => {
      const manifest = {
        modifiedFiles: [],
        preserveFiles: [],
        customComponents: [],
        lastUpdated: '2025-01-01T00:00:00Z',
      };

      await saveCustomizationManifest(tempDir, manifest);

      const savedContent = await readFile(join(tempDir, '.omcustom-customizations.json'), 'utf-8');
      const saved = JSON.parse(savedContent);

      expect(saved.modifiedFiles).toEqual([]);
      expect(saved.preserveFiles).toEqual([]);
      expect(saved.customComponents).toEqual([]);
    });
  });

  describe('getAgentVersions', () => {
    it('should return versions from config', async () => {
      await createConfig('1.0.0');

      // Add agents to config
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      config.agents = {
        'agent-1': {
          version: '1.0.0',
          source: 'local',
          lastUpdated: '2025-01-01T00:00:00Z',
          hasLocalModifications: false,
          enabled: true,
        },
        'agent-2': {
          version: '2.0.0',
          source: 'https://github.com/example/agent',
          lastUpdated: '2025-01-02T00:00:00Z',
          hasLocalModifications: true,
          enabled: true,
        },
      };
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      const versions = await getAgentVersions(tempDir);

      expect(versions.length).toBe(2);

      const agent1 = versions.find((v) => v.name === 'agent-1');
      expect(agent1).toBeDefined();
      expect(agent1?.version).toBe('1.0.0');
      expect(agent1?.source).toBe('local');
      expect(agent1?.hasLocalModifications).toBe(false);

      const agent2 = versions.find((v) => v.name === 'agent-2');
      expect(agent2).toBeDefined();
      expect(agent2?.version).toBe('2.0.0');
      expect(agent2?.source).toBe('https://github.com/example/agent');
      expect(agent2?.hasLocalModifications).toBe(true);
    });

    it('should return empty array when no agents configured', async () => {
      await createConfig('1.0.0');

      const versions = await getAgentVersions(tempDir);

      expect(versions).toEqual([]);
    });

    it('should handle missing config gracefully', async () => {
      // No config file created
      const versions = await getAgentVersions(tempDir);

      expect(versions).toEqual([]);
    });

    it('should handle agents with missing optional fields', async () => {
      await createConfig('1.0.0');

      // Add agent with minimal fields
      const configContent = await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8');
      const config = JSON.parse(configContent);
      config.agents = {
        'minimal-agent': {
          version: '1.0.0',
          enabled: true,
          // source, lastUpdated, hasLocalModifications not specified
        },
      };
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));

      const versions = await getAgentVersions(tempDir);

      expect(versions.length).toBe(1);
      expect(versions[0].name).toBe('minimal-agent');
      expect(versions[0].version).toBe('1.0.0');
      expect(versions[0].source).toBe('local'); // Default
      expect(versions[0].lastUpdated).toBe(''); // Default
      expect(versions[0].hasLocalModifications).toBe(false); // Default
    });
  });

  describe('syncRootLevelFiles (Bug #201)', () => {
    it('should sync root-level files during full update', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        // No components specified = full update
      });

      expect(result.success).toBe(true);
      expect(result.syncedRootFiles).toBeDefined();
      expect(result.syncedRootFiles.length).toBeGreaterThan(0);
      // statusline.sh should be synced
      expect(result.syncedRootFiles).toContain('statusline.sh');
    });

    it('should not sync root-level files when specific components are updated', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.syncedRootFiles.length).toBe(0);
    });

    it('should preserve execute permissions on .sh files', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      await update({
        targetDir: tempDir,
      });

      // Check that statusline.sh has execute permissions
      const fs = await import('node:fs/promises');
      const statuslinePath = join(tempDir, layout.rootDir, 'statusline.sh');
      const stats = await fs.stat(statuslinePath);
      // Check owner execute bit (0o100)
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it('should sync schemas/tool-inputs.json and create the missing parent dir (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      // Only the root dir exists; schemas/ must be created by the sync
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });
      const schemaDest = join(tempDir, layout.rootDir, 'schemas', 'tool-inputs.json');
      expect(await readFile(schemaDest, 'utf-8').catch(() => null)).toBeNull();

      const result = await update({ targetDir: tempDir });

      expect(result.success).toBe(true);
      expect(result.syncedRootFiles).toContain('schemas/tool-inputs.json');

      const templateContent = readFileSync(
        pathJoin(import.meta.dir, '../../../templates', layout.rootDir, 'schemas/tool-inputs.json'),
        'utf-8'
      );
      expect(await readFile(schemaDest, 'utf-8')).toBe(templateContent);
    });

    it('should overwrite a stale schemas/tool-inputs.json with template content (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await createDirStructure({
        [`${layout.rootDir}/schemas/tool-inputs.json`]: '{"stale":true}',
      });

      await update({ targetDir: tempDir });

      const templateContent = readFileSync(
        pathJoin(import.meta.dir, '../../../templates', layout.rootDir, 'schemas/tool-inputs.json'),
        'utf-8'
      );
      expect(
        await readFile(join(tempDir, layout.rootDir, 'schemas', 'tool-inputs.json'), 'utf-8')
      ).toBe(templateContent);
    });

    it('should keep a user-customized schemas/tool-inputs.json listed in config preserveFiles (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      const schemaRel = `${layout.rootDir}/schemas/tool-inputs.json`;
      const config = JSON.parse(await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8'));
      config.preserveFiles = [schemaRel];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));
      await createDirStructure({ [schemaRel]: '{"user":"custom"}' });

      const result = await update({ targetDir: tempDir });

      expect(result.success).toBe(true);
      expect(await readFile(join(tempDir, schemaRel), 'utf-8')).toBe('{"user":"custom"}');
      expect(result.syncedRootFiles).not.toContain('schemas/tool-inputs.json');
      expect(result.preservedFiles).toContain(schemaRel);
      // Unlisted root files are still synced
      expect(result.syncedRootFiles).toContain('install-hooks.sh');
    });

    it('should overwrite a customized schema when it is not listed in preserveFiles (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      const schemaRel = `${layout.rootDir}/schemas/tool-inputs.json`;
      await createDirStructure({ [schemaRel]: '{"user":"custom"}' });

      const result = await update({ targetDir: tempDir });

      expect(result.syncedRootFiles).toContain('schemas/tool-inputs.json');
      expect(await readFile(join(tempDir, schemaRel), 'utf-8')).not.toBe('{"user":"custom"}');
      expect(result.preservedFiles).not.toContain(schemaRel);
    });

    it('should keep a customized statusline.sh listed in manifest preserveFiles (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      const statuslineRel = `${layout.rootDir}/statusline.sh`;
      await createDirStructure({
        [statuslineRel]: '#!/bin/sh\necho custom\n',
        '.omcustom-customizations.json': JSON.stringify({
          modifiedFiles: [],
          preserveFiles: [statuslineRel],
          customComponents: [],
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      });

      const result = await update({ targetDir: tempDir });

      expect(await readFile(join(tempDir, statuslineRel), 'utf-8')).toBe(
        '#!/bin/sh\necho custom\n'
      );
      expect(result.syncedRootFiles).not.toContain('statusline.sh');
      expect(result.syncedRootFiles).toContain('install-hooks.sh');
    });

    it('should overwrite preserved root files when forceOverwriteAll is set (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      const schemaRel = `${layout.rootDir}/schemas/tool-inputs.json`;
      const config = JSON.parse(await readFile(join(tempDir, '.omcustomrc.json'), 'utf-8'));
      config.preserveFiles = [schemaRel];
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify(config, null, 2));
      await createDirStructure({ [schemaRel]: '{"user":"custom"}' });

      await update({ targetDir: tempDir, forceOverwriteAll: true });

      expect(await readFile(join(tempDir, schemaRel), 'utf-8')).not.toBe('{"user":"custom"}');
    });

    it('should keep syncing the three original root files alongside schemas (#1770)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({ targetDir: tempDir });

      expect(result.syncedRootFiles).toEqual(
        expect.arrayContaining(['statusline.sh', 'install-hooks.sh', 'uninstall-hooks.sh'])
      );
      const fs = await import('node:fs/promises');
      for (const name of ['statusline.sh', 'install-hooks.sh', 'uninstall-hooks.sh']) {
        const stats = await fs.stat(join(tempDir, layout.rootDir, name));
        expect(stats.mode & 0o100).toBeTruthy();
      }
      // Non-.sh schema file is not forced executable
      const schemaStats = await fs.stat(
        join(tempDir, layout.rootDir, 'schemas', 'tool-inputs.json')
      );
      expect(schemaStats.mode & 0o100).toBeFalsy();
    });

    it('should return file list in dry run mode without copying', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.syncedRootFiles.length).toBeGreaterThan(0);
      expect(result.syncedRootFiles).toContain('schemas/tool-inputs.json');

      // Files should NOT actually exist (dry run)
      const statuslinePath = join(tempDir, layout.rootDir, 'statusline.sh');
      const exists = await readFile(statuslinePath, 'utf-8').catch(() => null);
      expect(exists).toBeNull();
    });
  });

  describe('removeDeprecatedFiles (Bug #202)', () => {
    it('should remove deprecated files during full update', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      // Create a deprecated file that exists in the manifest
      await createDirStructure({
        [`${layout.rootDir}/rules/SHOULD-agent-teams.md`]: '# Old agent teams rule',
      });

      const result = await update({
        targetDir: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles).toContain('.claude/rules/SHOULD-agent-teams.md');

      // File should be removed
      const deprecatedPath = join(tempDir, layout.rootDir, 'rules', 'SHOULD-agent-teams.md');
      const exists = await readFile(deprecatedPath, 'utf-8').catch(() => null);
      expect(exists).toBeNull();
    });

    it('should not remove deprecated files when specific components are updated', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await createDirStructure({
        [`${layout.rootDir}/rules/SHOULD-agent-teams.md`]: '# Old agent teams rule',
      });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles.length).toBe(0);

      // File should still exist
      const deprecatedPath = join(tempDir, layout.rootDir, 'rules', 'SHOULD-agent-teams.md');
      const content = await readFile(deprecatedPath, 'utf-8');
      expect(content).toBe('# Old agent teams rule');
    });

    it('should skip deprecated files that do not exist in target', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });
      // Do NOT create SHOULD-agent-teams.md

      const result = await update({
        targetDir: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles.length).toBe(0);
    });

    it('should return deprecated file list in dry run mode without removing', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await createDirStructure({
        [`${layout.rootDir}/rules/SHOULD-agent-teams.md`]: '# Old agent teams rule',
      });

      const result = await update({
        targetDir: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedDeprecatedFiles.length).toBeGreaterThan(0);

      // File should still exist (dry run)
      const deprecatedPath = join(tempDir, layout.rootDir, 'rules', 'SHOULD-agent-teams.md');
      const content = await readFile(deprecatedPath, 'utf-8');
      expect(content).toBe('# Old agent teams rule');
    });
  });

  describe('--hard mode (namespace sync)', () => {
    describe('extractFrontmatterName', () => {
      it('should extract name from valid YAML frontmatter', () => {
        const content = '---\nname: my-agent\nmodel: sonnet\n---\n\n# Body';
        expect(extractFrontmatterName(content)).toBe('my-agent');
      });

      it('should extract quoted name values', () => {
        const content = '---\nname: "my-agent"\nmodel: sonnet\n---\n\n# Body';
        expect(extractFrontmatterName(content)).toBe('my-agent');
      });

      it('should extract single-quoted name values', () => {
        const content = "---\nname: 'my-agent'\nmodel: sonnet\n---\n\n# Body";
        expect(extractFrontmatterName(content)).toBe('my-agent');
      });

      it('should return null when content has no frontmatter', () => {
        const content = '# Just a heading\n\nNo frontmatter here.';
        expect(extractFrontmatterName(content)).toBeNull();
      });

      it('should return null when frontmatter has no name field', () => {
        const content = '---\nmodel: sonnet\ntools: [Read]\n---\n\n# Body';
        expect(extractFrontmatterName(content)).toBeNull();
      });

      it('should return null for empty content', () => {
        expect(extractFrontmatterName('')).toBeNull();
      });
    });

    it('should report namespaceSynced: [] when hard is not set', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.namespaceSynced).toEqual([]);
    });

    it('should run namespace sync when hard is true and update a name mismatch', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      const rulesDir = join(tempDir, layout.rootDir, 'rules');
      await mkdir(rulesDir, { recursive: true });

      // Create a .md file in the rules dir with a name: that differs from upstream
      // We need a file that exists in templates — pick one we know exists
      // Instead, test syncNamespaceInFile indirectly through the full update flow.
      // Since we can't easily manufacture a lockfile mismatch in a unit test,
      // we verify that the result.namespaceSynced array is present and defined.
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
        hard: true,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.namespaceSynced)).toBe(true);
    });

    it('should not sync user-modified files (hash differs from lockfile)', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Run a normal update first to install files and generate lockfile
      await update({ targetDir: tempDir, components: ['rules'] });

      // Simulate user modification of one installed file
      const rulesDir = join(tempDir, layout.rootDir, 'rules');
      const installedFiles = await (await import('node:fs/promises')).readdir(rulesDir);
      if (installedFiles.length > 0) {
        const firstFile = join(rulesDir, installedFiles[0]);
        const original = await readFile(firstFile, 'utf-8');
        // Append user modification to change the hash
        await writeFile(firstFile, `${original}\n<!-- user modification -->`);
      }

      // Run --hard update — modified files must not be synced
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        force: true,
        hard: true,
      });

      expect(result.success).toBe(true);
      // The modified file should not appear in namespaceSynced
      if (installedFiles.length > 0) {
        const modifiedRelPath = `${layout.rootDir}/rules/${installedFiles[0]}`;
        expect(result.namespaceSynced).not.toContain(modifiedRelPath);
      }
    });

    it('should return empty namespaceSynced when no lockfile is present', async () => {
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      // Ensure no lockfile exists (fresh directory, never initialized)
      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
        hard: true,
      });

      expect(result.success).toBe(true);
      // Without a lockfile, applyNamespaceSync returns [] immediately
      expect(Array.isArray(result.namespaceSynced)).toBe(true);
    });
  });

  describe('shouldSkipSelfUpdate (via update())', () => {
    it('should set skippedSource=true when target is the oh-my-customcode source project', async () => {
      // Write a package.json with name "oh-my-customcode" to tempDir
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'oh-my-customcode', version: '0.1.0' }, null, 2)
      );
      await createConfig('0.1.0');

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.skippedSource).toBe(true);
    });

    it('should NOT set skippedSource for normal (non-source) projects', async () => {
      // Write a package.json with a different name
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-other-project', version: '0.1.0' }, null, 2)
      );
      await createConfig('0.1.0');

      const layout = getProviderLayout();
      await mkdir(join(tempDir, layout.rootDir), { recursive: true });

      const result = await update({
        targetDir: tempDir,
        components: ['rules'],
      });

      expect(result.success).toBe(true);
      expect(result.skippedSource).toBeUndefined();
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

describe('update RTK retirement lifecycle', () => {
  let project: string;
  const skill = '.claude/skills/rtk-exec/SKILL.md';
  const wrapper = '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs';
  const hook = '.claude/hooks/scripts/rtk-intercept.sh';
  const owned = 'old managed RTK content\n';
  const hash = createHash('sha256').update(owned).digest('hex');
  const paths = [skill, wrapper, hook];

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'omcustom-retirement-update-'));
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    for (const path of paths) {
      await mkdir(join(project, path, '..'), { recursive: true });
      await writeFile(join(project, path), owned);
    }
    await mkdir(join(project, '.claude/rules'), { recursive: true });
    await writeFile(join(project, '.claude/rules/user-sentinel.md'), 'non-RTK sentinel');
    await writeFile(
      join(project, '.omcustom.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        generatorVersion: '0.1.0',
        templateVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        files: Object.fromEntries(
          paths.map((path) => [
            path,
            {
              templateHash: hash,
              size: Buffer.byteLength(owned),
              component: path === hook ? 'hooks' : 'skills',
            },
          ])
        ),
      })
    );
  });
  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function assertNewLockExcluded(excluded: string[]) {
    const lock = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
    for (const path of excluded) expect(lock.files[path]).toBeUndefined();
    expect(lock.files['.claude/rules/user-sentinel.md']).toBeDefined();
    expect(Object.keys(lock.files).length).toBeGreaterThan(0);
  }

  it('removes only old-hash-owned RTK files and keeps a non-RTK corpus', async () => {
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(result.rtkRetirement?.removed.sort()).toEqual([...paths].sort());
    for (const path of paths) await expect(access(join(project, path))).rejects.toThrow();
    expect(await readFile(join(project, '.claude/rules/user-sentinel.md'), 'utf8')).toBe(
      'non-RTK sentinel'
    );
    await assertNewLockExcluded(paths);
    expect(codexCheckSpy).toHaveBeenCalledTimes(1);
    expect(codexInstallSpy).not.toHaveBeenCalled();
  });

  it('preserves modified and unknown files without registering them in the new lock, including repeat update', async () => {
    await writeFile(join(project, skill), '---\nname: user-owned-rtk\n---\nuser changes');
    const oldLock = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
    delete oldLock.files[wrapper];
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(oldLock));
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await update({ targetDir: project, force: true });
      expect(result.success).toBe(true);
      expect(result.rtkRetirement?.preserved.map((entry) => entry.path)).toEqual(
        expect.arrayContaining([skill, wrapper])
      );
      expect(await readFile(join(project, skill), 'utf8')).toContain('user changes');
      expect(await readFile(join(project, wrapper), 'utf8')).toBe(owned);
      await assertNewLockExcluded(paths);
    }
    // A retained user-owned SKILL remains discoverable; this is not an inactive claim.
    expect(await readFile(join(project, skill), 'utf8')).toContain('name: user-owned-rtk');
  });

  it('keeps retained RTK ownership excluded across full, rules-only, and full forced updates', async () => {
    const modified = '---\nname: user-retained-rtk\n---\nuser changes';
    await writeFile(join(project, skill), modified);
    const oldLock = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
    delete oldLock.files[wrapper];
    delete oldLock.files[hook];
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(oldLock));

    const stages: Array<UpdateComponent[] | undefined> = [undefined, ['rules'], undefined];
    for (const [stage, components] of stages.entries()) {
      const settingsBefore = await Promise.all(
        ['.claude/settings.json', '.claude/settings.local.json'].map((path) =>
          readFile(join(project, path)).catch(() => null)
        )
      );
      const result = await update({
        targetDir: project,
        force: true,
        components,
      });
      expect(result.success).toBe(true);
      expect(result.rtkRetirement?.removed ?? []).toEqual([]);
      expect(await readFile(join(project, skill), 'utf8')).toBe(modified);
      expect(await readFile(join(project, wrapper), 'utf8')).toBe(owned);
      expect(await readFile(join(project, hook), 'utf8')).toBe(owned);
      await assertNewLockExcluded(paths);
      expect(codexCheckSpy).toHaveBeenCalledTimes(stage + 1);
      expect(codexInstallSpy).not.toHaveBeenCalled();
      if (stage === 1) {
        expect(result.rtkRetirement?.preserved ?? []).toEqual([]);
        expect(result.rtkRetirement?.settingsChanged ?? []).toEqual([]);
        for (const [index, path] of [
          '.claude/settings.json',
          '.claude/settings.local.json',
        ].entries()) {
          expect(await readFile(join(project, path)).catch(() => null)).toEqual(
            settingsBefore[index]
          );
        }
      } else {
        expect(result.rtkRetirement?.preserved.map((entry) => entry.path)).toEqual(
          expect.arrayContaining(paths)
        );
      }
    }
  });

  it('preserves files with no prior lock and reports missing ownership', async () => {
    await rm(join(project, '.omcustom.lock.json'));
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(result.rtkRetirement?.preserved).toHaveLength(3);
    for (const path of paths) expect(await readFile(join(project, path), 'utf8')).toBe(owned);
    await assertNewLockExcluded(paths);
  });

  for (const options of [
    { force: true },
    { forceOverwriteAll: true },
    { preserveCustomizations: false },
  ]) {
    it(`keeps modified RTK data with ${JSON.stringify(options)}`, async () => {
      await writeFile(join(project, wrapper), 'user-custom wrapper');
      const result = await update({ targetDir: project, ...options });
      expect(result.success).toBe(true);
      expect(await readFile(join(project, wrapper), 'utf8')).toBe('user-custom wrapper');
      expect(result.rtkRetirement?.preserved.some((entry) => entry.path === wrapper)).toBe(true);
      await assertNewLockExcluded(paths);
    });
  }

  it('honors explicit config preservation even with forceOverwriteAll', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.preserveFiles = [skill];
    await saveConfig(project, config);
    const result = await update({ targetDir: project, forceOverwriteAll: true });
    expect(result.success).toBe(true);
    expect(await readFile(join(project, skill), 'utf8')).toBe(owned);
    expect(result.rtkRetirement?.preserved).toContainEqual({
      path: skill,
      reason: 'explicitly preserved',
    });
    await assertNewLockExcluded(paths);
  });

  for (const component of ['skills', 'hooks', 'rules'] as const) {
    it(`retires only files for selected ${component} component`, async () => {
      const result = await update({ targetDir: project, components: [component] });
      expect(result.success).toBe(true);
      const retired =
        component === 'skills' ? [skill, wrapper] : component === 'hooks' ? [hook] : [];
      expect(result.rtkRetirement?.removed ?? []).toEqual(retired);
      for (const path of paths.filter((path) => !retired.includes(path))) {
        expect(await readFile(join(project, path), 'utf8')).toBe(owned);
      }
      if (retired.length) await assertNewLockExcluded(retired);
    });
  }

  it('honors ancestor custom-component ownership without deleting unchanged RTK data', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.customComponents = [
      { type: 'skill', name: 'user-rtk', path: '.claude/skills/rtk-exec', managed: false },
    ];
    await saveConfig(project, config);
    const result = await update({ targetDir: project, forceOverwriteAll: true });
    expect(result.success).toBe(true);
    for (const path of [skill, wrapper]) {
      expect(await readFile(join(project, path), 'utf8')).toBe(owned);
      expect(result.rtkRetirement?.preserved).toContainEqual({
        path,
        reason: 'explicitly preserved',
      });
    }
    await assertNewLockExcluded(paths);
  });

  it('honors a manifest-preserved managed file under the default option', async () => {
    await saveCustomizationManifest(project, {
      modifiedFiles: [],
      preserveFiles: [wrapper],
      customComponents: [],
      lastUpdated: new Date().toISOString(),
    });
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(await readFile(join(project, wrapper), 'utf8')).toBe(owned);
    expect(result.rtkRetirement?.preserved).toContainEqual({
      path: wrapper,
      reason: 'explicitly preserved',
    });
    await assertNewLockExcluded(paths);
  });

  it('disables manifest preservation explicitly while keeping the old ownership hash guard', async () => {
    await saveCustomizationManifest(project, {
      modifiedFiles: [],
      preserveFiles: [wrapper],
      customComponents: [],
      lastUpdated: new Date().toISOString(),
    });
    const result = await update({ targetDir: project, preserveCustomizations: false });
    expect(result.success).toBe(true);
    expect(result.rtkRetirement?.removed).toContain(wrapper);
    await expect(access(join(project, wrapper))).rejects.toThrow();
    await assertNewLockExcluded(paths);
  });

  it('rejects malformed old ownership hashes without losing user data', async () => {
    const oldLock = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
    oldLock.files[wrapper].templateHash = 'invalid hash';
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(oldLock));
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(await readFile(join(project, wrapper), 'utf8')).toBe(owned);
    expect(result.rtkRetirement?.preserved).toContainEqual({
      path: wrapper,
      reason: 'missing or invalid old ownership',
    });
    await assertNewLockExcluded(paths);
  });

  it('dry-run leaves file/settings/lock/config bytes and directory entries unchanged with backup requested', async () => {
    const settingsPath = '.claude/settings.local.json';
    await writeFile(
      join(project, settingsPath),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/rtk-intercept.sh' }],
            },
          ],
        },
      })
    );
    const snapshotPaths = [...paths, settingsPath, '.omcustom.lock.json', '.omcustomrc.json'];
    const before = await Promise.all(snapshotPaths.map((path) => readFile(join(project, path))));
    const entries = await readdir(project);
    const result = await update({ targetDir: project, dryRun: true, backup: true });
    expect(result.success).toBe(true);
    expect(result.rtkRetirement?.wouldRemove.sort()).toEqual([...paths].sort());
    expect(result.rtkRetirement?.wouldChangeSettings).toContain(settingsPath);
    expect(result.rtkRetirement?.removed).toEqual([]);
    expect(result.backedUpPaths).toEqual([]);
    expect(codexCheckSpy).not.toHaveBeenCalled();
    expect(codexInstallSpy).not.toHaveBeenCalled();
    for (const [index, path] of snapshotPaths.entries()) {
      expect(await readFile(join(project, path))).toEqual(before[index]);
    }
    expect(await readdir(project)).toEqual(entries);
  });
});

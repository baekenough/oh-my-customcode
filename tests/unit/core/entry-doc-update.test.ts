import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { getProviderLayout } from '../../../src/core/layout.js';
import { update } from '../../../src/core/updater.js';
import { fileExists, resolveTemplatePath } from '../../../src/utils/fs.js';

describe('updateEntryDoc via update()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-entry-doc-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createConfig(overrides?: Record<string, unknown>): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    if (overrides) {
      Object.assign(config, overrides);
    }
    await saveConfig(tempDir, config);
  }

  // Test 1: merge mode - existing file with markers
  it('should merge entry doc preserving custom sections', async () => {
    await createConfig();
    const layout = getProviderLayout();

    // Set up directory structure
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    // Check if entry template exists
    const templateName = `${layout.entryFile.replace('.md', '')}.md.en`;
    const templatePath = resolveTemplatePath(templateName);
    const templateExists = await fileExists(templatePath);

    if (!templateExists) {
      // Skip test if no template available (CI environment)
      return;
    }

    // Create existing entry file with custom content + managed section
    const entryPath = join(tempDir, layout.entryFile);
    await writeFile(
      entryPath,
      'My custom intro\n<!-- omcustom:start -->\nOld template content\n<!-- omcustom:end -->\nMy custom outro'
    );

    // Run update without specifying components (triggers updateEntryDoc)
    const result = await update({
      targetDir: tempDir,
      force: false,
    });

    expect(result.success).toBe(true);

    // Verify entry doc was updated
    const content = await readFile(entryPath, 'utf-8');
    // Custom sections should be preserved
    expect(content).toContain('My custom intro');
    expect(content).toContain('My custom outro');
    // Managed section should be replaced with new template
    expect(content).toContain('<!-- omcustom:start -->');
    expect(content).toContain('<!-- omcustom:end -->');
    // Old content should be gone
    expect(content).not.toContain('Old template content');
  });

  // Test 2: force mode - overwrite with backup
  it('should force overwrite entry doc with backup', async () => {
    await createConfig();
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    const templateName = `${layout.entryFile.replace('.md', '')}.md.en`;
    const templatePath = resolveTemplatePath(templateName);
    if (!(await fileExists(templatePath))) {
      return;
    }

    const entryPath = join(tempDir, layout.entryFile);
    await writeFile(entryPath, 'Original content before force update');

    const result = await update({
      targetDir: tempDir,
      force: true,
    });

    expect(result.success).toBe(true);

    // Verify content was overwritten (not merged)
    const content = await readFile(entryPath, 'utf-8');
    expect(content).not.toContain('Original content before force update');
  });

  // Test 3: new file creation - wrap in markers
  it('should create entry doc with markers when it does not exist', async () => {
    await createConfig();
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    const templateName = `${layout.entryFile.replace('.md', '')}.md.en`;
    const templatePath = resolveTemplatePath(templateName);
    if (!(await fileExists(templatePath))) {
      return;
    }

    const entryPath = join(tempDir, layout.entryFile);
    // Don't create entry file - it should be created

    const result = await update({
      targetDir: tempDir,
      force: false,
    });

    expect(result.success).toBe(true);

    // Verify file was created with markers
    expect(await fileExists(entryPath)).toBe(true);
    const content = await readFile(entryPath, 'utf-8');
    expect(content).toContain('<!-- omcustom:start -->');
    expect(content).toContain('<!-- omcustom:end -->');
  });

  // Test 4: dry-run must not modify entry doc
  it('should NOT modify entry doc during dry-run', async () => {
    await createConfig();
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    const templateName = `${layout.entryFile.replace('.md', '')}.md.en`;
    const templatePath = resolveTemplatePath(templateName);
    if (!(await fileExists(templatePath))) {
      return;
    }

    const entryPath = join(tempDir, layout.entryFile);
    const originalContent = 'This content must NOT be modified during dry-run';
    await writeFile(entryPath, originalContent);

    const result = await update({
      targetDir: tempDir,
      force: true,
      dryRun: true,
    });

    expect(result.success).toBe(true);

    // Entry doc must remain unchanged during dry-run
    const content = await readFile(entryPath, 'utf-8');
    expect(content).toBe(originalContent);
  });

  // Test 5: dry-run must not update config version
  it('should NOT update config during dry-run', async () => {
    await createConfig({ version: '0.1.0' });
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    // Capture config content before dry-run
    const configPath = join(tempDir, '.omcustomrc.json');
    const contentBefore = await readFile(configPath, 'utf-8');
    const configBefore = JSON.parse(contentBefore);

    const result = await update({
      targetDir: tempDir,
      force: true,
      dryRun: true,
    });

    expect(result.success).toBe(true);

    // Config version must remain unchanged during dry-run
    const contentAfter = await readFile(configPath, 'utf-8');
    const configAfter = JSON.parse(contentAfter);
    expect(configAfter.version).toBe(configBefore.version);
    expect(configAfter.version).toBe('0.1.0');
  });

  // Test 6: updateEntryDoc not called when specific components requested
  it('should not update entry doc when specific components are requested', async () => {
    await createConfig();
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });

    const entryPath = join(tempDir, layout.entryFile);
    const originalContent = 'This should not change';
    await writeFile(entryPath, originalContent);

    const result = await update({
      targetDir: tempDir,
      components: ['rules'],
    });

    expect(result.success).toBe(true);

    // Entry doc should not be modified when specific components are listed
    const content = await readFile(entryPath, 'utf-8');
    expect(content).toBe(originalContent);
  });
});

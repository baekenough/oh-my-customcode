/**
 * `update` refreshes an already-installed project ontology-rag (#1949) and nothing else:
 * no venv creation, no prompt, nothing on --dry-run, a failure is only a warning.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { checkForUpdates, update } from '../../../src/core/updater.js';
import { fileExists } from '../../../src/utils/fs.js';

describe('update refreshes an installed ontology-rag (#1949)', () => {
  let project: string;
  let calls: string[];
  let failInstall: boolean;
  const spies: Array<{ mockRestore: () => void }> = [];
  let previousSkip: string | undefined;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'omcustom-update-onto-'));
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    await mkdir(join(project, '.claude'), { recursive: true });
    previousSkip = process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP;
    delete process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP;
    calls = [];
    failInstall = false;
    spies.push(
      spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        calls.push(String(cmd));
        if (failInstall && String(cmd).includes('pip install')) throw new Error('uv exploded');
        return Buffer.from('');
      }),
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true)
    );
  });

  afterEach(async () => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    if (previousSkip === undefined) delete process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP;
    else process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP = previousSkip;
    await rm(project, { recursive: true, force: true });
  });

  async function seedVenv(): Promise<void> {
    await mkdir(join(project, '.venv', 'bin'), { recursive: true });
    await writeFile(join(project, '.venv', 'bin', 'python'), '');
    await mkdir(
      join(project, '.venv', 'lib', 'python3.12', 'site-packages', 'ontology_rag-0.3.0.dist-info'),
      { recursive: true }
    );
  }

  const installs = () => calls.filter((c) => c.includes('pip install'));

  it('installed: reinstalls with --reinstall-package', async () => {
    await seedVenv();
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(installs()).toHaveLength(1);
    expect(installs()[0]).toContain('--reinstall-package ontology-rag');
  });

  it('component-filtered update: not called', async () => {
    await seedVenv();
    const result = await update({ targetDir: project, components: ['hooks'] });
    expect(result.success).toBe(true);
    expect(installs()).toEqual([]);
  });

  it('empty components list counts as a full update, like the other post-processing (#1949)', async () => {
    await seedVenv();
    const result = await update({ targetDir: project, components: [] });
    expect(result.success).toBe(true);
    expect(installs()).toHaveLength(1);
  });

  it('up to date: skipped, but --force reaches the refresh', async () => {
    await seedVenv();
    // Record every component at the current template version: nothing left to update
    const pending = await checkForUpdates(project);
    const upToDate = getDefaultConfig();
    upToDate.version = pending.latestVersion;
    upToDate.componentVersions = Object.fromEntries(
      pending.updatableComponents.map((c) => [c.name, pending.latestVersion])
    );
    await saveConfig(project, upToDate);
    calls.length = 0;
    const plain = await update({ targetDir: project });
    expect(plain.skippedComponents.length).toBeGreaterThan(0);
    expect(installs()).toEqual([]);
    const forced = await update({ targetDir: project, force: true });
    expect(forced.success).toBe(true);
    expect(installs()).toHaveLength(1);
  });

  it('not installed: no install call and no venv is created', async () => {
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(installs()).toEqual([]);
    expect(await fileExists(join(project, '.venv'))).toBe(false);
  });

  it('failure: warns and the update still succeeds', async () => {
    await seedVenv();
    failInstall = true;
    const result = await update({ targetDir: project });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.startsWith('ontology-rag was not refreshed:'))).toBe(true);
    expect(result.warnings.join('\n')).toContain('uv exploded');
  });

  it('dry-run: nothing is installed', async () => {
    await seedVenv();
    const result = await update({ targetDir: project, dryRun: true });
    expect(result.success).toBe(true);
    expect(installs()).toEqual([]);
  });
});

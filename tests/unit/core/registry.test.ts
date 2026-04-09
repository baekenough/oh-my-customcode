/**
 * Unit tests for src/core/registry.ts
 *
 * These tests monkey-patch the module-level REGISTRY_PATH constant by
 * re-exporting a patched version. Since the registry module reads the path
 * at call-time via os.homedir(), we redirect homedir() via a temporary
 * HOME env override so the registry file lands in a temp directory.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mkDir(base: string, ...parts: string[]): Promise<string> {
  const dir = join(base, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tempRoot: string;
let originalHome: string | undefined;

/**
 * We redirect HOME so the registry writes to a temp directory
 * instead of the real ~/.oh-my-customcode/.
 */
beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'omcc-registry-test-'));
  originalHome = process.env['HOME'];
  process.env['HOME'] = tempRoot;
});

afterEach(async () => {
  if (originalHome !== undefined) {
    process.env['HOME'] = originalHome;
  } else {
    delete process.env['HOME'];
  }
  await rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readRegistry — empty / missing
// ---------------------------------------------------------------------------

describe('readRegistry()', () => {
  it('returns empty registry when file does not exist', async () => {
    // Import after HOME is set so homedir() picks up the temp dir
    const { readRegistry } = await import('../../../src/core/registry.js');
    const registry = await readRegistry();
    expect(registry.projects).toBeDefined();
    expect(Object.keys(registry.projects).length).toBe(0);
  });

  it('returns empty registry when file contains invalid JSON', async () => {
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(join(registryDir, 'projects.json'), 'not-json', 'utf-8');

    const { readRegistry } = await import('../../../src/core/registry.js');
    const registry = await readRegistry();
    expect(Object.keys(registry.projects).length).toBe(0);
  });

  it('returns empty registry when file has unexpected shape', async () => {
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(join(registryDir, 'projects.json'), JSON.stringify([1, 2, 3]), 'utf-8');

    const { readRegistry } = await import('../../../src/core/registry.js');
    const registry = await readRegistry();
    expect(Object.keys(registry.projects).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// registerProject
// ---------------------------------------------------------------------------

describe('registerProject()', () => {
  it('creates the registry file and adds a project entry', async () => {
    const { registerProject, readRegistry } = await import('../../../src/core/registry.js');
    const projectPath = join(tempRoot, 'my-project');

    await registerProject(projectPath, '0.79.0');

    const registry = await readRegistry();
    expect(registry.projects[projectPath]).toBeDefined();
    expect(registry.projects[projectPath].version).toBe('0.79.0');
    expect(typeof registry.projects[projectPath].installedAt).toBe('string');
    expect(typeof registry.projects[projectPath].updatedAt).toBe('string');
  });

  it('creates .oh-my-customcode directory if it does not exist', async () => {
    const { registerProject } = await import('../../../src/core/registry.js');
    const projectPath = join(tempRoot, 'dir-creation-test');

    await registerProject(projectPath, '0.79.0');

    const registryFile = join(tempRoot, '.oh-my-customcode', 'projects.json');
    const content = await readFile(registryFile, 'utf-8');
    expect(JSON.parse(content)).toBeDefined();
  });

  it('preserves installedAt when updating an existing entry', async () => {
    const { registerProject, readRegistry } = await import('../../../src/core/registry.js');
    const projectPath = join(tempRoot, 'update-project');

    await registerProject(projectPath, '0.78.0');
    const first = await readRegistry();
    const firstInstalledAt = first.projects[projectPath].installedAt;

    // Small delay to ensure updatedAt changes
    await new Promise((r) => setTimeout(r, 5));

    await registerProject(projectPath, '0.79.0');
    const second = await readRegistry();

    expect(second.projects[projectPath].version).toBe('0.79.0');
    expect(second.projects[projectPath].installedAt).toBe(firstInstalledAt);
    expect(second.projects[projectPath].updatedAt).not.toBe(firstInstalledAt);
  });

  it('supports multiple projects in the same registry', async () => {
    const { registerProject, readRegistry } = await import('../../../src/core/registry.js');
    const pathA = join(tempRoot, 'project-a');
    const pathB = join(tempRoot, 'project-b');

    await registerProject(pathA, '0.79.0');
    await registerProject(pathB, '0.78.0');

    const registry = await readRegistry();
    expect(Object.keys(registry.projects).length).toBe(2);
    expect(registry.projects[pathA].version).toBe('0.79.0');
    expect(registry.projects[pathB].version).toBe('0.78.0');
  });
});

// ---------------------------------------------------------------------------
// unregisterProject
// ---------------------------------------------------------------------------

describe('unregisterProject()', () => {
  it('removes an existing project from the registry', async () => {
    const { registerProject, unregisterProject, readRegistry } = await import(
      '../../../src/core/registry.js'
    );
    const projectPath = join(tempRoot, 'to-remove');

    await registerProject(projectPath, '0.79.0');
    await unregisterProject(projectPath);

    const registry = await readRegistry();
    expect(registry.projects[projectPath]).toBeUndefined();
  });

  it('is a no-op when project is not registered', async () => {
    const { unregisterProject, readRegistry } = await import('../../../src/core/registry.js');
    const nonExistent = join(tempRoot, 'not-in-registry');

    // Should not throw
    await expect(unregisterProject(nonExistent)).resolves.toBeUndefined();

    const registry = await readRegistry();
    expect(Object.keys(registry.projects).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// migrateFromLockfiles
// ---------------------------------------------------------------------------

describe('migrateFromLockfiles()', () => {
  it('imports projects with .omcustom.lock.json into the registry', async () => {
    const { migrateFromLockfiles, readRegistry } = await import('../../../src/core/registry.js');

    const projectDir = await mkDir(tempRoot, 'workspace', 'my-project');
    await writeFile(
      join(projectDir, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.75.0', installedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
      'utf-8'
    );

    const imported = await migrateFromLockfiles([join(tempRoot, 'workspace')]);

    expect(imported).toBe(1);
    const registry = await readRegistry();
    expect(registry.projects[projectDir]).toBeDefined();
    expect(registry.projects[projectDir].version).toBe('0.75.0');
    expect(registry.projects[projectDir].installedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not double-import already-registered projects', async () => {
    const { migrateFromLockfiles, registerProject, readRegistry } = await import(
      '../../../src/core/registry.js'
    );

    const projectDir = await mkDir(tempRoot, 'workspace2', 'existing-project');
    await writeFile(
      join(projectDir, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.75.0' }, null, 2),
      'utf-8'
    );

    // Pre-register with a different version
    await registerProject(projectDir, '0.79.0');

    const imported = await migrateFromLockfiles([join(tempRoot, 'workspace2')]);

    // Already registered — should not be re-imported
    expect(imported).toBe(0);
    const registry = await readRegistry();
    // Version remains as-registered (0.79.0), not overwritten by lock file
    expect(registry.projects[projectDir].version).toBe('0.79.0');
  });

  it('returns 0 when no lock files are found', async () => {
    const { migrateFromLockfiles } = await import('../../../src/core/registry.js');
    const emptyDir = await mkDir(tempRoot, 'empty-workspace');

    const imported = await migrateFromLockfiles([emptyDir]);

    expect(imported).toBe(0);
  });

  it('silently ignores non-existent search directories', async () => {
    const { migrateFromLockfiles } = await import('../../../src/core/registry.js');
    const ghostDir = join(tempRoot, 'ghost-dir-that-does-not-exist');

    const imported = await migrateFromLockfiles([ghostDir]);

    expect(imported).toBe(0);
  });

  it('imports multiple projects from nested directories', async () => {
    const { migrateFromLockfiles, readRegistry } = await import('../../../src/core/registry.js');

    const wsDir = await mkDir(tempRoot, 'ws');
    const projectA = await mkDir(wsDir, 'proj-a');
    const projectB = await mkDir(wsDir, 'proj-b');

    await writeFile(
      join(projectA, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.70.0' }, null, 2),
      'utf-8'
    );
    await writeFile(
      join(projectB, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.71.0' }, null, 2),
      'utf-8'
    );

    const imported = await migrateFromLockfiles([wsDir]);

    expect(imported).toBe(2);
    const registry = await readRegistry();
    expect(registry.projects[projectA]).toBeDefined();
    expect(registry.projects[projectB]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// registryToList
// ---------------------------------------------------------------------------

describe('registryToList()', () => {
  it('converts a registry into a flat list with correct fields', async () => {
    const { registerProject, readRegistry, registryToList } = await import(
      '../../../src/core/registry.js'
    );

    const projectPath = join(tempRoot, 'list-project');
    await registerProject(projectPath, '0.79.0');

    const registry = await readRegistry();
    const list = registryToList(registry);

    expect(list.length).toBe(1);
    expect(list[0].path).toBe(projectPath);
    expect(list[0].name).toBe('list-project');
    expect(list[0].version).toBe('0.79.0');
    expect(typeof list[0].installedAt).toBe('string');
    expect(typeof list[0].updatedAt).toBe('string');
  });

  it('returns empty array for empty registry', async () => {
    const { registryToList } = await import('../../../src/core/registry.js');
    const list = registryToList({ projects: {} });
    expect(list).toEqual([]);
  });
});

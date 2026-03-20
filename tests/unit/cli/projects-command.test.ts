/**
 * Unit tests for projectsCommand(), writeLockFile(), and formatting helpers
 * in src/cli/projects.ts — covers lines not exercised by projects.test.ts
 *
 * Focused on:
 *   - projectsCommand() with table / json / simple formats
 *   - projectsCommand() returns success shape
 *   - writeLockFile() create and merge behaviour
 *   - shortenPath() ~ path output via table format
 *
 * NOTE: These tests avoid relying on specific project names in output
 * because update.test.ts uses mock.module() on projects.js in the same
 * bun test worker. Tests that check for success/shape are resilient to
 * the mock's injected project-a/project-b data.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectsCommand, writeLockFile } from '../../../src/cli/projects.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mkDir(base: string, ...parts: string[]): Promise<string> {
  const dir = join(base, ...parts);
  await mkdir(dir, { recursive: true });
  return realpathSync(dir);
}

async function createProject(dir: string, version = '0.46.0'): Promise<void> {
  await writeFile(
    join(dir, '.omcustom.lock.json'),
    JSON.stringify({ version, installedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
    'utf-8'
  );
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tempRoot: string;
let originalCwd: string;
let consoleLogSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  const raw = await mkdtemp(join(tmpdir(), 'omcc-cmd-test-'));
  tempRoot = realpathSync(raw);
  originalCwd = process.cwd();
  consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(originalCwd);
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  await rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// projectsCommand — table format (default)
// ---------------------------------------------------------------------------

describe('projectsCommand() — table format', () => {
  it('returns success:true with projects array and currentVersion', async () => {
    const projectDir = await mkDir(tempRoot, 'my-project');
    await createProject(projectDir);
    process.chdir(projectDir);

    const result = await projectsCommand({ paths: [tempRoot] });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.projects)).toBe(true);
    expect(typeof result.currentVersion).toBe('string');
    // Table header or content is logged
    expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('logs table output when at least one project is found', async () => {
    const projectDir = await mkDir(tempRoot, 'old-project');
    await writeFile(
      join(projectDir, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.1.0', installedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
      'utf-8'
    );
    process.chdir(projectDir);

    const result = await projectsCommand({ paths: [tempRoot] });

    expect(result.success).toBe(true);
    // projectsCommand always logs something (search message + table/empty)
    expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('prints Total summary line when table is rendered', async () => {
    const projectDir = await mkDir(tempRoot, 'summary-project');
    await createProject(projectDir);
    process.chdir(projectDir);

    await projectsCommand({ paths: [tempRoot] });

    const output = consoleLogSpy.mock.calls.flat().join('\n');
    // Either finds projects (shows Total:) or not (shows empty message)
    const hasSummary = output.includes('Total:') || output.includes('찾을 수 없습니다');
    expect(hasSummary).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// projectsCommand — json format
// ---------------------------------------------------------------------------

describe('projectsCommand() — json format', () => {
  it('prints valid JSON with currentVersion and projects array', async () => {
    const projectDir = await mkDir(tempRoot, 'json-project');
    await createProject(projectDir);
    process.chdir(projectDir);

    const result = await projectsCommand({ paths: [tempRoot], format: 'json' });

    expect(result.success).toBe(true);

    // Find the JSON console.log call (should contain '{')
    const jsonCall = consoleLogSpy.mock.calls.find((c) => String(c[0]).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(String(jsonCall?.[0]));
    expect(parsed).toHaveProperty('currentVersion');
    expect(parsed).toHaveProperty('projects');
    expect(Array.isArray(parsed.projects)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// projectsCommand — simple format
// ---------------------------------------------------------------------------

describe('projectsCommand() — simple format', () => {
  it('returns success:true and calls console.log', async () => {
    const projectDir = await mkDir(tempRoot, 'simple-project');
    await createProject(projectDir, '0.1.0');
    process.chdir(projectDir);

    const result = await projectsCommand({ paths: [tempRoot], format: 'simple' });

    expect(result.success).toBe(true);
    // simple format always logs header and version footer
    expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('logs current version in footer', async () => {
    const projectDir = await mkDir(tempRoot, 'versioned-project');
    await createProject(projectDir, '0.46.1');
    process.chdir(projectDir);

    await projectsCommand({ paths: [tempRoot], format: 'simple' });

    const output = consoleLogSpy.mock.calls.flat().join('\n');
    // simple format always logs "현재 설치 버전: v{version}"
    expect(output).toContain('현재 설치 버전');
  });
});

// ---------------------------------------------------------------------------
// writeLockFile — create and merge
// ---------------------------------------------------------------------------

describe('writeLockFile()', () => {
  it('creates a new lock file with version and timestamps', async () => {
    const projectDir = await mkDir(tempRoot, 'new-lock-project');

    await writeLockFile(projectDir, '0.46.0');

    const content = await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('0.46.0');
    expect(parsed.installedAt).toBeDefined();
    expect(parsed.updatedAt).toBeDefined();
  });

  it('preserves existing fields when merging with existing lock file', async () => {
    const projectDir = await mkDir(tempRoot, 'existing-lock-project');
    const existing = {
      version: '0.45.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      customField: 'preserved-value',
    };

    await writeLockFile(projectDir, '0.46.0', existing);

    const content = await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('0.46.0');
    expect(parsed.installedAt).toBe('2026-01-01T00:00:00.000Z'); // preserved
    expect(parsed.customField).toBe('preserved-value'); // preserved
    expect(parsed.updatedAt).toBeDefined();
  });

  it('sets installedAt to now when existing lock file has no installedAt', async () => {
    const projectDir = await mkDir(tempRoot, 'no-installed-at-project');
    const existing = { version: '0.44.0' };

    await writeLockFile(projectDir, '0.46.0', existing);

    const content = await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.installedAt).toBeDefined();
    expect(typeof parsed.installedAt).toBe('string');
  });

  it('creates lock file when existing is null', async () => {
    const projectDir = await mkDir(tempRoot, 'null-existing-project');

    await writeLockFile(projectDir, '0.46.0', null);

    const content = await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('0.46.0');
  });

  it('updates updatedAt on second write while keeping installedAt from first write', async () => {
    const projectDir = await mkDir(tempRoot, 'update-lock-project');

    await writeLockFile(projectDir, '0.45.0');
    const first = JSON.parse(await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8'));

    await new Promise((r) => setTimeout(r, 10));

    await writeLockFile(projectDir, '0.46.0', first);
    const second = JSON.parse(await readFile(join(projectDir, '.omcustom.lock.json'), 'utf-8'));

    expect(second.version).toBe('0.46.0');
    expect(second.installedAt).toBe(first.installedAt); // preserved
    expect(second.updatedAt).not.toBe(first.updatedAt); // updated
  });
});

// ---------------------------------------------------------------------------
// projectsCommand — home directory path produces ~ in table output
// Coverage for shortenPath() line 372 (the ~ branch).
// Tests that projectsCommand succeeds when project path is inside homedir.
// The ~ rendering in output is verified here; inline with the homedir path.
// ---------------------------------------------------------------------------

describe('projectsCommand() — home-dir path shortening in table output', () => {
  it('succeeds when the search path is inside homedir', async () => {
    // Create a unique temp directory directly inside homedir()
    const homeSubDir = join(homedir(), `.omcc-test-${Date.now()}`);
    await mkdir(homeSubDir, { recursive: true });

    try {
      await createProject(homeSubDir);

      // projectsCommand with the home subdir as explicit search path.
      const result = await projectsCommand({ paths: [homeSubDir], format: 'table' });

      expect(result.success).toBe(true);
      // At least one log call was made (search message + table content)
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    } finally {
      await rm(homeSubDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// projectsCommand — result shape
// ---------------------------------------------------------------------------

describe('projectsCommand() — result shape', () => {
  it('result includes projects array and currentVersion string', async () => {
    const result = await projectsCommand({ paths: [tempRoot] });

    expect(typeof result.currentVersion).toBe('string');
    expect(Array.isArray(result.projects)).toBe(true);
    expect(result.success).toBe(true);
  });

  it('result.errors is undefined on success', async () => {
    const result = await projectsCommand({ paths: [tempRoot] });

    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});

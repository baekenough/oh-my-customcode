/**
 * Isolated test for getTemplateVersion() packageJson fallback (Line 127 in projects.ts).
 *
 * This test is in a SEPARATE file because it uses mock.module() to patch fs.js,
 * which in Bun leaks globally across test files. Isolating it prevents mock
 * pollution from breaking unrelated tests (list.test.ts, snapshot.test.ts, etc.).
 *
 * mock.restore() in Bun only restores spyOn-based mocks — not mock.module() patches.
 * Placing this test in its own file ensures the mock never escapes to other test files.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectsCommand } from '../../../src/cli/projects.js';
import { _setRegistryDirForTesting } from '../../../src/core/registry.js';

let tempRoot: string;
let originalCwd: string;

beforeEach(async () => {
  const raw = await mkdtemp(join(tmpdir(), 'omcc-tmplver-test-'));
  tempRoot = realpathSync(raw);
  originalCwd = process.cwd();

  const registryDir = join(tempRoot, '.oh-my-customcode');
  await mkdir(registryDir, { recursive: true });
  await writeFile(
    join(registryDir, 'projects.json'),
    JSON.stringify({ projects: {} }, null, 2),
    'utf-8'
  );
  _setRegistryDirForTesting(registryDir);
});

afterEach(async () => {
  mock.restore();
  _setRegistryDirForTesting(undefined);
  process.chdir(originalCwd);
  await rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getTemplateVersion fallback — Line 127
// When manifest.json does not exist, falls back to packageJson.version
// ---------------------------------------------------------------------------

describe('getTemplateVersion() — packageJson fallback (Line 127)', () => {
  it('uses packageJson.version as fallback when manifest is unavailable', async () => {
    // Mock fileExists to return false for all paths, forcing the packageJson fallback.
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const packageVersion: string = (
      currentPkg as unknown as { default: { version: string } }
    ).default.version;

    mock.module('../../../src/utils/fs.js', () => ({
      fileExists: async (_path: string) => false,
      readJsonFile: async (_path: string) => ({}),
      resolveTemplatePath: (_rel: string) => '/nonexistent/manifest.json',
    }));

    // projectsCommand calls getTemplateVersion internally; when fileExists returns false,
    // line 127 (return packageJson.version) executes.
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({ projects: {} }, null, 2),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    try {
      const result = await projectsCommand({ paths: [tempRoot], format: 'json' });
      // When the fallback fires, currentVersion equals the packageJson version
      expect(result.currentVersion).toBe(packageVersion);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

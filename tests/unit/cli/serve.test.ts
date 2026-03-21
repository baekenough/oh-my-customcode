/**
 * Unit tests for serve.ts — background server lifecycle management
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PORT,
  findServeBuildDir,
  isServeRunning,
  startServeBackground,
  stopServe,
} from '../../../src/cli/serve.js';

// The PID file path is computed at module load time using HOME.
// Tests that require PID file control must write to / clean up the real location.
const PID_FILE = join(homedir(), '.omcustom-serve.pid');

async function removePidFile(): Promise<void> {
  try {
    await unlink(PID_FILE);
  } catch {
    // Ignore — file may not exist
  }
}

describe('serve.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(homedir(), 'omcustom-serve-test-'));
    // Ensure no stale PID file before each test
    await removePidFile();
  });

  afterEach(async () => {
    await removePidFile();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('DEFAULT_PORT', () => {
    it('should export 4321 as the default port', () => {
      expect(DEFAULT_PORT).toBe(4321);
    });
  });

  describe('findServeBuildDir', () => {
    it('should return null when build directory does not exist', () => {
      const result = findServeBuildDir(tempDir, { skipNpmFallback: true });
      expect(result).toBeNull();
    });

    it('should return monorepo local build path when packages/serve/build/index.js exists', async () => {
      const buildDir = join(tempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), '// build output');

      const result = findServeBuildDir(tempDir);

      expect(result).toBe(buildDir);
    });

    it('should prefer monorepo local build over npm package build', async () => {
      const localBuildDir = join(tempDir, 'packages', 'serve', 'build');
      await mkdir(localBuildDir, { recursive: true });
      await writeFile(join(localBuildDir, 'index.js'), '// local build');

      const result = findServeBuildDir(tempDir);

      expect(result).toBe(localBuildDir);
    });

    it('should return null when build directory exists but index.js is missing', async () => {
      const buildDir = join(tempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      // No index.js created

      const result = findServeBuildDir(tempDir, { skipNpmFallback: true });

      expect(result).toBeNull();
    });

    it('should return npm package build path when local build is absent and npm build exists', async () => {
      // serve.ts is loaded from src/cli/serve.ts in the test environment.
      // Its import.meta.dirname resolves to {project_root}/src/cli.
      // The npm fallback path is: src/cli/../../packages/serve/build
      //                          = {project_root}/packages/serve/build
      const serveModuleDir = join(import.meta.dirname, '..', '..', '..', 'src', 'cli');
      const npmBuildPath = join(serveModuleDir, '..', '..', 'packages', 'serve', 'build');
      const npmIndexJs = join(npmBuildPath, 'index.js');

      const dirExistedBefore = existsSync(npmBuildPath);
      const indexExistedBefore = existsSync(npmIndexJs);

      if (!dirExistedBefore) {
        await mkdir(npmBuildPath, { recursive: true });
      }
      if (!indexExistedBefore) {
        await writeFile(npmIndexJs, '// mock npm build for test');
      }

      try {
        // tempDir has no local packages/serve/build — npm fallback should trigger
        const result = findServeBuildDir(tempDir);
        expect(result).toBe(npmBuildPath);
      } finally {
        if (!indexExistedBefore) {
          await rm(npmIndexJs, { force: true });
        }
        if (!dirExistedBefore) {
          await rm(npmBuildPath, { recursive: true, force: true });
        }
      }
    });
  });

  describe('isServeRunning', () => {
    it('should return false when PID file does not exist', async () => {
      // afterEach/beforeEach ensure the PID file is absent
      const result = await isServeRunning();
      expect(result).toBe(false);
    });

    it('should return false and clean up PID file with invalid (non-numeric) content', async () => {
      await writeFile(PID_FILE, 'not-a-number', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      // PID file should be cleaned up
      const pidFileExists = await Bun.file(PID_FILE).exists();
      expect(pidFileExists).toBe(false);
    });

    it('should return false and clean up PID file with zero PID', async () => {
      await writeFile(PID_FILE, '0', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      const pidFileExists = await Bun.file(PID_FILE).exists();
      expect(pidFileExists).toBe(false);
    });

    it('should return false for a PID that does not correspond to a running process', async () => {
      // PID 999999999 almost certainly does not exist
      await writeFile(PID_FILE, '999999999', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
    });

    it('should return true for a PID that exists (the current process)', async () => {
      // Use the current process PID — we know it exists
      await writeFile(PID_FILE, String(process.pid), 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(true);
    });
  });

  describe('stopServe', () => {
    it('should return false when no PID file exists', async () => {
      const result = await stopServe();
      expect(result).toBe(false);
    });

    it('should return false when PID file contains invalid content', async () => {
      await writeFile(PID_FILE, 'bad-pid', 'utf-8');

      const result = await stopServe();

      expect(result).toBe(false);
    });

    it('should return false when PID does not correspond to a running process', async () => {
      await writeFile(PID_FILE, '999999999', 'utf-8');

      // process.kill throws ESRCH when the PID doesn't exist → catch → return false
      const result = await stopServe();

      expect(result).toBe(false);
    });
  });

  describe('startServeBackground', () => {
    it('should silently skip when build directory is not found', async () => {
      // No build dir exists — should resolve without throwing.
      // skipNpmFallback prevents the npm fallback path from finding the real
      // build and spawning an orphan detached server process.
      await expect(
        startServeBackground(tempDir, undefined, { skipNpmFallback: true })
      ).resolves.toBeUndefined();
    });

    it('should silently skip when server is already running (PID file points to this process)', async () => {
      // Fake a running server by writing current process PID
      await writeFile(PID_FILE, String(process.pid), 'utf-8');

      // Should return without spawning a new process.
      // skipNpmFallback prevents the npm fallback from finding the real build
      // in case the isServeRunning check does not short-circuit first.
      await expect(
        startServeBackground(tempDir, undefined, { skipNpmFallback: true })
      ).resolves.toBeUndefined();
    });
  });
});

/**
 * Unit tests for serve.ts — background server lifecycle management
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import * as childProcess from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PORT,
  findServeBuildDir,
  isServeRunning,
  resolveServePidFile,
  ServePidFileError,
  startServeBackground,
  stopServe,
} from '../../../src/cli/serve.js';

const PID_FILE_NAME = '.omcustom-serve.pid';

/** root bypasses permission bits, so tests that rely on them cannot fail as intended. */
const RUNNING_AS_ROOT = process.getuid?.() === 0;

describe('serve.ts', () => {
  let tempDir: string;
  // The PID file is resolved from process.env.HOME on every call, so each test
  // points HOME at its own temp directory and never touches the real home.
  let fakeHome: string;
  let pidFile: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-serve-test-'));
    fakeHome = await mkdtemp(join(tmpdir(), 'omcustom-serve-home-'));
    pidFile = join(fakeHome, PID_FILE_NAME);
    originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(tempDir, { recursive: true, force: true });
    await rm(fakeHome, { recursive: true, force: true });
  });

  /**
   * Run `fn` with the cwd set to a fresh temp directory and HOME set to the
   * RELATIVE path `rel-home` (so a relative-home PID file would land inside
   * that temp directory, never in the real cwd). Returns the would-be PID file.
   */
  async function withRelativeHome(fn: (relativePidFile: string) => Promise<void>): Promise<void> {
    const cwdDir = await mkdtemp(join(tmpdir(), 'omcustom-serve-relhome-'));
    const originalCwd = process.cwd();
    process.chdir(cwdDir);
    process.env.HOME = 'rel-home';
    try {
      await mkdir(join(cwdDir, 'rel-home'), { recursive: true });
      await fn(join(cwdDir, 'rel-home', PID_FILE_NAME));
    } finally {
      process.chdir(originalCwd);
      await rm(cwdDir, { recursive: true, force: true });
    }
  }

  describe('resolveServePidFile', () => {
    it('should place the PID file directly under HOME', () => {
      expect(resolveServePidFile()).toBe(pidFile);
    });

    it('should re-read HOME on every call (never memoised)', async () => {
      const otherHome = await mkdtemp(join(tmpdir(), 'omcustom-serve-home2-'));
      try {
        expect(resolveServePidFile()).toBe(pidFile);
        process.env.HOME = otherHome;
        expect(resolveServePidFile()).toBe(join(otherHome, PID_FILE_NAME));
      } finally {
        await rm(otherHome, { recursive: true, force: true });
      }
    });

    it('should skip an empty HOME and use the next home source (no cwd-relative path)', () => {
      const result = resolveServePidFile({ envHome: () => '', osHome: () => fakeHome });
      expect(result).toBe(pidFile);
    });

    it('should return null when no home source yields a value', () => {
      const result = resolveServePidFile({
        envHome: () => '',
        osHome: () => '',
        passwdHome: () => '',
      });
      expect(result).toBeNull();
    });

    it('should return null when the resolved home is a relative path', () => {
      process.env.HOME = 'rel-home';
      expect(resolveServePidFile()).toBeNull();
    });
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
      // beforeEach gives each test a fresh, empty HOME
      const result = await isServeRunning();
      expect(result).toBe(false);
    });

    it('should return false and clean up PID file with invalid (non-numeric) content', async () => {
      await writeFile(pidFile, 'not-a-number', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      // PID file should be cleaned up
      const pidFileExists = await Bun.file(pidFile).exists();
      expect(pidFileExists).toBe(false);
    });

    it('should return false and clean up PID file with zero PID', async () => {
      await writeFile(pidFile, '0', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      const pidFileExists = await Bun.file(pidFile).exists();
      expect(pidFileExists).toBe(false);
    });

    it('should return false for a PID that does not correspond to a running process', async () => {
      // PID 999999999 almost certainly does not exist
      await writeFile(pidFile, '999999999', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
    });

    it('should return true for a PID that exists (the current process)', async () => {
      // Use the current process PID — we know it exists
      await writeFile(pidFile, String(process.pid), 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(true);
    });

    it('should read the PID file from the HOME current at call time', async () => {
      const otherHome = await mkdtemp(join(tmpdir(), 'omcustom-serve-home2-'));
      try {
        await writeFile(join(otherHome, PID_FILE_NAME), String(process.pid), 'utf-8');
        expect(await isServeRunning()).toBe(false);
        process.env.HOME = otherHome;
        expect(await isServeRunning()).toBe(true);
      } finally {
        await rm(otherHome, { recursive: true, force: true });
      }
    });

    it('should return false and leave a cwd-relative PID file alone when HOME is relative', async () => {
      await withRelativeHome(async (relativePidFile) => {
        await writeFile(relativePidFile, String(process.pid), 'utf-8');

        expect(await isServeRunning()).toBe(false);
        expect(existsSync(relativePidFile)).toBe(true);
      });
    });
  });

  describe('stopServe', () => {
    it('should return false when no PID file exists', async () => {
      const result = await stopServe();
      expect(result).toBe(false);
    });

    it('should return false when PID file contains invalid content', async () => {
      await writeFile(pidFile, 'bad-pid', 'utf-8');

      const result = await stopServe();

      expect(result).toBe(false);
    });

    it('should return false when PID does not correspond to a running process', async () => {
      await writeFile(pidFile, '999999999', 'utf-8');

      // process.kill throws ESRCH when the PID doesn't exist → catch → return false
      const result = await stopServe();

      expect(result).toBe(false);
    });

    it('should signal the recorded PID and remove the PID file under HOME', async () => {
      const killSpy = spyOn(process, 'kill').mockImplementation(() => true);
      try {
        await writeFile(pidFile, '424242', 'utf-8');

        expect(await stopServe()).toBe(true);
        expect(killSpy).toHaveBeenCalledWith(424242, 'SIGTERM');
        expect(existsSync(pidFile)).toBe(false);
      } finally {
        killSpy.mockRestore();
      }
    });

    it('should not signal anything when HOME is relative', async () => {
      const killSpy = spyOn(process, 'kill').mockImplementation(() => true);
      try {
        await withRelativeHome(async (relativePidFile) => {
          await writeFile(relativePidFile, '424242', 'utf-8');

          expect(await stopServe()).toBe(false);
          expect(killSpy).not.toHaveBeenCalled();
          expect(existsSync(relativePidFile)).toBe(true);
        });
      } finally {
        killSpy.mockRestore();
      }
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
      await writeFile(pidFile, String(process.pid), 'utf-8');

      // Should return without spawning a new process.
      // skipNpmFallback prevents the npm fallback from finding the real build
      // in case the isServeRunning check does not short-circuit first.
      await expect(
        startServeBackground(tempDir, undefined, { skipNpmFallback: true })
      ).resolves.toBeUndefined();
    });

    /** Create a build whose index.js exits immediately (a harmless detached child). */
    async function createExitingBuild(): Promise<void> {
      const buildDir = join(tempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);\n', 'utf-8');
    }

    it('should record the spawned PID in the PID file under HOME', async () => {
      await createExitingBuild();

      await startServeBackground(tempDir, undefined, { skipNpmFallback: true });

      const recorded = Number((await readFile(pidFile, 'utf-8')).trim());
      expect(Number.isInteger(recorded)).toBe(true);
      expect(recorded).toBeGreaterThan(0);
    });

    /** Create a build whose index.js stays alive (a stand-in for a long-running server). */
    async function createLingeringBuild(): Promise<void> {
      const buildDir = join(tempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'setTimeout(() => {}, 10000);\n', 'utf-8');
    }

    /**
     * Run `fn` with a call-through spy on `spawn`. Any child still running
     * afterwards is killed, so a failing assertion never leaves a process behind.
     */
    async function withSpawnSpy(
      fn: (spawnSpy: ReturnType<typeof spyOn<typeof childProcess, 'spawn'>>) => Promise<void>
    ): Promise<void> {
      const spawnSpy = spyOn(childProcess, 'spawn');
      try {
        await fn(spawnSpy);
      } finally {
        for (const result of spawnSpy.mock.results) {
          const child = result.value as ChildProcess;
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        }
        spawnSpy.mockRestore();
      }
    }

    /** Resolve with the child's terminating signal, or `'still-running'` after `ms`. */
    async function exitSignal(child: ChildProcess, ms: number): Promise<string | null> {
      if (child.exitCode !== null || child.signalCode !== null) {
        return child.signalCode;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('still-running'), ms);
      });
      try {
        return await Promise.race([
          once(child, 'exit').then(([, signal]) => signal as string | null),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    it('should not spawn or write a PID file when HOME is relative', async () => {
      await createExitingBuild();

      await withSpawnSpy(async (spawnSpy) => {
        await withRelativeHome(async (relativePidFile) => {
          const error = await startServeBackground(tempDir, undefined, {
            skipNpmFallback: true,
          }).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(ServePidFileError);
          expect((error as ServePidFileError).reason).toBe('home-unresolved');
          expect((error as ServePidFileError).pidFile).toBeNull();
          expect(existsSync(relativePidFile)).toBe(false);
        });
        expect(spawnSpy).not.toHaveBeenCalled();
      });
      expect(existsSync(pidFile)).toBe(false);
    });

    it('should not spawn when the PID directory cannot be used (ENOTDIR, root-safe)', async () => {
      await createLingeringBuild();
      // A regular file where the home directory's parent should be: access()
      // fails with ENOTDIR for every user, root included.
      const blocker = join(fakeHome, 'blocker');
      await writeFile(blocker, '', 'utf-8');
      process.env.HOME = join(blocker, 'home');
      const blockedPidFile = join(blocker, 'home', PID_FILE_NAME);

      await withSpawnSpy(async (spawnSpy) => {
        const error = await startServeBackground(tempDir, undefined, {
          skipNpmFallback: true,
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ServePidFileError);
        expect((error as ServePidFileError).reason).toBe('pid-not-writable');
        expect((error as ServePidFileError).pidFile).toBe(blockedPidFile);
        expect(((error as ServePidFileError).cause as NodeJS.ErrnoException).code).toBe('ENOTDIR');
        expect(spawnSpy).not.toHaveBeenCalled();
      });
    });

    // Pins W_OK (not mere existence): only permission bits can make an existing
    // directory unwritable, and root ignores them — so this one is skipped as root.
    it.skipIf(RUNNING_AS_ROOT)(
      'should not spawn when the PID directory is not writable',
      async () => {
        await createLingeringBuild();
        // 555, not 000: Bun's realpath fails with EACCES on a 000 directory itself
        await chmod(fakeHome, 0o555);
        try {
          await withSpawnSpy(async (spawnSpy) => {
            const error = await startServeBackground(tempDir, undefined, {
              skipNpmFallback: true,
            }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ServePidFileError);
            expect((error as ServePidFileError).reason).toBe('pid-not-writable');
            expect((error as ServePidFileError).pidFile).toBe(pidFile);
            expect(spawnSpy).not.toHaveBeenCalled();
          });
          expect(existsSync(pidFile)).toBe(false);
        } finally {
          await chmod(fakeHome, 0o755);
        }
      }
    );

    it('should terminate the spawned server when the PID file write fails after spawning', async () => {
      await createLingeringBuild();
      // The directory is writable (the pre-spawn check passes) but the PID path
      // is itself a directory, so the write after spawning fails with EISDIR.
      await mkdir(pidFile);

      await withSpawnSpy(async (spawnSpy) => {
        const error = await startServeBackground(tempDir, undefined, {
          skipNpmFallback: true,
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ServePidFileError);
        expect((error as ServePidFileError).reason).toBe('pid-not-writable');
        expect((error as ServePidFileError).cause).toBeInstanceOf(Error);

        expect(spawnSpy).toHaveBeenCalledTimes(1);
        const child = spawnSpy.mock.results[0]?.value as ChildProcess;
        expect(await exitSignal(child, 3000)).toBe('SIGTERM');
      });
    });

    it('should not spawn when the server is already running, even with a build present', async () => {
      await createLingeringBuild();
      await writeFile(pidFile, String(process.pid), 'utf-8');

      await withSpawnSpy(async (spawnSpy) => {
        await expect(
          startServeBackground(tempDir, undefined, { skipNpmFallback: true })
        ).resolves.toBeUndefined();
        expect(spawnSpy).not.toHaveBeenCalled();
      });
      expect((await readFile(pidFile, 'utf-8')).trim()).toBe(String(process.pid));
    });

    // Order of the pre-spawn checks (see the startServeBackground JSDoc):
    // home resolution comes BEFORE the build lookup, the writability check AFTER it.
    it('should throw home-unresolved for a relative HOME even when the build is missing', async () => {
      await withSpawnSpy(async (spawnSpy) => {
        await withRelativeHome(async () => {
          const error = await startServeBackground(tempDir, undefined, {
            skipNpmFallback: true,
          }).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(ServePidFileError);
          expect((error as ServePidFileError).reason).toBe('home-unresolved');
        });
        expect(spawnSpy).not.toHaveBeenCalled();
      });
    });

    it('should skip silently for an unusable PID directory when the build is missing', async () => {
      const blocker = join(fakeHome, 'blocker');
      await writeFile(blocker, '', 'utf-8');
      process.env.HOME = join(blocker, 'home'); // ENOTDIR for every user, root included

      await withSpawnSpy(async (spawnSpy) => {
        await expect(
          startServeBackground(tempDir, undefined, { skipNpmFallback: true })
        ).resolves.toBeUndefined();
        expect(spawnSpy).not.toHaveBeenCalled();
      });
    });

    it('should absorb an asynchronous spawn error instead of crashing', async () => {
      await createExitingBuild();
      // Mirrors a failed spawn (e.g. `node` not on PATH): no pid, and the error
      // arrives later as an 'error' event.
      const failedChild = Object.assign(new EventEmitter(), {
        pid: undefined,
        unref: () => {},
      });
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(() => {
        process.nextTick(() => failedChild.emit('error', new Error('spawn node ENOENT')));
        return failedChild as unknown as ChildProcess;
      });
      try {
        await expect(
          startServeBackground(tempDir, undefined, { skipNpmFallback: true })
        ).resolves.toBeUndefined();
        await new Promise((resolve) => setImmediate(resolve)); // let the error fire

        expect(failedChild.listenerCount('error')).toBeGreaterThan(0);
        expect(() => failedChild.emit('error', new Error('again'))).not.toThrow();
        expect(existsSync(pidFile)).toBe(false);
      } finally {
        spawnSpy.mockRestore();
      }
    });
  });

  describe('ServePidFileError', () => {
    it('should name the failure and keep the PID path and cause', () => {
      const cause = new Error('EACCES');
      const error = new ServePidFileError('pid-not-writable', '/abs/.omcustom-serve.pid', {
        cause,
      });
      expect(error.name).toBe('ServePidFileError');
      expect(error.message).toContain('/abs/.omcustom-serve.pid');
      expect(error.cause).toBe(cause);
      expect(new ServePidFileError('home-unresolved', null).message).toContain('home directory');
    });
  });
});

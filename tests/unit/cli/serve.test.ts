/**
 * Unit tests for serve.ts — background server lifecycle management
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import * as childProcess from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import {
  existsSync,
  linkSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import * as fsp from 'node:fs/promises';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as timersPromises from 'node:timers/promises';
import {
  CLAIM_MAX_AGE_MS,
  DEFAULT_PORT,
  findServeBuildDir,
  isServeRunning,
  PARTIAL_RECORD_GRACE_MS,
  resolveServePidFile,
  ServePidFileError,
  startServeBackground,
  stopServe,
} from '../../../src/cli/serve.js';

const PID_FILE_NAME = '.omcustom-serve.pid';

// The real fs functions, captured before any test spies on them: a spy that
// injects an interleaving calls through to these.
const realAccess = fsp.access;
const realLink = fsp.link;
const realReadFile = fsp.readFile;
const realRename = fsp.rename;
const realWriteFile = fsp.writeFile;

/** A PID that is not a running process (ESRCH). */
const DEAD_PID = 999999999;

/** An error carrying a Node errno code. */
function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: injected`), { code });
}

/** A `process.kill` stand-in: {@link DEAD_PID} does not exist, every other PID does. */
function fakeKill(pid: number): true {
  if (pid === DEAD_PID) {
    throw errnoError('ESRCH');
  }
  return true;
}

/** Set a file's mtime `ms` (plus one second of margin) into the past. */
function backdate(path: string, ms: number): void {
  const past = new Date(Date.now() - ms - 1000);
  utimesSync(path, past, past);
}

/**
 * Run `fn` with `Date.now()` fixed at `ageMs` after the file's mtime, so an
 * age check sees exactly that age however long the test takes.
 */
async function atAge(path: string, ageMs: number, fn: () => Promise<void>): Promise<void> {
  const { mtimeMs } = lstatSync(path);
  const nowSpy = spyOn(Date, 'now').mockReturnValue(mtimeMs + ageMs);
  try {
    await fn();
  } finally {
    nowSpy.mockRestore();
  }
}

/** A promise with its resolver, for holding an operation at a chosen point. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Let pending fs operations and timers of a held call run up to its next gate. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

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

    // A running check is a read only: it never removes a record (#1822 review S1).
    it('should return false and leave a PID file with invalid (non-numeric) content in place', async () => {
      await writeFile(pidFile, 'not-a-number', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      expect(readFileSync(pidFile, 'utf-8')).toBe('not-a-number');
    });

    it('should return false and leave a PID file with zero PID in place', async () => {
      await writeFile(pidFile, '0', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      expect(readFileSync(pidFile, 'utf-8')).toBe('0');
    });

    it('should return false for a PID that does not correspond to a running process', async () => {
      // PID 999999999 almost certainly does not exist
      await writeFile(pidFile, '999999999', 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(false);
      expect(readFileSync(pidFile, 'utf-8')).toBe('999999999');
    });

    it('should return true for a PID that exists (the current process)', async () => {
      // Use the current process PID — we know it exists
      await writeFile(pidFile, String(process.pid), 'utf-8');

      const result = await isServeRunning();

      expect(result).toBe(true);
    });

    /** A `readFile` spy that reports the PID file absent on its first read only. */
    function absentOnFirstRead(): { spy: { mockRestore: () => void }; reads: () => number } {
      let reads = 0;
      const spy = spyOn(fsp, 'readFile').mockImplementation((async (
        path: Parameters<typeof realReadFile>[0],
        options: Parameters<typeof realReadFile>[1]
      ) => {
        if (path === pidFile) {
          reads += 1;
          if (reads === 1) {
            throw errnoError('ENOENT'); // taken away by a remover for a moment
          }
        }
        return realReadFile(path, options);
      }) as typeof realReadFile);
      return { spy, reads: () => reads };
    }

    it('should read a momentarily absent PID file once more (#1822 re-review)', async () => {
      await writeFile(pidFile, String(process.pid), 'utf-8');
      const absent = absentOnFirstRead();
      // the pause before the second read, resolved at once (no real waiting)
      const delaySpy = spyOn(timersPromises, 'setTimeout').mockImplementation(
        (async () => undefined) as unknown as typeof timersPromises.setTimeout
      );
      try {
        expect(await isServeRunning()).toBe(true);
        expect(delaySpy).toHaveBeenCalledTimes(1);
        expect(Number(delaySpy.mock.calls[0]?.[0])).toBeGreaterThan(0);
      } finally {
        delaySpy.mockRestore();
        absent.spy.mockRestore();
      }
      expect(absent.reads()).toBe(2);
    });

    it('should read an absent PID file exactly twice before reporting not running', async () => {
      let reads = 0;
      const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
        path: Parameters<typeof realReadFile>[0],
        options: Parameters<typeof realReadFile>[1]
      ) => {
        if (path === pidFile) {
          reads += 1;
        }
        return realReadFile(path, options);
      }) as typeof realReadFile);
      try {
        expect(await isServeRunning()).toBe(false);
      } finally {
        readSpy.mockRestore();
      }
      expect(reads).toBe(2);
    });

    it('should not re-read a PID file that is unreadable for another reason', async () => {
      await mkdir(pidFile);
      let reads = 0;
      const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
        path: Parameters<typeof realReadFile>[0],
        options: Parameters<typeof realReadFile>[1]
      ) => {
        if (path === pidFile) {
          reads += 1;
        }
        return realReadFile(path, options);
      }) as typeof realReadFile);
      try {
        expect(await isServeRunning()).toBe(false);
      } finally {
        readSpy.mockRestore();
      }
      expect(reads).toBe(1);
    });

    it('should count a start in progress as running while its starter is alive', async () => {
      const claim = `starting:${process.pid}:in-progress`;
      await writeFile(pidFile, claim, 'utf-8');

      expect(await isServeRunning()).toBe(true);
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should tolerate whitespace around a record (e.g. a hand-edited file)', async () => {
      const claim = `\n  starting:${process.pid}:edited  \n`;
      await writeFile(pidFile, claim, 'utf-8');

      expect(await isServeRunning()).toBe(true);
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should report a claim whose starter is gone as not running, leaving it in place', async () => {
      const claim = `starting:${DEAD_PID}:crashed`;
      await writeFile(pidFile, claim, 'utf-8');

      expect(await isServeRunning()).toBe(false);
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should return false and leave an unreadable PID path alone', async () => {
      await mkdir(pidFile);

      expect(await isServeRunning()).toBe(false);
      expect(existsSync(pidFile)).toBe(true);
    });

    // Only permission bits make a regular file unreadable, and root ignores them.
    it.skipIf(RUNNING_AS_ROOT)(
      'should return false and leave a PID file it cannot read alone',
      async () => {
        await writeFile(pidFile, String(process.pid), 'utf-8');
        await chmod(pidFile, 0o000);
        try {
          expect(await isServeRunning()).toBe(false);
          expect(existsSync(pidFile)).toBe(true);
        } finally {
          await chmod(pidFile, 0o644);
        }
      }
    );

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

    it('should return false and leave a PID file with invalid content in place', async () => {
      await writeFile(pidFile, 'bad-pid', 'utf-8');

      const result = await stopServe();

      expect(result).toBe(false);
      expect(readFileSync(pidFile, 'utf-8')).toBe('bad-pid');
    });

    it('should return false and leave an unreadable PID path alone', async () => {
      await mkdir(pidFile);

      expect(await stopServe()).toBe(false);
      expect(existsSync(pidFile)).toBe(true);
    });

    it('should neither signal the starter nor remove the claim of a start in progress', async () => {
      const claim = `starting:${process.pid}:in-progress`;
      await writeFile(pidFile, claim, 'utf-8');
      // fake, so a regression can never SIGTERM the test runner itself
      const killSpy = spyOn(process, 'kill').mockImplementation(fakeKill);
      try {
        expect(await stopServe()).toBe(false);
        expect(killSpy).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
      } finally {
        killSpy.mockRestore();
      }
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should neither signal nor remove the claim of a start whose starter is gone', async () => {
      const claim = `starting:${DEAD_PID}:crashed`;
      await writeFile(pidFile, claim, 'utf-8');
      const killSpy = spyOn(process, 'kill').mockImplementation(fakeKill);
      try {
        expect(await stopServe()).toBe(false);
        expect(killSpy).not.toHaveBeenCalledWith(DEAD_PID, 'SIGTERM');
      } finally {
        killSpy.mockRestore();
      }
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should not remove a record that replaced the stopped one', async () => {
      await writeFile(pidFile, '424242', 'utf-8');
      const fresh = `starting:${process.pid}:fresh`;
      // The server dies on SIGTERM and a new start claims the PID file before
      // the stop removes the record it read.
      const killSpy = spyOn(process, 'kill').mockImplementation(() => {
        writeFileSync(pidFile, fresh, 'utf-8');
        return true;
      });
      try {
        expect(await stopServe()).toBe(true);
      } finally {
        killSpy.mockRestore();
      }
      expect(readFileSync(pidFile, 'utf-8')).toBe(fresh);
    });

    it('should return false when PID does not correspond to a running process', async () => {
      await writeFile(pidFile, '999999999', 'utf-8');

      // process.kill throws ESRCH when the PID doesn't exist → catch → return false
      const result = await stopServe();

      expect(result).toBe(false);
      // only a start reclaims a stale record (#1822 review S2)
      expect(readFileSync(pidFile, 'utf-8')).toBe('999999999');
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

    it('should stop a server whose PID file was momentarily absent (#1822 re-review)', async () => {
      await writeFile(pidFile, '424242', 'utf-8');
      let firstRead = true;
      const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
        path: Parameters<typeof realReadFile>[0],
        options: Parameters<typeof realReadFile>[1]
      ) => {
        if (path === pidFile && firstRead) {
          firstRead = false;
          throw errnoError('ENOENT');
        }
        return realReadFile(path, options);
      }) as typeof realReadFile);
      const killSpy = spyOn(process, 'kill').mockImplementation(() => true);
      try {
        expect(await stopServe()).toBe(true);
        expect(killSpy).toHaveBeenCalledWith(424242, 'SIGTERM');
      } finally {
        killSpy.mockRestore();
        readSpy.mockRestore();
      }
      expect(existsSync(pidFile)).toBe(false);
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

    it('should not spawn when the PID path is a directory (the claim cannot read it)', async () => {
      await createLingeringBuild();
      // The directory is writable (the pre-spawn check passes) but the PID path
      // is itself a directory: the exclusive claim finds it taken and cannot read it.
      await mkdir(pidFile);

      await withSpawnSpy(async (spawnSpy) => {
        const error = await startServeBackground(tempDir, undefined, {
          skipNpmFallback: true,
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ServePidFileError);
        expect((error as ServePidFileError).reason).toBe('pid-not-writable');
        expect(((error as ServePidFileError).cause as NodeJS.ErrnoException).code).toBe('EISDIR');
        expect(spawnSpy).not.toHaveBeenCalled();
      });
      expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
    });

    it('should terminate the spawned server and drop the claim when recording its PID fails', async () => {
      await createLingeringBuild();
      // The claim succeeds, but replacing it with the PID (a rename of the
      // staged record over the PID file) fails after spawning.
      const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
        if (to === pidFile) {
          throw errnoError('EACCES');
        }
        return realRename(from, to);
      });
      try {
        await withSpawnSpy(async (spawnSpy) => {
          const error = await startServeBackground(tempDir, undefined, {
            skipNpmFallback: true,
          }).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(ServePidFileError);
          expect((error as ServePidFileError).reason).toBe('pid-not-writable');
          expect(((error as ServePidFileError).cause as NodeJS.ErrnoException).code).toBe('EACCES');

          expect(spawnSpy).toHaveBeenCalledTimes(1);
          const child = spawnSpy.mock.results[0]?.value as ChildProcess;
          expect(await exitSignal(child, 3000)).toBe('SIGTERM');
        });
      } finally {
        renameSpy.mockRestore();
      }
      // neither the claim nor a staged record is left behind
      expect(await readdir(fakeHome)).toEqual([]);
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

    describe('PID file claim (concurrent starts, #1822)', () => {
      const STUB_PID = 424242;

      /** A stub child: never a real process. */
      function stubChild(pid: number | undefined) {
        return Object.assign(new EventEmitter(), {
          pid,
          unref: () => {},
          kill: mock(() => true),
        });
      }

      /** Run `fn` with `spawn` replaced by a stub returning a child with `pid`. */
      async function withStubSpawn(
        pid: number | undefined,
        fn: (spawnSpy: ReturnType<typeof spyOn<typeof childProcess, 'spawn'>>) => Promise<void>
      ): Promise<void> {
        const stubSpawn = (): ChildProcess => stubChild(pid) as unknown as ChildProcess;
        const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
          stubSpawn as unknown as typeof childProcess.spawn
        );
        try {
          await fn(spawnSpy);
        } finally {
          spawnSpy.mockRestore();
        }
      }

      function start(): Promise<void> {
        return startServeBackground(tempDir, undefined, { skipNpmFallback: true });
      }

      it('should spawn exactly once when two starts both pass the running check', async () => {
        await createExitingBuild();
        // Hold every start at the writability check (step 4) until both have
        // arrived: both have then passed the running check (step 2) and found
        // nothing running — the interleaving that spawned two servers before.
        let arrived = 0;
        let releaseBoth: () => void = () => {};
        const bothArrived = new Promise<void>((resolve) => {
          releaseBoth = resolve;
        });
        const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
          arrived += 1;
          if (arrived === 2) {
            releaseBoth();
          }
          await bothArrived;
          return realAccess(path, mode);
        });
        const writeSpy = spyOn(fsp, 'writeFile'); // call-through: records the staged claims
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await Promise.all([start(), start()]);
            expect(arrived).toBe(2);
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
          // Both starts staged a claim, and the two claims differ although both
          // come from this one process (the nonce tells them apart).
          const claims = writeSpy.mock.calls
            .map((call) => String(call[1]))
            .filter((content) => content.startsWith('starting:'));
          expect(claims).toHaveLength(2);
          expect(new Set(claims).size).toBe(2);
        } finally {
          writeSpy.mockRestore();
          accessSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
      });

      it('should never write the PID file in place, so no reader sees a partial record', async () => {
        await createExitingBuild();
        const writeSpy = spyOn(fsp, 'writeFile'); // call-through
        try {
          await withStubSpawn(STUB_PID, async () => {
            await start();
          });
          expect(writeSpy.mock.calls.length).toBeGreaterThan(0);
          for (const call of writeSpy.mock.calls) {
            expect(String(call[0])).not.toBe(pidFile);
          }
        } finally {
          writeSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
      });

      it('should reclaim a stale server record (dead PID) and start', async () => {
        await createExitingBuild();
        await writeFile(pidFile, String(DEAD_PID), 'utf-8');

        await withStubSpawn(STUB_PID, async (spawnSpy) => {
          await start();
          expect(spawnSpy).toHaveBeenCalledTimes(1);
        });
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
      });

      it('should reclaim a stale claim left by a crashed start and start', async () => {
        await createExitingBuild();
        await writeFile(pidFile, `starting:${DEAD_PID}:crashed`, 'utf-8');

        await withStubSpawn(STUB_PID, async (spawnSpy) => {
          await start();
          expect(spawnSpy).toHaveBeenCalledTimes(1);
        });
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
      });

      it('should reclaim a stale record that appears after the running check', async () => {
        await createExitingBuild();
        // The running check (step 2) saw no file; a stale record appears before
        // the claim (step 5), so the claim itself must reclaim it.
        const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
          writeFileSync(pidFile, String(DEAD_PID), 'utf-8');
          return realAccess(path, mode);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
        } finally {
          accessSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
      });

      it('should reclaim a malformed record older than the grace period that appears after the running check', async () => {
        await createExitingBuild();
        const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
          writeFileSync(pidFile, 'garbage', 'utf-8');
          backdate(pidFile, PARTIAL_RECORD_GRACE_MS);
          return realAccess(path, mode);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
        } finally {
          accessSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
      });

      it('should not start while a live start holds the claim', async () => {
        await createExitingBuild();
        const claim = `starting:${process.pid}:other-start`;
        await writeFile(pidFile, claim, 'utf-8');

        await withStubSpawn(STUB_PID, async (spawnSpy) => {
          await expect(start()).resolves.toBeUndefined();
          expect(spawnSpy).not.toHaveBeenCalled();
        });
        expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
      });

      it('should not start when a live server PID appears after the running check', async () => {
        await createExitingBuild();
        const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
          writeFileSync(pidFile, String(process.pid), 'utf-8');
          return realAccess(path, mode);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          accessSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
      });

      it('should leave no claim behind when the spawn fails', async () => {
        await createExitingBuild();

        await withStubSpawn(undefined, async (spawnSpy) => {
          await expect(start()).resolves.toBeUndefined();
          expect(spawnSpy).toHaveBeenCalledTimes(1);
        });
        expect(await readdir(fakeHome)).toEqual([]);
        expect(await isServeRunning()).toBe(false);
      });

      it('should not spawn when the claim cannot be created', async () => {
        await createExitingBuild();
        // EIO, not EPERM: EPERM means "no hard links here" and has a fallback
        const linkSpy = spyOn(fsp, 'link').mockImplementation(async () => {
          throw errnoError('EIO');
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            const error = await start().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ServePidFileError);
            expect((error as ServePidFileError).reason).toBe('pid-not-writable');
            expect(((error as ServePidFileError).cause as NodeJS.ErrnoException).code).toBe('EIO');
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          linkSpy.mockRestore();
        }
        expect(await readdir(fakeHome)).toEqual([]);
      });

      it('should re-try the claim when the competing record is gone before it is read', async () => {
        await createExitingBuild();
        let linkCalls = 0;
        const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from, to) => {
          linkCalls += 1;
          if (linkCalls === 1) {
            throw errnoError('EEXIST'); // a record existed, then vanished
          }
          return realLink(from, to);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
        } finally {
          linkSpy.mockRestore();
        }
        // two claim attempts, then the PID record (also created exclusively)
        expect(linkCalls).toBe(3);
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
      });

      it('should give up without spawning when a stale record cannot be removed', async () => {
        await createExitingBuild();
        await writeFile(pidFile, String(DEAD_PID), 'utf-8');
        let takes = 0;
        const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
          if (from === pidFile) {
            takes += 1;
            throw errnoError('EBUSY');
          }
          return realRename(from, to);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          renameSpy.mockRestore();
        }
        // one take per claim attempt (3); the running check never takes
        expect(takes).toBe(3);
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(DEAD_PID));
      });

      it('should put back a fresh claim that replaced the stale record it was removing', async () => {
        await createExitingBuild();
        await writeFile(pidFile, String(DEAD_PID), 'utf-8');
        const winner = `starting:${process.pid}:winner`;
        let takes = 0;
        // Between this start reading the stale record and taking it, another
        // start reclaims the stale record and writes its own claim.
        const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
          if (from === pidFile) {
            takes += 1;
            if (takes === 1) {
              writeFileSync(pidFile, winner, 'utf-8');
            }
          }
          return realRename(from, to);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          renameSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(winner);
        expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
      });

      it('should keep a newer record over a taken one it cannot put back', async () => {
        await createExitingBuild();
        await writeFile(pidFile, String(DEAD_PID), 'utf-8');
        const first = `starting:${process.pid}:first`;
        const newer = `starting:${process.pid}:newer`;
        let takes = 0;
        const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
          if (from === pidFile) {
            takes += 1;
            if (takes === 1) {
              writeFileSync(pidFile, first, 'utf-8');
            }
          }
          return realRename(from, to);
        });
        // While the taken claim is held, a newer record appears at the path.
        const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from, to) => {
          if (String(from).endsWith('.taken')) {
            writeFileSync(pidFile, newer, 'utf-8');
          }
          return realLink(from, to);
        });
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          linkSpy.mockRestore();
          renameSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(newer);
        expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
      });

      it('should put back a taken record it cannot read', async () => {
        await createExitingBuild();
        await writeFile(pidFile, String(DEAD_PID), 'utf-8');
        const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
          path: Parameters<typeof realReadFile>[0],
          options: Parameters<typeof realReadFile>[1]
        ) => {
          if (String(path).endsWith('.taken')) {
            throw errnoError('EIO');
          }
          return realReadFile(path, options);
        }) as typeof realReadFile);
        try {
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
        } finally {
          readSpy.mockRestore();
        }
        expect(readFileSync(pidFile, 'utf-8')).toBe(String(DEAD_PID));
        expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
      });

      describe('a running check or stop racing two starts (#1822 review S1/S2)', () => {
        const FIRST_PID = 111;
        const SECOND_PID = 222;

        /** `process.kill` stand-in: the two stub servers and this process exist. */
        function killStub() {
          return spyOn(process, 'kill').mockImplementation(((pid: number) => {
            if (pid === process.pid || pid === FIRST_PID || pid === SECOND_PID) {
              return true;
            }
            throw errnoError('ESRCH');
          }) as typeof process.kill);
        }

        /**
         * Spies that hold a reader (running check or stop) in the middle of
         * removing the record it read: before taking the PID file (`take`) and
         * before reading the taken file (`read`). Only removals that start
         * while `readerPhase` is set are held.
         */
        function holdReaderRemoval() {
          const take = gate();
          const read = gate();
          const state = { readerPhase: true, readerTaken: '' };
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (state.readerPhase && from === pidFile && String(to).endsWith('.taken')) {
              state.readerTaken = String(to);
              await take.opened;
            }
            return realRename(from, to);
          });
          const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
            path: Parameters<typeof realReadFile>[0],
            options: Parameters<typeof realReadFile>[1]
          ) => {
            if (state.readerTaken !== '' && String(path) === state.readerTaken) {
              await read.opened;
            }
            return realReadFile(path, options);
          }) as typeof realReadFile);
          return {
            take,
            read,
            state,
            restore: () => {
              take.open();
              read.open();
              readSpy.mockRestore();
              renameSpy.mockRestore();
            },
          };
        }

        function spawnSequence() {
          const pids = [FIRST_PID, SECOND_PID];
          let next = 0;
          return spyOn(childProcess, 'spawn').mockImplementation((() =>
            stubChild(pids[next++])) as unknown as typeof childProcess.spawn);
        }

        it('should not let a running check that read a stale record drop a later server record (S1)', async () => {
          await createExitingBuild();
          writeFileSync(pidFile, String(DEAD_PID), 'utf-8');
          const hold = holdReaderRemoval();
          const spawnSpy = spawnSequence();
          const killSpy = killStub();
          try {
            const reader = isServeRunning(); // reads the stale record
            await settle();
            hold.state.readerPhase = false;
            await start(); // A reclaims the stale record and records FIRST_PID
            hold.take.open();
            await settle();
            await start(); // B must find FIRST_PID running
            hold.read.open();
            expect(await reader).toBe(false);
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          } finally {
            killSpy.mockRestore();
            spawnSpy.mockRestore();
            hold.restore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(FIRST_PID));
        });

        it('should not let a stop that read a stale record drop a live claim (S2)', async () => {
          await createExitingBuild();
          writeFileSync(pidFile, String(DEAD_PID), 'utf-8');
          const hold = holdReaderRemoval();
          const recordHold = gate();
          const writeSpy = spyOn(fsp, 'writeFile').mockImplementation((async (
            path: Parameters<typeof realWriteFile>[0],
            data: Parameters<typeof realWriteFile>[1],
            options: Parameters<typeof realWriteFile>[2]
          ) => {
            if (String(data) === String(FIRST_PID)) {
              await recordHold.opened; // hold A between spawn and recording its PID
            }
            return realWriteFile(path, data, options);
          }) as typeof realWriteFile);
          const spawnSpy = spawnSequence();
          const killSpy = killStub();
          try {
            const stopper = stopServe(); // reads the stale record
            await settle();
            hold.state.readerPhase = false;
            const first = start(); // A claims and spawns FIRST_PID, held before recording
            await settle();
            hold.take.open();
            await settle();
            await start(); // B must find A's claim live
            hold.read.open();
            expect(await stopper).toBe(false);
            recordHold.open();
            await first;
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          } finally {
            recordHold.open();
            killSpy.mockRestore();
            spawnSpy.mockRestore();
            writeSpy.mockRestore();
            hold.restore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(FIRST_PID));
        });
      });

      describe('a claim lost before the PID is recorded', () => {
        it('should terminate its server and keep the record of a start that took the claim over', async () => {
          await createExitingBuild();
          const child = stubChild(STUB_PID);
          const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
            // meanwhile another start reclaimed this claim and recorded its server
            writeFileSync(pidFile, '222', 'utf-8');
            return child;
          }) as unknown as typeof childProcess.spawn);
          try {
            await expect(start()).resolves.toBeUndefined();
            expect(child.kill).toHaveBeenCalledWith('SIGTERM');
          } finally {
            spawnSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe('222');
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        // An absent claim is not a lost one: a remover may be about to put it
        // back (#1822 re-review F-A), so the PID is recorded exclusively.
        it('should record its server when the claim path is empty', async () => {
          await createExitingBuild();
          const child = stubChild(STUB_PID);
          const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
            unlinkSync(pidFile);
            return child;
          }) as unknown as typeof childProcess.spawn);
          try {
            await expect(start()).resolves.toBeUndefined();
            expect(child.kill).not.toHaveBeenCalled();
          } finally {
            spawnSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        // #1822 re-review F-A (rr-d2): a slower start B that read the same stale
        // record takes this start's claim right after the spawn and puts it back
        // after this start's next operation on the PID path.
        it('should keep its server when another remover takes and puts back the claim (rr-d2)', async () => {
          await createExitingBuild();
          await writeFile(pidFile, String(DEAD_PID), 'utf-8');
          const takenByB = join(fakeHome, 'B.taken');
          let held = false;
          let putBack = '';
          const putBackByB = (): void => {
            if (!held) {
              return;
            }
            held = false;
            try {
              linkSync(takenByB, pidFile);
              putBack = 'linked';
            } catch (error: unknown) {
              putBack = (error as NodeJS.ErrnoException).code ?? 'error';
            }
            unlinkSync(takenByB);
          };
          const child = stubChild(STUB_PID);
          const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
            renameSync(pidFile, takenByB); // B takes the claim (it expected the stale record)
            held = true;
            return child;
          }) as unknown as typeof childProcess.spawn);
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from, to) => {
            try {
              return await realLink(from, to);
            } finally {
              if (to === pidFile) {
                putBackByB();
              }
            }
          });
          const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
            path: Parameters<typeof realReadFile>[0],
            options: Parameters<typeof realReadFile>[1]
          ) => {
            try {
              return await realReadFile(path, options);
            } finally {
              if (path === pidFile) {
                putBackByB();
              }
            }
          }) as typeof realReadFile);
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            try {
              return await realRename(from, to);
            } finally {
              if (to === pidFile) {
                putBackByB();
              }
            }
          });
          try {
            await expect(start()).resolves.toBeUndefined();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
            expect(child.kill).not.toHaveBeenCalled();
          } finally {
            renameSpy.mockRestore();
            readSpy.mockRestore();
            linkSpy.mockRestore();
            spawnSpy.mockRestore();
          }
          expect(putBack).toBe('EEXIST'); // B's put-back lost to the recorded server
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should try again when the claim is taken away between its checks', async () => {
          await createExitingBuild();
          const takenByB = join(fakeHome, 'B.taken');
          let spawned = false;
          let held = false;
          const child = stubChild(STUB_PID);
          const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
            spawned = true;
            return child;
          }) as unknown as typeof childProcess.spawn);
          // The record's exclusive create finds the claim; B takes it before it is read ...
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from, to) => {
            try {
              return await realLink(from, to);
            } finally {
              if (spawned && !held && to === pidFile && existsSync(pidFile)) {
                renameSync(pidFile, takenByB);
                held = true;
              }
            }
          });
          // ... and puts it back once that read found the path empty.
          const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
            path: Parameters<typeof realReadFile>[0],
            options: Parameters<typeof realReadFile>[1]
          ) => {
            try {
              return await realReadFile(path, options);
            } finally {
              if (held && path === pidFile && existsSync(takenByB)) {
                renameSync(takenByB, pidFile);
              }
            }
          }) as typeof realReadFile);
          try {
            await expect(start()).resolves.toBeUndefined();
            expect(child.kill).not.toHaveBeenCalled();
          } finally {
            readSpy.mockRestore();
            linkSpy.mockRestore();
            spawnSpy.mockRestore();
          }
          expect(held).toBe(true);
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should terminate its server and throw when the claim cannot be re-read', async () => {
          await createExitingBuild();
          const child = stubChild(STUB_PID);
          let spawned = false;
          const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() => {
            spawned = true;
            return child;
          }) as unknown as typeof childProcess.spawn);
          const readSpy = spyOn(fsp, 'readFile').mockImplementation((async (
            path: Parameters<typeof realReadFile>[0],
            options: Parameters<typeof realReadFile>[1]
          ) => {
            if (spawned && path === pidFile) {
              throw errnoError('EIO');
            }
            return realReadFile(path, options);
          }) as typeof realReadFile);
          try {
            const error = await start().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ServePidFileError);
            expect((error as ServePidFileError).reason).toBe('pid-not-writable');
            expect(((error as ServePidFileError).cause as NodeJS.ErrnoException).code).toBe('EIO');
            expect(child.kill).toHaveBeenCalledWith('SIGTERM');
          } finally {
            readSpy.mockRestore();
            spawnSpy.mockRestore();
          }
          // the claim (still readable through the taken file) is removed
          expect(await readdir(fakeHome)).toEqual([]);
        });
      });

      describe('a filesystem without hard links', () => {
        it.each([
          'ENOTSUP',
          'EPERM',
          'EXDEV',
        ])('should claim with an exclusive write when link fails with %s', async (code) => {
          await createExitingBuild();
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async () => {
            throw errnoError(code);
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            linkSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should still spawn exactly once for two concurrent starts', async () => {
          await createExitingBuild();
          let arrived = 0;
          const both = gate();
          const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
            arrived += 1;
            if (arrived === 2) {
              both.open();
            }
            await both.opened;
            return realAccess(path, mode);
          });
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async () => {
            throw errnoError('ENOTSUP');
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await Promise.all([start(), start()]);
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            linkSpy.mockRestore();
            accessSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should put a taken record back with an exclusive write', async () => {
          await createExitingBuild();
          await writeFile(pidFile, String(DEAD_PID), 'utf-8');
          const winner = `starting:${process.pid}:winner`;
          let takes = 0;
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (from === pidFile) {
              takes += 1;
              if (takes === 1) {
                writeFileSync(pidFile, winner, 'utf-8');
              }
            }
            return realRename(from, to);
          });
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async () => {
            throw errnoError('ENOTSUP');
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await expect(start()).resolves.toBeUndefined();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          } finally {
            linkSpy.mockRestore();
            renameSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(winner);
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it.each([
          ['an empty', ''],
          ['a cut-short "s"', 's'],
          ['a cut-short "starting"', 'starting'],
          ['a cut-short "starting:"', 'starting:'],
          ['a cut-short "starting:12"', 'starting:12'],
        ])('should not reclaim %s record within the grace period (a record being written)', async (_, content) => {
          await createExitingBuild();
          await writeFile(pidFile, content, 'utf-8');

          await atAge(pidFile, PARTIAL_RECORD_GRACE_MS - 1, async () => {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await expect(start()).resolves.toBeUndefined();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(content);
        });

        // #1822 re-review F-B: only content that can still become a record is held.
        it.each([
          ['garbage'],
          ['user data'],
          ['starting:12x'],
          ['startingx'],
          [' starting:'],
        ])('should reclaim %p at once, even within the grace period', async (content) => {
          await createExitingBuild();
          await writeFile(pidFile, content, 'utf-8');

          await atAge(pidFile, 0, async () => {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should reclaim a cut-short record exactly at the end of the grace period', async () => {
          await createExitingBuild();
          await writeFile(pidFile, 'starting:', 'utf-8');

          await atAge(pidFile, PARTIAL_RECORD_GRACE_MS, async () => {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should keep a newer record over a taken one it cannot put back', async () => {
          await createExitingBuild();
          await writeFile(pidFile, String(DEAD_PID), 'utf-8');
          const first = `starting:${process.pid}:first`;
          const newer = `starting:${process.pid}:newer`;
          let takes = 0;
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (from === pidFile) {
              takes += 1;
              if (takes === 1) {
                writeFileSync(pidFile, first, 'utf-8');
              }
            }
            return realRename(from, to);
          });
          // While the taken claim is held, a newer record appears at the path.
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from) => {
            if (String(from).endsWith('.taken')) {
              writeFileSync(pidFile, newer, 'utf-8');
            }
            throw errnoError('ENOTSUP');
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await expect(start()).resolves.toBeUndefined();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          } finally {
            linkSpy.mockRestore();
            renameSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(newer);
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should not reclaim an empty record whose age cannot be read', async () => {
          await createExitingBuild();
          await writeFile(pidFile, '', 'utf-8');
          backdate(pidFile, PARTIAL_RECORD_GRACE_MS);
          const realStat = fsp.stat;
          const statSpy = spyOn(fsp, 'stat').mockImplementation((async (
            path: Parameters<typeof realStat>[0],
            options?: Parameters<typeof realStat>[1]
          ) => {
            if (path === pidFile) {
              throw errnoError('EIO');
            }
            return realStat(path, options);
          }) as typeof realStat);
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await expect(start()).resolves.toBeUndefined();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          } finally {
            statSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe('');
        });

        it('should reclaim an empty record older than the grace period', async () => {
          await createExitingBuild();
          await writeFile(pidFile, '', 'utf-8');
          backdate(pidFile, PARTIAL_RECORD_GRACE_MS);

          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });
      });

      describe('claim age limit (a reused starter PID)', () => {
        it('should reclaim a claim older than the limit although its starter PID is alive', async () => {
          await createExitingBuild();
          await writeFile(pidFile, `starting:${process.pid}:reused`, 'utf-8');
          backdate(pidFile, CLAIM_MAX_AGE_MS);

          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should reclaim a claim exactly at the limit', async () => {
          await createExitingBuild();
          await writeFile(pidFile, `starting:${process.pid}:at-limit`, 'utf-8');
          await atAge(pidFile, CLAIM_MAX_AGE_MS, async () => {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should not reclaim a live claim within the limit', async () => {
          await createExitingBuild();
          const claim = `starting:${process.pid}:slow-start`;
          await writeFile(pidFile, claim, 'utf-8');

          await atAge(pidFile, CLAIM_MAX_AGE_MS - 1, async () => {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await expect(start()).resolves.toBeUndefined();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
        });

        it('should report an over-age claim as not running and leave it in place', async () => {
          const claim = `starting:${process.pid}:reused`;
          await writeFile(pidFile, claim, 'utf-8');
          backdate(pidFile, CLAIM_MAX_AGE_MS);
          const killSpy = spyOn(process, 'kill').mockImplementation(fakeKill);
          try {
            expect(await isServeRunning()).toBe(false);
            expect(await stopServe()).toBe(false);
            expect(killSpy).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
          } finally {
            killSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
        });

        it('should never age out a server record', async () => {
          await createExitingBuild();
          await writeFile(pidFile, String(process.pid), 'utf-8');
          backdate(pidFile, CLAIM_MAX_AGE_MS * 10);

          expect(await isServeRunning()).toBe(true);
          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).not.toHaveBeenCalled();
          });
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
        });
      });

      describe('remnants of crashed starts', () => {
        const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
        /** A PID that exists but cannot be signalled (EPERM). */
        const FOREIGN_PID = 1;

        function killWithForeign() {
          return spyOn(process, 'kill').mockImplementation(((pid: number) => {
            if (pid === FOREIGN_PID) {
              throw errnoError('EPERM');
            }
            return fakeKill(pid);
          }) as typeof process.kill);
        }

        it('should remove staged and taken files of dead processes when claiming', async () => {
          await createExitingBuild();
          await writeFile(join(fakeHome, `${PID_FILE_NAME}.${DEAD_PID}.${UUID}.tmp`), 'x', 'utf-8');
          await writeFile(
            join(fakeHome, `${PID_FILE_NAME}.${DEAD_PID}.${UUID}.taken`),
            '1',
            'utf-8'
          );
          const killSpy = killWithForeign();
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            killSpy.mockRestore();
          }
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should keep files of live processes and files outside the exact pattern', async () => {
          await createExitingBuild();
          const kept = [
            `${PID_FILE_NAME}.${process.pid}.${UUID}.tmp`, // live process
            `${PID_FILE_NAME}.${FOREIGN_PID}.${UUID}.taken`, // exists, not signallable
            `${PID_FILE_NAME}.${DEAD_PID}.not-a-uuid.tmp`,
            `${PID_FILE_NAME}.${DEAD_PID}.${UUID}.tmp.bak`,
            `${PID_FILE_NAME}.${DEAD_PID}.${UUID.toUpperCase()}.tmp`,
            `${PID_FILE_NAME}.${DEAD_PID}.${UUID}.log`,
            `x${PID_FILE_NAME}.${DEAD_PID}.${UUID}.tmp`,
            `${PID_FILE_NAME}.0.${UUID}.tmp`,
          ];
          for (const name of kept) {
            await writeFile(join(fakeHome, name), 'x', 'utf-8');
          }
          const killSpy = killWithForeign();
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            killSpy.mockRestore();
          }
          expect((await readdir(fakeHome)).sort()).toEqual([PID_FILE_NAME, ...kept].sort());
        });
      });

      describe('a symbolic link at the PID path', () => {
        it('should reclaim a dangling link without creating its target', async () => {
          await createExitingBuild();
          const target = join(fakeHome, 'missing-target');
          await symlink(target, pidFile);

          await withStubSpawn(STUB_PID, async (spawnSpy) => {
            await start();
            expect(spawnSpy).toHaveBeenCalledTimes(1);
          });
          expect(lstatSync(pidFile).isSymbolicLink()).toBe(false);
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect(existsSync(target)).toBe(false);
          expect(await readdir(fakeHome)).toEqual([PID_FILE_NAME]);
        });

        it('should never delete the link target, even one that appears after the dangling check', async () => {
          await createExitingBuild();
          const target = join(fakeHome, 'racing-target');
          await symlink(target, pidFile);
          const realStat = fsp.stat;
          // The taken link is re-checked; its target appears right after that check.
          const statSpy = spyOn(fsp, 'stat').mockImplementation((async (
            path: Parameters<typeof realStat>[0],
            options?: Parameters<typeof realStat>[1]
          ) => {
            if (String(path).endsWith('.taken')) {
              writeFileSync(target, 'not the serve record', 'utf-8');
              throw errnoError('ENOENT');
            }
            return realStat(path, options);
          }) as typeof realStat);
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            statSpy.mockRestore();
          }
          expect(readFileSync(target, 'utf-8')).toBe('not the serve record');
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
        });

        it('should leave a dangling link alone when only checking or stopping', async () => {
          await symlink(join(fakeHome, 'missing-target'), pidFile);

          expect(await isServeRunning()).toBe(false);
          expect(await stopServe()).toBe(false);
          expect(lstatSync(pidFile).isSymbolicLink()).toBe(true);
        });

        it('should keep a link whose target appears before the link is removed', async () => {
          await createExitingBuild();
          const target = join(fakeHome, 'late-target');
          await symlink(target, pidFile);
          // The target (a live claim) appears after the claim found the link dangling.
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (from === pidFile && String(to).endsWith('.taken')) {
              writeFileSync(target, `starting:${process.pid}:late`, 'utf-8');
            }
            return realRename(from, to);
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          } finally {
            renameSpy.mockRestore();
          }
          expect(readFileSync(target, 'utf-8')).toBe(`starting:${process.pid}:late`);
          expect(readFileSync(pidFile, 'utf-8')).toBe(`starting:${process.pid}:late`);
          // the taken link is not left behind
          expect((await readdir(fakeHome)).sort()).toEqual([PID_FILE_NAME, 'late-target'].sort());
        });

        // #1822 re-review rr-d6: the put-back brings the target's content to the
        // PID path; content that is not a record is reclaimed at once.
        it('should reclaim a put-back target that is not a record, leaving the target intact', async () => {
          await createExitingBuild();
          const target = join(fakeHome, 'user-target');
          await symlink(target, pidFile);
          let once = true;
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (once && from === pidFile && String(to).endsWith('.taken')) {
              once = false;
              writeFileSync(target, 'user data', 'utf-8');
            }
            return realRename(from, to);
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).toHaveBeenCalledTimes(1);
            });
          } finally {
            renameSpy.mockRestore();
          }
          expect(readFileSync(target, 'utf-8')).toBe('user data');
          expect(readFileSync(pidFile, 'utf-8')).toBe(String(STUB_PID));
          expect((await readdir(fakeHome)).sort()).toEqual([PID_FILE_NAME, 'user-target'].sort());
        });

        it('should drop a taken link it cannot put back over a newer record', async () => {
          await createExitingBuild();
          const target = join(fakeHome, 'late-target');
          const newer = `starting:${process.pid}:newer`;
          await symlink(target, pidFile);
          const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (from === pidFile && String(to).endsWith('.taken')) {
              writeFileSync(target, 'user data', 'utf-8'); // no longer dangling -> put back
            }
            return realRename(from, to);
          });
          const linkSpy = spyOn(fsp, 'link').mockImplementation(async (from, to) => {
            if (String(from).endsWith('.taken')) {
              writeFileSync(pidFile, newer, 'utf-8'); // a newer record wins the path
            }
            return realLink(from, to);
          });
          try {
            await withStubSpawn(STUB_PID, async (spawnSpy) => {
              await start();
              expect(spawnSpy).not.toHaveBeenCalled();
            });
          } finally {
            linkSpy.mockRestore();
            renameSpy.mockRestore();
          }
          expect(readFileSync(pidFile, 'utf-8')).toBe(newer);
          expect(readFileSync(target, 'utf-8')).toBe('user data');
          expect((await readdir(fakeHome)).sort()).toEqual([PID_FILE_NAME, 'late-target'].sort());
        });
      });
    });
  });

  describe('PID file time limits', () => {
    // Pins the documented values: the tests import the constants, so they
    // would not notice a change of the limits themselves.
    it('should keep a one-minute claim age limit and a ten-second grace period', () => {
      expect(CLAIM_MAX_AGE_MS).toBe(60_000);
      expect(PARTIAL_RECORD_GRACE_MS).toBe(10_000);
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

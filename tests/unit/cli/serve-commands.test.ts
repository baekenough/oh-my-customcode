/**
 * Unit tests for serve-commands.ts — omcustom serve/serve-stop handlers
 *
 * Coverage targets (lines not covered by web-commands.test.ts):
 *   - serveCommand() invalid port → console.error + process.exit(1)  [lines 29-30]
 *   - serveCommand() foreground mode → runForeground() no-build path  [lines 36-37, 70-75]
 *   - serveStopCommand() not-running path covers the else branch       [line 62]
 *
 * NOTE: Tests that require mocking isServeRunning/stopServe are placed here
 * using state-based approaches (PID file manipulation) to avoid mock.module()
 * cross-test contamination.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveCommand, serveStopCommand } from '../../../src/cli/serve-commands.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

describe('serve-commands.ts', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let emptyTempDir: string;
  let fakeHome: string;
  let pidFile: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    await initI18n('en');
    emptyTempDir = await mkdtemp(join(tmpdir(), 'omcustom-serve-cmd-test-'));
    // serve.ts resolves the PID file from process.env.HOME on every call: point
    // HOME at a per-test temp dir so no test touches the real home.
    fakeHome = await mkdtemp(join(tmpdir(), 'omcustom-serve-cmd-home-'));
    pidFile = join(fakeHome, '.omcustom-serve.pid');
    originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(emptyTempDir, { recursive: true, force: true });
    await rm(fakeHome, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — invalid port validation (lines 29-30)
  // ---------------------------------------------------------------------------

  describe('serveCommand() — invalid port', () => {
    it('should call process.exit(1) when port is non-numeric', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(serveCommand({ port: 'abc' })).rejects.toThrow('process.exit called');

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain('abc');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should call process.exit(1) when port is 0', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(serveCommand({ port: '0' })).rejects.toThrow('process.exit called');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should call process.exit(1) when port exceeds 65535', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(serveCommand({ port: '99999' })).rejects.toThrow('process.exit called');
      } finally {
        processExitSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — foreground mode (lines 36-37, 70-75)
  // runForeground() exits when build dir is not found.
  // ---------------------------------------------------------------------------

  describe('serveCommand() — foreground mode', () => {
    it('should call process.exit(1) when foreground mode has no build dir', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(
          serveCommand({ port: '4321', foreground: true, _projectRoot: emptyTempDir })
        ).rejects.toThrow('process.exit called');

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain('build');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should run spawnSync when build directory exists in foreground mode', async () => {
      // Create a fake build dir with index.js that exits immediately
      const fakeBuildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(fakeBuildDir, { recursive: true });
      await writeFile(join(fakeBuildDir, 'index.js'), 'process.exit(0);', 'utf-8');

      // spawnSync will run node index.js which exits immediately
      await serveCommand({ port: '4321', foreground: true, _projectRoot: emptyTempDir });

      const logOutput = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(logOutput).toContain('4321');
    });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — failure path: server does not start (line 49-51)
  // startServeBackground silently skips when build dir is missing,
  // so isServeRunning returns false → failure path with process.exit(1)
  // ---------------------------------------------------------------------------

  describe('serveCommand() — failure path (no build dir)', () => {
    it('should call process.exit(1) when server fails to start (no build)', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        // With no build dir, startServeBackground is a no-op, isServeRunning→false → exit(1)
        await expect(serveCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit called'
        );

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput.length).toBeGreaterThan(0);
      } finally {
        processExitSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — the server's PID cannot be recorded (#1795 F2/F5)
  // A build IS present in these tests, so the generic "failed" path (no build)
  // cannot be what produces the exit.
  // ---------------------------------------------------------------------------

  describe('serveCommand() — PID file cannot be recorded', () => {
    async function createBuild(): Promise<void> {
      const buildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);', 'utf-8');
    }

    it('should explain the unresolvable home, not spawn, and exit 1 when HOME is relative', async () => {
      await createBuild();
      const spawnSpy = spyOn(childProcess, 'spawn');
      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      const originalCwd = process.cwd();
      process.chdir(emptyTempDir); // a relative HOME could only resolve under this temp dir
      process.env.HOME = 'rel-home';

      try {
        await expect(serveCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain(i18n.t('cli.web.start.homeUnresolved'));
        expect(errorOutput).not.toContain(i18n.t('cli.web.start.failed'));
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        process.chdir(originalCwd);
        processExitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
    });

    it('should name the unusable PID file, not spawn, and exit 1 (ENOTDIR, root-safe)', async () => {
      await createBuild();
      const spawnSpy = spyOn(childProcess, 'spawn');
      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      // A regular file in the home path fails with ENOTDIR for every user, root included
      const blocker = join(fakeHome, 'blocker');
      await writeFile(blocker, '', 'utf-8');
      process.env.HOME = join(blocker, 'home');

      try {
        await expect(serveCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain(join(blocker, 'home', '.omcustom-serve.pid'));
        expect(errorOutput).toContain('ENOTDIR');
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        processExitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
    });

    it('should report the generic start failure, not crash, when spawn fails asynchronously', async () => {
      await createBuild();
      const failedChild = Object.assign(new EventEmitter(), { pid: undefined, unref: () => {} });
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(() => {
        process.nextTick(() => failedChild.emit('error', new Error('spawn node ENOENT')));
        return failedChild as unknown as ChildProcess;
      });
      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });

      try {
        await expect(serveCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );
        await new Promise((resolve) => setImmediate(resolve)); // let the error fire

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain(i18n.t('cli.web.start.failed'));
        expect(failedChild.listenerCount('error')).toBeGreaterThan(0);
      } finally {
        processExitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
    });

    it('should rethrow an unrelated start failure without exiting', async () => {
      await createBuild();
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(() => {
        throw new Error('spawn exploded');
      });
      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });

      try {
        await expect(serveCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'spawn exploded'
        );
        expect(processExitSpy).not.toHaveBeenCalled();
      } finally {
        processExitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — success path (lines 44-47)
  // Write current PID to PID file before calling serveCommand so that
  // isServeRunning() returns true → success path with console.log
  // ---------------------------------------------------------------------------

  describe('serveCommand() — success path (server already running)', () => {
    it('should say a server is already running, without claiming the requested port', async () => {
      // Write current process PID so the PID file holds a live server record
      await writeFile(pidFile, String(process.pid), 'utf-8');
      // A build in a temp project root (never the real packages/serve/build): if
      // the "already running" short-circuit regressed, only this exiting stub
      // could be spawned — and the spy below would catch it.
      const buildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);', 'utf-8');
      const spawnSpy = spyOn(childProcess, 'spawn');

      try {
        await serveCommand({ port: '4321', _projectRoot: emptyTempDir });

        const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logOutput).toContain(i18n.t('cli.web.start.alreadyRunning', { pid: process.pid }));
        expect(logOutput).not.toContain('4321');
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        spawnSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // serveCommand — only a start this call performed is reported as started (#1825)
  // ---------------------------------------------------------------------------

  describe('serveCommand() — what is reported for each start outcome (#1825)', () => {
    const FOREIGN_PID = 424243;

    async function createBuild(): Promise<void> {
      const buildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);', 'utf-8');
    }

    /** A `spawn` stand-in whose child is never a real process; its PID is this test process. */
    function stubSpawn() {
      return spyOn(childProcess, 'spawn').mockImplementation((() =>
        Object.assign(new EventEmitter(), {
          pid: process.pid,
          unref: () => {},
          kill: () => true,
        })) as unknown as typeof childProcess.spawn);
    }

    function logged(): string {
      return consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    }

    it('should report started on the requested port when this call started the server', async () => {
      await createBuild();
      const spawnSpy = stubSpawn();
      try {
        await serveCommand({ port: '4555', _projectRoot: emptyTempDir });
        expect(spawnSpy).toHaveBeenCalledTimes(1);
      } finally {
        spawnSpy.mockRestore();
      }
      expect(logged()).toBe(i18n.t('cli.web.start.started', { port: 4555 }));
      expect(readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
    });

    it.each([
      'en',
      'ko',
    ] as const)('should report an already-running server (EPERM record) with its PID in %s, exit 0, no port', async (locale) => {
      await initI18n(locale);
      await createBuild();
      await writeFile(pidFile, String(FOREIGN_PID), 'utf-8');
      const killSpy = spyOn(process, 'kill').mockImplementation(((pid: number) => {
        if (pid === FOREIGN_PID) {
          throw Object.assign(new Error('EPERM: injected'), { code: 'EPERM' });
        }
        return true;
      }) as typeof process.kill);
      const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      const spawnSpy = stubSpawn();
      // rendered in the locale under test, before it is reset
      let expected = '';
      let plain = '';
      try {
        await serveCommand({ port: '4555', _projectRoot: emptyTempDir });
        expect(spawnSpy).not.toHaveBeenCalled();
        expect(exitSpy).not.toHaveBeenCalled();
        expected = i18n.t('cli.web.start.alreadyRunningNotPermitted', {
          pid: FOREIGN_PID,
          path: pidFile,
        });
        plain = i18n.t('cli.web.start.alreadyRunning', { pid: FOREIGN_PID });
      } finally {
        spawnSpy.mockRestore();
        exitSpy.mockRestore();
        killSpy.mockRestore();
        await initI18n('en');
      }
      const out = logged();
      // #1825 review M2: the user learns the PID is another user's and how to clear a stale record
      expect(out).toBe(expected);
      expect(out).toContain(pidFile);
      expect(out).not.toBe(plain);
      expect(out).not.toContain('4555');
      expect(out).not.toContain('{{');
      expect(out).not.toContain('cli.web.start');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(readFileSync(pidFile, 'utf-8')).toBe(String(FOREIGN_PID));
    });

    it.each([
      'en',
      'ko',
    ] as const)('should report a start in progress elsewhere in %s, exit 0, no port', async (locale) => {
      await initI18n(locale);
      await createBuild();
      const claim = `starting:${process.pid}:other-start`;
      await writeFile(pidFile, claim, 'utf-8');
      const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      const spawnSpy = stubSpawn();
      try {
        await serveCommand({ port: '4555', _projectRoot: emptyTempDir });
        expect(spawnSpy).not.toHaveBeenCalled();
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        spawnSpy.mockRestore();
        exitSpy.mockRestore();
        await initI18n('en');
      }
      const out = logged();
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toContain('4555');
      expect(out).not.toContain('{{');
      expect(out).not.toContain('cli.web.start');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(readFileSync(pidFile, 'utf-8')).toBe(claim);
    });

    it('should distinguish the already-running message from the in-progress one', async () => {
      expect(i18n.t('cli.web.start.alreadyRunning', { pid: 1 })).not.toBe(
        i18n.t('cli.web.start.startingElsewhere')
      );
    });

    // #1825 review M5 / A2: "started" needs the server this call spawned to be
    // the live record — a child that died at once, or whose record another
    // start took over, is a failed start.
    it('should fail, not report started, when the spawned server exited at once', async () => {
      await createBuild();
      const DEAD_PID = 999999990; // not a running process
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() =>
        Object.assign(new EventEmitter(), {
          pid: DEAD_PID,
          unref: () => {},
          kill: () => true,
        })) as unknown as typeof childProcess.spawn);
      const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      try {
        await expect(serveCommand({ port: '4555', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );
      } finally {
        exitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
      expect(logged()).toBe('');
      const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errorOutput).toContain(i18n.t('cli.web.start.failed'));
    });

    it.each([
      ['a live start in progress', `starting:${process.pid}:other-start`],
      ['another running server', String(process.pid)],
    ])('should fail, not report started, when %s took the record of a server that died at once', async (_, other) => {
      await createBuild();
      const DEAD_PID = 999999990;
      const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation((() =>
        Object.assign(new EventEmitter(), {
          pid: DEAD_PID,
          unref: () => {},
          kill: () => true,
        })) as unknown as typeof childProcess.spawn);
      // right after this call records its (dead) server, another start replaces the record
      const realRename = fsp.rename;
      const renameSpy = spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
        await realRename(from, to);
        if (to === pidFile) {
          writeFileSync(pidFile, other, 'utf-8');
        }
      });
      const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      try {
        await expect(serveCommand({ port: '4555', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );
      } finally {
        exitSpy.mockRestore();
        renameSpy.mockRestore();
        spawnSpy.mockRestore();
      }
      expect(logged()).toBe('');
      expect(readFileSync(pidFile, 'utf-8')).toBe(other);
    });

    it('should report "started" exactly once when two starts with different ports race', async () => {
      await createBuild();
      // Hold both starts at the writability check until both have passed the
      // running check and found nothing running.
      let arrived = 0;
      let releaseBoth: () => void = () => {};
      const bothArrived = new Promise<void>((resolve) => {
        releaseBoth = resolve;
      });
      const realAccess = fsp.access;
      const accessSpy = spyOn(fsp, 'access').mockImplementation(async (path, mode) => {
        arrived += 1;
        if (arrived === 2) {
          releaseBoth();
        }
        await bothArrived;
        return realAccess(path, mode);
      });
      const spawnSpy = stubSpawn();
      const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      try {
        await Promise.all([
          serveCommand({ port: '4001', _projectRoot: emptyTempDir }),
          serveCommand({ port: '4002', _projectRoot: emptyTempDir }),
        ]);
        expect(arrived).toBe(2);
        expect(spawnSpy).toHaveBeenCalledTimes(1);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
        spawnSpy.mockRestore();
        accessSpy.mockRestore();
      }
      const lines = consoleLogSpy.mock.calls.map((c) => c.join(' '));
      expect(lines).toHaveLength(2);
      const started = lines.filter(
        (l) =>
          l === i18n.t('cli.web.start.started', { port: 4001 }) ||
          l === i18n.t('cli.web.start.started', { port: 4002 })
      );
      expect(started).toHaveLength(1);
      const other = lines.find((l) => !started.includes(l));
      expect([
        i18n.t('cli.web.start.alreadyRunning', { pid: process.pid }),
        i18n.t('cli.web.start.startingElsewhere'),
      ]).toContain(other as string);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(readFileSync(pidFile, 'utf-8')).toBe(String(process.pid));
    });
  });

  // ---------------------------------------------------------------------------
  // Locale placeholders of the messages added for #1795: a typo such as
  // `{{paht}}` in one locale renders literally instead of failing loudly.
  // ---------------------------------------------------------------------------

  describe('PID-file message placeholders', () => {
    const KEYS = [
      'homeUnresolved',
      'pidNotWritable',
      'alreadyRunning',
      'alreadyRunningNotPermitted',
      'startingElsewhere',
    ] as const;

    function startMessages(locale: 'en' | 'ko'): Record<string, string> {
      const path = join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'src',
        'i18n',
        'locales',
        `${locale}.json`
      );
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
        cli: { web: { start: Record<string, string> } };
      };
      return parsed.cli.web.start;
    }

    function placeholders(message: string | undefined): string[] {
      return [...(message ?? '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? '').sort();
    }

    it.each(KEYS)('should use the same placeholders in en and ko for %s', (key) => {
      const en = startMessages('en')[key];
      const ko = startMessages('ko')[key];
      expect(en).toBeDefined();
      expect(ko).toBeDefined();
      expect(placeholders(ko)).toEqual(placeholders(en));
    });

    it.each([
      'en',
      'ko',
    ] as const)('should leave no unsubstituted placeholder in %s', async (locale) => {
      await initI18n(locale);
      const rendered = [
        i18n.t('cli.web.start.homeUnresolved'),
        i18n.t('cli.web.start.pidNotWritable', {
          path: '/abs/.omcustom-serve.pid',
          error: 'EISDIR',
        }),
      ];
      for (const message of rendered) {
        expect(message).not.toContain('{{');
        expect(message).not.toContain('cli.web.start');
      }
      expect(rendered[1]).toContain('/abs/.omcustom-serve.pid');
      expect(rendered[1]).toContain('EISDIR');
    });
  });

  // ---------------------------------------------------------------------------
  // serveStopCommand — stopped path (line 60) and not-running path (line 62)
  // ---------------------------------------------------------------------------

  describe('serveStopCommand()', () => {
    it('should log a not-running message when server is not running', async () => {
      // No PID file → stopServe returns false → else branch (line 62)
      await serveStopCommand();

      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    });

    // #1825: a recorded process that exists but cannot be signalled (EPERM) is
    // reported as running by `web status`, so `web stop` must not say it is not
    // running, and must not crash with a stack trace either.
    it.each([
      'en',
      'ko',
    ])('should explain an EPERM stop failure in %s and exit 1 without crashing', async (lang) => {
      await initI18n(lang);
      const foreignPid = 424243;
      await writeFile(pidFile, String(foreignPid), 'utf-8');
      const killSpy = spyOn(process, 'kill').mockImplementation(((pid: number) => {
        if (pid === foreignPid) {
          throw Object.assign(new Error('EPERM: injected'), { code: 'EPERM' });
        }
        return true;
      }) as typeof process.kill);
      const exitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });
      try {
        await expect(serveStopCommand()).rejects.toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
        killSpy.mockRestore();
        await initI18n('en'); // do not leak the locale into other tests
      }
      const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errorOutput).toContain(String(foreignPid));
      expect(errorOutput).toContain(pidFile);
      expect(errorOutput).not.toContain('{{');
      expect(errorOutput).not.toContain('cli.web.stop');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(readFileSync(pidFile, 'utf-8')).toBe(String(foreignPid));
    });

    it('should log a stopped message when a running process is stopped', async () => {
      // Mock process.kill so it doesn't actually signal anything
      const killSpy = spyOn(process, 'kill').mockImplementation(() => true);

      try {
        // Write a valid PID (current process) — process.kill is mocked so no signal sent
        await writeFile(pidFile, String(process.pid), 'utf-8');

        await serveStopCommand();

        // stopServe returns true → console.log stopped message (line 60)
        const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logOutput).toContain('stopped');
      } finally {
        killSpy.mockRestore();
      }
    });
  });
});

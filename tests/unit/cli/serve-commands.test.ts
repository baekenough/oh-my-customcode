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
import { readFileSync } from 'node:fs';
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
    it('should log the started message when isServeRunning returns true', async () => {
      // Write current process PID so isServeRunning() → true
      await writeFile(pidFile, String(process.pid), 'utf-8');
      // A build in a temp project root (never the real packages/serve/build): if
      // the "already running" short-circuit regressed, only this exiting stub
      // could be spawned — and the spy below would catch it.
      const buildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);', 'utf-8');
      const spawnSpy = spyOn(childProcess, 'spawn');

      try {
        // startServeBackground short-circuits (already running), then
        // isServeRunning() returns true → console.log started message
        await serveCommand({ port: '4321', _projectRoot: emptyTempDir });

        const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logOutput).toContain('4321');
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        spawnSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Locale placeholders of the messages added for #1795: a typo such as
  // `{{paht}}` in one locale renders literally instead of failing loudly.
  // ---------------------------------------------------------------------------

  describe('PID-file message placeholders', () => {
    const KEYS = ['homeUnresolved', 'pidNotWritable'] as const;

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

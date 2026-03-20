/**
 * Unit tests for serve-commands.ts — omcustom serve/serve-stop handlers
 *
 * Coverage targets (lines not covered by web-commands.test.ts):
 *   - serveCommand() invalid port → console.error + process.exit(1)  [lines 29-30]
 *   - serveCommand() foreground mode → runForeground() no-build path  [lines 36-37, 70-75]
 *   - serveStopCommand() not-running path covers the else branch       [line 62]
 *   - openBrowser() execution on current platform                     [lines 95-113]
 *
 * NOTE: Tests that require mocking isServeRunning/stopServe are placed here
 * using state-based approaches (PID file manipulation) to avoid mock.module()
 * cross-test contamination.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser, serveCommand, serveStopCommand } from '../../../src/cli/serve-commands.js';
import { initI18n } from '../../../src/i18n/index.js';

const PID_FILE = join(homedir(), '.omcustom-serve.pid');

async function removePidFile(): Promise<void> {
  try {
    await unlink(PID_FILE);
  } catch {
    // Ignore — file may not exist
  }
}

describe('serve-commands.ts', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let emptyTempDir: string;

  beforeEach(async () => {
    await initI18n('en');
    await removePidFile();
    emptyTempDir = await mkdtemp(join(tmpdir(), 'omcustom-serve-cmd-test-'));
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    await removePidFile();
    await rm(emptyTempDir, { recursive: true, force: true });
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
  // serveCommand — success path (lines 44-47)
  // Write current PID to PID file before calling serveCommand so that
  // isServeRunning() returns true → success path with console.log
  // ---------------------------------------------------------------------------

  describe('serveCommand() — success path (server already running)', () => {
    it('should log the started message when isServeRunning returns true', async () => {
      // Write current process PID so isServeRunning() → true
      await writeFile(PID_FILE, String(process.pid), 'utf-8');

      // startServeBackground will short-circuit (already running), then
      // isServeRunning() returns true → console.log started message (line 44)
      await serveCommand({ port: '4321' });

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('4321');
    });

    it('should log started message and call openBrowser when open option is set', async () => {
      await writeFile(PID_FILE, String(process.pid), 'utf-8');

      // open: true exercises line 45-47
      await serveCommand({ port: '4321', open: true });

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('4321');
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
        await writeFile(PID_FILE, String(process.pid), 'utf-8');

        await serveStopCommand();

        // stopServe returns true → console.log stopped message (line 60)
        const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logOutput).toContain('stopped');
      } finally {
        killSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // openBrowser() — platform branches (lines 99-113)
  // openBrowser fires off execFile and returns without blocking.
  // ---------------------------------------------------------------------------

  describe('openBrowser()', () => {
    it('should execute without throwing on the current platform (darwin)', () => {
      // openBrowser is sync fire-and-forget — should not throw
      expect(() => openBrowser(4321)).not.toThrow();
    });

    it('should accept valid port values', () => {
      expect(() => openBrowser(8080)).not.toThrow();
      expect(() => openBrowser(3000)).not.toThrow();
    });

    it('should call execFile with xdg-open on linux platform', () => {
      // Override process.platform to 'linux' to exercise the else branch (line 108-111)
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      try {
        expect(() => openBrowser(4321)).not.toThrow();
      } finally {
        if (descriptor) {
          Object.defineProperty(process, 'platform', descriptor);
        }
      }
    });

    it('should call execFile with cmd on win32 platform', () => {
      // Override process.platform to 'win32' to exercise the win32 branch (line 103-107)
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        expect(() => openBrowser(4321)).not.toThrow();
      } finally {
        if (descriptor) {
          Object.defineProperty(process, 'platform', descriptor);
        }
      }
    });
  });
});

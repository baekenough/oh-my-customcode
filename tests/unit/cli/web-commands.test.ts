/**
 * Unit tests for web-commands.ts — omcustom web subcommand handlers
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  webOpenCommand,
  webStartCommand,
  webStatusCommand,
  webStopCommand,
} from '../../../src/cli/web-commands.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

describe('web-commands.ts', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let emptyTempDir: string;
  let fakeHome: string;
  let pidFile: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    await initI18n('en');
    emptyTempDir = await mkdtemp(join(tmpdir(), 'omcustom-web-cmd-test-'));
    // serve.ts resolves the PID file from process.env.HOME on every call: point
    // HOME at a per-test temp dir so no test touches the real home.
    fakeHome = await mkdtemp(join(tmpdir(), 'omcustom-web-cmd-home-'));
    pidFile = join(fakeHome, '.omcustom-serve.pid');
    originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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
  // webStatusCommand
  // ---------------------------------------------------------------------------

  describe('webStatusCommand', () => {
    it('should print "not running" message when no PID file exists', async () => {
      await webStatusCommand();

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('not running');
    });

    it('should print the start hint when server is not running', async () => {
      await webStatusCommand();

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('omcustom web start');
    });

    it('should print "running" message with URL when server is running', async () => {
      // Write current process PID to fake a running server
      await writeFile(pidFile, String(process.pid), 'utf-8');

      await webStatusCommand();

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('running');
      expect(logOutput).toContain('localhost');
    });

    it('should use OMCUSTOM_PORT env var in the running URL when set', async () => {
      const origPort = process.env.OMCUSTOM_PORT;
      process.env.OMCUSTOM_PORT = '9876';

      try {
        await writeFile(pidFile, String(process.pid), 'utf-8');
        await webStatusCommand();

        const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logOutput).toContain('9876');
      } finally {
        if (origPort === undefined) {
          delete process.env.OMCUSTOM_PORT;
        } else {
          process.env.OMCUSTOM_PORT = origPort;
        }
      }
    });

    it('should call console.log exactly twice when server is not running', async () => {
      await webStatusCommand();

      // One line for "not running", one line for the start hint
      expect(consoleLogSpy.mock.calls.length).toBe(2);
    });

    it('should call console.log exactly once when server is running', async () => {
      await writeFile(pidFile, String(process.pid), 'utf-8');

      await webStatusCommand();

      expect(consoleLogSpy.mock.calls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // webStopCommand
  // ---------------------------------------------------------------------------

  describe('webStopCommand', () => {
    it('should print "not running" message when no PID file exists', async () => {
      await webStopCommand();

      const logOutput = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logOutput).toContain('not running');
    });
  });

  // ---------------------------------------------------------------------------
  // webOpenCommand
  // ---------------------------------------------------------------------------

  describe('webOpenCommand', () => {
    it('should call process.exit(1) when port is non-numeric', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(webOpenCommand({ port: 'not-a-port' })).rejects.toThrow('process.exit called');

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain('not-a-port');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should call process.exit(1) when port is out of range (> 65535)', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(webOpenCommand({ port: '99999' })).rejects.toThrow('process.exit called');

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain('99999');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should call process.exit(1) when port is 0', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(webOpenCommand({ port: '0' })).rejects.toThrow('process.exit called');
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should warn when server does not appear to be running', async () => {
      // No PID file → not running
      await webOpenCommand({ port: '4321' });

      const warnOutput = consoleWarnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(warnOutput).toContain('not');
    });

    it('should not warn when server is running', async () => {
      await writeFile(pidFile, String(process.pid), 'utf-8');

      await webOpenCommand({ port: '4321' });

      expect(consoleWarnSpy.mock.calls.length).toBe(0);
    });

    it('should use DEFAULT_PORT (4321) when no port option is provided', async () => {
      // Should not throw for a valid default port
      await expect(webOpenCommand({})).resolves.toBeUndefined();
    });

    it('should accept valid port in range (1–65535)', async () => {
      await expect(webOpenCommand({ port: '8080' })).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // webStartCommand
  // ---------------------------------------------------------------------------

  describe('webStartCommand', () => {
    it('should explain the unresolvable home and not spawn when HOME is relative', async () => {
      const buildDir = join(emptyTempDir, 'packages', 'serve', 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'index.js'), 'process.exit(0);', 'utf-8');
      const spawnSpy = spyOn(childProcess, 'spawn');
      const processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });
      const originalCwd = process.cwd();
      process.chdir(emptyTempDir); // a relative HOME could only resolve under this temp dir
      process.env.HOME = 'rel-home';

      try {
        await expect(webStartCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit(1)'
        );

        const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errorOutput).toContain(i18n.t('cli.web.start.homeUnresolved'));
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        process.chdir(originalCwd);
        processExitSpy.mockRestore();
        spawnSpy.mockRestore();
      }
    });

    it('should fail with process.exit(1) when no build directory exists', async () => {
      // serveCommand → startServeBackground (no build) → isServeRunning → false → exit(1)
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await expect(webStartCommand({ port: '4321', _projectRoot: emptyTempDir })).rejects.toThrow(
          'process.exit called'
        );
      } finally {
        processExitSpy.mockRestore();
      }
    });

    it('should print an error message when server fails to start', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await webStartCommand({ port: '4321', _projectRoot: emptyTempDir }).catch(() => {});
      } finally {
        processExitSpy.mockRestore();
      }

      const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errorOutput).toContain('Failed');
    });

    it('should pass port option through to the underlying serveCommand', async () => {
      const processExitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => {
        throw new Error('process.exit called');
      });

      try {
        await webStartCommand({ port: '9000', _projectRoot: emptyTempDir }).catch(() => {});
      } finally {
        processExitSpy.mockRestore();
      }

      // serveCommand reports the error — verifies the delegation path ran
      const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errorOutput.length).toBeGreaterThan(0);
    });
  });
});

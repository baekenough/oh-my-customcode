/**
 * Tests for autoSelfUpdate (#1946): `init` and `update` update the CLI before doing any work,
 * without a prompt, with a fresh npm query, and re-run on the verified new binary.
 *
 * Every side effect (npm lookup, install, spawn, exit) is injected, so no real CLI is run.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  type AutoSelfUpdateOptions,
  autoSelfUpdate,
  isNpxInvocation,
  isPathInside,
  shouldSkipAutoSelfUpdate,
} from '../../../src/core/self-update.js';
import { initI18n } from '../../../src/i18n/index.js';
import { isCiEnvironment } from '../../../src/utils/ci.js';

const PKG = 'test-package';
const ENTRY = '/fake/prefix/lib/node_modules/test-package/dist/cli/index.js';
const ENTRY_DIR = dirname(ENTRY);
const GLOBAL_ROOT = '/fake/prefix/lib/node_modules';

/** package.json reader: the binary at ENTRY belongs to PKG at `version`. */
function binaryReader(version: string | null) {
  return (path: string): string => {
    if (version !== null && path === join(ENTRY_DIR, 'package.json')) {
      return JSON.stringify({ name: PKG, version });
    }
    throw new Error(`ENOENT: ${path}`);
  };
}

describe('autoSelfUpdate (#1946)', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;
  let originalStdinTTY: boolean | undefined;
  let originalStdoutTTY: boolean | undefined;
  const install = mock((_name: string, _version: string): void => {});
  const spawn = mock((_cmd: string, _args: string[], _opts: unknown) => ({
    status: 0 as number | null,
    signal: null as NodeJS.Signals | null,
    error: undefined as Error | undefined,
  }));
  const exit = mock((_code: number): void => {});
  const fetchLatest = mock((_name: string): string | null => '1.5.0');
  const probe = mock(
    (_cmd: string, _args: string[], _env: NodeJS.ProcessEnv): string | null => '1.5.0'
  );

  beforeAll(async () => {
    await initI18n('en');
  });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omcustom-auto-self-update-'));
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    originalStdinTTY = process.stdin.isTTY;
    originalStdoutTTY = process.stdout.isTTY;
    install.mockReset();
    spawn.mockReset();
    spawn.mockImplementation(() => ({ status: 0, signal: null, error: undefined }));
    exit.mockReset();
    fetchLatest.mockReset();
    probe.mockReset();
    probe.mockImplementation(() => '1.5.0');
    fetchLatest.mockImplementation(() => '1.5.0');
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    setTty(originalStdinTTY, originalStdoutTTY);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function setTty(stdin: boolean | undefined, stdout: boolean | undefined): void {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: stdin,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: stdout,
      writable: true,
      configurable: true,
    });
  }

  function options(overrides: Partial<AutoSelfUpdateOptions> = {}): AutoSelfUpdateOptions {
    return {
      currentVersion: '1.0.0',
      command: 'init',
      packageName: PKG,
      cachePath: join(tempDir, 'cache.json'),
      argv: ['node', ENTRY, 'init', '--yes'],
      env: {},
      fetchLatestVersion: fetchLatest,
      deps: {
        installFn: install,
        spawnFn: spawn,
        exitFn: exit,
        realpathFn: (p) => p,
        readFileFn: binaryReader('1.5.0'),
        globalRootFn: () => GLOBAL_ROOT,
        probeFn: probe,
      },
      ...overrides,
    };
  }

  function warnings(): string {
    return warnSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
  }

  describe('latest version installed, verified and re-run', () => {
    it('installs without a prompt in a TTY session, verifies the binary and re-runs it', () => {
      setTty(true, true);

      expect(autoSelfUpdate(options())).toBe('relaunched');

      expect(install).toHaveBeenCalledTimes(1);
      expect(install).toHaveBeenCalledWith(PKG, '1.5.0');
      expect(spawn).toHaveBeenCalledTimes(1);
      const [command, args, spawnOptions] = spawn.mock.calls[0] as [
        string,
        string[],
        { stdio: string; env: NodeJS.ProcessEnv },
      ];
      expect(command).toBe(process.execPath);
      expect(args).toEqual([ENTRY, 'init', '--yes']);
      expect(spawnOptions.stdio).toBe('inherit');
      expect(spawnOptions.env.OMCUSTOM_SKIP_SELF_UPDATE).toBe('true');
      expect(exit).toHaveBeenCalledWith(0);
    });

    it('does the same in a non-interactive session (no TTY)', () => {
      setTty(false, false);

      expect(autoSelfUpdate(options())).toBe('relaunched');

      expect(install).toHaveBeenCalledWith(PKG, '1.5.0');
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    });

    it('uses the update command name and exits with the child exit code', () => {
      spawn.mockImplementation(() => ({ status: 3, signal: null, error: undefined }));

      expect(
        autoSelfUpdate(options({ command: 'update', argv: ['node', ENTRY, 'update', '--all'] }))
      ).toBe('relaunched');

      const args = (spawn.mock.calls[0] as [string, string[]])[1];
      expect(args).toEqual([ENTRY, 'update', '--all']);
      expect(logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).toContain(
        'omcustom update'
      );
      expect(exit).toHaveBeenCalledWith(3);
    });

    it('maps a child killed by a signal to 128 + signal number', () => {
      spawn.mockImplementation(() => ({ status: null, signal: 'SIGTERM', error: undefined }));

      autoSelfUpdate(options());

      expect(exit).toHaveBeenCalledWith(143);
    });
  });

  describe('fresh npm query (no cache)', () => {
    it('queries npm even when the cache holds a fresh entry', () => {
      const now = Date.now();
      writeFileSync(
        join(tempDir, 'cache.json'),
        JSON.stringify({ checkedAt: new Date(now).toISOString(), latestVersion: '1.0.0' })
      );

      expect(autoSelfUpdate(options({ now }))).toBe('relaunched');

      expect(fetchLatest).toHaveBeenCalledTimes(1);
      expect(install).toHaveBeenCalledWith(PKG, '1.5.0');
    });

    it('negative: a cached latest equal to the current version does not hide a newer release', () => {
      const now = Date.now();
      writeFileSync(
        join(tempDir, 'cache.json'),
        JSON.stringify({ checkedAt: new Date(now).toISOString(), latestVersion: '1.0.0' })
      );
      fetchLatest.mockImplementation(() => '1.0.0');

      expect(autoSelfUpdate(options({ now }))).toBe('up-to-date');

      expect(fetchLatest).toHaveBeenCalledTimes(1);
      expect(install).not.toHaveBeenCalled();
    });
  });

  describe('up to date', () => {
    it('does nothing when npm reports the current version', () => {
      fetchLatest.mockImplementation(() => '1.0.0');

      expect(autoSelfUpdate(options())).toBe('up-to-date');

      expect(install).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not downgrade when the current version is newer than npm latest', () => {
      fetchLatest.mockImplementation(() => '0.9.0');

      expect(autoSelfUpdate(options())).toBe('up-to-date');

      expect(install).not.toHaveBeenCalled();
    });
  });

  describe('skip conditions', () => {
    const cases: [string, Partial<AutoSelfUpdateOptions>][] = [
      ['skip option (--skip-version-check via preAction)', { skip: true }],
      ['--skip-version-check in argv', { argv: ['node', ENTRY, 'update', '--skip-version-check'] }],
      ['--skip-self in argv', { argv: ['node', ENTRY, 'init', '--skip-self'] }],
      ['OMCUSTOM_SKIP_SELF_UPDATE=true', { env: { OMCUSTOM_SKIP_SELF_UPDATE: 'true' } }],
      ['CI=true', { env: { CI: 'true' } }],
      ['GITHUB_ACTIONS=true', { env: { GITHUB_ACTIONS: 'true' } }],
      ['CI=1', { env: { CI: '1' } }],
      ['CI=True', { env: { CI: 'True' } }],
      ['CI=woodpecker', { env: { CI: 'woodpecker' } }],
      ['TF_BUILD=True', { env: { TF_BUILD: 'True' } }],
    ];

    for (const [name, overrides] of cases) {
      it(`skips without querying npm: ${name}`, () => {
        expect(autoSelfUpdate(options(overrides))).toBe('skipped');

        expect(fetchLatest).not.toHaveBeenCalled();
        expect(install).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
      });
    }

    const notSkipping: [string, NodeJS.ProcessEnv][] = [
      ['CI=false', { CI: 'false' }],
      ['CI=0', { CI: '0' }],
      ['OMCUSTOM_SKIP_SELF_UPDATE=false', { OMCUSTOM_SKIP_SELF_UPDATE: 'false' }],
      ['GITHUB_ACTIONS=false', { GITHUB_ACTIONS: 'false' }],
      ['TF_BUILD=false', { TF_BUILD: 'false' }],
      ['CI= (empty)', { CI: '' }],
    ];

    for (const [name, env] of notSkipping) {
      it(`negative: ${name} does not skip`, () => {
        expect(shouldSkipAutoSelfUpdate({ argv: ['node', ENTRY, 'init'], env })).toBe(false);
        expect(autoSelfUpdate(options({ env }))).toBe('relaunched');
        expect(fetchLatest).toHaveBeenCalledTimes(1);
      });
    }

    it('reads process.argv and process.env when none are given', () => {
      expect(shouldSkipAutoSelfUpdate({})).toBe(
        process.argv.includes('--skip-version-check') ||
          process.argv.includes('--skip-self') ||
          process.env.OMCUSTOM_SKIP_SELF_UPDATE === 'true' ||
          isCiEnvironment(process.env)
      );
    });
  });

  describe('binary verification failure', () => {
    it('does not re-run when the running binary is a different version, and continues', () => {
      const result = autoSelfUpdate(
        options({
          deps: { ...options().deps, readFileFn: binaryReader('1.0.0') },
        })
      );

      expect(result).toBe('failed');
      expect(install).toHaveBeenCalledTimes(1);
      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(warnings()).toContain('1.5.0');
      expect(warnings()).toContain('1.0.0');
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
    });

    it('does not re-run when the binary version cannot be determined', () => {
      const result = autoSelfUpdate(
        options({
          deps: { ...options().deps, readFileFn: binaryReader(null) },
        })
      );

      expect(result).toBe('failed');
      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
    });

    it('does not re-run when argv has no entry path', () => {
      expect(autoSelfUpdate(options({ argv: ['node'] }))).toBe('failed');

      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    });

    it('continues when the verified binary cannot be started', () => {
      spawn.mockImplementation(() => ({
        status: null,
        signal: null,
        error: new Error('spawn EACCES'),
      }));

      expect(autoSelfUpdate(options())).toBe('failed');

      expect(exit).not.toHaveBeenCalled();
      expect(warnings()).toContain('spawn EACCES');
    });
  });

  describe('npx invocation', () => {
    const npxArgv = ['node', '/home/u/.npm/_npx/abc/node_modules/.bin/omcustom', 'init', '--yes'];

    it('re-runs through npx -y <package>@latest with the same arguments and does not install', () => {
      spawn.mockImplementation(() => ({ status: 2, signal: null, error: undefined }));

      expect(autoSelfUpdate(options({ argv: npxArgv }))).toBe('relaunched');

      expect(install).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(1);
      const [command, args, spawnOptions] = spawn.mock.calls[0] as [
        string,
        string[],
        { env: NodeJS.ProcessEnv },
      ];
      expect(command).toBe('npx');
      expect(args).toEqual(['-y', `${PKG}@1.5.0`, 'init', '--yes']);
      expect(spawnOptions.env.OMCUSTOM_SKIP_SELF_UPDATE).toBe('true');
      expect(exit).toHaveBeenCalledWith(2);
    });

    it('also detects npx through the environment when argv[1] is outside the global root', () => {
      expect(
        autoSelfUpdate(
          options({
            env: { npm_command: 'exec' },
            argv: ['node', '/home/u/project/bin/omcustom.js', 'update', '--all'],
          })
        )
      ).toBe('relaunched');

      expect(install).not.toHaveBeenCalled();
      expect((spawn.mock.calls[0] as [string])[0]).toBe('npx');
    });

    it('continues when npx cannot be started', () => {
      spawn.mockImplementation(() => ({
        status: null,
        signal: null,
        error: new Error('spawn npx ENOENT'),
      }));

      expect(autoSelfUpdate(options({ argv: npxArgv }))).toBe('failed');

      expect(exit).not.toHaveBeenCalled();
      expect(warnings()).toContain('spawn npx ENOENT');
    });

    it('negative: does not re-run through npx when already on the latest version', () => {
      fetchLatest.mockImplementation(() => '1.0.0');

      expect(autoSelfUpdate(options({ argv: npxArgv }))).toBe('up-to-date');

      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe('the new CLI must start before the command is re-run (R0-1 M2)', () => {
    it('global: probes the installed binary with --version, then re-runs it', () => {
      expect(autoSelfUpdate(options())).toBe('relaunched');

      const [command, args, env] = probe.mock.calls[0] as [string, string[], NodeJS.ProcessEnv];
      expect(command).toBe(process.execPath);
      expect(args).toEqual([ENTRY, '--version']);
      expect(env.OMCUSTOM_SKIP_SELF_UPDATE).toBe('true');
      expect(probe.mock.invocationCallOrder[0]).toBeLessThan(spawn.mock.invocationCallOrder[0]);
    });

    for (const [name, output] of [
      ['fails to start', null],
      ['reports another version', '1.0.0'],
      ['prints nothing', ''],
    ] as const) {
      it(`global: continues with one notice when the probe ${name}`, () => {
        probe.mockImplementation(() => output);

        expect(autoSelfUpdate(options())).toBe('failed');

        expect(spawn).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
        expect(warnings()).toContain('--skip-self');
      });
    }

    it('npx: probes npx -y <package>@<resolved version> --version first', () => {
      autoSelfUpdate(options({ argv: ['node', '/home/u/.npm/_npx/abc/bin/omcustom', 'init'] }));

      const [command, args] = probe.mock.calls[0] as [string, string[]];
      expect(command).toBe('npx');
      expect(args).toEqual(['-y', `${PKG}@1.5.0`, '--version']);
    });

    it('npx: announces before the probe (the first download can take a while)', () => {
      autoSelfUpdate(options({ argv: ['node', '/home/u/.npm/_npx/abc/bin/omcustom', 'init'] }));

      const announcedAt = logSpy.mock.invocationCallOrder[0];
      expect(logSpy.mock.calls[0]?.[0]).toContain('npx');
      expect(announcedAt).toBeLessThan(probe.mock.invocationCallOrder[0]);
    });

    it('npx: a definite _npx run never spawns npm root -g', () => {
      const globalRootFn = mock(() => GLOBAL_ROOT);
      const base = options();

      autoSelfUpdate(
        options({
          argv: ['node', '/home/u/.npm/_npx/abc/bin/omcustom', 'init'],
          deps: { ...base.deps, globalRootFn },
        })
      );

      expect(globalRootFn).not.toHaveBeenCalled();
    });

    it('negative: a global binary still resolves npm root -g', () => {
      const globalRootFn = mock(() => GLOBAL_ROOT);
      const base = options();

      autoSelfUpdate(options({ deps: { ...base.deps, globalRootFn } }));

      expect(globalRootFn).toHaveBeenCalledTimes(1);
    });

    it('npx: does not re-run, and continues with one notice, when the probe fails', () => {
      probe.mockImplementation(() => null);

      expect(
        autoSelfUpdate(options({ argv: ['node', '/home/u/.npm/_npx/abc/bin/omcustom', 'init'] }))
      ).toBe('failed');

      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
    });
  });

  describe('spawn failures use the single failure notice (R0-1 L9)', () => {
    it('names the manual command when the verified binary cannot be started', () => {
      spawn.mockImplementation(() => ({
        status: null,
        signal: null,
        error: new Error('spawn EACCES'),
      }));

      expect(autoSelfUpdate(options())).toBe('failed');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnings()).toContain('spawn EACCES');
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
    });
  });

  describe('CLI not managed by npm (R0-1 L6/L7)', () => {
    const bunGlobal = '/home/u/.bun/install/global/node_modules/test-package/dist/cli/index.js';

    it('does not install, probe or re-run, and names the situation', () => {
      expect(autoSelfUpdate(options({ argv: ['node', bunGlobal, 'update'] }))).toBe('failed');

      expect(install).not.toHaveBeenCalled();
      expect(probe).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnings()).toContain(GLOBAL_ROOT);
      expect(warnings()).toContain(bunGlobal);
      expect(warnings()).toContain('--skip-self');
      // The advice to run npm install -g would contradict the detection
      expect(warnings()).not.toContain('npm install -g');
    });

    it('negative: installs when argv[1] is inside the npm global root', () => {
      expect(autoSelfUpdate(options())).toBe('relaunched');

      expect(install).toHaveBeenCalledTimes(1);
    });

    it('negative: still installs when npm root -g cannot be determined', () => {
      const base = options();
      expect(autoSelfUpdate(options({ deps: { ...base.deps, globalRootFn: () => null } }))).toBe(
        'relaunched'
      );

      expect(install).toHaveBeenCalledTimes(1);
    });
  });

  describe('npx detection (R0-1 L3)', () => {
    it('an inherited npm_command=exec does not make a global binary an npx run', () => {
      expect(autoSelfUpdate(options({ env: { npm_command: 'exec' } }))).toBe('relaunched');

      expect(install).toHaveBeenCalledTimes(1);
      expect((spawn.mock.calls[0] as [string])[0]).toBe(process.execPath);
    });

    it('isNpxInvocation: env signals count outside the global root, not inside', () => {
      const env = { npm_command: 'exec' };
      const identity = (p: string) => p;

      expect(isNpxInvocation(['node', '/x/y.js'], env, GLOBAL_ROOT, identity)).toBe(true);
      expect(isNpxInvocation(['node', ENTRY], env, GLOBAL_ROOT, identity)).toBe(false);
      expect(isNpxInvocation(['node', ENTRY], env)).toBe(true);
      expect(isNpxInvocation(['node', '/a/_npx/1/x.js'], {}, GLOBAL_ROOT, identity)).toBe(true);
    });

    it('isPathInside: prefix siblings and empty inputs are outside', () => {
      const identity = (p: string) => p;

      expect(isPathInside('/a/b/c.js', '/a/b', identity)).toBe(true);
      expect(isPathInside('/a/b/c.js', '/a/b/', identity)).toBe(true);
      expect(isPathInside('/a/bc/c.js', '/a/b', identity)).toBe(false);
      expect(isPathInside('', '/a/b', identity)).toBe(false);
      expect(isPathInside('/a/b/c.js', '', identity)).toBe(false);
      expect(
        isPathInside('/a/b/c.js', '/a/b', () => {
          throw new Error('ENOENT');
        })
      ).toBe(true);
      expect(isPathInside('/x', '/', identity)).toBe(true);
    });
  });

  describe('failures never block', () => {
    it('prints one notice naming the manual command when the npm lookup fails', () => {
      fetchLatest.mockImplementation(() => null);

      expect(autoSelfUpdate(options())).toBe('failed');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
      expect(install).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    });

    it('prints one notice with the first error line when the install fails (EACCES)', () => {
      install.mockImplementation(() => {
        throw new Error('EACCES: permission denied\nsecond line of npm output');
      });

      expect(autoSelfUpdate(options())).toBe('failed');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnings()).toContain('EACCES: permission denied');
      expect(warnings()).not.toContain('second line');
      expect(warnings()).toContain(`npm install -g ${PKG}@latest`);
      expect(spawn).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    });

    it('handles a non-Error throw and an empty message', () => {
      install.mockImplementationOnce(() => {
        throw 'plain string failure';
      });
      expect(autoSelfUpdate(options())).toBe('failed');
      expect(warnings()).toContain('plain string failure');

      install.mockImplementationOnce(() => {
        throw new Error('');
      });
      expect(autoSelfUpdate(options())).toBe('failed');
      expect(warnings()).toContain('unknown error');
    });

    it('negative: a successful run prints no warning', () => {
      autoSelfUpdate(options());

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does nothing when the current version is invalid', () => {
      expect(autoSelfUpdate(options({ currentVersion: '' }))).toBe('failed');

      expect(install).not.toHaveBeenCalled();
    });
  });
});

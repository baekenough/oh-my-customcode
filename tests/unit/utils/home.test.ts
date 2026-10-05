import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';
import {
  isPathWithin,
  isUnderHome,
  resolveHomeDir,
  shortenHome,
  stripTrailingSeparators,
} from '../../../src/utils/home.js';

describe('stripTrailingSeparators', () => {
  const cases: Array<[string, string]> = [
    ['/x/home', '/x/home'],
    ['/x/home/', '/x/home'],
    ['/x/home///', '/x/home'],
    ['/', '/'],
    ['///', '/'],
    ['', ''],
  ];

  for (const [input, expected] of cases) {
    it(`maps ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(stripTrailingSeparators(input)).toBe(expected);
    });
  }
});

describe('resolveHomeDir (injected sources)', () => {
  it('uses osHome when env is unset', () => {
    expect(resolveHomeDir({ envHome: () => undefined, osHome: () => '/os/home' })).toBe('/os/home');
  });

  it('uses osHome when env is empty', () => {
    expect(resolveHomeDir({ envHome: () => '', osHome: () => '/os/home' })).toBe('/os/home');
  });

  it('prefers a non-empty env value', () => {
    expect(resolveHomeDir({ envHome: () => '/x/home', osHome: () => '/os/home' })).toBe('/x/home');
  });

  it('strips trailing separators from env', () => {
    expect(resolveHomeDir({ envHome: () => '/x/home/' })).toBe('/x/home');
    expect(resolveHomeDir({ envHome: () => '/x/home///' })).toBe('/x/home');
  });

  it('keeps a root home as root', () => {
    expect(resolveHomeDir({ envHome: () => '/' })).toBe('/');
  });

  it('falls back to passwdHome when env and osHome are empty', () => {
    expect(
      resolveHomeDir({
        envHome: () => '',
        osHome: () => '',
        passwdHome: () => '/passwd/home/',
      })
    ).toBe('/passwd/home');
  });

  it('returns empty string when every source is empty', () => {
    expect(
      resolveHomeDir({ envHome: () => undefined, osHome: () => '', passwdHome: () => '' })
    ).toBe('');
  });

  it('skips throwing sources', () => {
    const boom = (): never => {
      throw new Error('no passwd entry');
    };
    expect(resolveHomeDir({ envHome: boom, osHome: boom, passwdHome: () => '/p' })).toBe('/p');
    expect(resolveHomeDir({ envHome: boom, osHome: boom, passwdHome: boom })).toBe('');
  });

  it('falls back to the real os reader when only env is empty', () => {
    const home = resolveHomeDir({ envHome: () => '' });
    expect(home).not.toBe('');
    expect(isAbsolute(home)).toBe(true);
  });

  it('falls back to the real passwd reader when env and os are empty', () => {
    const home = resolveHomeDir({ envHome: () => '', osHome: () => '' });
    expect(home).not.toBe('');
    expect(isAbsolute(home)).toBe(true);
  });
});

describe('resolveHomeDir (default sources)', () => {
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it('reads process.env.HOME at call time without memoising', () => {
    process.env.HOME = '/tmp/home-a';
    expect(resolveHomeDir()).toBe('/tmp/home-a');
    process.env.HOME = '/tmp/home-b/';
    expect(resolveHomeDir()).toBe('/tmp/home-b');
  });
});

describe('isPathWithin', () => {
  const cases: Array<[string, string, boolean]> = [
    ['/x/home/p', '/x/home/', true],
    ['/x/home/p', '/x/home', true],
    ['/x/home', '/x/home', true],
    ['/x/home/', '/x/home', true],
    ['/x/homework/p', '/x/home', false],
    ['/Users/sangyi/x', '/Users/san', false],
    ['/x', '/', true],
    ['/', '/', true],
    ['/x/home/p', '', false],
    ['', '', false],
  ];

  for (const [path, base, expected] of cases) {
    it(`(${JSON.stringify(path)}, ${JSON.stringify(base)}) -> ${expected}`, () => {
      expect(isPathWithin(path, base)).toBe(expected);
    });
  }
});

describe('isUnderHome', () => {
  it('uses the explicit home argument', () => {
    expect(isUnderHome('/x/home/p', '/x/home')).toBe(true);
    expect(isUnderHome('/x/homework/p', '/x/home')).toBe(false);
  });

  it('defaults to the resolved home directory', () => {
    const home = resolveHomeDir();
    expect(home).not.toBe('');
    expect(isUnderHome(home)).toBe(true);
  });
});

describe('symlinked HOME (realpath-aware comparison)', () => {
  let scratch: string;
  let realDir: string;
  let link: string;

  beforeEach(() => {
    // Real temp dirs outside $HOME; `link` is a symlink to `realDir`.
    scratch = mkdtempSync(join(tmpdir(), 'omc-home-link-'));
    realDir = join(scratch, 'real');
    link = join(scratch, 'link');
    mkdirSync(join(realDir, 'p'), { recursive: true });
    symlinkSync(realDir, link, 'dir');
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('isUnderHome: realpath-form path under a symlink-form home', () => {
    expect(isUnderHome(join(realpathSync(realDir), 'p'), link)).toBe(true);
  });

  it('isUnderHome: symlink-form path under a realpath-form home', () => {
    expect(isUnderHome(join(link, 'p'), realpathSync(realDir))).toBe(true);
  });

  it('isUnderHome: sibling sharing the prefix is NOT under the symlinked home', () => {
    expect(isUnderHome(join(`${realpathSync(realDir)}x`, 'p'), link)).toBe(false);
  });

  it('isUnderHome: nonexistent path under the symlinked home matches without throwing', () => {
    expect(isUnderHome(join(link, 'does-not-exist', 'q'), link)).toBe(true);
  });

  it('isUnderHome: an explicit empty home is never matched', () => {
    expect(isUnderHome(join(link, 'p'), '')).toBe(false);
  });

  it('shortenHome: realpath-form path with a symlink-form home', () => {
    expect(shortenHome(join(realpathSync(realDir), 'p'), link)).toBe(`~${sep}p`);
  });

  it('shortenHome: symlink-form path with a realpath-form home', () => {
    expect(shortenHome(join(link, 'p'), realpathSync(realDir))).toBe(`~${sep}p`);
  });

  it('shortenHome: the symlinked home itself becomes ~', () => {
    expect(shortenHome(realpathSync(realDir), link)).toBe('~');
  });

  it('shortenHome: sibling and empty home return the path unchanged', () => {
    const sibling = join(`${realpathSync(realDir)}x`, 'p');
    expect(shortenHome(sibling, link)).toBe(sibling);
    expect(shortenHome(join(link, 'p'), '')).toBe(join(link, 'p'));
  });

  it('isUnderHome: follows a retargeted home symlink (no memoisation)', () => {
    const d1 = join(scratch, 'd1');
    const d2 = join(scratch, 'd2');
    const hm = join(scratch, 'hm');
    mkdirSync(join(d1, 'p'), { recursive: true });
    mkdirSync(join(d2, 'p'), { recursive: true });
    symlinkSync(d1, hm, 'dir');
    expect(isUnderHome(join(d1, 'p'), hm)).toBe(true);

    unlinkSync(hm);
    symlinkSync(d2, hm, 'dir');
    expect(isUnderHome(join(d1, 'p'), hm)).toBe(false);
    expect(isUnderHome(join(d2, 'p'), hm)).toBe(true);
  });

  it('two different aliases of the same real dir match (realpath x realpath)', () => {
    const l1 = join(scratch, 'l1');
    const l2 = join(scratch, 'l2');
    symlinkSync(realDir, l1, 'dir');
    symlinkSync(realDir, l2, 'dir');
    expect(isUnderHome(join(l2, 'p'), l1)).toBe(true);
    expect(shortenHome(join(l2, 'p'), l1)).toBe(`~${sep}p`);
  });

  it('relative paths are never resolved against the cwd', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(realDir);
      const home = realpathSync(scratch);
      expect(isUnderHome('p', home)).toBe(false);
      expect(isUnderHome('.', home)).toBe(false);
      expect(shortenHome('p', home)).toBe('p');
      expect(shortenHome('.', home)).toBe('.');
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('shortenHome', () => {
  const cases: Array<[string, string, string]> = [
    ['/x/home/p', '/x/home/', '~/p'],
    ['/x/home/p', '/x/home', '~/p'],
    ['/x/home', '/x/home', '~'],
    ['/x/home/', '/x/home', '~'],
    ['/x/homework/p', '/x/home', '/x/homework/p'],
    ['/Users/sangyi/x', '/Users/san', '/Users/sangyi/x'],
    ['/x', '/', '~/x'],
    ['/x/home/p', '', '/x/home/p'],
  ];

  for (const [path, home, expected] of cases) {
    it(`(${JSON.stringify(path)}, ${JSON.stringify(home)}) -> ${JSON.stringify(expected)}`, () => {
      expect(shortenHome(path, home)).toBe(expected);
    });
  }

  it('defaults to the resolved home directory', () => {
    const home = resolveHomeDir();
    expect(shortenHome(home)).toBe('~');
  });
});

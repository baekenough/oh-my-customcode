import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isAbsolute } from 'node:path';
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

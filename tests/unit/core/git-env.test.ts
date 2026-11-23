import { afterEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  GIT_INJECTED_CONFIG_ENV_KEYS,
  GIT_INJECTED_CONFIG_ENV_PREFIXES,
  GIT_LOCATION_ENV_KEYS,
  gitChildEnv,
  gitChildEnvLocationOnly,
} from '../../../src/core/git-env.js';

/**
 * #1983: the environment handed to git child processes that must inspect a directory's own
 * repository.
 *
 * The removal set is written out here instead of being read from the exported constants, so
 * dropping a name from a constant fails these tests instead of shrinking what they check.
 *
 * Equivalent mutant: replacing `delete env[key]` with `env[key] = undefined` is not detected on
 * purpose. These tests compare only defined values, because that is what a child process gets:
 * Node and Bun do not pass undefined-valued keys to a child. The last test below shows this
 * for the runtime under test.
 */
const EXPECTED_LOCATION = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
] as const;

const EXPECTED_REMOVED_EXACT = [
  ...EXPECTED_LOCATION,
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
] as const;

/** Injected configuration that gitChildEnvLocationOnly keeps (env-supplied safe.directory). */
const INJECTED_CONFIG: Readonly<Record<string, string>> = {
  GIT_CONFIG_PARAMETERS: "'safe.directory'='*'",
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'safe.directory',
  GIT_CONFIG_VALUE_0: '*',
};

/** Variables a child git process must keep: the user's own config locations and identity. */
const KEPT: Readonly<Record<string, string>> = {
  PATH: '/usr/bin:/bin',
  HOME: '/home/someone',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/etc/someone-gitconfig',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Author',
  GIT_AUTHOR_EMAIL: 'author@example.invalid',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
};

/** The variables a child would actually receive: undefined values are not passed on. */
function definedEntries(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

describe('gitChildEnv (#1983)', () => {
  const touched: string[] = [];

  afterEach(() => {
    for (const key of touched.splice(0)) {
      delete process.env[key];
    }
  });

  function setProcessEnv(key: string, value: string): void {
    if (!touched.includes(key) && process.env[key] !== undefined) {
      throw new Error(`refusing to overwrite a pre-existing ${key} in process.env`);
    }
    touched.push(key);
    process.env[key] = value;
  }

  it('removes exactly the relocation and injected-config variables', () => {
    const source: NodeJS.ProcessEnv = { ...KEPT };
    for (const key of EXPECTED_REMOVED_EXACT) {
      source[key] = `bait-${key}`;
    }
    source.GIT_CONFIG_KEY_0 = 'core.excludesFile';
    source.GIT_CONFIG_VALUE_0 = '/bait/excludes';

    expect(definedEntries(gitChildEnv(source))).toEqual({ ...KEPT });
  });

  for (const key of EXPECTED_REMOVED_EXACT) {
    it(`drops ${key}`, () => {
      const result = gitChildEnv({ ...KEPT, [key]: 'bait' });

      expect(result[key]).toBeUndefined();
      expect(result.PATH).toBe(KEPT.PATH);
    });
  }

  it('keeps GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM and GIT_CONFIG_NOSYSTEM with their values', () => {
    const result = gitChildEnv({ ...KEPT });

    expect(result.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(result.GIT_CONFIG_SYSTEM).toBe('/etc/someone-gitconfig');
    expect(result.GIT_CONFIG_NOSYSTEM).toBe('1');
  });

  it('keeps PATH, HOME, GIT_AUTHOR_* and GIT_SSH_COMMAND (kept, not just absent from the removal set)', () => {
    const result = definedEntries(gitChildEnv({ ...KEPT, GIT_DIR: 'bait' }));

    for (const [key, value] of Object.entries(KEPT)) {
      expect(result[key]).toBe(value);
    }
    expect(Object.keys(result).length).toBe(Object.keys(KEPT).length);
  });

  it('removes numbered GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n> but not look-alike names', () => {
    const source: NodeJS.ProcessEnv = {
      ...KEPT,
      GIT_CONFIG_KEY_0: 'a',
      GIT_CONFIG_VALUE_0: 'b',
      GIT_CONFIG_KEY_12: 'c',
      GIT_CONFIG_VALUE_12: 'd',
      GIT_CONFIG_KEYX: 'kept-1',
      GIT_CONFIG_VALUEX: 'kept-2',
      GIT_CONFIG: 'kept-3',
      GIT_DIRX: 'kept-4',
      XGIT_DIR: 'kept-5',
      GIT_COMMON_DIR_X: 'kept-6',
      XGIT_CONFIG_KEY_0: 'kept-7',
      MY_GIT_CONFIG_VALUE_1: 'kept-8',
    };

    const result = definedEntries(gitChildEnv(source));

    expect(result.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(result.GIT_CONFIG_VALUE_0).toBeUndefined();
    expect(result.GIT_CONFIG_KEY_12).toBeUndefined();
    expect(result.GIT_CONFIG_VALUE_12).toBeUndefined();
    expect(result.GIT_CONFIG_KEYX).toBe('kept-1');
    expect(result.GIT_CONFIG_VALUEX).toBe('kept-2');
    expect(result.GIT_CONFIG).toBe('kept-3');
    expect(result.GIT_DIRX).toBe('kept-4');
    expect(result.XGIT_DIR).toBe('kept-5');
    expect(result.GIT_COMMON_DIR_X).toBe('kept-6');
    expect(result.XGIT_CONFIG_KEY_0).toBe('kept-7');
    expect(result.MY_GIT_CONFIG_VALUE_1).toBe('kept-8');
    expect(result.GIT_AUTHOR_NAME).toBe('Author');
  });

  it('does not modify the source and returns a new object', () => {
    const source: NodeJS.ProcessEnv = {
      ...KEPT,
      GIT_DIR: 'bait',
      GIT_CONFIG_KEY_0: 'core.bare',
    };
    const before = { ...source };

    const result = gitChildEnv(source);

    expect(source).toEqual(before);
    expect(result).not.toBe(source);
  });

  it('reads process.env when called, not when imported', () => {
    setProcessEnv('OMCUSTOM_GIT_ENV_PROBE', 'first');
    setProcessEnv('GIT_CONFIG_KEY_7', 'core.bare');

    const first = gitChildEnv();
    expect(first.OMCUSTOM_GIT_ENV_PROBE).toBe('first');
    expect(first.GIT_CONFIG_KEY_7).toBeUndefined();
    expect(first.PATH).toBe(process.env.PATH);

    process.env.OMCUSTOM_GIT_ENV_PROBE = 'second';
    expect(gitChildEnv().OMCUSTOM_GIT_ENV_PROBE).toBe('second');
    // The call did not strip process.env itself
    expect(process.env.GIT_CONFIG_KEY_7).toBe('core.bare');
  });

  it('exports the removal lists as the documented names', () => {
    expect([...GIT_LOCATION_ENV_KEYS, ...GIT_INJECTED_CONFIG_ENV_KEYS]).toEqual([
      ...EXPECTED_REMOVED_EXACT,
    ]);
    expect([...GIT_INJECTED_CONFIG_ENV_PREFIXES]).toEqual(['GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_']);
  });

  it('gitChildEnvLocationOnly removes exactly the location variables and keeps injected config', () => {
    const source: NodeJS.ProcessEnv = { ...KEPT, ...INJECTED_CONFIG };
    for (const key of EXPECTED_LOCATION) {
      source[key] = `bait-${key}`;
    }

    expect(definedEntries(gitChildEnvLocationOnly(source))).toEqual({
      ...KEPT,
      ...INJECTED_CONFIG,
    });
  });

  for (const key of EXPECTED_LOCATION) {
    it(`gitChildEnvLocationOnly drops ${key}`, () => {
      expect(gitChildEnvLocationOnly({ ...KEPT, [key]: 'bait' })[key]).toBeUndefined();
    });
  }

  it('gitChildEnvLocationOnly does not modify the source and reads process.env when called', () => {
    const source: NodeJS.ProcessEnv = { ...KEPT, GIT_DIR: 'bait' };
    const before = { ...source };

    const result = gitChildEnvLocationOnly(source);

    expect(source).toEqual(before);
    expect(result).not.toBe(source);

    setProcessEnv('OMCUSTOM_GIT_ENV_PROBE', 'first');
    expect(gitChildEnvLocationOnly().OMCUSTOM_GIT_ENV_PROBE).toBe('first');
    process.env.OMCUSTOM_GIT_ENV_PROBE = 'second';
    expect(gitChildEnvLocationOnly().OMCUSTOM_GIT_ENV_PROBE).toBe('second');
  });

  it('an undefined-valued key does not reach a child process (why delete vs undefined is equivalent)', () => {
    const output = execFileSync('env', [], {
      encoding: 'utf-8',
      env: { PATH: process.env.PATH, OMCUSTOM_UNDEFINED_PROBE: undefined, OMCUSTOM_SET: 'x' },
    });

    expect(output).toMatch(/^OMCUSTOM_SET=x$/m);
    expect(output).not.toMatch(/^OMCUSTOM_UNDEFINED_PROBE=/m);
  });
});

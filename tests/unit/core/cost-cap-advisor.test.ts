import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const sourcePath = resolve(
  import.meta.dir,
  '../../..',
  '.claude/hooks/scripts/cost-cap-advisor.sh'
);
const input = { tool_name: 'Bash', tool_input: { command: 'echo fixture' }, fixture: true };
const source = readFileSync(sourcePath, 'utf8');
let root: string;
let script: string;
let costFile: string;
let stateFile: string;
let env: Record<string, string>;
const activeChildren = new Set<number>();

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omcustom-cost-cap-')));
  script = join(root, 'advisor.sh');
  costFile = join(root, `.claude-cost-${process.pid}`);
  stateFile = join(root, `.claude-cost-advisory-${process.pid}`);
  const roots = source.match(/\/tmp\/\.claude-cost(?:-advisory)?-\$\{PPID\}/g);
  expect(roots).toHaveLength(2);
  const relocated = source.replaceAll('/tmp/.claude-cost-', `${root}/.claude-cost-`);
  expect(relocated).not.toContain('/tmp/.claude-cost-');
  writeFileSync(script, relocated);
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, 'tmp'));
  mkdirSync(join(root, 'bin'));
  env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith('GIT_')
    )
  );
  delete env.CLAUDE_COST_CAP;
  delete env.BASH_ENV;
  env.HOME = join(root, 'home');
  env.TMPDIR = join(root, 'tmp');
  env.PATH = `${join(root, 'bin')}:/usr/bin:/bin`;
  env.BASH_ENV = join(root, 'producer.sh');
  env.PRODUCER_TRACE = join(root, 'producer.tsv');
  env.TEST_PARENT_PID = `${process.pid}`;
  writeFileSync(
    env.BASH_ENV,
    'if [[ "$PPID" == "$TEST_PARENT_PID" ]]; then printf "%s\\t%s\\n" "$$" "$PPID" > "$PRODUCER_TRACE"; fi\n'
  );
});

afterEach(() => {
  expect(activeChildren.size).toBe(0);
  expect(realpathSync(root)).toBe(root);
  expect(dirname(root)).toBe(realpathSync(tmpdir()));
  expect(root.split('/').at(-1)).toStartWith('omcustom-cost-cap-');
  // Every producer has exited; only this invocation's owned fixture is removed.
  rmSync(root, { recursive: true });
});

function bridge(cost: string, timestamp = `${Math.floor(Date.now() / 1000)}`) {
  writeFileSync(costFile, `${cost}\t25\t${timestamp}\t0\t0\t0\t0\n`);
}

function state() {
  return existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : null;
}

function stub(name: string, body: string) {
  writeFileSync(join(root, 'bin', name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
}

async function invoke(cap?: string) {
  const childEnv = { ...env };
  if (cap !== undefined) childEnv.CLAUDE_COST_CAP = cap;
  const child = Bun.spawn(['/bin/bash', script], {
    cwd: root,
    env: childEnv,
    stdin: new TextEncoder().encode(JSON.stringify(input)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  activeChildren.add(child.pid);
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    const [rc, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(child.signalCode).toBeNull();
    expect(readFileSync(env.PRODUCER_TRACE, 'utf8')).toBe(`${child.pid}\t${process.pid}\n`);
    expect(JSON.parse(stdout)).toEqual(input);
    return { rc, stdout, stderr };
  } finally {
    clearTimeout(timeout);
    await child.exited;
    activeChildren.delete(child.pid);
  }
}

async function quiet(cap?: string) {
  const result = await invoke(cap);
  expect(result.rc).toBe(0);
  expect(result.stderr).toBe('');
  return result;
}

async function warning(cap: string | undefined, level: number) {
  const result = await invoke(cap);
  expect(result.rc).toBe(level === 100 ? 2 : 0);
  expect(result.stderr.match(/Session cost/g)).toHaveLength(1);
  expect(result.stderr).toContain(level === 100 ? 'has reached cap' : `at ${level}%`);
}

describe('cost cap advisor: isolated actual hook behavior', () => {
  test('first 100%, duplicate, then changed cap 50% each retain stdin JSON', async () => {
    bridge('5');
    await warning('5', 100);
    expect(state()).toBe('5\t100\n');
    await quiet('5');
    bridge('25');
    await warning('50', 50);
    expect(state()).toBe('50\t50\n');
    await quiet('50');
  });

  test('equivalent decimal spellings retain the same numeric high-water identity', async () => {
    bridge('5');
    await warning('5', 100);
    for (const cap of ['5.0', '005.00', '5.']) {
      await quiet(cap);
      expect(state()).toBe('5\t100\n');
    }
  });

  test('50/75/90/100 warn once on promotion and suppress lower levels', async () => {
    for (const [cost, level] of [
      ['50', 50],
      ['75', 75],
      ['90', 90],
      ['100', 100],
    ] as const) {
      bridge(cost);
      await warning('100', level);
      expect(state()).toBe(`100\t${level}\n`);
      await quiet('100');
      bridge('49');
      await quiet('100');
      expect(state()).toBe(`100\t${level}\n`);
    }
  });

  test('cap decrease and return reset; changed cap below 50 persists before return', async () => {
    bridge('5');
    await warning('10', 50);
    await warning('5', 100);
    await warning('10', 50);
    await quiet('100');
    expect(state()).toBe('100\t0\n');
    await warning('10', 50);
    expect(state()).toBe('10\t50\n');
  });

  test.each([
    ['.5', '.25', '0.5'],
    ['000.5000', '0.2500', '0.5'],
    [undefined, '2.5', '5'],
    ['', '2.5', '5'],
  ])('valid/default cap %s has normalized state %s', async (cap, cost, identity) => {
    bridge(cost);
    await warning(cap, 50);
    expect(state()).toBe(`${identity}\t50\n`);
  });

  test.each([
    '0',
    '0.000',
    '-5',
    '+5',
    ' 5',
    '5 ',
    '1e2',
    'NaN',
    '1/2',
    '5\n6',
  ])('invalid cap %j is benign and cannot change existing state', async (cap) => {
    bridge('5');
    await warning('5', 100);
    await quiet(cap);
    expect(state()).toBe('5\t100\n');
  });

  test('calculator/shell grammar is inert rather than executable', async () => {
    bridge('5');
    const sentinel = join(root, 'injected');
    for (const cap of [`$(touch ${sentinel})`, `5; touch ${sentinel}`, '5);quit']) {
      await quiet(cap);
      expect(state()).toBeNull();
      expect(existsSync(sentinel)).toBe(false);
    }
  });

  test.each([
    '100\n',
    '',
    '5\t',
    '5\t101\n',
    '5\t100\textra\n',
    '5\t100\nother',
    'bad\t100\n',
  ])('legacy/corrupt state %j starts a fresh cap comparison', async (oldState) => {
    bridge('2.5');
    writeFileSync(stateFile, oldState);
    await warning('5', 50);
    expect(state()).toBe('5\t50\n');
    await quiet('5');
  });

  test('missing/nonregular/read-denied bridges preserve existing natural state', async () => {
    bridge('5');
    await warning('5', 100);
    rmSync(costFile);
    await quiet('50');
    mkdirSync(costFile);
    await quiet('50');
    rmSync(costFile, { recursive: true });
    bridge('25');
    // Deterministic access-failure injection, including privileged CI runners.
    writeFileSync(
      env.BASH_ENV,
      readFileSync(env.BASH_ENV, 'utf8') +
        '[() { if [[ "$1" == "-r" && "$2" == "$COST_DENIED" ]]; then return 1; fi; builtin [ "$@"; }\n'
    );
    env.COST_DENIED = costFile;
    await quiet('50');
    expect(state()).toBe('5\t100\n');
  });

  test.each([
    'garbage',
    '-1',
    '1e2',
    '1/2',
    'NaN',
    '5\n6',
  ])('malformed bridge cost %j cannot mutate state', async (cost) => {
    bridge(cost);
    await quiet('5');
    expect(state()).toBeNull();
  });

  test.each([
    'stale',
    'garbage',
    '-1',
    '1.2',
    '1;exit',
    '9'.repeat(400),
  ])('stale/malformed timestamp %j is benign', async (timestamp) => {
    bridge('5', timestamp === 'stale' ? `${Math.floor(Date.now() / 1000) - 120}` : timestamp);
    await quiet('5');
    expect(state()).toBeNull();
  });

  test('truncated bridge is rejected, and fresh bridge remains usable', async () => {
    writeFileSync(costFile, '5\t25');
    await quiet('5');
    expect(state()).toBeNull();
    bridge('5');
    await warning('5', 100);
  });

  test('state read failure and symlink cannot warn or mutate their targets', async () => {
    bridge('5');
    await warning('5', 100);
    stub('cat', 'if [[ "$1" == "$STATE_DENIED" ]]; then exit 1; fi\nexec /bin/cat "$@"');
    env.STATE_DENIED = stateFile;
    await quiet('50');
    expect(state()).toBe('5\t100\n');
    rmSync(stateFile);
    const neighbor = join(root, 'neighbor');
    writeFileSync(neighbor, 'neighbor-owned-control\n');
    symlinkSync(neighbor, stateFile);
    await quiet('5');
    expect(readFileSync(neighbor, 'utf8')).toBe('neighbor-owned-control\n');
  });

  test.each([
    'mktemp',
    'mv',
  ])('state publication %s failure is benign with no temporary residue', async (command) => {
    bridge('2.5');
    await warning('5', 50);
    stub(command, 'exit 1');
    bridge('5');
    await quiet('5');
    expect(state()).toBe('5\t50\n');
    expect(
      readdirSync(root).filter(
        (name) => name.startsWith('.claude-cost-advisory-') && name.includes('.tmp.')
      )
    ).toEqual([]);
  });

  test('huge wrapped bc percentages reach 100 without shell integer overflow', async () => {
    bridge(`1${'0'.repeat(80)}`);
    const result = await invoke('0.0000000001');
    expect(result.rc).toBe(2);
    expect(result.stderr).toMatch(/\([0-9]{90,}%\)/);
    expect(result.stderr).not.toContain('integer');
    expect(state()).toBe('0.0000000001\t100\n');
    await quiet('0.0000000001');
  });

  test('state content write failure suppresses warning and preserves prior state', async () => {
    bridge('2.5');
    await warning('5', 50);
    const unwritableOutput = join(root, 'output-directory');
    mkdirSync(unwritableOutput);
    env.UNWRITABLE_OUTPUT = unwritableOutput;
    // Return an owned directory: redirecting the state bytes fails deterministically.
    stub('mktemp', 'printf "%s\\n" "$UNWRITABLE_OUTPUT"');
    bridge('5');
    await quiet('5');
    expect(state()).toBe('5\t50\n');
    expect(readdirSync(unwritableOutput)).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Tier-1 deterministic checks for the two path-precheck blocks in auto-dev.yaml
// (extraction block and channel (c) file block). The blocks are extracted from the
// YAML text and run as written against a throwaway git repository under
// os.tmpdir(), with a fake `gh` first on PATH (no network). Every child process
// runs with all inherited GIT_* variables removed. Mutation controls change only
// the in-memory block string, never a file.
//
// Optional flag for raw mutation evidence: PRECHECK_MUTATION=tr|tail|literal|dirname
// applies that mutation to the block used by the ordinary tests, which must then fail.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const AUTO_DEV = '.claude/skills/pipeline/workflows/auto-dev.yaml';

type Mutation = 'tr' | 'tail' | 'literal' | 'dirname';

const MUTATIONS: Record<Mutation, [string, string]> = {
  tr: [String.raw`| tr -d '\000' |`, '|'],
  tail: ['|| [ -n "$p" ]', ''],
  literal: ['--literal-pathspecs ', ''],
  dirname: ['dirname -- "$p"', 'dirname "$p"'],
};

function mutate(block: string, kind: Mutation): string {
  const [from, to] = MUTATIONS[kind];
  expect(block.includes(from)).toBe(true);
  const out = block.replace(from, to);
  expect(out).not.toBe(block);
  return out;
}

function extractBlock(name: string): string {
  const lines = readFileSync(resolve(REPO_ROOT, AUTO_DEV), 'utf8').split('\n');
  const begin = lines.findIndex((l) => l.trim().startsWith(`# BEGIN ${name} (ONE Bash call)`));
  const end = lines.findIndex((l) => l.trim() === `# END ${name}`);
  expect(begin).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(begin);
  return lines
    .slice(begin + 1, end)
    .map((l) => l.replace(/^ {6}/, ''))
    .join('\n');
}

function run(cmd: string[], stdin: string, env: Record<string, string> = {}, cwd = REPO_ROOT) {
  // Strip every inherited GIT_* so git resolves from cwd, not from a parent hook's repo state.
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && value !== undefined) {
      inherited[key] = value;
    }
  }
  const proc = Bun.spawnSync(cmd, {
    cwd,
    stdin: Buffer.from(stdin),
    env: { ...inherited, ...env },
  });
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

const FAKE_GH = `#!/bin/sh
if [ -n "$FAKE_GH_FAIL" ]; then
  echo "gh: simulated failure" >&2
  exit 1
fi
exec jq -r '.title + "\\n" + (.body // "")' "$FAKE_VIEW_FILE"
`;

const ENV_MUTATION = process.env.PRECHECK_MUTATION as Mutation | undefined;

describe('auto-dev path-precheck blocks (extra Tier-1 checks)', () => {
  let tmp: string;
  let repo: string;
  let binDir: string;
  let viewFile: string;
  let seq = 0;

  const git = (...args: string[]) => {
    const res = run(['git', ...args], '', {}, repo);
    expect(res.code).toBe(0);
    return res;
  };

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omcustom-pcx-'));
    repo = join(tmp, 'repo');
    binDir = join(tmp, 'bin');
    mkdirSync(binDir);
    writeFileSync(join(binDir, 'gh'), FAKE_GH);
    chmodSync(join(binDir, 'gh'), 0o755);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    writeFileSync(
      join(binDir, 'git'),
      `#!/bin/sh\ncase " $* " in\n  *" ls-files "*) if [ "$FAKE_GIT_LS_FAIL" = 1 ]; then echo 'simulated git listing failure' >&2; exit 23; fi;;\nesac\nexec "${realGit}" "$@"\n`
    );
    chmodSync(join(binDir, 'git'), 0o755);
    viewFile = join(tmp, 'view.json');
    mkdirSync(repo);
    for (const f of [
      'src/index.ts',
      'src/util.ts',
      'app/[id]/page.tsx',
      'app/i/page.tsx',
      'README.md',
    ]) {
      mkdirSync(join(repo, f, '..'), { recursive: true });
      writeFileSync(join(repo, f), 'x\n');
    }
    git('init', '-q');
    git('add', '-A');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const base1 = () => extractBlock('path-precheck').replace('<N>', '1');
  const used1 = () => (ENV_MUTATION === 'tr' ? mutate(base1(), 'tr') : base1());

  function runBlock1(shell: 'bash' | 'zsh', block: string, env: Record<string, string> = {}) {
    const script = join(tmp, `b1-${seq++}.sh`);
    writeFileSync(script, `${block}\n`);
    const cmd = shell === 'zsh' ? ['zsh', '-f', script] : ['bash', script];
    return run(
      cmd,
      '',
      { PATH: `${binDir}:${process.env.PATH}`, FAKE_VIEW_FILE: viewFile, ...env },
      repo
    );
  }

  const writeView = (title: string, body: string) =>
    writeFileSync(viewFile, JSON.stringify({ title, body }));

  function runFileBlock(
    shell: 'bash' | 'zsh',
    content: string,
    kind?: Mutation,
    cwd = repo,
    forceMutation = false,
    env: Record<string, string> = {}
  ) {
    const pathFile = join(tmp, `paths-${seq++}.txt`);
    writeFileSync(pathFile, content);
    let block = extractBlock('path-precheck-file').replace('<path-file>', pathFile);
    const m = forceMutation ? kind : (kind ?? ENV_MUTATION);
    if (m === 'tail' || m === 'literal' || m === 'dirname') {
      block = mutate(block, m);
    }
    const script = join(tmp, `b2-${seq++}.sh`);
    writeFileSync(script, `${block}\n`);
    const cmd = shell === 'zsh' ? ['zsh', '-f', script] : ['bash', script];
    return run(cmd, '', { PATH: `${binDir}:${process.env.PATH}`, ...env }, cwd);
  }

  for (const shell of ['bash', 'zsh'] as const) {
    describe(`shell: ${shell}`, () => {
      test('git listing failure halts extraction instead of reporting no paths', () => {
        writeView('t', 'src/index.ts');
        const res = runBlock1(shell, base1(), { FAKE_GIT_LS_FAIL: '1' });
        expect(res.code).not.toBe(0);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain('[path-precheck] HALT');
      });

      test('file-channel git listing failure halts instead of reporting tracked=0', () => {
        const res = runFileBlock(shell, 'src/index.ts\n', undefined, repo, false, {
          FAKE_GIT_LS_FAIL: '1',
        });
        expect(res.code).not.toBe(0);
        expect(res.stdout).toBe('');
        expect(res.stderr).toContain('[path-precheck] HALT');
      });

      test('F4: failing gh writes [path-precheck] HALT to stderr and nothing to stdout', () => {
        writeView('t', 'see src/index.ts');
        const res = runBlock1(shell, used1(), { FAKE_GH_FAIL: '1' });
        expect(res.stderr).toContain('[path-precheck] HALT');
        expect(res.stdout).toBe('');
      });

      test('F4 control: a body without paths prints no HALT', () => {
        writeView('plain title', 'nothing path-like here at all');
        const res = runBlock1(shell, used1());
        expect(res.stderr).not.toContain('HALT');
        expect(res.stdout).toBe('');
      });

      test('F4 control: a body with a tracked path measures it and prints no HALT', () => {
        writeView('t', 'edit src/index.ts please');
        const res = runBlock1(shell, used1());
        expect(res.stderr).not.toContain('HALT');
        expect(res.stdout).toBe('src/index.ts tracked=1 dir=no parent=yes\n');
      });

      test('F6: a NUL in the body does not stop path extraction', () => {
        // JSON carries the NUL as a \\u0000 escape; the fake gh emits a raw NUL byte.
        writeFileSync(
          viewFile,
          String.raw`{"title":"t","body":"see src/in\u0000dex.ts and src/util.ts"}`
        );
        const res = runBlock1(shell, used1());
        expect(res.stdout.split('\n').filter(Boolean)).toEqual([
          'src/index.ts tracked=1 dir=no parent=yes',
          'src/util.ts tracked=1 dir=no parent=yes',
        ]);
      });

      test('F5: last line without a trailing newline is kept (2 lines)', () => {
        const res = runFileBlock(shell, 'src/index.ts\nsrc/util.ts');
        expect(res.stdout.split('\n').filter(Boolean)).toEqual([
          'src/index.ts tracked=1 dir=no parent=yes',
          'src/util.ts tracked=1 dir=no parent=yes',
        ]);
      });

      test('F5: two lines with a trailing newline give exactly 2 lines', () => {
        const res = runFileBlock(shell, 'src/index.ts\nsrc/util.ts\n');
        expect(res.stdout.split('\n')).toHaveLength(3);
        expect(res.stdout.split('\n').filter(Boolean)).toHaveLength(2);
      });

      test('F5: blank lines produce no empty-path line', () => {
        const res = runFileBlock(shell, '\nsrc/index.ts\n\n\nsrc/util.ts\n\n');
        const lines = res.stdout.split('\n').filter(Boolean);
        expect(lines).toHaveLength(2);
        for (const l of lines) {
          expect(l.startsWith(' ')).toBe(false);
        }
        expect(res.stdout).not.toContain('\n\n');
      });
    });
  }

  describe('channel (c) block details (bash)', () => {
    test('cwd=src gives the same output as a root run', () => {
      const content = 'src/index.ts\nREADME.md\nsrc\nmissing/file.ts\n';
      const root = runFileBlock('bash', content);
      const sub = runFileBlock('bash', content, undefined, join(repo, 'src'));
      expect(root.stdout).not.toBe('');
      expect(sub.stdout).toBe(root.stdout);
      expect(sub.stderr).toBe(root.stderr);
    });

    test('bracket path is measured literally: app/[id]/page.tsx has tracked=1', () => {
      const res = runFileBlock('bash', 'app/[id]/page.tsx\n');
      expect(res.stdout).toBe('app/[id]/page.tsx tracked=1 dir=no parent=yes\n');
    });

    test('-rf line: tracked=0 dir=no parent=yes with empty stderr', () => {
      const res = runFileBlock('bash', '-rf\n');
      expect(res.stdout).toBe('-rf tracked=0 dir=no parent=yes\n');
      expect(res.stderr).toBe('');
    });
  });

  describe('mutation controls (each mutation must be observable)', () => {
    for (const shell of ['bash', 'zsh'] as const) {
      test(`tr (${shell}): removing NUL deletion splits a path token`, () => {
        writeFileSync(
          viewFile,
          String.raw`{"title":"t","body":"see src/in\u0000dex.ts and src/util.ts"}`
        );
        const original = runBlock1(shell, base1());
        const mutated = runBlock1(shell, mutate(base1(), 'tr'));
        expect(original.code).toBe(0);
        expect(original.stderr).toBe('');
        expect(original.stdout.split('\n').filter(Boolean)).toEqual([
          'src/index.ts tracked=1 dir=no parent=yes',
          'src/util.ts tracked=1 dir=no parent=yes',
        ]);
        expect(mutated.code).toBe(0);
        expect(mutated.stderr).toBe('');
        expect(mutated.stdout.split('\n').filter(Boolean)).toEqual([
          'src/in tracked=0 dir=no parent=yes',
          'src/util.ts tracked=1 dir=no parent=yes',
        ]);
      });
    }

    test('tail: without `|| [ -n "$p" ]` the last unterminated line is lost', () => {
      const res = runFileBlock('bash', 'src/index.ts\nsrc/util.ts', 'tail', repo, true);
      expect(res.stdout.split('\n').filter(Boolean)).toEqual([
        'src/index.ts tracked=1 dir=no parent=yes',
      ]);
    });

    test('literal: without --literal-pathspecs the bracket path counts tracked=2', () => {
      const res = runFileBlock('bash', 'app/[id]/page.tsx\n', 'literal', repo, true);
      expect(res.stdout).toBe('app/[id]/page.tsx tracked=2 dir=no parent=yes\n');
    });

    test('dirname: without `--` the -rf line gives parent=no and a stderr message', () => {
      const res = runFileBlock('bash', '-rf\n', 'dirname', repo, true);
      expect(res.stdout).toBe('-rf tracked=0 dir=no parent=no\n');
      expect(res.stderr).not.toBe('');
    });
  });
});

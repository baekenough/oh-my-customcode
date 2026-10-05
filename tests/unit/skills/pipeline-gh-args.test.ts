import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Tier-1 deterministic checks for #1831 F9/F10: gh bodies travel through files,
// and phrases containing backtick code spans never enter a double-quoted
// command string. Shell behaviour is shown with fake `gh`/`git` shims first on
// PATH (no network, no real gh). Processes run via Bun.spawnSync.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');

const AUTO_DEV_COPIES = [
  '.claude/skills/pipeline/workflows/auto-dev.yaml',
  'templates/.claude/skills/pipeline/workflows/auto-dev.yaml',
  'workflows/auto-dev.yaml',
  'templates/workflows/auto-dev.yaml',
] as const;

const RELEASE_NOTES_COPIES = [
  '.claude/skills/omcustom-release-notes/SKILL.md',
  'templates/.claude/skills/omcustom-release-notes/SKILL.md',
] as const;

const FOLLOWUP_COPIES = [
  '.claude/skills/post-release-followup/SKILL.md',
  'templates/.claude/skills/post-release-followup/SKILL.md',
] as const;

function readText(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function run(cmd: string[], env: Record<string, string> = {}, cwd = REPO_ROOT) {
  // Strip every inherited GIT_* (pre-commit hooks export GIT_INDEX_FILE etc.).
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && value !== undefined) {
      inherited[key] = value;
    }
  }
  const proc = Bun.spawnSync(cmd, { cwd, env: { ...inherited, ...env } });
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

let sandbox = '';
let binDir = '';

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'pipeline-gh-args-'));
  binDir = join(sandbox, 'bin');
  mkdirSync(binDir);
  // Fake gh: print argv one per line.
  const gh = join(binDir, 'gh');
  writeFileSync(gh, '#!/bin/sh\nfor a in "$@"; do printf \'%s\\n\' "$a"; done\n');
  chmodSync(gh, 0o755);
  // Fake git: record the call in a marker file.
  const git = join(binDir, 'git');
  writeFileSync(git, `#!/bin/sh\nprintf 'called\\n' >> "${join(sandbox, 'git-marker')}"\n`);
  chmodSync(git, 0o755);
});

afterAll(() => {
  if (sandbox) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

function sandboxEnv(): Record<string, string> {
  return { PATH: `${binDir}:${process.env.PATH ?? ''}`, HOME: sandbox };
}

function countPrefix(dir: string, prefix: string): number {
  return readdirSync(dir).filter((f) => f.startsWith(prefix)).length;
}

describe('F9: auto-dev uses file channels for gh bodies', () => {
  for (const rel of AUTO_DEV_COPIES) {
    test(`${rel}: gh pr create uses --body-file, no legacy inline body`, () => {
      const text = readText(rel);
      const lines = text.split('\n').filter((l) => l.includes('gh pr create --base'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain('--body-file');
        expect(line).not.toMatch(/--body\s+"/);
      }
      expect(text).not.toContain("--body \"<MUST include 'Closes #N'");
    });

    test(`${rel}: non-npm gh release create uses --notes-file`, () => {
      const lines = readText(rel)
        .split('\n')
        .filter((l) => /gh release create v\{NEW\}/.test(l));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain('--notes-file');
        expect(line).not.toMatch(/--notes\s+"/);
      }
    });
  }
});

describe('F9: skill docs use file channels', () => {
  for (const rel of RELEASE_NOTES_COPIES) {
    test(`${rel}: --notes-file, tracked release_notes.md is not the input`, () => {
      const text = readText(rel);
      expect(text).toContain('--notes-file');
      expect(text).toContain(
        '`release_notes.md` is a tracked file and is not used as the `--notes-file` input'
      );
      expect(text).not.toMatch(/--notes-file\s+release_notes\.md/);
    });
  }

  for (const rel of FOLLOWUP_COPIES) {
    test(`${rel}: gh issue create examples use --body-file, no inline --body`, () => {
      const text = readText(rel);
      const blocks = text.split(/^gh issue create \\$/m).slice(1);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        const head = block.split('\n').slice(0, 5).join('\n');
        expect(head).toContain('--body-file');
      }
      expect(text.match(/--body\s+["']/g) ?? []).toHaveLength(0);
    });
  }
});

describe('F9: argv sandbox (fake gh)', () => {
  test('file form: payload stays in the file, nothing executes', () => {
    const dir = join(sandbox, 'file-form');
    mkdirSync(dir);
    const payload = `$(touch ${dir}/pwned-sub)\n\`touch ${dir}/pwned-tick\`\n`;
    const bodyFile = join(dir, 'body.md');
    writeFileSync(bodyFile, payload);
    const script = join(dir, 'run.sh');
    writeFileSync(script, `gh issue create --title t --body-file "${bodyFile}"\n`);
    const r = run(['bash', script], sandboxEnv());
    console.log(
      `[file-form] exit=${r.code} argv=${JSON.stringify(r.stdout)} pwned=${countPrefix(dir, 'pwned')}`
    );
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')).toContain('--body-file');
    expect(r.stdout).not.toContain('pwned');
    expect(countPrefix(dir, 'pwned')).toBe(0);
  });

  test('control: inline --body with the same payload executes it', () => {
    const dir = join(sandbox, 'inline-form');
    mkdirSync(dir);
    const script = join(dir, 'run.sh');
    writeFileSync(
      script,
      `gh issue create --title t --body "$(touch ${dir}/pwned-sub) \`touch ${dir}/pwned-tick\`"\n`
    );
    const r = run(['bash', script], sandboxEnv());
    console.log(
      `[inline-form] exit=${r.code} argv=${JSON.stringify(r.stdout)} pwned=${countPrefix(dir, 'pwned')}`
    );
    expect(r.code).toBe(0);
    expect(countPrefix(dir, 'pwned')).toBe(2);
  });
});

describe('F10: external text and quote-verify wording', () => {
  for (const rel of AUTO_DEV_COPIES) {
    test(`${rel}: ANY external or repository text rule and quote-verify pointer`, () => {
      const text = readText(rel);
      expect(text).toContain('ANY external or repository text');
      expect(text).toContain('use the canonical quote-verify block of the implement step');
      expect(text).toContain('# BEGIN quote-verify');
    });
  }
});

describe('F10: backtick span shim sandbox (fake git)', () => {
  const phrase = 'run `git status` before commit';

  test('control: phrase inside double-quoted grep -F runs the command', () => {
    const dir = join(sandbox, 'f10-inline');
    mkdirSync(dir);
    const target = join(dir, 'target.txt');
    writeFileSync(target, `${phrase}\n`);
    const marker = join(sandbox, 'git-marker');
    rmSync(marker, { force: true });
    const script = join(dir, 'run.sh');
    writeFileSync(script, `grep -F "${phrase}" "${target}"\n`);
    const r = run(['bash', script], sandboxEnv());
    const marked = readFileSync(marker, 'utf8').length > 0;
    console.log(`[f10-inline] exit=${r.code} marker=${marked ? 'created' : 'absent'}`);
    expect(marked).toBe(true);
  });

  test('file form: grep -F -f keeps the phrase inert', () => {
    const dir = join(sandbox, 'f10-file');
    mkdirSync(dir);
    const target = join(dir, 'target.txt');
    const phraseFile = join(dir, 'phrases.txt');
    writeFileSync(target, `${phrase}\n`);
    writeFileSync(phraseFile, `${phrase}\n`);
    const marker = join(sandbox, 'git-marker');
    rmSync(marker, { force: true });
    const script = join(dir, 'run.sh');
    writeFileSync(script, `grep -F -f "${phraseFile}" "${target}"\n`);
    const r = run(['bash', script], sandboxEnv());
    let markerExists = true;
    try {
      readFileSync(marker, 'utf8');
    } catch {
      markerExists = false;
    }
    console.log(`[f10-file] exit=${r.code} marker=${markerExists ? 'created' : 'absent'}`);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(phrase);
    expect(markerExists).toBe(false);
  });
});

describe('milestone assignment gate structure', () => {
  for (const rel of AUTO_DEV_COPIES) {
    test(`${rel}: gate precedes gh pr create, paginated, with FAIL marker`, () => {
      const text = readText(rel);
      const gate = text.indexOf('Milestone assignment gate');
      const pr = text.indexOf('gh pr create --base');
      expect(gate).toBeGreaterThan(-1);
      expect(pr).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(pr);
      expect(text).toContain('--paginate');
      expect(text).toContain('FAIL: milestone assignment gate');
      expect(text.slice(gate, pr)).toContain('--paginate');
    });
  }
});

describe('milestone assignment gate execution (fake gh, no network)', () => {
  function gate(text: string): string {
    const lines = text.split('\n');
    const start = lines.findIndex((line) => line.trim().startsWith("ms=$(gh api 'repos/"));
    const end = lines.findIndex(
      (line, i) => i > start && line.trim().startsWith('echo "PASS: milestone')
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return lines
      .slice(start, end + 1)
      .map((line) => line.trim())
      .join('\n');
  }

  function execute(env: Record<string, string> = {}) {
    const dir = join(sandbox, `milestone-${countPrefix(sandbox, 'milestone-')}`);
    mkdirSync(dir);
    const gh = join(dir, 'gh');
    writeFileSync(
      gh,
      `#!/bin/sh
case "$2" in
  *milestones*)
    [ "$FAIL_MILESTONE_QUERY" != 1 ] || exit 1
    case " $* " in *" --paginate "*) ;; *) echo 'missing pagination' >&2; exit 2;; esac
    [ "$MILESTONE_STATE" = open ] && printf '7\\n'
    exit 0;;
  */issues/101) [ "$FAIL_ISSUE_QUERY" != 1 ] || exit 1; printf '%s\\n' "$ISSUE_101";;
  */issues/102) printf '%s\\n' "$ISSUE_102";;
  *) exit 3;;
esac
`
    );
    chmodSync(gh, 0o755);
    const script = gate(readText(AUTO_DEV_COPIES[0]))
      .replaceAll('vX.Y.Z', 'v9.9.9')
      .replace('<N1> <N2>', '101 102');
    return run(['bash', '-c', script], {
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      MILESTONE_STATE: 'open',
      ISSUE_101: '7',
      ISSUE_102: '7',
      ...env,
    });
  }

  test('all workflow mirrors carry the same executable gate', () => {
    const expected = gate(readText(AUTO_DEV_COPIES[0]));
    for (const rel of AUTO_DEV_COPIES.slice(1)) expect(gate(readText(rel))).toBe(expected);
  });

  test('open milestone with every scope issue assigned passes using pagination', () => {
    const result = execute();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PASS: milestone v9.9.9');
  });

  for (const state of ['closed', 'absent']) {
    test(`${state} milestone blocks release`, () => {
      const result = execute({ MILESTONE_STATE: state });
      expect(result.code).not.toBe(0);
      expect(result.stdout).toContain('absent or not open');
      expect(result.stdout).not.toContain('PASS:');
    });
  }

  for (const assigned of ['none', '8']) {
    test(`scope issue with milestone ${assigned} blocks release`, () => {
      const result = execute({ ISSUE_102: assigned });
      expect(result.code).not.toBe(0);
      expect(result.stdout).toContain('FAIL: #102');
      expect(result.stdout).toContain('FAIL: milestone assignment gate');
    });
  }

  test('milestone API failure blocks release', () => {
    const result = execute({ FAIL_MILESTONE_QUERY: '1' });
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('FAIL: milestone query failed');
  });

  test('issue API failure blocks release', () => {
    const result = execute({ FAIL_ISSUE_QUERY: '1' });
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('FAIL: issue lookup failed for #101');
    expect(result.stdout).toContain('FAIL: milestone assignment gate');
  });
});

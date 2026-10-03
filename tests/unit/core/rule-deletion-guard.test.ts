/**
 * Behavioral tests for `.claude/hooks/scripts/rule-deletion-guard.sh` (#1782).
 *
 * Every case builds a throwaway project (`.claude/rules/MUST-x.md` plus the
 * `templates/.claude/rules/MUST-x.md` mirror), spawns the real script with a JSON payload on
 * stdin and `CLAUDE_PROJECT_DIR` pointing at that project, and asserts the exit code
 * (2 = block, 0 = allow) plus a stderr reason substring for blocks. The script is only ever
 * pointed at the temp project, so no repository file is touched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');
const GUARD = resolve(ROOT, '.claude/hooks/scripts/rule-deletion-guard.sh');

const BLOCKED = 'RULE DELETION BLOCKED';
const PARENT = 'Parent directory deletion detected';
const MULTIPLE = 'Multiple rules detected';

// Build verbs from parts so this source never contains a literal destructive command line.
const RM = ['r', 'm'].join('');
const MV = ['m', 'v'].join('');
const RULE = '.claude/rules/MUST-x.md';

interface GuardResult {
  code: number;
  stderr: string;
}

interface RunOptions {
  /** Directory the script process runs in (default: the project). */
  cwd?: string;
  /** Extra/overriding env entries; `undefined` removes the key. */
  env?: Record<string, string | undefined>;
  /** Script under test (default: the live guard). */
  script?: string;
  /** Bash binary to use (default: `bash` from PATH). */
  bash?: string;
}

const created: string[] = [];

function makeTemp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

function makeProject(): string {
  const project = makeTemp('rdg-project-');
  for (const base of ['.claude/rules', 'templates/.claude/rules']) {
    mkdirSync(join(project, base), { recursive: true });
    writeFileSync(join(project, base, 'MUST-x.md'), '# rule\n');
  }
  return project;
}

function runRaw(stdin: string, project: string, opts: RunOptions = {}): GuardResult {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_PROJECT_DIR: project,
    ...opts.env,
  };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }
  const r = Bun.spawnSync([opts.bash ?? 'bash', opts.script ?? GUARD], {
    cwd: opts.cwd ?? project,
    env: env as Record<string, string>,
    stdin: new TextEncoder().encode(stdin),
    timeout: 20000,
  });
  return { code: r.exitCode ?? -1, stderr: new TextDecoder().decode(r.stderr) };
}

function runBash(
  command: string,
  project: string,
  extra: Record<string, unknown> = {},
  opts: RunOptions = {}
): GuardResult {
  return runRaw(
    JSON.stringify({ tool_name: 'Bash', tool_input: { command }, ...extra }),
    project,
    opts
  );
}

let project: string;

beforeAll(() => {
  project = makeProject();
});

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('rule-deletion-guard: blocks', () => {
  const cases: Array<{ name: string; command: (p: string) => string; reason: string }> = [
    {
      name: 'deleting a protected rule by absolute path',
      command: (p) => `${RM} ${p}/.claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'deleting a protected rule by relative path',
      command: () => `${RM} .claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'deleting a rule in the templates mirror',
      command: () => `${RM} -rf templates/.claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'recursive delete of the rules directory',
      command: () => `${RM} -rf .claude/rules`,
      reason: BLOCKED,
    },
    {
      name: 'glob delete of several rules',
      command: () => `${RM} .claude/rules/*.md`,
      reason: MULTIPLE,
    },
    {
      name: 'recursive delete of an ancestor (.claude)',
      command: () => `${RM} -rf .claude`,
      reason: PARENT,
    },
    {
      name: 'mv with a rule as the source',
      command: () => 'mv .claude/rules/MUST-x.md /tmp',
      reason: BLOCKED,
    },
    {
      name: 'mv with the rules directory as the destination',
      command: () => 'mv /tmp/x.md .claude/rules/MUST-x.md',
      reason: BLOCKED,
    },
    {
      name: 'find -delete under the rules directory',
      command: () => 'find .claude/rules -delete',
      reason: BLOCKED,
    },
    {
      name: 'xargs delete fed a rules path',
      command: () => `echo .claude/rules/MUST-x.md | xargs ${RM}`,
      reason: BLOCKED,
    },
    {
      name: 'xargs delete fed a rules glob',
      command: () => `ls .claude/rules/*.md | xargs ${RM}`,
      reason: MULTIPLE,
    },
    {
      name: 'absolute /bin verb path',
      command: () => `/bin/${RM} .claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'sudo wrapper',
      command: () => `sudo ${RM} .claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'truncate',
      command: () => 'truncate -s0 .claude/rules/MUST-x.md',
      reason: BLOCKED,
    },
    {
      name: 'git rm',
      command: () => `git ${RM} .claude/rules/MUST-x.md`,
      reason: BLOCKED,
    },
    {
      name: 'git clean -fd at the project root',
      command: () => 'git clean -fd',
      reason: PARENT,
    },
    {
      name: 'truncating redirect onto a rule file',
      command: () => 'echo hi > .claude/rules/MUST-x.md',
      reason: BLOCKED,
    },
    {
      name: 'bash -c (opaque, legacy fallback)',
      command: () => `bash -c '${RM} .claude/rules/MUST-x.md'`,
      reason: BLOCKED,
    },
    {
      name: 'cd into .claude then delete rules',
      command: () => `cd .claude && ${RM} -rf rules`,
      reason: BLOCKED,
    },
  ];

  for (const c of cases) {
    it(`blocks ${c.name}`, () => {
      const r = runBash(c.command(project), project);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(c.reason);
    });
  }
});

describe('rule-deletion-guard: allows', () => {
  it('allows deleting an unrelated file when .claude/rules is only read elsewhere in the command', () => {
    const r = runBash(`${RM} foo.txt; cat .claude/rules/MUST-x.md`, project);
    expect(r.code).toBe(0);
  });

  it('allows deleting under a .claude/rules path OUTSIDE the project', () => {
    const outside = makeTemp('rdg-outside-');
    mkdirSync(join(outside, '.claude/rules'), { recursive: true });
    writeFileSync(join(outside, '.claude/rules/x.md'), '# other\n');
    expect(runBash(`${RM} ${outside}/.claude/rules/x.md`, project).code).toBe(0);
    expect(runBash(`${RM} -rf ${outside}/.claude`, project).code).toBe(0);
  });

  it('allows an echo string that merely contains the text', () => {
    expect(runBash(`echo 'do not ${RM} .claude/rules/MUST-x.md ever'`, project).code).toBe(0);
  });

  it('allows a git commit message mentioning the text', () => {
    expect(runBash(`git commit -m "${RM} .claude/rules/MUST-x.md"`, project).code).toBe(0);
  });

  it('allows git clean in dry-run mode', () => {
    expect(runBash('git clean -nd', project).code).toBe(0);
  });

  it('allows read-only listing of the rules directory', () => {
    expect(runBash('ls .claude/rules', project).code).toBe(0);
  });

  it('allows deleting a non-rule file under .claude', () => {
    expect(runBash(`${RM} .claude/settings.json`, project).code).toBe(0);
  });

  it('allows a heredoc body that contains a destructive-looking line', () => {
    expect(runBash(`cat <<EOF\n${RM} .claude/rules/MUST-x.md\nEOF`, project).code).toBe(0);
  });

  for (const tool of ['Write', 'Edit']) {
    it(`passes ${tool} tool events through (current behavior: not inspected)`, () => {
      const r = runRaw(
        JSON.stringify({
          tool_name: tool,
          tool_input: { file_path: join(project, '.claude/rules/MUST-x.md'), content: '' },
        }),
        project
      );
      expect(r.code).toBe(0);
    });
  }

  it('leaves the protected files untouched (guard never deletes anything itself)', () => {
    runBash(`${RM} .claude/rules/MUST-x.md`, project);
    expect(existsSync(join(project, '.claude/rules/MUST-x.md'))).toBe(true);
    expect(existsSync(join(project, 'templates/.claude/rules/MUST-x.md'))).toBe(true);
  });
});

describe('rule-deletion-guard: payload shapes', () => {
  it('still blocks with the legacy `tool` field', () => {
    const r = runRaw(
      JSON.stringify({ tool: 'Bash', tool_input: { command: `${RM} .claude/rules/MUST-x.md` } }),
      project
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(BLOCKED);
  });

  it('fails open on malformed JSON', () => {
    expect(runRaw('{not json', project).code).toBe(0);
  });

  it('fails open on empty stdin', () => {
    expect(runRaw('', project).code).toBe(0);
  });

  it('echoes an allowed payload back on stdout', () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    const r = Bun.spawnSync(['bash', GUARD], {
      cwd: project,
      env: { ...process.env, CLAUDE_PROJECT_DIR: project } as Record<string, string>,
      stdin: new TextEncoder().encode(payload),
    });
    expect(r.exitCode).toBe(0);
    expect(new TextDecoder().decode(r.stdout).trim()).toBe(payload);
  });

  it('resolves relative paths against the payload cwd when present', () => {
    // Process cwd is elsewhere; the payload cwd points into the project.
    const elsewhere = makeTemp('rdg-elsewhere-');
    const r = runBash(
      `${RM} .claude/rules/MUST-x.md`,
      project,
      { cwd: project },
      { cwd: elsewhere }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(BLOCKED);
  });

  it('does not treat a payload cwd outside the project as the project rules', () => {
    const outside = makeTemp('rdg-cwd-outside-');
    mkdirSync(join(outside, '.claude/rules'), { recursive: true });
    const r = runBash(`${RM} .claude/rules/MUST-x.md`, project, { cwd: outside });
    expect(r.code).toBe(0);
  });

  it('falls back to the process cwd when the payload has no cwd', () => {
    const r = runBash(`${RM} .claude/rules/MUST-x.md`, project, {}, { cwd: project });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(BLOCKED);
  });
});

describe('rule-deletion-guard: hermetic no-python3 fallback (legacy regex)', () => {
  const bashPath = Bun.which('bash');
  const haveJq = Bun.which('jq') !== null;

  /** PATH dir with symlinks to just the tools the guard needs; python3 is deliberately absent. */
  function hermeticBin(withJq: boolean): string {
    const bin = makeTemp('rdg-bin-');
    const names = ['bash', 'cat', 'grep', 'tr', 'sed', 'wc', 'basename', 'echo', 'printf'];
    if (withJq) {
      names.push('jq');
    }
    for (const name of names) {
      const src = Bun.which(name);
      if (src) {
        symlinkSync(src, join(bin, name));
      }
    }
    return bin;
  }

  const it_ = bashPath && haveJq ? it : it.skip;

  it_('uses the legacy regex check: blocks a plain rule deletion', () => {
    const bin = hermeticBin(true);
    const r = runBash(
      `${RM} .claude/rules/MUST-x.md`,
      project,
      {},
      { env: { PATH: bin }, bash: join(bin, 'bash') }
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(BLOCKED);
  });

  it_('legacy regex is coarser: blocks an unrelated delete that mentions the rules path', () => {
    const bin = hermeticBin(true);
    const r = runBash(
      `${RM} foo.txt; cat .claude/rules/MUST-x.md`,
      project,
      {},
      { env: { PATH: bin }, bash: join(bin, 'bash') }
    );
    expect(r.code).toBe(2);
  });

  it_('fails open when neither python3 nor jq is available', () => {
    const bin = hermeticBin(false);
    const r = runBash(
      `${RM} .claude/rules/MUST-x.md`,
      project,
      {},
      { env: { PATH: bin }, bash: join(bin, 'bash') }
    );
    expect(r.code).toBe(0);
  });
});

interface ShapeCase {
  name: string;
  command: string;
  /** Expected stderr substring for blocks (defaults to the generic block banner). */
  reason?: string;
}

function expectBlocks(cases: ShapeCase[]): void {
  for (const c of cases) {
    it(`blocks ${c.name}`, () => {
      const r = runBash(c.command, project);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(c.reason ?? BLOCKED);
    });
  }
}

function expectAllows(cases: ShapeCase[]): void {
  for (const c of cases) {
    it(`allows ${c.name}`, () => {
      expect(runBash(c.command, project).code).toBe(0);
    });
  }
}

describe('rule-deletion-guard: H1 reserved-word command heads', () => {
  expectBlocks([
    { name: 'then-branch', command: `if true; then ${RM} ${RULE}; fi` },
    { name: 'else-branch', command: `if false; then :; else ${RM} ${RULE}; fi` },
    { name: 'elif condition', command: `if false; then :; elif ${RM} ${RULE}; then :; fi` },
    { name: 'for-loop do', command: `for i in 1; do ${RM} ${RULE}; done` },
    { name: 'while condition', command: `while ${RM} ${RULE}; do break; done` },
    { name: 'until condition', command: `until ${RM} ${RULE}; do break; done` },
    { name: 'brace group', command: `{ ${RM} ${RULE}; }` },
    { name: 'negated command', command: `! ${RM} ${RULE}` },
    { name: 'function body forwarding "$@"', command: `f(){ ${RM} "$@"; }; f ${RULE}` },
  ]);
});

describe('rule-deletion-guard: H2 line continuation', () => {
  expectBlocks([
    { name: 'backslash-newline before the path', command: `${RM} -f \\\n${RULE}` },
    { name: 'backslash-newline inside the path', command: `${RM} -f .claude/\\\nrules/MUST-x.md` },
  ]);
});

describe('rule-deletion-guard: H3 wrappers and option values', () => {
  expectBlocks([
    { name: 'timeout wrapper', command: `timeout 5 ${RM} ${RULE}` },
    { name: 'gtimeout wrapper', command: `gtimeout 5 ${RM} ${RULE}` },
    { name: 'stdbuf wrapper', command: `stdbuf -o0 ${RM} ${RULE}` },
    { name: 'caffeinate wrapper', command: `caffeinate ${RM} ${RULE}` },
    { name: 'busybox wrapper', command: `busybox ${RM} ${RULE}` },
    { name: 'env -u X wrapper', command: `env -u X ${RM} ${RULE}` },
    { name: 'env -C dir wrapper', command: `env -C .claude ${RM} rules/MUST-x.md` },
    { name: 'git --work-tree <dir> rm', command: `git --work-tree . ${RM} ${RULE}` },
    { name: 'git --git-dir <dir> rm', command: `git --git-dir .git ${RM} ${RULE}` },
    { name: 'git --namespace <ns> rm', command: `git --namespace q ${RM} ${RULE}` },
    { name: 'find -exec mv', command: `find .claude/rules -exec ${MV} {} /tmp \\;` },
    { name: 'find -exec git rm', command: `find .claude/rules -exec git ${RM} {} +` },
    { name: 'find -exec sudo rm', command: `find .claude/rules -exec sudo ${RM} {} \\;` },
  ]);
});

describe('rule-deletion-guard: H4 heredoc markers inside quotes or comments', () => {
  expectBlocks([
    {
      name: 'quoted <<Z then a real deletion line',
      command: `echo "<<Z"\n${RM} -rf .claude/rules`,
    },
    {
      name: 'commented <<Z then a real deletion line',
      command: `ls # <<Z\n${RM} -rf .claude/rules`,
    },
  ]);
});

describe('rule-deletion-guard: H5 quoted operator characters as arguments', () => {
  expectBlocks(
    [';', '|', '(', '<'].map((op) => ({
      name: `quoted "${op}" argument before the path`,
      command: `${RM} "${op}" ${RULE}`,
    }))
  );
});

describe('rule-deletion-guard: H6 root-level globs and find without protected matches', () => {
  expectAllows([
    { name: 'delete of *.log at the project root', command: `${RM} -f *.log` },
    { name: 'delete of ./*.tmp at the project root', command: `${RM} -f ./*.tmp` },
    { name: 'mv of *.md into docs/ when no rule matches', command: `${MV} *.md docs/` },
    { name: 'find . -name "*.log" -delete', command: 'find . -name "*.log" -delete' },
    {
      name: 'find . -name "*.log" piped to xargs delete',
      command: `find . -name "*.log" | xargs ${RM}`,
    },
  ]);
  expectBlocks([
    {
      name: 'unfiltered recursive delete of * at the root',
      command: `${RM} -rf *`,
      reason: PARENT,
    },
    { name: 'unfiltered find . -delete', command: 'find . -delete' },
    { name: 'unfiltered find . -type f -delete', command: 'find . -type f -delete' },
  ]);
});

describe('rule-deletion-guard: find filter simulation', () => {
  expectBlocks([
    { name: 'find .claude -name "*.md" -delete', command: 'find .claude -name "*.md" -delete' },
    { name: 'find . -name "MUST-*.md" -delete', command: 'find . -name "MUST-*.md" -delete' },
    {
      name: 'find templates -path "*rules*" -delete',
      command: 'find templates -path "*rules*" -delete',
    },
    { name: 'find .claude -newer x -delete', command: 'find .claude -newer x -delete' },
  ]);
  expectAllows([
    { name: 'find .claude -name "*.tmp" -delete', command: 'find .claude -name "*.tmp" -delete' },
    {
      name: 'find .claude/rules -name "*.tmp" -delete',
      command: 'find .claude/rules -name "*.tmp" -delete',
    },
  ]);
});

describe('rule-deletion-guard: appends, descriptor redirects, variables, escapes', () => {
  expectBlocks([
    { name: '>> append onto a rule file (changed by design)', command: `echo x >> ${RULE}` },
    { name: '&>> append onto a rule file', command: `echo x &>> ${RULE}` },
    { name: '>& redirect onto a rule file', command: `echo x >& ${RULE}` },
    { name: '&> redirect onto a rule file', command: `echo x &> ${RULE}` },
    { name: 'env-var directory prefix', command: `D=.claude/rules; ${RM} $D/MUST-x.md` },
    { name: 'braced env-var ancestor', command: `D=.claude; ${RM} -rf \${D}/rules` },
    { name: 'xargs -n1', command: `echo ${RULE} | xargs -n1 ${RM}` },
    { name: 'xargs -r', command: `echo ${RULE} | xargs -r ${RM}` },
    { name: 'xargs --max-args 1', command: `echo ${RULE} | xargs --max-args 1 ${RM}` },
    { name: "$'...' ANSI-C quoted path", command: `${RM} $'.cla\\x75de/rules/MUST-x.md'` },
  ]);
});

describe('rule-deletion-guard: never weaker than the legacy regex guard', () => {
  // Representative payloads the legacy regex guard blocked; the quote-aware analyzer must still
  // block every one of them (G5 differential corpus, kept 2 -> 2).
  const legacyBlocked: string[] = [
    `${RM} ${RULE}`,
    `${RM} -rf .claude/rules`,
    `${RM} -rf .claude/rules/`,
    `${RM} -r -f .claude/rules`,
    `${RM} -f ./${RULE}`,
    `${RM} -rf templates/.claude/rules`,
    `${RM} -rf .claude`,
    `${RM} -rf templates/.claude`,
    `${MV} ${RULE} /tmp`,
    `${MV} /tmp/x.md ${RULE}`,
    'find .claude/rules -delete',
    'find templates/.claude/rules -delete',
    `echo ${RULE} | xargs ${RM}`,
    `sudo ${RM} ${RULE}`,
    `/bin/${RM} ${RULE}`,
    `git ${RM} ${RULE}`,
    `git ${RM} -r .claude/rules`,
    'git clean -fd',
    `truncate -s0 ${RULE}`,
    `echo hi > ${RULE}`,
    `bash -c '${RM} ${RULE}'`,
    `cd .claude && ${RM} -rf rules`,
    `${RM} ${RULE}; ls`,
    `ls && ${RM} ${RULE}`,
    `true || ${RM} ${RULE}`,
    `if true; then ${RM} ${RULE}; fi`,
    `(${RM} ${RULE})`,
  ];

  for (const command of legacyBlocked) {
    it(`still blocks: ${command}`, () => {
      expect(runBash(command, project).code).toBe(2);
    });
  }
});

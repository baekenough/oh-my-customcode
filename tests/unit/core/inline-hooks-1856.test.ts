import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// #1856 / #1775: behavior of three inline hooks in .claude/hooks/hooks.json.
// Payload shapes follow a CC 2.1.310 `claude -p` probe (PreToolUse Bash tool_input keys:
// command, description; PostToolUse Bash tool_response keys: interrupted, isImage,
// noOutputExpected, stderr, stdout). `run_in_background` in tool_input is [hypothesis].

const HOOKS_JSON = join(import.meta.dir, '..', '..', '..', '.claude', 'hooks', 'hooks.json');

const DEV =
  'Advise (additionalContext, never blocks) when a foreground dev server starts outside tmux/run_in_background - keeps logs accessible';
const MD = 'Non-blocking notice on new .md/.txt files (exit 1) - keeps docs consolidated';
const PR = 'Log PR URL and provide review command after PR creation';

function inlineCommand(description: string): string {
  const cfg = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8')) as {
    hooks: Record<string, Array<{ description?: string; hooks: Array<{ command?: string }> }>>;
  };
  for (const groups of Object.values(cfg.hooks)) {
    for (const g of groups) {
      if (g.description === description && g.hooks[0]?.command) return g.hooks[0].command;
    }
  }
  throw new Error(`no hook group with description: ${description}`);
}

function run(command: string, payload: unknown) {
  const p = Bun.spawnSync(['bash', '-c', command], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

const bash = (command: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command, description: 'start dev server', ...extra },
});

describe('dev-server PreToolUse advisory (#1856)', () => {
  const cmd = inlineCommand(DEV);

  const advisory = (command: string, extra: Record<string, unknown> = {}) => {
    const r = run(cmd, bash(command, extra));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.additionalContext).toContain('run_in_background');
    expect(out.hookSpecificOutput.additionalContext).toContain('tmux');
  };

  const silent = (command: string, extra: Record<string, unknown> = {}) => {
    const r = run(cmd, bash(command, extra));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  };

  it.each([
    'npm run dev',
    'FOO=1 npm run dev',
    'cd web && npm run dev',
    'pnpm dev',
    'bun run dev',
    'npm run dev -- --port 3000',
    '(cd web; npm run dev)',
    '(cd web && npm run dev)',
  ])('advises (exit 0, additionalContext) for foreground: %s', (c) => {
    advisory(c);
  });

  it('advises when run_in_background is explicitly false', () => {
    advisory('npm run dev', { run_in_background: false });
  });

  it.each([
    'git commit -m "mention npm run dev"',
    'echo "npm run dev"',
    'git grep -n "npm run dev" -- README.md',
    'nohup npm run dev > /tmp/x.log 2>&1 &',
    'npm run dev > /tmp/x.log 2>&1 &',
    'npm run dev:test',
    'npm run develop',
    'yarn devtools',
    "tmux new-session -d -s dev 'npm run dev'",
  ])('stays silent (exit 0, no output) for: %s', (c) => {
    silent(c);
  });

  it('stays silent when run_in_background is true', () => {
    silent('npm run dev', { run_in_background: true });
  });

  it('documents a known limitation: a leading tmux command masks a later foreground dev server', () => {
    // `tmux ls; npm run dev` starts with tmux, so the advisory stays silent (false negative; never blocks).
    silent('tmux ls; npm run dev');
  });

  const shells = ['/bin/sh', '/bin/dash'].filter((s) => existsSync(s));
  const inlineDescs = [DEV, MD, PR];
  for (const sh of shells) {
    it(`every inline hook parses and exits 0 for a plain ls -la payload under ${sh}`, () => {
      for (const d of inlineDescs) {
        const p = Bun.spawnSync([sh, '-c', inlineCommand(d)], {
          stdin: new TextEncoder().encode(JSON.stringify(bash('ls -la'))),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect({ d, code: p.exitCode, err: p.stderr.toString() }).toEqual({
          d,
          code: 0,
          err: '',
        });
      }
    });
  }

  it('advisory also works under /bin/sh', () => {
    const p = Bun.spawnSync(['/bin/sh', '-c', cmd], {
      stdin: new TextEncoder().encode(JSON.stringify(bash('pnpm dev'))),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).toContain('additionalContext');
  });
});

describe('.md creation PreToolUse hook (#1856)', () => {
  const cmd = inlineCommand(MD);
  const write = (file_path: string) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path, content: 'x' },
  });

  it('notices notes.md with exit 1, honest wording', () => {
    const r = run(cmd, write('/work/notes.md'));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('non-blocking');
    expect(r.stderr).not.toContain('BLOCKED');
  });

  it('exits 0 for README.md', () => {
    expect(run(cmd, write('/work/README.md')).code).toBe(0);
  });
});

describe('gh pr create PostToolUse hook (#1775)', () => {
  const cmd = inlineCommand(PR);
  const URL = 'https://github.com/example/repo/pull/42';
  const post = (extra: Record<string, unknown>) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'gh pr create --fill', description: 'create PR' },
    ...extra,
  });

  it('reads the URL from tool_response.stdout', () => {
    const r = run(
      cmd,
      post({
        tool_response: {
          interrupted: false,
          isImage: false,
          noOutputExpected: false,
          stderr: '',
          stdout: `${URL}\n`,
        },
      })
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toContain(`PR created: ${URL}`);
  });

  it('falls back to legacy tool_output.output', () => {
    const r = run(cmd, post({ tool_output: { output: URL } }));
    expect(r.stderr).toContain(`PR created: ${URL}`);
  });

  it('prints no PR line without a URL', () => {
    const r = run(cmd, post({ tool_response: { stdout: 'nothing here', stderr: '' } }));
    expect(r.stderr).not.toContain('PR created');
  });
});

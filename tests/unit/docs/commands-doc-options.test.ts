import { describe, expect, it } from 'bun:test';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = join(import.meta.dir, '..', '..', '..');
const CLI = join(ROOT, 'src', 'cli', 'index.ts');
// OMCUSTOM_COMMANDS_DOC_PATH exists only for mutation proofs (point at a scratch copy).
const DOC = readFileSync(
  process.env.OMCUSTOM_COMMANDS_DOC_PATH ?? join(ROOT, 'docs', 'guide', 'commands.md'),
  'utf-8'
);

/** `src/cli/index.ts` runs main() on import, so the definitions are read from `--help` output. */
async function help(commandPath: string[]): Promise<string> {
  const { stdout } = await execFileAsync('bun', ['run', CLI, ...commandPath, '--help'], {
    env: { ...process.env, OMCUSTOM_SKIP_SELF_UPDATE: 'true', NO_COLOR: '1' },
    timeout: 30_000,
  });
  return stdout;
}

function sectionLines(helpText: string, title: 'Options' | 'Commands'): string[] {
  const lines = helpText.split('\n');
  const start = lines.findIndex((l) => l.trim() === `${title}:`);
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') break;
    out.push(line);
  }
  return out;
}

/** Long flags (`--foo`) declared on the Options block, including `--no-*` forms. */
export function parseLongFlags(helpText: string): string[] {
  const flags: string[] = [];
  for (const line of sectionLines(helpText, 'Options')) {
    const m = line.match(/^\s{2}(?:-\w, )?(--[\w-]+)/);
    if (m?.[1]) flags.push(m[1]);
  }
  return flags;
}

/** Direct subcommand names from the Commands block (`help` excluded). */
export function parseSubcommands(helpText: string): string[] {
  const names: string[] = [];
  for (const line of sectionLines(helpText, 'Commands')) {
    const m = line.match(/^\s{2}([a-z][\w-]*)/);
    if (m?.[1] && m[1] !== 'help') names.push(m[1]);
  }
  return names;
}

/** True when `flag` appears in `text` as a whole token (`--skip` must not match `--skip-self`). */
export function mentionsFlag(text: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

/** Text of every `## ` section whose heading contains `command` as a word. */
function docSections(command: string): string {
  const parts = DOC.split(/^## /m).slice(1);
  return parts
    .filter((p) => (p.split('\n')[0] ?? '').split(/[^\w-]+/).includes(command))
    .join('\n');
}

interface CommandDef {
  path: string[];
  flags: string[];
}

async function collect(path: string[]): Promise<CommandDef[]> {
  const text = await help(path);
  const defs: CommandDef[] = [{ path, flags: parseLongFlags(text) }];
  const subs = await Promise.all(parseSubcommands(text).map((s) => collect([...path, s])));
  return defs.concat(subs.flat());
}

function findMissing({ path, flags }: CommandDef): string[] {
  if (path.length === 0) {
    return flags.filter((f) => !mentionsFlag(DOC, f)).map((f) => `(global) ${f}`);
  }
  const top = path[0] as string;
  const section = docSections(top);
  if (section === '') return [`section for ${top}`];
  const missing = DOC.includes(`omcustom ${top}`) ? [] : [`command ${top}`];
  for (const f of flags.filter((x) => x !== '--help')) {
    if (!mentionsFlag(section, f)) missing.push(`${path.join(' ')} ${f}`);
  }
  return missing;
}

describe('docs/guide/commands.md option coverage', () => {
  it('matcher: negative control and token boundaries', () => {
    expect(mentionsFlag(DOC, '--this-option-does-not-exist')).toBe(false);
    expect(mentionsFlag('`--skip-self`', '--skip')).toBe(false);
    expect(mentionsFlag('use --skip-self now', '--skip-self')).toBe(true);
    expect(mentionsFlag('`--no-agent-teams`', '--agent-teams')).toBe(false);
  });

  it('parser: reads known flags from real --help output', async () => {
    const init = parseLongFlags(await help(['init']));
    expect(init).toContain('--lang');
    expect(init).toContain('--no-agent-teams');
    expect(init).toContain('--skip-self');
  });

  it('documents every command and every long option of the real CLI', async () => {
    const defs = await collect([]);
    expect(defs.length).toBeGreaterThan(10);

    expect(defs.flatMap(findMissing)).toEqual([]);
  }, 120_000);
});

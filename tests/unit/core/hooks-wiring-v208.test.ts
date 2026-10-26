import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// v2.0.8 hook wiring (#1775, #1834, #1880): reads the committed source of truth
// (.claude/hooks/hooks.json) and the generated .claude/settings.json.

const ROOT = join(import.meta.dir, '..', '..', '..');

interface Group {
  matcher?: string;
  description?: string;
  hooks: { type: string; command?: string }[];
}
type Blocks = Record<string, Group[]>;

function load(rel: string): Blocks {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf-8')).hooks as Blocks;
}

function eventsReferencing(blocks: Blocks, script: string): string[] {
  return Object.entries(blocks)
    .filter(([, groups]) => groups.some((g) => g.hooks.some((h) => h.command?.includes(script))))
    .map(([event]) => event);
}

const SOURCES: [string, string][] = [
  ['hooks.json', '.claude/hooks/hooks.json'],
  ['settings.json', '.claude/settings.json'],
];

describe.each(SOURCES)('v2.0.8 hook wiring in %s', (_name, rel) => {
  const blocks = load(rel);
  const isSource = rel.endsWith('hooks.json');

  it('wires subagent-failure-advisor only under PostToolUseFailure', () => {
    expect(eventsReferencing(blocks, 'subagent-failure-advisor.sh')).toEqual([
      'PostToolUseFailure',
    ]);
    const group = blocks.PostToolUseFailure.find((g) =>
      g.hooks.some((h) => h.command?.includes('subagent-failure-advisor.sh'))
    ) as Group;
    expect(group.matcher).toBe(isSource ? 'tool == "Task" || tool == "Agent"' : 'Task|Agent');
  });

  it('keeps subagent-failure-advisor out of SubagentStop', () => {
    const commands = blocks.SubagentStop.flatMap((g) => g.hooks.map((h) => h.command ?? ''));
    expect(commands.some((c) => c.includes('subagent-failure-advisor'))).toBe(false);
  });

  it('wires bash-cd-advisor under PreToolUse with a Bash matcher', () => {
    expect(eventsReferencing(blocks, 'bash-cd-advisor.sh')).toEqual(['PreToolUse']);
    const group = blocks.PreToolUse.find((g) =>
      g.hooks.some((h) => h.command?.includes('bash-cd-advisor.sh'))
    ) as Group;
    expect(group.matcher).toBe(isSource ? 'tool == "Bash"' : 'Bash');
  });

  it('SubagentStop description no longer mentions auto-continue', () => {
    for (const g of blocks.SubagentStop) {
      expect(g.description ?? '').not.toContain('auto-continue');
      expect(g.description ?? '').not.toContain('failure advisory');
    }
  });

  it('FileChanged matcher contains no glob characters', () => {
    for (const g of blocks.FileChanged) {
      expect(g.matcher ?? '').not.toMatch(/[?[\]{}]/);
    }
  });
});

describe.each(SOURCES)('FileChanged matcher in %s', (_name, rel) => {
  // CC docs: the FileChanged matcher is split on "|" and each segment is registered as a
  // literal filename in the working directory, so "*" would watch a file literally named "*".
  const groups = load(rel).FileChanged;

  it('is not "*" and lists only literal filenames', () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.matcher).toBeDefined();
      expect(g.matcher).not.toBe('*');
      const segments = (g.matcher ?? '').split('|');
      expect(segments.length).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment).toMatch(/^[A-Za-z0-9._-]+$/);
      }
    }
  });
});

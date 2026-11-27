/**
 * Pure tests of the rules index merge (#1992): which entries of the project's
 * `.claude/rules/index.yaml` are carried into the template index, and when the index must be kept.
 * The plan/commit steps and update() are covered in updater-rules-index.test.ts.
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { Document, parse as parseYaml } from 'yaml';
import {
  carryProjectRuleEntries,
  type RuleIndexCarryInput,
  ruleFileOfIndexPath,
} from '../../../src/core/rules-index-merge.js';

interface IndexEntry {
  id?: unknown;
  title?: unknown;
  path?: unknown;
  scope?: unknown;
}

function entriesOf(content: string): IndexEntry[] {
  const parsed = parseYaml(content) as { rules?: IndexEntry[] };
  return parsed.rules ?? [];
}

const TEMPLATE = `# Global Rules

rules:
  # MUST - Never violate
  - id: R000
    name: language-policy
    title: Language & Delegation Policy
    path: ./MUST-language-policy.md
    priority: MUST
    scope: all

  - id: R001
    name: safety
    title: Safety Rules
    path: ./MUST-safety.md
    priority: MUST
    scope: all
`;

const TEMPLATE_FILES = new Set(['MUST-language-policy.md', 'MUST-safety.md']);

const USER_ENTRY = `
  # Project rule
  - id: R024
    name: learning-tutor
    title: Learning Tutor
    path: ./MUST-learning-tutor.md
    priority: MUST
    scope: all
`;

function carry(
  overrides: Partial<RuleIndexCarryInput>
): ReturnType<typeof carryProjectRuleEntries> {
  return carryProjectRuleEntries({
    existingContent: `${TEMPLATE}${USER_ENTRY}`,
    templateContent: TEMPLATE,
    filesOnDisk: new Set(['MUST-learning-tutor.md']),
    templateFiles: TEMPLATE_FILES,
    ...overrides,
  });
}

describe('ruleFileOfIndexPath', () => {
  it('normalizes ./ prefixes and keeps bare names', () => {
    expect(ruleFileOfIndexPath('./MUST-x.md')).toBe('MUST-x.md');
    expect(ruleFileOfIndexPath('././MUST-x.md')).toBe('MUST-x.md');
    expect(ruleFileOfIndexPath('MUST-x.md')).toBe('MUST-x.md');
  });

  it('NFC-normalizes the name', () => {
    expect(ruleFileOfIndexPath('./café.md')).toBe('café.md');
  });

  it('rejects non-strings, nested paths, parent escapes and non-markdown names', () => {
    expect(ruleFileOfIndexPath(42)).toBeNull();
    expect(ruleFileOfIndexPath(undefined)).toBeNull();
    expect(ruleFileOfIndexPath('./sub/MUST-x.md')).toBeNull();
    expect(ruleFileOfIndexPath('../MUST-x.md')).toBeNull();
    expect(ruleFileOfIndexPath('.\\MUST-x.md')).toBeNull();
    expect(ruleFileOfIndexPath('./MUST-x.yaml')).toBeNull();
    expect(ruleFileOfIndexPath('./.md')).toBeNull();
    expect(ruleFileOfIndexPath('')).toBeNull();
  });
});

describe('carryProjectRuleEntries', () => {
  it('appends a project rule entry (with its comment) after the unchanged template text', () => {
    const result = carry({ filesOnDisk: new Set([...TEMPLATE_FILES, 'MUST-learning-tutor.md']) });

    expect(result.carried).toEqual(['MUST-learning-tutor.md']);
    expect(result.warnings).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.lossy).toBe(false);
    expect(result.keep).toBeNull();
    const content = result.content ?? '';
    expect(content.startsWith(TEMPLATE)).toBe(true);
    expect(content).toContain('# Project rule');
    expect(entriesOf(content).map((e) => e.id)).toEqual(['R000', 'R001', 'R024']);
  });

  it('lists an entry whose rule file is missing on disk as an orphan, not as a lossy drop', () => {
    const result = carry({ filesOnDisk: TEMPLATE_FILES });

    expect(result.content).toBeNull();
    expect(result.carried).toEqual([]);
    expect(result.orphans).toEqual(['MUST-learning-tutor.md']);
    expect(result.lossy).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('treats an entry whose path differs from the file on disk only by case as an orphan', () => {
    const result = carry({ existingContent: `${TEMPLATE}  - path: ./must-learning-tutor.md\n` });

    expect(result.carried).toEqual([]);
    expect(result.orphans).toEqual(['must-learning-tutor.md']);
    expect(result.warnings).toEqual([]);
  });

  it('lists each orphan once and keeps a lossy drop next to it lossy', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - path: ./MUST-gone.md\n  - id: R030\n    path: ./MUST-gone.md\n  - path: ./sub/x.md\n`,
    });

    expect(result.orphans).toEqual(['MUST-gone.md']);
    expect(result.lossy).toBe(true);
    expect(result.warnings).toEqual([
      'Dropped the .claude/rules/index.yaml entry with path "./sub/x.md": unsupported path (only ./<name>.md directly in .claude/rules/ is kept).',
    ]);
  });

  it('resolves an alias to an anchor outside the carried entry', () => {
    const result = carry({
      existingContent: `x: &sc all\n${TEMPLATE}  - id: R024\n    path: ./MUST-custom.md\n    scope: *sc\n`,
      filesOnDisk: new Set(['MUST-custom.md']),
    });

    expect(result.lossy).toBe(true);
    expect(result.carried).toEqual(['MUST-custom.md']);
    const content = result.content ?? '';
    expect(content.startsWith(TEMPLATE)).toBe(true);
    expect(content).not.toContain('*sc');
    expect(entriesOf(content).find((e) => e.id === 'R024')).toEqual({
      id: 'R024',
      path: './MUST-custom.md',
      scope: 'all',
    } as IndexEntry);
    expect(result.warnings).toEqual([
      'Dropped the top-level key(s) x of .claude/rules/index.yaml (the template does not have them).',
      'Kept the .claude/rules/index.yaml entry for MUST-custom.md with its aliases resolved; its comments were not kept.',
    ]);
  });

  it('does not let an alias rebind to a same-named anchor of another carried entry', () => {
    const result = carry({
      existingContent: `rules:\n  - id: R024\n    path: ./MUST-x.md\n    scope: &s project\n  - id: R000\n    path: ./MUST-language-policy.md\n    scope: &s all\n  - id: R025\n    path: ./MUST-y.md\n    scope: *s\n`,
      filesOnDisk: new Set(['MUST-x.md', 'MUST-y.md']),
    });

    const entries = entriesOf(result.content ?? '');
    expect(entries.find((e) => e.id === 'R024')?.scope).toBe('project');
    expect(entries.find((e) => e.id === 'R025')?.scope).toBe('all');
    expect(result.warnings).toEqual([
      'Kept the .claude/rules/index.yaml entry for MUST-y.md with its aliases resolved; its comments were not kept.',
    ]);
  });

  it('resolves an alias that comes before a same-named anchor inside the entry', () => {
    const result = carry({
      existingContent: `rules:\n  - {id: R000, path: ./MUST-language-policy.md, s: &s outer}\n  - {id: R024, path: ./MUST-custom.md, a: *s, b: &s mine}\n`,
      filesOnDisk: new Set(['MUST-custom.md']),
    });

    const r024 = (
      parseYaml(result.content ?? '') as { rules: Array<Record<string, unknown>> }
    ).rules.find((e) => e.id === 'R024');
    expect(r024?.a).toBe('outer');
    expect(r024?.b).toBe('mine');
    expect(result.lossy).toBe(true);
  });

  it('keeps an entry whose aliases point at anchors inside the entry itself', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R024\n    path: ./MUST-custom.md\n    meta: &base { scope: all }\n    copy: *base\n`,
      filesOnDisk: new Set(['MUST-custom.md']),
    });

    expect(result.carried).toEqual(['MUST-custom.md']);
    expect(result.content).toContain('copy: *base');
    expect(result.warnings).toEqual([]);
  });

  it('drops each entry that cannot be written and returns a lossy no-carry result when none can', () => {
    const toStringSpy = spyOn(Document.prototype, 'toString').mockImplementation(() => {
      throw new Error('serialize boom');
    });
    try {
      const result = carry({});

      expect(result).toEqual({
        content: null,
        carried: [],
        orphans: [],
        lossy: true,
        keep: null,
        warnings: [
          'Dropped the .claude/rules/index.yaml entry for MUST-learning-tutor.md: it cannot be written (serialize boom).',
        ],
      });
    } finally {
      toStringSpy.mockRestore();
    }
  });

  it('returns a lossy no-carry result when the final write fails after the per-entry check passed', () => {
    const realToString = Document.prototype.toString;
    let calls = 0;
    const toStringSpy = spyOn(Document.prototype, 'toString').mockImplementation(function (
      this: Document,
      ...args: Parameters<Document['toString']>
    ) {
      calls += 1;
      if (calls !== 2) throw new Error(`boom ${calls}`);
      return realToString.apply(this, args);
    });
    try {
      const result = carry({});

      expect(result).toEqual({
        content: null,
        carried: [],
        orphans: [],
        lossy: true,
        keep: null,
        warnings: [
          'Could not write the project rule entries into .claude/rules/index.yaml (boom 3); wrote the template version.',
        ],
      });
    } finally {
      toStringSpy.mockRestore();
    }
  });

  it('keeps an entry with more than 100 aliases to its own anchor verbatim and carries the next one', () => {
    const scopes = Array.from({ length: 101 }, () => '*s').join(', ');
    const result = carry({
      existingContent: `rules:\n  - {id: R024, path: ./MUST-custom.md, a: &s project, scopes: [${scopes}]}\n  - {id: R025, path: ./MUST-other.md}\n`,
      filesOnDisk: new Set(['MUST-custom.md', 'MUST-other.md']),
    });

    expect(result.carried).toEqual(['MUST-custom.md', 'MUST-other.md']);
    expect(result.lossy).toBe(false);
    expect(result.content).toContain(`scopes: [ ${scopes} ]`);
  });

  it('drops only an entry with more than 100 aliases to an outside anchor', () => {
    const scopes = Array.from({ length: 101 }, () => '*s').join(', ');
    const result = carry({
      existingContent: `rules:\n  - {id: R000, path: ./MUST-language-policy.md, a: &s all}\n  - {id: R024, path: ./MUST-custom.md, scopes: [${scopes}]}\n  - {id: R025, path: ./MUST-other.md}\n`,
      filesOnDisk: new Set(['MUST-custom.md', 'MUST-other.md']),
    });

    expect(result.carried).toEqual(['MUST-other.md']);
    expect(result.warnings).toEqual([
      'Dropped the .claude/rules/index.yaml entry for MUST-custom.md: its aliases cannot be resolved (Excessive alias count indicates a resource exhaustion attack).',
    ]);
  });

  it('drops only an entry with a YAML 1.1 timestamp that cannot be written', () => {
    const result = carry({
      existingContent: `%YAML 1.1\n---\nrules:\n  - {id: R024, path: ./MUST-custom.md, added: 2026-11-24}\n  - {id: R025, path: ./MUST-other.md}\n`,
      filesOnDisk: new Set(['MUST-custom.md', 'MUST-other.md']),
    });

    expect(result.carried).toEqual(['MUST-other.md']);
    expect(entriesOf(result.content ?? '').map((e) => e.id)).toEqual(['R000', 'R001', 'R025']);
    expect(result.warnings).toEqual([
      'Dropped the .claude/rules/index.yaml entry for MUST-custom.md: it cannot be written (Tag not resolved for Date value).',
    ]);
  });

  it('resolves a path given as an alias before deciding', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R024\n    path: &p ./MUST-custom.md\n  - id: R025\n    path: *p\n  - id: R026\n    path: *missing\n`,
      filesOnDisk: new Set(['MUST-custom.md']),
    });

    expect(result.carried).toEqual(['MUST-custom.md']);
    expect(result.warnings).toEqual([
      'Dropped a repeated .claude/rules/index.yaml entry for MUST-custom.md (id R025): an earlier entry with the same file or id was kept.',
      'Dropped the .claude/rules/index.yaml entry (id R026) with path undefined: unsupported path (only ./<name>.md directly in .claude/rules/ is kept).',
    ]);
  });

  it('does not repeat a template section comment above a carried entry', () => {
    const template = `${TEMPLATE}\n  # MAY - Optional\n  - id: R005\n    path: ./MAY-optimization.md\n`;
    const result = carry({
      existingContent: `${TEMPLATE}\n  # MAY - Optional\n  - id: R024\n    path: ./MUST-custom.md\n\n  # My own heading\n  - id: R025\n    path: ./MUST-other.md\n`,
      templateContent: template,
      filesOnDisk: new Set(['MUST-custom.md', 'MUST-other.md']),
    });

    const content = result.content ?? '';
    expect(result.carried).toEqual(['MUST-custom.md', 'MUST-other.md']);
    expect(content.split('# MAY - Optional').length - 1).toBe(1);
    expect(content).toContain('# My own heading');
  });

  it('drops every leading template heading line, not only the first', () => {
    // Both lines are comments of TEMPLATE (document comment and the first entry's heading)
    expect(TEMPLATE).toContain('# Global Rules\n');
    expect(TEMPLATE).toContain('  # MUST - Never violate\n');
    const result = carry({
      existingContent: `${TEMPLATE}\n  # Global Rules\n  # MUST - Never violate\n  # my note\n  - id: R024\n    path: ./MUST-custom.md\n`,
      filesOnDisk: new Set(['MUST-custom.md']),
    });

    const appended = (result.content ?? '').slice(TEMPLATE.length);
    expect(appended).toBe('\n  # my note\n  - id: R024\n    path: ./MUST-custom.md\n');
  });

  it('drops only leading template heading lines (whitespace variants included) and keeps user lines', () => {
    const template = `${TEMPLATE}\n  # MAY - Optional\n  - id: R005\n    path: ./MAY-optimization.md\n`;
    for (const [heading, kept] of [
      ['  # MAY - Optional\n  # my note\n', '# my note'],
      ['  #MAY - Optional\n', null],
      ['  # my note\n  # MAY - Optional\n', '# MAY - Optional'],
    ] as const) {
      const result = carry({
        existingContent: `${TEMPLATE}\n${heading}  - id: R024\n    path: ./MUST-custom.md\n`,
        templateContent: template,
        filesOnDisk: new Set(['MUST-custom.md']),
      });

      const appended = (result.content ?? '').slice(template.length);
      expect(result.carried).toEqual(['MUST-custom.md']);
      expect(appended.includes('MAY - Optional')).toBe(kept === '# MAY - Optional');
      if (kept !== null) expect(appended).toContain(kept);
    }
  });

  it('refreshes template rule entries from the template (a stale existing entry is not carried)', () => {
    const stale = TEMPLATE.replace('title: Safety Rules', 'title: Stale Safety Title');
    const result = carry({
      existingContent: `${stale}${USER_ENTRY}`,
      filesOnDisk: new Set([...TEMPLATE_FILES, 'MUST-learning-tutor.md']),
    });

    const entries = entriesOf(result.content ?? '');
    expect(entries.find((e) => e.id === 'R001')?.title).toBe('Safety Rules');
    expect(result.content).not.toContain('Stale Safety Title');
  });

  it('treats a file named only by a template entry as a template rule', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R030\n    path: ./MUST-safety.md\n`,
      filesOnDisk: TEMPLATE_FILES,
      templateFiles: new Set(),
    });

    expect(result.carried).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.lossy).toBe(false);
  });

  it('skips a shipped (e.g. retired) rule file even when it is still on disk', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R016\n    path: ./SHOULD-retired.md\n`,
      filesOnDisk: new Set([...TEMPLATE_FILES, 'SHOULD-retired.md']),
      templateFiles: new Set([...TEMPLATE_FILES, 'SHOULD-retired.md']),
    });

    expect(result.content).toBeNull();
    expect(result.lossy).toBe(false);
  });

  it('drops a project entry whose id is used by a template rule, with a warning', () => {
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R001\n    path: ./MUST-learning-tutor.md\n`,
    });

    expect(result.content).toBeNull();
    expect(result.lossy).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('MUST-learning-tutor.md');
    expect(result.warnings[0]).toContain(
      'id R001 is used by a template rule. If it is a project rule, give it a new id'
    );
  });

  it('keeps only the first of repeated project entries (same file or same id)', () => {
    const existing = `${TEMPLATE}  - id: R024\n    path: ./MUST-a.md\n  - id: R025\n    path: MUST-a.md\n  - id: R024\n    path: ./MUST-b.md\n  - path: ./MUST-a.md\n`;
    const result = carry({
      existingContent: existing,
      filesOnDisk: new Set(['MUST-a.md', 'MUST-b.md']),
    });

    expect(result.carried).toEqual(['MUST-a.md']);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toContain('MUST-a.md (id R025)');
    expect(result.warnings[1]).toContain('MUST-b.md (id R024)');
    expect(result.warnings[2]).toContain('entry for MUST-a.md:');
    const entries = entriesOf(result.content ?? '');
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('carries an entry without an id, and an entry with a numeric id as a string id', () => {
    const existing = `${TEMPLATE}  - path: ./MUST-a.md\n  - id: 24\n    path: ./MUST-b.md\n  - id: [x]\n    path: ./MUST-c.md\n`;
    const result = carry({
      existingContent: existing,
      filesOnDisk: new Set(['MUST-a.md', 'MUST-b.md', 'MUST-c.md']),
    });

    expect(result.carried).toEqual(['MUST-a.md', 'MUST-b.md', 'MUST-c.md']);
  });

  it('drops non-map items, entries without a usable path and top-level keys other than rules', () => {
    const odd = carry({
      existingContent: `${TEMPLATE}  - just a string\n  - id: R024\n  - id: R025\n    path: ./sub/MUST-x.md\n`,
      filesOnDisk: new Set(['MUST-x.md']),
    });
    expect(odd.content).toBeNull();
    expect(odd.lossy).toBe(true);
    expect(odd.warnings).toEqual([
      'Dropped 1 non-map item(s) from the rules list of .claude/rules/index.yaml.',
      'Dropped the .claude/rules/index.yaml entry (id R024) with path undefined: unsupported path (only ./<name>.md directly in .claude/rules/ is kept).',
      'Dropped the .claude/rules/index.yaml entry (id R025) with path "./sub/MUST-x.md": unsupported path (only ./<name>.md directly in .claude/rules/ is kept).',
    ]);

    const nonString = carry({
      existingContent: `${TEMPLATE}  - path: 5\n`,
      filesOnDisk: new Set(),
    });
    expect(nonString.warnings).toEqual([
      'Dropped the .claude/rules/index.yaml entry with path 5: unsupported path (only ./<name>.md directly in .claude/rules/ is kept).',
    ]);

    // A map without a rules key has no entries; its other keys are dropped (lossy, not a keep)
    const noRules = carry({ existingContent: 'other: 1\n', filesOnDisk: new Set() });
    expect(noRules).toEqual({
      content: null,
      carried: [],
      orphans: [],
      warnings: [
        'Dropped the top-level key(s) other of .claude/rules/index.yaml (the template does not have them).',
      ],
      lossy: true,
      keep: null,
    });
  });

  it('treats an empty, whitespace-only or comment-only index as one without entries', () => {
    for (const existingContent of ['', '  \n\n', '# only a comment\n']) {
      expect(carry({ existingContent, filesOnDisk: new Set() })).toEqual({
        content: null,
        carried: [],
        orphans: [],
        warnings: [],
        lossy: false,
        keep: null,
      });
    }
  });

  it('keeps the existing index when it cannot be parsed', () => {
    const result = carry({ existingContent: 'rules:\n  - id: [\n' });

    expect(result.content).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.keep?.source).toBe('existing');
    expect(result.keep?.reason).toStartWith('it cannot be parsed as YAML (');
  });

  it('keeps the existing index when its rules is not a list or its top level is not a map', () => {
    for (const [existingContent, reason] of [
      ['rules:\n  a: 1\n', 'its top-level rules is not a list'],
      ['rules:\n', 'its top-level rules is not a list'],
      ['- a\n- b\n', 'its top level is not a map'],
      ['just text\n', 'its top level is not a map'],
    ] as const) {
      const result = carry({ existingContent });
      expect(result.keep).toEqual({ source: 'existing', reason });
      expect(result.content).toBeNull();
      expect(result.lossy).toBe(false);
    }
  });

  it('keeps the existing index when the template index has no rules list', () => {
    for (const templateContent of ['other: 1\n', 'rules:\n  - id: [\n', '']) {
      const result = carry({ templateContent });

      expect(result.content).toBeNull();
      expect(result.keep).toEqual({
        source: 'template',
        reason: 'the template index has no readable rules list',
      });
    }
  });

  it('does not fold long values of carried entries', () => {
    const longTitle = 'word '.repeat(40).trim();
    const result = carry({
      existingContent: `${TEMPLATE}  - id: R024\n    title: ${longTitle}\n    path: ./MUST-a.md\n`,
      filesOnDisk: new Set(['MUST-a.md']),
    });

    expect(result.content).toContain(`    title: ${longTitle}\n`);
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Regression for #1879: Claude Code substitutes in-range `$N` (0-based) with the
 * invocation arguments in SKILL.md (observed on CC 2.1.310 in a bash fence and
 * in prose; whether only single digits are recognized is undetermined [가설],
 * `$10` stayed literal with 3 args). `${N}` is not substituted, and the
 * out-of-range index observed (prose `$5`) stayed literal. So a SKILL.md body must contain no
 * `$<digit>` at all, except the `${N}` form. Dollar amounts are written
 * `USD 5`, never `$5` (with one URL argument `$0.01` would render as `<url>.01`).
 *
 * `findBareDigitParams` (shell fences only) is kept as the narrower check;
 * `findAnyDigitParams` is the full-body check applied to every SKILL.md.
 * No opt-out marker exists because no skill intentionally uses a `$N`
 * argument placeholder.
 */
const ROOT = resolve(import.meta.dir, '../../..');
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh']);

export function findBareDigitParams(markdown: string): string[] {
  const hits: string[] = [];
  let inShellFence = false;
  let inOtherFence = false;
  markdown.split('\n').forEach((line, idx) => {
    const fence = line.match(/^\s*```+\s*([A-Za-z0-9_-]*)/);
    if (fence) {
      if (inShellFence || inOtherFence) {
        inShellFence = false;
        inOtherFence = false;
      } else if (SHELL_LANGS.has(fence[1].toLowerCase())) {
        inShellFence = true;
      } else {
        inOtherFence = true;
      }
      return;
    }
    if (inShellFence && /\$[0-9]/.test(line)) {
      hits.push(`${idx + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

export function findAnyDigitParams(markdown: string): string[] {
  const hits: string[] = [];
  markdown.split('\n').forEach((line, idx) => {
    if (/\$[0-9]/.test(line)) hits.push(`${idx + 1}: ${line.trim()}`);
  });
  return hits;
}

function skillFiles(base: string): string[] {
  const dir = join(ROOT, base);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name, 'SKILL.md'))
    .filter((p) => existsSync(p));
}

describe('skill positional parameters (#1879)', () => {
  it('flags bare $1 in a bash fence', () => {
    const md = ['text', '```bash', 'f() { [ -f "$1" ]; }', '```'].join('\n');
    expect(findBareDigitParams(md)).toHaveLength(1);
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${N} fixture
  it('accepts ${1} in a bash fence', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${N} fixture
    const md = ['```bash', 'f() { [ -f "${1}" ]; }', '```'].join('\n');
    expect(findBareDigitParams(md)).toEqual([]);
  });

  it('shell-fence check ignores $5 in prose and in unlabeled fences', () => {
    const md = ['cost ~$5 per run', '```', 'budget $5', '```'].join('\n');
    expect(findBareDigitParams(md)).toEqual([]);
  });

  it('full-body check flags prose $5 and unlabeled-fence $5', () => {
    expect(findAnyDigitParams('cost ~$5 per run')).toHaveLength(1);
    expect(findAnyDigitParams(['```', 'budget $0.01', '```'].join('\n'))).toHaveLength(1);
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${N} fixture
  it('full-body check accepts USD 5 and ${1} anywhere', () => {
    expect(findAnyDigitParams('cost ~USD 5 per run')).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${N} fixture
    expect(findAnyDigitParams('prose ${1} here')).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${N} fixture
    expect(findAnyDigitParams(['```bash', 'f "${1}"', '```'].join('\n'))).toEqual([]);
  });

  for (const base of ['.claude/skills', 'templates/.claude/skills']) {
    const files = skillFiles(base);
    it(`finds skills under ${base}`, () => {
      expect(files.length).toBeGreaterThan(0);
    });
    for (const file of files) {
      it(`${file.slice(ROOT.length + 1)} has no bare $N in shell fences`, () => {
        expect(findBareDigitParams(readFileSync(file, 'utf-8'))).toEqual([]);
      });
      it(`${file.slice(ROOT.length + 1)} has no $N anywhere in the body`, () => {
        expect(findAnyDigitParams(readFileSync(file, 'utf-8'))).toEqual([]);
      });
    }
  }
});

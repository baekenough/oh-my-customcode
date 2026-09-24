import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildPrompt,
  collectImplementationStats,
  extractNamesFromReadme,
  extractSlashCommandsFromReadme,
  type ImplementationStats,
  INSTRUCTION_VISIBLE_LENGTH_ERROR_LIMIT,
  INSTRUCTION_VISIBLE_LENGTH_WARN_LIMIT,
  type InstructionFileInput,
  measureInstructionBudget,
  programmaticValidation,
  type SlashCommandValidation,
  stripHtmlComments,
  type ValidationResult,
} from '../../../.github/scripts/validate-docs';

// ---------------------------------------------------------------------------
// cwd fixture — collectImplementationStats() resolves repo-relative paths
// (`templates/.claude/agents`, `templates/.claude/skills`, `templates/.claude/rules`,
// `templates/guides`, etc.) against process.cwd(), so this suite must run with cwd
// at the repo root even though the test file itself now lives under tests/unit/scripts/.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(REPO_ROOT);
});

afterAll(() => {
  process.chdir(originalCwd);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATS_ALL_MATCH: ImplementationStats = {
  agent_count: 3,
  agent_names: ['lang-go-expert', 'lang-python-expert', 'lang-typescript-expert'],
  skill_count: 2,
  skill_names: ['typescript-best-practices', 'react-best-practices'],
  rule_count: 23,
  rule_must_count: 14,
  rule_should_count: 8,
  rule_may_count: 1,
  guide_count: 57,
  hook_count: 5,
  context_count: 2,
};

const README_WITH_CANONICAL_BLOCKS = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

### Rules (23)

| Priority | Count | Description |
|----------|-------|-------------|
| **MUST** | 14 | Safety, permissions |
| **SHOULD** | 8 | Interaction, error handling |
| **MAY** | 1 | Optimization |

### Guides (57)

Reference documentation covering best practices.

## Canonical agent IDs

\`\`\`text
lang-go-expert
lang-python-expert
lang-typescript-expert
\`\`\`

## Canonical skill IDs

\`\`\`text
typescript-best-practices
react-best-practices
\`\`\`
`;

const README_MISSING_AGENT = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

## Canonical agent IDs

\`\`\`text
lang-go-expert
lang-python-expert
\`\`\`

## Canonical skill IDs

\`\`\`text
typescript-best-practices
react-best-practices
\`\`\`
`;

const README_EXTRA_AGENT = `
# oh-my-customcode

We have Agents (3) in the system.

## Canonical agent IDs

\`\`\`text
lang-go-expert
lang-python-expert
lang-typescript-expert
lang-rust-expert
\`\`\`

## Canonical skill IDs

\`\`\`text
typescript-best-practices
react-best-practices
\`\`\`
`;

const README_COUNT_MISMATCH = `
# oh-my-customcode

We have Agents (99) in the system.

There are 99 skills available.
`;

// README with SHOULD mismatch: claims 6 SHOULD but actual is 8
const README_SHOULD_MISMATCH = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

### Rules (23)

| Priority | Count | Description |
|----------|-------|-------------|
| **MUST** | 14 | Safety, permissions |
| **SHOULD** | 6 | Interaction, error handling |
| **MAY** | 1 | Optimization |

### Guides (57)

Reference documentation.
`;

// README with internal breakdown sum mismatch: MUST(14)+SHOULD(6)+MAY(1)=21 ≠ header total 23
const README_BREAKDOWN_SUM_MISMATCH = `
# oh-my-customcode

### Rules (23)

| Priority | Count | Description |
|----------|-------|-------------|
| **MUST** | 14 | Safety, permissions |
| **SHOULD** | 6 | Interaction, error handling |
| **MAY** | 1 | Optimization |
`;

// README with guide count mismatch: claims 42 guides but actual is 57
const README_GUIDE_COUNT_MISMATCH = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

### Rules (23)

| Priority | Count | Description |
|----------|-------|-------------|
| **MUST** | 14 | Safety, permissions |
| **SHOULD** | 8 | Interaction, error handling |
| **MAY** | 1 | Optimization |

### Guides (42)

Reference documentation.
`;

// README with all rules/guides correctly stated (no breakdown, no mismatches)
const README_RULES_ALL_MATCH = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

### Rules (23)

| Priority | Count | Description |
|----------|-------|-------------|
| **MUST** | 14 | Safety, permissions |
| **SHOULD** | 8 | Interaction, error handling |
| **MAY** | 1 | Optimization |

### Guides (57)

Reference documentation.
`;

const README_NO_CANONICAL_BLOCKS = `
# oh-my-customcode

| Agent | Type |
|-------|------|
| lang-go-expert | language |
| lang-python-expert | language |
`;

const README_EMPTY = '';

const VALIDATION_ALL_CLEAN: ValidationResult = {
  missingFromReadme: { agents: [], skills: [] },
  extraInReadme: { agents: [], skills: [] },
  countMismatches: [],
};

const VALIDATION_WITH_ISSUES: ValidationResult = {
  missingFromReadme: { agents: ['lang-typescript-expert'], skills: ['react-best-practices'] },
  extraInReadme: { agents: ['phantom-agent'], skills: ['phantom-skill'] },
  countMismatches: [
    { field: 'agents', readme: 5, actual: 3 },
    { field: 'skills', readme: 10, actual: 2 },
  ],
};

const SLASH_COMMAND_VALIDATION_CLEAN: SlashCommandValidation = {
  valid: ['analysis', 'dev-review'],
  phantom: [],
};

const SLASH_COMMAND_VALIDATION_WITH_PHANTOM: SlashCommandValidation = {
  valid: ['analysis'],
  phantom: ['nonexistent-command'],
};

// ---------------------------------------------------------------------------
// extractNamesFromReadme
// ---------------------------------------------------------------------------

describe('extractNamesFromReadme', () => {
  test('extracts agents and skills from canonical blocks', () => {
    const result = extractNamesFromReadme(README_WITH_CANONICAL_BLOCKS);

    expect(result.agents).toEqual([
      'lang-go-expert',
      'lang-python-expert',
      'lang-typescript-expert',
    ]);
    expect(result.skills).toEqual(['typescript-best-practices', 'react-best-practices']);
  });

  test('returns empty arrays for empty string input', () => {
    const result = extractNamesFromReadme(README_EMPTY);

    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  test('returns empty arrays when no canonical blocks exist', () => {
    const result = extractNamesFromReadme(README_NO_CANONICAL_BLOCKS);

    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  test('returns empty arrays for empty canonical blocks', () => {
    const readme = `
## Canonical agent IDs

\`\`\`text
\`\`\`

## Canonical skill IDs

\`\`\`text
\`\`\`
`;
    const result = extractNamesFromReadme(readme);

    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  test('trims whitespace from extracted names', () => {
    const readme = `
## Canonical agent IDs

\`\`\`text
  lang-go-expert
  lang-python-expert
\`\`\`
`;
    const result = extractNamesFromReadme(readme);

    expect(result.agents).toEqual(['lang-go-expert', 'lang-python-expert']);
  });

  test('handles readme with only agent block (no skill block)', () => {
    const readme = `
## Canonical agent IDs

\`\`\`text
lang-go-expert
\`\`\`
`;
    const result = extractNamesFromReadme(readme);

    expect(result.agents).toEqual(['lang-go-expert']);
    expect(result.skills).toEqual([]);
  });

  test('handles readme with only skill block (no agent block)', () => {
    const readme = `
## Canonical skill IDs

\`\`\`text
typescript-best-practices
\`\`\`
`;
    const result = extractNamesFromReadme(readme);

    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual(['typescript-best-practices']);
  });
});

// ---------------------------------------------------------------------------
// extractSlashCommandsFromReadme
// ---------------------------------------------------------------------------

describe('extractSlashCommandsFromReadme', () => {
  test('extracts slash commands from table rows', () => {
    const readme = `
| Command | Description |
|---------|-------------|
| \`/analysis\` | Analyze project |
| \`/dev-review\` | Code review |
| \`/help\` | Show help |
`;
    const result = extractSlashCommandsFromReadme(readme);

    expect(result).toEqual(['analysis', 'dev-review', 'help']);
  });

  test('returns empty array when no slash commands found', () => {
    const result = extractSlashCommandsFromReadme(README_NO_CANONICAL_BLOCKS);

    expect(result).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    const result = extractSlashCommandsFromReadme('');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// programmaticValidation
// ---------------------------------------------------------------------------

describe('programmaticValidation', () => {
  test('returns no issues when all names and counts match', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_WITH_CANONICAL_BLOCKS);

    expect(result.missingFromReadme.agents).toEqual([]);
    expect(result.missingFromReadme.skills).toEqual([]);
    expect(result.extraInReadme.agents).toEqual([]);
    expect(result.extraInReadme.skills).toEqual([]);
    expect(result.countMismatches).toEqual([]);
  });

  test('detects agent missing from readme', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_MISSING_AGENT);

    expect(result.missingFromReadme.agents).toContain('lang-typescript-expert');
    expect(result.missingFromReadme.skills).toEqual([]);
  });

  test('detects extra agent in readme that does not exist in implementation', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_EXTRA_AGENT);

    expect(result.extraInReadme.agents).toContain('lang-rust-expert');
    expect(result.extraInReadme.skills).toEqual([]);
  });

  test('detects agent count mismatch', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_COUNT_MISMATCH);

    const agentMismatch = result.countMismatches.find((m) => m.field === 'agents');
    expect(agentMismatch).toBeDefined();
    expect(agentMismatch?.readme).toBe(99);
    expect(agentMismatch?.actual).toBe(3);
  });

  test('detects skill count mismatch', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_COUNT_MISMATCH);

    const skillMismatch = result.countMismatches.find((m) => m.field === 'skills');
    expect(skillMismatch).toBeDefined();
    expect(skillMismatch?.readme).toBe(99);
    expect(skillMismatch?.actual).toBe(2);
  });

  test('skips name comparison when no canonical blocks present', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_NO_CANONICAL_BLOCKS);

    expect(result.missingFromReadme.agents).toEqual([]);
    expect(result.missingFromReadme.skills).toEqual([]);
    expect(result.extraInReadme.agents).toEqual([]);
    expect(result.extraInReadme.skills).toEqual([]);
  });

  test('skips name comparison for empty readme', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_EMPTY);

    expect(result.missingFromReadme.agents).toEqual([]);
    expect(result.missingFromReadme.skills).toEqual([]);
    expect(result.extraInReadme.agents).toEqual([]);
    expect(result.extraInReadme.skills).toEqual([]);
    expect(result.countMismatches).toEqual([]);
  });

  test('does not report count mismatch when counts match', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_WITH_CANONICAL_BLOCKS);

    expect(result.countMismatches).toEqual([]);
  });

  test('detects missing skills in readme', () => {
    const statsWithExtraSkill: ImplementationStats = {
      ...STATS_ALL_MATCH,
      skill_count: 3,
      skill_names: ['typescript-best-practices', 'react-best-practices', 'golang-best-practices'],
    };
    const result = programmaticValidation(statsWithExtraSkill, README_WITH_CANONICAL_BLOCKS);

    expect(result.missingFromReadme.skills).toContain('golang-best-practices');
  });

  test('detects extra skills in readme', () => {
    const readme = `
## Canonical agent IDs

\`\`\`text
lang-go-expert
lang-python-expert
lang-typescript-expert
\`\`\`

## Canonical skill IDs

\`\`\`text
typescript-best-practices
react-best-practices
phantom-skill
\`\`\`
`;
    const result = programmaticValidation(STATS_ALL_MATCH, readme);

    expect(result.extraInReadme.skills).toContain('phantom-skill');
  });

  // ---------------------------------------------------------------------------
  // Rule priority breakdown validation
  // ---------------------------------------------------------------------------

  test('detects SHOULD classification mismatch (README 6 vs actual 8)', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_SHOULD_MISMATCH);

    const shouldMismatch = result.countMismatches.find((m) => m.field === 'rules-should');
    expect(shouldMismatch).toBeDefined();
    expect(shouldMismatch?.readme).toBe(6);
    expect(shouldMismatch?.actual).toBe(8);
  });

  test('does not report MUST or MAY mismatch when only SHOULD is wrong', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_SHOULD_MISMATCH);

    expect(result.countMismatches.find((m) => m.field === 'rules-must')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-may')).toBeUndefined();
  });

  test('detects internal breakdown sum mismatch (14+6+1=21 ≠ header 23)', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_BREAKDOWN_SUM_MISMATCH);

    const sumMismatch = result.countMismatches.find((m) => m.field === 'rules-breakdown-sum');
    expect(sumMismatch).toBeDefined();
    // readme field holds the README header total (23), actual holds the sum (21)
    expect(sumMismatch?.readme).toBe(23);
    expect(sumMismatch?.actual).toBe(21);
  });

  test('detects guide count mismatch (README 42 vs actual 57)', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_GUIDE_COUNT_MISMATCH);

    const guideMismatch = result.countMismatches.find((m) => m.field === 'guides');
    expect(guideMismatch).toBeDefined();
    expect(guideMismatch?.readme).toBe(42);
    expect(guideMismatch?.actual).toBe(57);
  });

  test('returns no rule/guide mismatches when all match', () => {
    const result = programmaticValidation(STATS_ALL_MATCH, README_RULES_ALL_MATCH);

    expect(result.countMismatches.find((m) => m.field === 'rules')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-must')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-should')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-may')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-breakdown-sum')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'guides')).toBeUndefined();
    expect(result.countMismatches).toEqual([]);
  });

  test('skips rules/guides checks when patterns are absent from README', () => {
    // README_NO_CANONICAL_BLOCKS has no rules/guides count lines → no false positives
    const result = programmaticValidation(STATS_ALL_MATCH, README_NO_CANONICAL_BLOCKS);

    expect(result.countMismatches.find((m) => m.field === 'rules')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-must')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-should')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-may')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'guides')).toBeUndefined();
    expect(result.countMismatches.find((m) => m.field === 'rules-breakdown-sum')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  const readmeKo = '# 한국어 README';

  test('includes stats JSON in the prompt', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).toContain('"agent_count": 3');
    expect(prompt).toContain('"skill_count": 2');
    expect(prompt).toContain('"rule_count": 23');
  });

  test('includes success message when validation has no issues', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).toContain(
      '✅ 모든 agent/skill 이름과 개수가 README와 실제 구현에서 정확히 일치합니다.'
    );
  });

  test('includes mismatch details when validation has issues', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_WITH_ISSUES,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).toContain('불일치 발견');
    expect(prompt).toContain('lang-typescript-expert');
    expect(prompt).toContain('react-best-practices');
    expect(prompt).toContain('phantom-agent');
    expect(prompt).toContain('phantom-skill');
    expect(prompt).toContain('agents 개수: README=5, 실제=3');
    expect(prompt).toContain('skills 개수: README=10, 실제=2');
  });

  test('includes slash command success message when no phantom commands', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).toContain('README의 모든 슬래시 커맨드');
    expect(prompt).toContain('SKILL.md가 존재합니다');
  });

  test('includes phantom slash command details when present', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_WITH_PHANTOM
    );

    expect(prompt).toContain('Phantom 슬래시 커맨드 발견');
    expect(prompt).toContain('/nonexistent-command');
  });

  test('includes readme content in the prompt', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).toContain('oh-my-customcode');
    expect(prompt).toContain('한국어 README');
  });

  test('does not include success message when issues are present', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_WITH_ISSUES,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(prompt).not.toContain(
      '✅ 모든 agent/skill 이름과 개수가 README와 실제 구현에서 정확히 일치합니다.'
    );
  });

  test('returns a non-empty string', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN
    );

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// LLM verdict regex — inline tests for emoji-prefixed and plain formats
// ---------------------------------------------------------------------------

describe('LLM verdict regex parsing', () => {
  // Mirrors the fixed regex from validate-docs.ts lines 450-451
  const hasExplicitFail = (result: string) => /최종 판정[\s\S]*?\*\*(❌\s*)?FAIL\*\*/i.test(result);
  const hasExplicitPass = (result: string) => /최종 판정[\s\S]*?\*\*(✅\s*)?PASS\*\*/i.test(result);

  test('detects PASS with emoji prefix (**✅ PASS**)', () => {
    const result = '최종 판정\n**✅ PASS**';
    expect(hasExplicitPass(result)).toBe(true);
    expect(hasExplicitFail(result)).toBe(false);
  });

  test('detects FAIL with emoji prefix (**❌ FAIL**)', () => {
    const result = '최종 판정\n**❌ FAIL**';
    expect(hasExplicitFail(result)).toBe(true);
    expect(hasExplicitPass(result)).toBe(false);
  });

  test('detects PASS without emoji (**PASS**)', () => {
    const result = '최종 판정\n**PASS**';
    expect(hasExplicitPass(result)).toBe(true);
    expect(hasExplicitFail(result)).toBe(false);
  });

  test('detects FAIL without emoji (**FAIL**)', () => {
    const result = '최종 판정\n**FAIL**';
    expect(hasExplicitFail(result)).toBe(true);
    expect(hasExplicitPass(result)).toBe(false);
  });

  test('detects PASS with emoji and no space (**✅PASS**)', () => {
    const result = '최종 판정: **✅PASS**';
    expect(hasExplicitPass(result)).toBe(true);
  });

  test('detects FAIL with emoji and no space (**❌FAIL**)', () => {
    const result = '최종 판정: **❌FAIL**';
    expect(hasExplicitFail(result)).toBe(true);
  });

  test('returns false for PASS when result contains only FAIL', () => {
    const result = '최종 판정\n**❌ FAIL**\n문서에 불일치가 있습니다.';
    expect(hasExplicitPass(result)).toBe(false);
    expect(hasExplicitFail(result)).toBe(true);
  });

  test('returns false for FAIL when result contains only PASS', () => {
    const result = '최종 판정\n**✅ PASS**\n모든 항목이 일치합니다.';
    expect(hasExplicitFail(result)).toBe(false);
    expect(hasExplicitPass(result)).toBe(true);
  });

  test('returns false when 최종 판정 section is absent', () => {
    const result = '**✅ PASS**';
    expect(hasExplicitPass(result)).toBe(false);
    expect(hasExplicitFail(result)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Additional edge cases (v0.33.0)
  // ---------------------------------------------------------------------------

  test('detects PASS with multiple spaces between emoji and verdict (**✅  PASS**)', () => {
    // \s* in the regex matches zero or more whitespace characters including multiple spaces
    const result = '최종 판정\n**✅  PASS**';
    expect(hasExplicitPass(result)).toBe(true);
    expect(hasExplicitFail(result)).toBe(false);
  });

  test('detects FAIL with multiple spaces between emoji and verdict (**❌  FAIL**)', () => {
    const result = '최종 판정\n**❌  FAIL**';
    expect(hasExplicitFail(result)).toBe(true);
    expect(hasExplicitPass(result)).toBe(false);
  });

  test('detects PASS when verdict appears inline with surrounding text', () => {
    // [\s\S]*? in the section regex is lazy and spans lines, so inline text on the same
    // line as the verdict is allowed
    const result = '최종 판정: 결과 **✅ PASS** 완료';
    expect(hasExplicitPass(result)).toBe(true);
  });

  test('detects FAIL when verdict appears inline with surrounding text', () => {
    const result = '최종 판정: 결과 **❌ FAIL** 오류 발생';
    expect(hasExplicitFail(result)).toBe(true);
  });

  test('detects lowercase pass (**✅ pass**) due to case-insensitive flag', () => {
    // /i flag makes the regex case-insensitive
    const result = '최종 판정\n**✅ pass**';
    expect(hasExplicitPass(result)).toBe(true);
  });

  test('detects mixed-case Pass (**✅ Pass**) due to case-insensitive flag', () => {
    const result = '최종 판정\n**✅ Pass**';
    expect(hasExplicitPass(result)).toBe(true);
  });

  test('detects lowercase fail (**❌ fail**) due to case-insensitive flag', () => {
    const result = '최종 판정\n**❌ fail**';
    expect(hasExplicitFail(result)).toBe(true);
  });

  test('detects mixed-case Fail (**❌ Fail**) due to case-insensitive flag', () => {
    const result = '최종 판정\n**❌ Fail**';
    expect(hasExplicitFail(result)).toBe(true);
  });

  test('handles verdict split across lines with multiple newlines between', () => {
    // [\s\S]*? spans across all whitespace including multiple newline characters
    const result = '최종 판정\n\n\n**PASS**';
    expect(hasExplicitPass(result)).toBe(true);
    expect(hasExplicitFail(result)).toBe(false);
  });

  test('does not match PASS in bold text that lacks 최종 판정 prefix', () => {
    // The regex requires 최종 판정 before the verdict — a bold PASS alone is not matched
    const result = '다른 섹션\n**PASS**';
    expect(hasExplicitPass(result)).toBe(false);
    expect(hasExplicitFail(result)).toBe(false);
  });

  test('handles both PASS and FAIL in same output — both predicates return true', () => {
    // When the LLM output contains two 최종 판정 sections (edge case),
    // hasExplicitPass and hasExplicitFail can both be true simultaneously.
    // The [\s\S]*? lazy match will find whichever verdict appears first after each section header.
    const result = '최종 판정\n**PASS**\n\n다른 최종 판정\n**FAIL**';
    expect(hasExplicitPass(result)).toBe(true);
    // hasExplicitFail: 최종 판정[\s\S]*?FAIL — the lazy quantifier finds the second section
    expect(hasExplicitFail(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectImplementationStats — smoke test (uses real templates/ directory)
// ---------------------------------------------------------------------------

describe('collectImplementationStats', () => {
  // Expected values below are computed from ABSOLUTE paths (rooted at REPO_ROOT),
  // independent of process.cwd() — mirroring the exact directory/filter logic that
  // collectImplementationStats() (.github/scripts/validate-docs.ts) applies to its
  // (cwd-relative) `templates/...` paths. Because the expected side does not depend
  // on the cwd pin above, a broken pin (collectImplementationStats() reading from
  // the wrong cwd, e.g. an empty/unrelated directory) makes `stats.*` diverge from
  // these expected values instead of both sides vacuously agreeing on zero.
  const TEMPLATES_DIR = join(REPO_ROOT, 'templates');

  const mdFileNames = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.md'));

  const skillDirNames = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => existsSync(join(dir, d.name, 'SKILL.md')))
      .map((d) => d.name);

  test('returns an object with all required numeric fields', async () => {
    const stats = await collectImplementationStats();

    expect(typeof stats.agent_count).toBe('number');
    expect(typeof stats.skill_count).toBe('number');
    expect(typeof stats.rule_count).toBe('number');
    expect(typeof stats.rule_must_count).toBe('number');
    expect(typeof stats.rule_should_count).toBe('number');
    expect(typeof stats.rule_may_count).toBe('number');
    expect(typeof stats.guide_count).toBe('number');
    expect(typeof stats.hook_count).toBe('number');
    expect(typeof stats.context_count).toBe('number');
  });

  test('agent_count/agent_names match templates/.claude/agents on disk (catches a broken cwd pin)', async () => {
    const stats = await collectImplementationStats();
    const expectedNames = mdFileNames(join(TEMPLATES_DIR, '.claude', 'agents')).map((f) =>
      f.replace('.md', '')
    );

    expect(stats.agent_count).toBeGreaterThan(0);
    expect(stats.agent_count).toBe(expectedNames.length);
    expect([...stats.agent_names].sort()).toEqual([...expectedNames].sort());
  });

  test('skill_count/skill_names match templates/.claude/skills on disk (catches a broken cwd pin)', async () => {
    const stats = await collectImplementationStats();
    const expectedNames = skillDirNames(join(TEMPLATES_DIR, '.claude', 'skills'));

    expect(stats.skill_count).toBeGreaterThan(0);
    expect(stats.skill_count).toBe(expectedNames.length);
    expect([...stats.skill_names].sort()).toEqual([...expectedNames].sort());
  });

  test('rule_count and MUST/SHOULD/MAY breakdown match templates/.claude/rules on disk (catches a broken cwd pin)', async () => {
    const stats = await collectImplementationStats();
    const ruleFiles = mdFileNames(join(TEMPLATES_DIR, '.claude', 'rules'));

    expect(stats.rule_count).toBeGreaterThan(0);
    expect(stats.rule_count).toBe(ruleFiles.length);
    expect(stats.rule_must_count).toBe(ruleFiles.filter((f) => f.startsWith('MUST-')).length);
    expect(stats.rule_should_count).toBe(ruleFiles.filter((f) => f.startsWith('SHOULD-')).length);
    expect(stats.rule_may_count).toBe(ruleFiles.filter((f) => f.startsWith('MAY-')).length);
  });

  test('rule breakdown sum equals rule_count', async () => {
    const stats = await collectImplementationStats();

    expect(stats.rule_must_count + stats.rule_should_count + stats.rule_may_count).toBe(
      stats.rule_count
    );
  });

  test('rule breakdown counts are non-negative integers', async () => {
    const stats = await collectImplementationStats();

    expect(stats.rule_must_count).toBeGreaterThanOrEqual(0);
    expect(stats.rule_should_count).toBeGreaterThanOrEqual(0);
    expect(stats.rule_may_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stats.rule_must_count)).toBe(true);
    expect(Number.isInteger(stats.rule_should_count)).toBe(true);
    expect(Number.isInteger(stats.rule_may_count)).toBe(true);
  });

  test('returns agent_names array consistent with agent_count', async () => {
    const stats = await collectImplementationStats();

    expect(Array.isArray(stats.agent_names)).toBe(true);
    expect(stats.agent_names.length).toBe(stats.agent_count);
  });

  test('returns skill_names array consistent with skill_count', async () => {
    const stats = await collectImplementationStats();

    expect(Array.isArray(stats.skill_names)).toBe(true);
    expect(stats.skill_names.length).toBe(stats.skill_count);
  });

  test('agent_count is a non-negative integer', async () => {
    const stats = await collectImplementationStats();

    expect(stats.agent_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stats.agent_count)).toBe(true);
  });

  test('skill_count is a non-negative integer', async () => {
    const stats = await collectImplementationStats();

    expect(stats.skill_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stats.skill_count)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripHtmlComments / measureInstructionBudget — instruction budget gate (#1717)
// ---------------------------------------------------------------------------

describe('stripHtmlComments', () => {
  test('removes a single HTML comment', () => {
    expect(stripHtmlComments('before<!-- hidden -->after')).toBe('beforeafter');
  });

  test('removes multi-line HTML comments (dotall)', () => {
    const input = 'a<!--\nline1\nline2\n-->b';
    expect(stripHtmlComments(input)).toBe('ab');
  });

  test('removes multiple non-overlapping comments (non-greedy)', () => {
    const input = 'x<!-- one -->y<!-- two -->z';
    expect(stripHtmlComments(input)).toBe('xyz');
  });

  test('leaves stray --> when a nested comment closes the outer comment early', () => {
    // <!-- a <!-- b --> is matched first (non-greedy up to the FIRST -->),
    // leaving " c -->" behind as visible text with a stray closer.
    const input = '<!-- a <!-- b --> c -->';
    expect(stripHtmlComments(input)).toBe(' c -->');
  });

  test('leaves an unclosed <!-- untouched', () => {
    expect(stripHtmlComments('before<!-- never closed')).toBe('before<!-- never closed');
  });

  test('returns input unchanged when there are no comments', () => {
    expect(stripHtmlComments('plain text, no markers')).toBe('plain text, no markers');
  });
});

describe('measureInstructionBudget', () => {
  const makeFiles = (entries: Array<[string, string]>): InstructionFileInput[] =>
    entries.map(([file, content]) => ({ file, content }));

  test('comment-stripped measurement ignores HTML comments', () => {
    const files = makeFiles([
      ['CLAUDE.md', 'visible text<!-- this comment is not counted at all -->more visible'],
    ]);
    const result = measureInstructionBudget(files);

    expect(result.files[0].rawLength).toBe(
      'visible text<!-- this comment is not counted at all -->more visible'.length
    );
    expect(result.files[0].visibleLength).toBe('visible textmore visible'.length);
    expect(result.totalVisibleLength).toBe('visible textmore visible'.length);
    expect(result.totalVisibleLength).toBeLessThan(result.totalRawLength);
  });

  test('reports no errors/warnings when total is well under the warn limit', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(1000)]]);
    const result = measureInstructionBudget(files);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.totalVisibleLength).toBe(1000);
  });

  test('total > 150,000 visible chars produces an error', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(150_001)]]);
    const result = measureInstructionBudget(files);

    expect(result.totalVisibleLength).toBe(150_001);
    expect(result.errors.some((e) => e.includes('Instruction budget exceeded'))).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('total exactly at 150,000 does not error (boundary is exclusive)', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(INSTRUCTION_VISIBLE_LENGTH_ERROR_LIMIT)]]);
    const result = measureInstructionBudget(files);

    expect(result.errors).toEqual([]);
  });

  test('total in (140,000, 150,000] range produces a warning only, no error', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(140_001)]]);
    const result = measureInstructionBudget(files);

    expect(result.totalVisibleLength).toBe(140_001);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Instruction budget warning'))).toBe(true);
  });

  test('total exactly at 140,000 does not warn (boundary is exclusive)', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(INSTRUCTION_VISIBLE_LENGTH_WARN_LIMIT)]]);
    const result = measureInstructionBudget(files);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('a stray --> outside any comment produces an error', () => {
    const files = makeFiles([['MUST-safety.md', 'some text --> more text, no opener at all']]);
    const result = measureInstructionBudget(files);

    expect(result.files[0].hasStrayCommentMarker).toBe(true);
    expect(
      result.errors.some(
        (e) => e.includes('MUST-safety.md') && e.includes('stray HTML comment marker')
      )
    ).toBe(true);
  });

  test('nested comment `<!-- a <!-- b --> c -->` leaves a stray --> and errors', () => {
    const files = makeFiles([['MUST-orchestrator-coordination.md', '<!-- a <!-- b --> c -->']]);
    const result = measureInstructionBudget(files);

    expect(result.files[0].visibleLength).toBeGreaterThan(0);
    expect(result.files[0].hasStrayCommentMarker).toBe(true);
    expect(
      result.errors.some(
        (e) => e.includes('MUST-orchestrator-coordination.md') && e.includes('nested')
      )
    ).toBe(true);
  });

  test('clean nested-looking but properly closed comments do not error', () => {
    // A single well-formed comment with no interior "-->" — not the nested-defect case.
    const files = makeFiles([
      ['CLAUDE.md', 'visible<!-- just one comment, nothing tricky -->text'],
    ]);
    const result = measureInstructionBudget(files);

    expect(result.files[0].hasStrayCommentMarker).toBe(false);
    expect(result.errors).toEqual([]);
  });

  test('computes total across multiple files and sorts topFiles by visible size descending', () => {
    const files = makeFiles([
      ['small.md', 'a'.repeat(10)],
      ['big.md', 'b'.repeat(1000)],
      ['medium.md', 'c'.repeat(100)],
      ['tiny.md', 'd'.repeat(5)],
    ]);
    const result = measureInstructionBudget(files);

    expect(result.totalVisibleLength).toBe(10 + 1000 + 100 + 5);
    expect(result.topFiles.map((f) => f.file)).toEqual(['big.md', 'medium.md', 'small.md']);
    expect(result.topFiles).toHaveLength(3);
  });

  test('respects custom errorLimit/warnLimit options', () => {
    const files = makeFiles([['CLAUDE.md', 'a'.repeat(50)]]);
    const result = measureInstructionBudget(files, { errorLimit: 40, warnLimit: 20 });

    expect(result.errors.some((e) => e.includes('Instruction budget exceeded'))).toBe(true);
  });

  test('returns empty result for no files', () => {
    const result = measureInstructionBudget([]);

    expect(result.files).toEqual([]);
    expect(result.totalVisibleLength).toBe(0);
    expect(result.totalRawLength).toBe(0);
    expect(result.topFiles).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

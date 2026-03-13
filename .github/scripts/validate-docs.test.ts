import { describe, test, expect } from 'bun:test';
import {
  extractNamesFromReadme,
  programmaticValidation,
  buildPrompt,
  collectImplementationStats,
  extractSlashCommandsFromReadme,
  type ImplementationStats,
  type ValidationResult,
  type SlashCommandValidation,
} from './validate-docs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATS_ALL_MATCH: ImplementationStats = {
  agent_count: 3,
  agent_names: ['lang-go-expert', 'lang-python-expert', 'lang-typescript-expert'],
  skill_count: 2,
  skill_names: ['typescript-best-practices', 'react-best-practices'],
  rule_count: 18,
  guide_count: 24,
  hook_count: 5,
  context_count: 2,
};

const README_WITH_CANONICAL_BLOCKS = `
# oh-my-customcode

We have Agents (3) in the system.

There are 2 skills available.

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
      SLASH_COMMAND_VALIDATION_CLEAN,
    );

    expect(prompt).toContain('"agent_count": 3');
    expect(prompt).toContain('"skill_count": 2');
    expect(prompt).toContain('"rule_count": 18');
  });

  test('includes success message when validation has no issues', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN,
    );

    expect(prompt).toContain('✅ 모든 agent/skill 이름과 개수가 README와 실제 구현에서 정확히 일치합니다.');
  });

  test('includes mismatch details when validation has issues', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_WITH_ISSUES,
      SLASH_COMMAND_VALIDATION_CLEAN,
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
      SLASH_COMMAND_VALIDATION_CLEAN,
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
      SLASH_COMMAND_VALIDATION_WITH_PHANTOM,
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
      SLASH_COMMAND_VALIDATION_CLEAN,
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
      SLASH_COMMAND_VALIDATION_CLEAN,
    );

    expect(prompt).not.toContain('✅ 모든 agent/skill 이름과 개수가 README와 실제 구현에서 정확히 일치합니다.');
  });

  test('returns a non-empty string', () => {
    const prompt = buildPrompt(
      STATS_ALL_MATCH,
      README_WITH_CANONICAL_BLOCKS,
      readmeKo,
      VALIDATION_ALL_CLEAN,
      SLASH_COMMAND_VALIDATION_CLEAN,
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
  const hasExplicitFail = (result: string) =>
    /최종 판정[\s\S]*?\*\*(❌\s*)?FAIL\*\*/i.test(result);
  const hasExplicitPass = (result: string) =>
    /최종 판정[\s\S]*?\*\*(✅\s*)?PASS\*\*/i.test(result);

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
});

// ---------------------------------------------------------------------------
// collectImplementationStats — smoke test (uses real templates/ directory)
// ---------------------------------------------------------------------------

describe('collectImplementationStats', () => {
  test('returns an object with all required numeric fields', async () => {
    const stats = await collectImplementationStats();

    expect(typeof stats.agent_count).toBe('number');
    expect(typeof stats.skill_count).toBe('number');
    expect(typeof stats.rule_count).toBe('number');
    expect(typeof stats.guide_count).toBe('number');
    expect(typeof stats.hook_count).toBe('number');
    expect(typeof stats.context_count).toBe('number');
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

#!/usr/bin/env bun
/**
 * Documentation Validator Script
 * - Uses Claude API to validate that documentation matches implementation
 * - Checks agent/skill/rule counts, CLI commands, and feature descriptions
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

export interface ImplementationStats {
  agent_count: number;
  agent_names: string[];
  skill_count: number;
  skill_names: string[];
  rule_count: number;
  rule_must_count: number;
  rule_should_count: number;
  rule_may_count: number;
  guide_count: number;
  hook_count: number;
  context_count: number;
}

export interface ValidationResult {
  missingFromReadme: { agents: string[]; skills: string[] };
  extraInReadme: { agents: string[]; skills: string[] };
  countMismatches: { field: string; readme: number; actual: number }[];
}

export interface SlashCommandValidation {
  valid: string[];    // Commands that have a matching SKILL.md
  phantom: string[]; // Commands listed in README but missing SKILL.md
}

/** Count-bearing fields checked across secondary doc files (README_ko, templates/*). */
export type DocCountField = 'agents' | 'skills' | 'rules' | 'guides';

/** A count mismatch discovered in a secondary doc file (not the primary README.md). */
export interface DocCountMismatch {
  file: string;
  field: DocCountField;
  documented: number;
  actual: number;
}

/**
 * Regex patterns tried in priority order per field. The first pattern that matches
 * the file content wins (mirrors the single-match style of `programmaticValidation`
 * for the primary README.md). A field with no matching pattern is skipped entirely —
 * this avoids false positives on files that never mention that count.
 *
 * Patterns cover both English and Korean phrasing observed across README_ko.md,
 * templates/CLAUDE.md.en, templates/CLAUDE.md.ko, and templates/README.md:
 *   - Headings:        "### Agents (49)", "## 에이전트 (49개)"
 *   - Table totals:     "| **Total** | **49** |", "| **총계** | **49** |"
 *   - Tree comments:    "agents/  # Subagent definitions (49 files)",
 *                       "agents/  # 서브에이전트 정의 (49 파일)",
 *                       "skills/  # Skills (118 directories)"
 *   - Inline prose:     "49개 에이전트", "57개 레퍼런스 문서", "23 governance rules"
 */
const DOC_COUNT_PATTERNS: Record<DocCountField, RegExp[]> = {
  agents: [
    /#{1,3}\s*Agents?\s*\((\d+)\)/i,
    /#{1,3}\s*에이전트\s*\((\d+)\s*개?\)/,
    /\*\*(?:Total|총계)\*\*\s*\|\s*\*\*(\d+)\*\*/i,
    /agents\/[^\n]*?(\d+)\s*(?:files?|파일|개)\)/i,
    /(\d+)\s*개\s*에이전트/,
    /(\d+)\s*agents?\b/i,
  ],
  skills: [
    /#{1,3}\s*Skills?\s*\((\d+)\)/i,
    /#{1,3}\s*스킬\s*\((\d+)\s*개?\)/,
    /skills\/[^\n]*?(\d+)\s*(?:directories|파일|디렉토리|개)\)/i,
    /(\d+)\s*개\s*스킬/,
    /(\d+)\s*skills?\b/i,
  ],
  rules: [
    /#{1,3}\s*Rules?\s*\((\d+)\)/i,
    /#{1,3}\s*규칙\s*\((\d+)\s*개?\)/,
    /(\d+)\s*개\s*(?:거버넌스\s*)?규칙/,
    /(\d+)\s*governance rules/i,
    /(\d+)\s*rules?\b/i,
  ],
  guides: [
    /#{1,3}\s*Guides?\s*\((\d+)\)/i,
    /#{1,3}\s*가이드\s*\((\d+)\s*개?\)/,
    /guides\/[^\n]*?(\d+)\s*(?:topics|토픽|개)\)/i,
    /(\d+)\s*개\s*레퍼런스\s*문서/,
    /(\d+)\s*reference documents/i,
    /(\d+)\s*개\s*가이드/,
    /(\d+)\s*guides?\b/i,
  ],
};

const DOC_COUNT_FIELD_TO_STATS_KEY: Record<DocCountField, keyof ImplementationStats> = {
  agents: 'agent_count',
  skills: 'skill_count',
  rules: 'rule_count',
  guides: 'guide_count',
};

/**
 * Checks a single doc file's content for stale agents/skills/rules/guides counts
 * against the actual implementation stats. Returns one mismatch entry per field
 * where a count is documented AND differs from the actual count. Fields whose
 * count is not mentioned in the file (no pattern match) are silently skipped —
 * this is intentional to avoid false positives (see DOC_COUNT_PATTERNS doc comment).
 */
export function validateDocFileCounts(
  file: string,
  content: string,
  stats: ImplementationStats,
): DocCountMismatch[] {
  const mismatches: DocCountMismatch[] = [];

  if (!content) {
    return mismatches;
  }

  for (const field of Object.keys(DOC_COUNT_PATTERNS) as DocCountField[]) {
    const patterns = DOC_COUNT_PATTERNS[field];
    let documented: number | undefined;

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1] !== undefined) {
        documented = parseInt(match[1], 10);
        break;
      }
    }

    if (documented === undefined) {
      continue;
    }

    const actual = stats[DOC_COUNT_FIELD_TO_STATS_KEY[field]] as number;
    if (documented !== actual) {
      mismatches.push({ file, field, documented, actual });
    }
  }

  return mismatches;
}

/**
 * Reads and validates the secondary doc files that `programmaticValidation` does
 * NOT cover (it only checks the primary README.md). Extends coverage to
 * README_ko.md and the templates/ mirrors, closing the CI blind spot where a
 * count regression in these files could pass validation silently.
 * Missing files are skipped (not an error) — see step 2 requirement.
 */
export async function validateAdditionalDocFiles(
  stats: ImplementationStats,
): Promise<DocCountMismatch[]> {
  const files = [
    'README_ko.md',
    path.join('templates', 'CLAUDE.md.en'),
    path.join('templates', 'CLAUDE.md.ko'),
    path.join('templates', 'README.md'),
  ];

  const mismatches: DocCountMismatch[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const content = await extractReadmeClaims(file);
    mismatches.push(...validateDocFileCounts(file, content, stats));
  }

  return mismatches;
}

export async function collectImplementationStats(): Promise<ImplementationStats> {
  const stats: ImplementationStats = {
    agent_count: 0,
    agent_names: [],
    skill_count: 0,
    skill_names: [],
    rule_count: 0,
    rule_must_count: 0,
    rule_should_count: 0,
    rule_may_count: 0,
    guide_count: 0,
    hook_count: 0,
    context_count: 0,
  };

  const templatesDir = 'templates';

  // Count agents
  const agentsDir = path.join(templatesDir, '.claude/agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    stats.agent_count = files.length;
    stats.agent_names = files.map((f) => f.replace('.md', ''));
  }

  // Count skills (directories with SKILL.md)
  const skillsDir = path.join(templatesDir, '.claude/skills');
  if (fs.existsSync(skillsDir)) {
    const dirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')));
    stats.skill_count = dirs.length;
    stats.skill_names = dirs.map((d) => d.name);
  }

  // Count rules (total and per-priority breakdown by filename prefix)
  const rulesDir = path.join(templatesDir, '.claude/rules');
  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'));
    stats.rule_count = ruleFiles.length;
    stats.rule_must_count = ruleFiles.filter((f) => f.startsWith('MUST-')).length;
    stats.rule_should_count = ruleFiles.filter((f) => f.startsWith('SHOULD-')).length;
    stats.rule_may_count = ruleFiles.filter((f) => f.startsWith('MAY-')).length;
  }

  // Count guides (subdirectories)
  const guidesDir = path.join(templatesDir, 'guides');
  if (fs.existsSync(guidesDir)) {
    stats.guide_count = fs
      .readdirSync(guidesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
  }

  // Count hooks (files, not hidden)
  const hooksDir = path.join(templatesDir, '.claude/hooks');
  if (fs.existsSync(hooksDir)) {
    stats.hook_count = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.json')).length;
  }

  // Count contexts
  const contextsDir = path.join(templatesDir, '.claude/contexts');
  if (fs.existsSync(contextsDir)) {
    stats.context_count = fs.readdirSync(contextsDir).filter((f) => f.endsWith('.md')).length;
  }

  return stats;
}

async function extractReadmeClaims(path: string): Promise<string> {
  try {
    const file = Bun.file(path);
    return await file.text();
  } catch {
    return '';
  }
}

export function extractNamesFromReadme(readme: string): { agents: string[]; skills: string[] } {
  const agents: string[] = [];
  const skills: string[] = [];

  // Extract from "Canonical agent IDs" code block
  const agentMatch = readme.match(/Canonical agent IDs[^`]*```(?:text)?\n([\s\S]*?)```/);
  if (agentMatch) {
    agents.push(...agentMatch[1].trim().split('\n').map((l) => l.trim()).filter(Boolean));
  }

  // Extract from "Canonical skill IDs" code block
  const skillMatch = readme.match(/Canonical skill IDs[^`]*```(?:text)?\n([\s\S]*?)```/);
  if (skillMatch) {
    skills.push(...skillMatch[1].trim().split('\n').map((l) => l.trim()).filter(Boolean));
  }

  return { agents, skills };
}

/**
 * Extracts slash command names from the README slash-commands table.
 * Matches table rows of the form: | `/command-name` | Description |
 */
export function extractSlashCommandsFromReadme(readmeContent: string): string[] {
  const commands: string[] = [];
  const pattern = /^\|\s*`\/([a-z][a-z0-9-]*)`\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(readmeContent)) !== null) {
    commands.push(match[1]);
  }
  return commands;
}

/**
 * Validates that every slash command listed in the README has a corresponding
 * SKILL.md file under templates/.claude/skills/<command-name>/SKILL.md.
 */
export function validateSlashCommands(readmeContent: string, skillsDir: string): SlashCommandValidation {
  const commands = extractSlashCommandsFromReadme(readmeContent);

  const valid: string[] = [];
  const phantom: string[] = [];

  for (const command of commands) {
    const skillPath = path.join(skillsDir, command, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      valid.push(command);
    } else {
      phantom.push(command);
    }
  }

  return { valid, phantom };
}

export function programmaticValidation(stats: ImplementationStats, readmeEn: string): ValidationResult {
  const readme = extractNamesFromReadme(readmeEn);

  // If canonical ID blocks are not found, skip name comparison
  // to avoid false positives when README uses table format instead
  const hasCanonicalBlocks = readme.agents.length > 0 || readme.skills.length > 0;

  const missingFromReadme = hasCanonicalBlocks
    ? {
        agents: stats.agent_names.filter((a) => !readme.agents.includes(a)),
        skills: stats.skill_names.filter((s) => !readme.skills.includes(s)),
      }
    : { agents: [], skills: [] };

  const extraInReadme = hasCanonicalBlocks
    ? {
        agents: readme.agents.filter((a) => !stats.agent_names.includes(a)),
        skills: readme.skills.filter((s) => !stats.skill_names.includes(s)),
      }
    : { agents: [], skills: [] };

  const countMismatches: { field: string; readme: number; actual: number }[] = [];

  // Check counts mentioned in README (look for patterns like "42 agents" or "Agents (42)")
  const agentCountMatch = readmeEn.match(/(?:Agents?\s*\(?(\d+)\)?|(\d+)\s*agents?)/i);
  if (agentCountMatch) {
    const readmeCount = parseInt(agentCountMatch[1] || agentCountMatch[2]);
    if (readmeCount !== stats.agent_count) {
      countMismatches.push({ field: 'agents', readme: readmeCount, actual: stats.agent_count });
    }
  }

  const skillCountMatch = readmeEn.match(/(?:Skills?\s*\(?(\d+)\)?|(\d+)\s*skills?)/i);
  if (skillCountMatch) {
    const readmeCount = parseInt(skillCountMatch[1] || skillCountMatch[2]);
    if (readmeCount !== stats.skill_count) {
      countMismatches.push({ field: 'skills', readme: readmeCount, actual: stats.skill_count });
    }
  }

  // Check rules total count: matches "Rules (N)" or "N governance rules"
  const ruleCountMatch = readmeEn.match(/(?:Rules\s*\((\d+)\)|(\d+)\s*governance rules)/i);
  if (ruleCountMatch) {
    const readmeCount = parseInt(ruleCountMatch[1] || ruleCountMatch[2]);
    if (readmeCount !== stats.rule_count) {
      countMismatches.push({ field: 'rules', readme: readmeCount, actual: stats.rule_count });
    }
  }

  // Check guides count: matches "Guides (N)" or "N reference documents"
  const guideCountMatch = readmeEn.match(/(?:Guides\s*\((\d+)\)|(\d+)\s*reference documents)/i);
  if (guideCountMatch) {
    const readmeCount = parseInt(guideCountMatch[1] || guideCountMatch[2]);
    if (readmeCount !== stats.guide_count) {
      countMismatches.push({ field: 'guides', readme: readmeCount, actual: stats.guide_count });
    }
  }

  // Check rule priority breakdown: matches table rows like "| **MUST** | N |"
  const mustMatch = readmeEn.match(/\|\s*\*\*MUST\*\*\s*\|\s*(\d+)\s*\|/);
  if (mustMatch) {
    const readmeCount = parseInt(mustMatch[1]);
    if (readmeCount !== stats.rule_must_count) {
      countMismatches.push({ field: 'rules-must', readme: readmeCount, actual: stats.rule_must_count });
    }
  }

  const shouldMatch = readmeEn.match(/\|\s*\*\*SHOULD\*\*\s*\|\s*(\d+)\s*\|/);
  if (shouldMatch) {
    const readmeCount = parseInt(shouldMatch[1]);
    if (readmeCount !== stats.rule_should_count) {
      countMismatches.push({ field: 'rules-should', readme: readmeCount, actual: stats.rule_should_count });
    }
  }

  const mayMatch = readmeEn.match(/\|\s*\*\*MAY\*\*\s*\|\s*(\d+)\s*\|/);
  if (mayMatch) {
    const readmeCount = parseInt(mayMatch[1]);
    if (readmeCount !== stats.rule_may_count) {
      countMismatches.push({ field: 'rules-may', readme: readmeCount, actual: stats.rule_may_count });
    }
  }

  // Check internal sum consistency: README breakdown MUST+SHOULD+MAY should equal README rules total
  if (ruleCountMatch && mustMatch && shouldMatch && mayMatch) {
    const readmeTotal = parseInt(ruleCountMatch[1] || ruleCountMatch[2]);
    const readmeMust = parseInt(mustMatch[1]);
    const readmeShould = parseInt(shouldMatch[1]);
    const readmeMay = parseInt(mayMatch[1]);
    const readmeBreakdownSum = readmeMust + readmeShould + readmeMay;
    if (readmeBreakdownSum !== readmeTotal) {
      countMismatches.push({ field: 'rules-breakdown-sum', readme: readmeTotal, actual: readmeBreakdownSum });
    }
  }

  return { missingFromReadme, extraInReadme, countMismatches };
}

export function buildPrompt(
  stats: ImplementationStats,
  readmeEn: string,
  readmeKo: string,
  validation: ValidationResult,
  slashCommandValidation: SlashCommandValidation,
): string {
  const statsJson = JSON.stringify(stats, null, 2);

  return `당신은 oh-my-customcode 프로젝트의 문서 검증 전문가입니다.
구현 현황과 README 문서를 비교하여 불일치 사항을 찾아주세요.

---

## 구현 현황 (실제 파일 기반)

\`\`\`json
${statsJson}
\`\`\`

---

## 프로그래밍적 검증 결과 (확정 - 변경 금지)

다음은 코드로 검증한 확정적 결과입니다. 이 결과를 절대 변경하거나 재해석하지 마세요.

${validation.missingFromReadme.agents.length === 0 && validation.missingFromReadme.skills.length === 0 && validation.extraInReadme.agents.length === 0 && validation.extraInReadme.skills.length === 0 && validation.countMismatches.length === 0
  ? '✅ 모든 agent/skill 이름과 개수가 README와 실제 구현에서 정확히 일치합니다.'
  : `불일치 발견:
${validation.missingFromReadme.agents.length > 0 ? `- README에 누락된 agents: ${validation.missingFromReadme.agents.join(', ')}` : ''}
${validation.missingFromReadme.skills.length > 0 ? `- README에 누락된 skills: ${validation.missingFromReadme.skills.join(', ')}` : ''}
${validation.extraInReadme.agents.length > 0 ? `- README에만 있는 agents (실제 미존재): ${validation.extraInReadme.agents.join(', ')}` : ''}
${validation.extraInReadme.skills.length > 0 ? `- README에만 있는 skills (실제 미존재): ${validation.extraInReadme.skills.join(', ')}` : ''}
${validation.countMismatches.map((m) => `- ${m.field} 개수: README=${m.readme}, 실제=${m.actual}`).join('\n')}`
}

### 슬래시 커맨드 검증 (확정 - 변경 금지)

${slashCommandValidation.phantom.length === 0
  ? `✅ README의 모든 슬래시 커맨드(${slashCommandValidation.valid.length}개)에 대응하는 SKILL.md가 존재합니다.`
  : `❌ Phantom 슬래시 커맨드 발견 (README에 있으나 SKILL.md 미존재):
${slashCommandValidation.phantom.map((c) => `- /${c}`).join('\n')}
유효한 커맨드(${slashCommandValidation.valid.length}개): ${slashCommandValidation.valid.map((c) => `/${c}`).join(', ')}`
}

---

## README.md (English)

\`\`\`markdown
${readmeEn}
\`\`\`

---

## README_ko.md (Korean)

\`\`\`markdown
${readmeKo}
\`\`\`

---

## 검증 항목

**중요**: agent/skill 이름 목록과 개수 비교는 위의 프로그래밍적 검증 결과를 그대로 사용하세요.
이름 목록을 직접 비교하거나 재해석하지 마세요. 프로그래밍적 결과가 최종입니다.

당신은 다음만 검증하세요:

1. **언어 일관성**: README.md와 README_ko.md의 정보가 일치하는가?
2. **오래된 정보**: 더 이상 존재하지 않는 기능이 문서에 남아있는가?
3. **의미적 일관성**: 기능 설명이 실제 구현과 맞는가?
4. **누락된 기능**: 새로 추가된 기능이 문서에 반영되었는가?

---

## 마커 사용 규칙 (엄격히 준수)

| 마커 | 사용 조건 | 예시 |
|------|----------|------|
| ✅ | EN과 KO가 동일하거나 정확한 번역일 때 | 숫자, 목록, 구조가 양쪽 일치 |
| ⚠️ | EN과 KO 사이에 **구체적이고 명확한 사실적 불일치**가 있을 때만 | EN에는 있는 정보가 KO에 없음, 숫자 불일치, 항목 누락 |
| ❌ | 실제 구현과 문서가 불일치할 때 | 삭제된 기능이 문서에 남아있음 |
| ℹ️ | 의미적 제안, 분류 의견, 개선 아이디어 (CI에 영향 없음) | "이 분류가 더 적합할 수 있음", "톤 차이" |

**중요**: 다음은 ⚠️가 아닌 ℹ️로 표시하세요:
- 스킬/에이전트 분류에 대한 의견 (예: "X는 Y 카테고리가 더 적합")
- 번역 톤이나 스타일의 사소한 차이
- 슬래시 커맨드 등재 여부에 대한 제안 (실제 EN↔KO 불일치가 아닌 경우)
- 양쪽 README에서 동일하게 존재하는 잠재적 문제 (이것은 EN↔KO 불일치가 아님)

## 응답 형식 (Markdown)

> 🔍 **Documentation Validator**

### 검증 결과

(✅ 일치 / ⚠️ 불일치 / ❌ 오류 / ℹ️ 참고)

### 발견된 불일치

| 항목 | README.md 값 | README_ko.md 값 | 판정 |
|------|-------------|----------------|------|
| (⚠️ 또는 ❌ 항목만 나열) |

### 참고사항 (선택)

(ℹ️ 항목 나열 — CI에 영향 없음)

### 권장 수정사항

(⚠️/❌ 항목에 대한 수정 제안만)

### 최종 판정

**PASS** 또는 **FAIL**

- FAIL: ⚠️ 또는 ❌가 1개 이상 존재
- PASS: ✅와 ℹ️만 존재 (ℹ️는 참고사항이므로 PASS)

### 요약

(전체 검증 결과 요약 1-2문장)

---
_이 검증은 Claude API에 의해 자동 수행되었습니다._
`;
}

function printProgrammaticResults(
  stats: ImplementationStats,
  validation: ValidationResult,
  slashCommandValidation: SlashCommandValidation,
  additionalDocMismatches: DocCountMismatch[] = [],
): boolean {
  console.log('📋 Programmatic Validation Results');

  const hasProgrammaticIssues =
    validation.missingFromReadme.agents.length > 0 ||
    validation.missingFromReadme.skills.length > 0 ||
    validation.extraInReadme.agents.length > 0 ||
    validation.extraInReadme.skills.length > 0 ||
    validation.countMismatches.length > 0 ||
    slashCommandValidation.phantom.length > 0 ||
    additionalDocMismatches.length > 0;

  // Agent count line
  const agentMismatch = validation.countMismatches.find((m) => m.field === 'agents');
  if (agentMismatch) {
    console.log(`❌ Agent count: README=${agentMismatch.readme}, actual=${agentMismatch.actual}`);
  } else {
    console.log(`✅ Agent count: ${stats.agent_count} (matched)`);
  }

  // Skill count line
  const skillMismatch = validation.countMismatches.find((m) => m.field === 'skills');
  if (skillMismatch) {
    console.log(`❌ Skill count: README=${skillMismatch.readme}, actual=${skillMismatch.actual}`);
  } else {
    console.log(`✅ Skill count: ${stats.skill_count} (matched)`);
  }

  // Missing/extra agents
  if (validation.missingFromReadme.agents.length > 0) {
    console.log(`❌ Agents missing from README: ${validation.missingFromReadme.agents.join(', ')}`);
  }
  if (validation.extraInReadme.agents.length > 0) {
    console.log(`❌ Phantom agents in README: ${validation.extraInReadme.agents.join(', ')}`);
  }

  // Missing/extra skills
  if (validation.missingFromReadme.skills.length > 0) {
    console.log(`❌ Skills missing from README: ${validation.missingFromReadme.skills.join(', ')}`);
  }
  if (validation.extraInReadme.skills.length > 0) {
    console.log(`❌ Phantom skills in README: ${validation.extraInReadme.skills.join(', ')}`);
  }

  // Rule total count line
  const ruleMismatch = validation.countMismatches.find((m) => m.field === 'rules');
  if (ruleMismatch) {
    console.log(`❌ Rule count: README=${ruleMismatch.readme}, actual=${ruleMismatch.actual}`);
  } else {
    console.log(`✅ Rule count: ${stats.rule_count} (matched)`);
  }

  // Rule breakdown lines
  const mustMismatch = validation.countMismatches.find((m) => m.field === 'rules-must');
  if (mustMismatch) {
    console.log(`❌ MUST rule count: README=${mustMismatch.readme}, actual=${mustMismatch.actual}`);
  } else {
    console.log(`✅ MUST rule count: ${stats.rule_must_count} (matched)`);
  }

  const shouldMismatch = validation.countMismatches.find((m) => m.field === 'rules-should');
  if (shouldMismatch) {
    console.log(`❌ SHOULD rule count: README=${shouldMismatch.readme}, actual=${shouldMismatch.actual}`);
  } else {
    console.log(`✅ SHOULD rule count: ${stats.rule_should_count} (matched)`);
  }

  const mayMismatch = validation.countMismatches.find((m) => m.field === 'rules-may');
  if (mayMismatch) {
    console.log(`❌ MAY rule count: README=${mayMismatch.readme}, actual=${mayMismatch.actual}`);
  } else {
    console.log(`✅ MAY rule count: ${stats.rule_may_count} (matched)`);
  }

  // Rules breakdown internal sum consistency
  const breakdownSumMismatch = validation.countMismatches.find((m) => m.field === 'rules-breakdown-sum');
  if (breakdownSumMismatch) {
    console.log(`❌ Rules breakdown sum (${breakdownSumMismatch.actual}) ≠ README rules total (${breakdownSumMismatch.readme})`);
  }

  // Guide count line
  const guideMismatch = validation.countMismatches.find((m) => m.field === 'guides');
  if (guideMismatch) {
    console.log(`❌ Guide count: README=${guideMismatch.readme}, actual=${guideMismatch.actual}`);
  } else {
    console.log(`✅ Guide count: ${stats.guide_count} (matched)`);
  }

  // Slash commands
  if (slashCommandValidation.phantom.length > 0) {
    console.log(`❌ Phantom slash commands: ${slashCommandValidation.phantom.map((c) => `/${c}`).join(', ')}`);
    console.log(`✅ Slash commands: ${slashCommandValidation.valid.length} valid, ${slashCommandValidation.phantom.length} phantom`);
  } else {
    console.log(`✅ Slash commands: ${slashCommandValidation.valid.length} valid, 0 phantom`);
  }

  // Secondary doc files (README_ko.md, templates/CLAUDE.md.en/.ko, templates/README.md)
  if (additionalDocMismatches.length > 0) {
    for (const m of additionalDocMismatches) {
      console.log(`❌ ${m.file}: ${m.field} count=${m.documented}, actual=${m.actual}`);
    }
  } else {
    console.log('✅ Secondary docs (README_ko.md, templates/CLAUDE.md.*, templates/README.md): counts matched');
  }

  return !hasProgrammaticIssues;
}

async function main() {
  const programmaticOnly = process.argv.includes('--programmatic-only');

  try {
    const stats = await collectImplementationStats();
    const readmeEn = await extractReadmeClaims('README.md');

    if (!readmeEn) {
      console.log('⚠️ README.md를 찾을 수 없습니다.');
      console.log('\n<!-- VALIDATION_STATUS: FAIL -->');
      process.exit(1);
    }

    const validation = programmaticValidation(stats, readmeEn);
    const skillsDir = path.join('templates', '.claude/skills');
    const slashCommandValidation = validateSlashCommands(readmeEn, skillsDir);
    const additionalDocMismatches = await validateAdditionalDocFiles(stats);

    if (programmaticOnly) {
      const passed = printProgrammaticResults(stats, validation, slashCommandValidation, additionalDocMismatches);
      const status = passed ? 'PASS' : 'FAIL';
      console.log(`\n<!-- VALIDATION_STATUS: ${status} -->`);
      if (!passed) {
        process.exit(1);
      }
      return;
    }

    const readmeKo = await extractReadmeClaims('README_ko.md');

    const client = new Anthropic();
    const message = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: buildPrompt(stats, readmeEn, readmeKo, validation, slashCommandValidation),
        },
      ],
    });

    const resultParts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        resultParts.push(block.text);
      }
    }
    const result = resultParts.join('\n');
    console.log(result);

    if (additionalDocMismatches.length > 0) {
      console.log('📋 Secondary Doc File Validation');
      for (const m of additionalDocMismatches) {
        console.log(`❌ ${m.file}: ${m.field} count=${m.documented}, actual=${m.actual}`);
      }
    }

    // Determine pass/fail from programmatic validation and LLM output
    const hasProgrammaticIssues =
      validation.missingFromReadme.agents.length > 0 ||
      validation.missingFromReadme.skills.length > 0 ||
      validation.extraInReadme.agents.length > 0 ||
      validation.extraInReadme.skills.length > 0 ||
      validation.countMismatches.length > 0 ||
      slashCommandValidation.phantom.length > 0 ||
      additionalDocMismatches.length > 0;
    // Check for explicit LLM verdict first, fall back to marker detection
    const hasExplicitFail = /최종 판정[\s\S]*?\*\*(❌\s*)?FAIL\*\*/i.test(result);
    const hasExplicitPass = /최종 판정[\s\S]*?\*\*(✅\s*)?PASS\*\*/i.test(result);
    const hasLlmIssues = hasExplicitFail || (!hasExplicitPass && result.includes('❌'));
    const status = hasProgrammaticIssues || hasLlmIssues ? 'FAIL' : 'PASS';
    console.log(`\n<!-- VALIDATION_STATUS: ${status} -->`);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`⚠️ Claude API 호출 중 오류가 발생했습니다: ${error.message}`);
      console.error('⚠️ 문서 검증에 실패했습니다.');
      process.exit(1);
    } else {
      console.error(`⚠️ 예기치 않은 오류: ${error}`);
      console.error('⚠️ 문서 검증 중 오류가 발생했습니다.');
      process.exit(1);
    }
  }
}

main();

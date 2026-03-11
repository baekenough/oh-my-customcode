#!/usr/bin/env bun
/**
 * Documentation Validator Script
 * - Uses Claude API to validate that documentation matches implementation
 * - Checks agent/skill/rule counts, CLI commands, and feature descriptions
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

interface ImplementationStats {
  agent_count: number;
  agent_names: string[];
  skill_count: number;
  skill_names: string[];
  rule_count: number;
  guide_count: number;
  hook_count: number;
  context_count: number;
}

interface ValidationResult {
  missingFromReadme: { agents: string[]; skills: string[] };
  extraInReadme: { agents: string[]; skills: string[] };
  countMismatches: { field: string; readme: number; actual: number }[];
}

async function collectImplementationStats(): Promise<ImplementationStats> {
  const stats: ImplementationStats = {
    agent_count: 0,
    agent_names: [],
    skill_count: 0,
    skill_names: [],
    rule_count: 0,
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

  // Count rules
  const rulesDir = path.join(templatesDir, '.claude/rules');
  if (fs.existsSync(rulesDir)) {
    stats.rule_count = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')).length;
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
    stats.hook_count = fs.readdirSync(hooksDir).filter((f) => !f.startsWith('.')).length;
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

function extractNamesFromReadme(readme: string): { agents: string[]; skills: string[] } {
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

function programmaticValidation(stats: ImplementationStats, readmeEn: string): ValidationResult {
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

  return { missingFromReadme, extraInReadme, countMismatches };
}

function buildPrompt(stats: ImplementationStats, readmeEn: string, readmeKo: string, validation: ValidationResult): string {
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

async function main() {
  try {
    const stats = await collectImplementationStats();
    const readmeEn = await extractReadmeClaims('README.md');
    const readmeKo = await extractReadmeClaims('README_ko.md');

    if (!readmeEn) {
      console.log('⚠️ README.md를 찾을 수 없습니다.');
      console.log('\n<!-- VALIDATION_STATUS: FAIL -->');
      return;
    }

    const validation = programmaticValidation(stats, readmeEn);

    const client = new Anthropic();
    const message = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: buildPrompt(stats, readmeEn, readmeKo, validation),
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

    // Determine pass/fail from programmatic validation and LLM output
    const hasProgrammaticIssues =
      validation.missingFromReadme.agents.length > 0 ||
      validation.missingFromReadme.skills.length > 0 ||
      validation.extraInReadme.agents.length > 0 ||
      validation.extraInReadme.skills.length > 0 ||
      validation.countMismatches.length > 0;
    // Check for explicit LLM verdict first, fall back to marker detection
    const hasExplicitFail = /최종 판정[\s\S]*?\*\*FAIL\*\*/i.test(result);
    const hasExplicitPass = /최종 판정[\s\S]*?\*\*PASS\*\*/i.test(result);
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

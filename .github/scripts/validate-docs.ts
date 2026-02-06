#!/usr/bin/env bun
/**
 * Documentation Validator Script
 * - Uses Claude API to validate that documentation matches implementation
 * - Checks agent/skill/rule counts, CLI commands, and feature descriptions
 */

import Anthropic from '@anthropic-ai/sdk';
import { Glob } from 'bun';

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

  // Count agents
  const agentGlob = new Glob('templates/.claude/agents/*.md');
  const agentFiles: string[] = [];
  for await (const file of agentGlob.scan('.')) {
    agentFiles.push(file);
  }
  stats.agent_count = agentFiles.length;
  stats.agent_names = agentFiles.map((f) =>
    f.replace('templates/.claude/agents/', '').replace('.md', '')
  );

  // Count skills (directories with SKILL.md)
  const skillDirs: string[] = [];
  const skillGlob = new Glob('templates/.claude/skills/*/SKILL.md');
  for await (const file of skillGlob.scan('.')) {
    const dirName = file.replace('templates/.claude/skills/', '').replace('/SKILL.md', '');
    skillDirs.push(dirName);
  }
  stats.skill_count = skillDirs.length;
  stats.skill_names = skillDirs;

  // Count rules
  const ruleGlob = new Glob('templates/.claude/rules/*.md');
  let ruleCount = 0;
  for await (const _ of ruleGlob.scan('.')) {
    ruleCount++;
  }
  stats.rule_count = ruleCount;

  // Count guides
  const guideGlob = new Glob('templates/guides/*/');
  const guideDirs = new Set<string>();
  for await (const file of guideGlob.scan('.')) {
    const dirName = file.replace('templates/guides/', '').split('/')[0];
    if (dirName) {
      guideDirs.add(dirName);
    }
  }
  stats.guide_count = guideDirs.size;

  // Count hooks
  const hookGlob = new Glob('templates/.claude/hooks/*/');
  const hookDirs = new Set<string>();
  for await (const file of hookGlob.scan('.')) {
    const dirName = file.replace('templates/.claude/hooks/', '').split('/')[0];
    if (dirName) {
      hookDirs.add(dirName);
    }
  }
  stats.hook_count = hookDirs.size;

  // Count contexts
  const contextGlob = new Glob('templates/.claude/contexts/*.md');
  let contextCount = 0;
  for await (const _ of contextGlob.scan('.')) {
    contextCount++;
  }
  stats.context_count = contextCount;

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

function buildPrompt(stats: ImplementationStats, readmeEn: string, readmeKo: string): string {
  const statsJson = JSON.stringify(stats, null, 2);

  return `당신은 oh-my-customcode 프로젝트의 문서 검증 전문가입니다.
구현 현황과 README 문서를 비교하여 불일치 사항을 찾아주세요.

---

## 구현 현황 (실제 파일 기반)

\`\`\`json
${statsJson}
\`\`\`

---

## README.md (English)

\`\`\`markdown
${readmeEn.slice(0, 8000)}
\`\`\`

---

## README_ko.md (Korean)

\`\`\`markdown
${readmeKo.slice(0, 8000)}
\`\`\`

---

## 검증 항목

다음 항목들을 검증하세요:

1. **숫자 일치**: README에 언급된 agent/skill/rule/guide 개수가 실제와 일치하는가?
2. **목록 일치**: README에 나열된 agent/skill 이름이 실제 존재하는가?
3. **언어 일관성**: README.md와 README_ko.md의 정보가 일치하는가?
4. **오래된 정보**: 더 이상 존재하지 않는 기능이 문서에 남아있는가?

---

## 응답 형식 (Markdown)

> 🔍 **Documentation Validator**

### 검증 결과

(✅ 일치 / ⚠️ 불일치 / ❌ 오류)

### 발견된 불일치

| 항목 | 문서 값 | 실제 값 | 파일 |
|------|--------|--------|------|
| (불일치 항목 나열) |

### 권장 수정사항

(구체적인 수정 제안)

### 요약

(전체 검증 결과 요약 1-2문장)

---
_이 검증은 Claude API에 의해 자동 수행되었습니다._
`;
}

async function validateDocs(): Promise<string> {
  // Collect implementation stats
  const stats = await collectImplementationStats();

  // Read READMEs
  const readmeEn = await extractReadmeClaims('README.md');
  const readmeKo = await extractReadmeClaims('README_ko.md');

  if (!readmeEn) {
    return '⚠️ README.md를 찾을 수 없습니다.';
  }

  // Call Claude API
  const client = new Anthropic();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: buildPrompt(stats, readmeEn, readmeKo),
      },
    ],
  });

  // Extract text response
  const resultParts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      resultParts.push(block.text);
    }
  }

  return resultParts.join('\n');
}

async function main() {
  try {
    const result = await validateDocs();
    console.log(result);
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

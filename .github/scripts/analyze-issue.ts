#!/usr/bin/env bun

/**
 * GitHub Issue Analysis Script (Universal)
 *
 * Analyzes GitHub issues using Claude API and posts Korean analysis comments.
 * Can be used in any repository by providing PROJECT_CONTEXT.
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Required
 * - GITHUB_TOKEN: Required
 * - GITHUB_REPOSITORY: Required (format: owner/repo)
 * - ISSUE_NUMBER: Optional if passed as CLI arg
 * - PROJECT_CONTEXT: Optional custom context (defaults to oh-my-customcode)
 * - ISSUE_TITLE, ISSUE_BODY, ISSUE_AUTHOR, ISSUE_LABELS: Optional overrides
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Interfaces
// ============================================================================

interface IssueData {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
}

interface AnalysisResult {
  summary: string;
  type: string;
  priority: string;
  priority_reason: string;
  technical_points: string[];
  challenges: string[];
  suggested_approach: string[];
  related_areas: string[];
  questions: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  githubRepo: process.env.GITHUB_REPOSITORY,
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  maxTokens: 8000,
};

const DEFAULT_PROJECT_CONTEXT = `oh-my-customcode는 Claude Code를 커스터마이징하는 AI 에이전트 시스템 npm 패키지입니다.

## 아키텍처 개요

핵심 구성요소:
- Agents (44): 특화된 AI 서브에이전트 전문가들
- Skills (75): 재사용 가능한 지식 및 워크플로우 정의
- Rules (14): 전역 동작 규칙 (R000-R021)
- Guides (2): 레퍼런스 문서

## 에이전트 카테고리

| 카테고리 | 에이전트 수 | 예시 |
|----------|------------|------|
| SW Engineer / Language | 6 | lang-typescript-expert, lang-golang-expert, lang-python-expert |
| SW Engineer / Backend | 6 | be-fastapi-expert, be-springboot-expert, be-nestjs-expert |
| SW Engineer / Frontend | 4 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent |
| SW Engineer / Tooling | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| DE Engineer | 6 | de-airflow-expert, de-dbt-expert, de-kafka-expert |
| Database | 3 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| Security | 1 | sec-codeql-expert |
| SW Architect | 2 | arch-documenter, arch-speckit-agent |
| Infra Engineer | 2 | infra-docker-expert, infra-aws-expert |
| QA Team | 3 | qa-planner, qa-writer, qa-engineer |
| Manager | 6 | mgr-creator, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| System | 2 | sys-memory-keeper, sys-naggy |

## 오케스트레이션 패턴

메인 대화(오케스트레이터)가 라우팅 스킬을 통해 서브에이전트에 위임:
- secretary-routing → 매니저 에이전트 (mgr-creator, mgr-gitnerd 등)
- dev-lead-routing → 언어/프레임워크 전문가 (lang-*, be-*, fe-* 등)
- de-lead-routing → 데이터 엔지니어링 전문가 (de-* 등)
- qa-lead-routing → QA 워크플로우 조율

## 핵심 규칙 요약

- R007 에이전트 식별: 모든 응답은 \`┌─ Agent:\` 헤더로 시작
- R009 병렬 실행: 독립 작업 2개 이상 시 병렬 에이전트 실행
- R010 오케스트레이터: 오케스트레이터는 파일 수정 금지, 서브에이전트에 위임
- R006 에이전트 설계: 에이전트(.claude/agents/) 와 스킬(.claude/skills/) 관심사 분리

## 디렉토리 구조

\`\`\`
.claude/
├── agents/    # 44개 서브에이전트 정의 (kebab-case .md 파일)
├── skills/    # 75개 스킬 디렉토리 (각 SKILL.md 포함)
├── rules/     # 14개 전역 규칙 (R000-R021)
└── hooks/     # 보안/검증/HUD 훅 스크립트
guides/        # 2개 레퍼런스 문서 토픽
\`\`\`

## 핵심 철학

"전문가가 없으면? 만들고, 지식을 연결하고, 사용한다."
(No expert? CREATE one, connect knowledge, and USE it.)

## 기술 스택

TypeScript/Bun, GitHub Actions, npm 패키지 배포.
CLI 커맨드: omcustom init, list, doctor.`;

// ============================================================================
// Context File Loading
// ============================================================================

function loadContextFile(filename: string): string | null {
  try {
    const scriptDir = import.meta.dir;
    const filePath = resolve(scriptDir, 'context', filename);
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(): string {
  const externalPrompt = loadContextFile('analysis-system-prompt.md');
  if (externalPrompt) {
    return externalPrompt;
  }

  const projectSummary = loadContextFile('project-summary.md') || DEFAULT_PROJECT_CONTEXT;

  return `You are an expert issue analyst for the oh-my-customcode project.

## Project Context

${projectSummary}

## Analysis Guidelines

- GitHub 이슈를 분석하고 한국어로 인사이트를 제공합니다.
- 기술 용어, 파일명, 코드 참조는 영어 그대로 유지합니다.
- 실행 가능하고 구체적인 인사이트를 제공합니다.
- 간결하지만 포괄적으로 분석합니다.
- 정보가 부족하면 명확화 질문을 포함합니다.
- 기술 용어(API, CLI, TypeScript 등), 파일명(*.ts, CLAUDE.md 등), 코드(함수명, 변수명)는 영어로 유지합니다.
- 응답은 반드시 유효한 JSON 형식으로만 출력합니다.`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateEnvironment(): void {
  const missing: string[] = [];

  if (!CONFIG.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!CONFIG.githubToken) missing.push('GITHUB_TOKEN');
  if (!CONFIG.githubRepo) missing.push('GITHUB_REPOSITORY');

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function getIssueNumber(): number {
  // Try CLI arg first, then env var
  const issueNum = process.argv[2] || process.env.ISSUE_NUMBER;

  if (!issueNum) {
    console.error('❌ Issue number not provided. Pass as CLI arg or set ISSUE_NUMBER env var.');
    process.exit(1);
  }

  const num = parseInt(issueNum, 10);
  if (isNaN(num) || num <= 0) {
    console.error(`❌ Invalid issue number: ${issueNum}`);
    process.exit(1);
  }

  return num;
}

async function fetchIssueFromGitHub(issueNumber: number): Promise<IssueData> {
  console.log(`📥 Fetching issue #${issueNumber} from GitHub...`);

  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues/${issueNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'oh-my-customcode-issue-analyzer',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issue = await response.json();

    return {
      number: issue.number,
      title: issue.title || '',
      body: issue.body || '',
      author: issue.user?.login || 'unknown',
      labels: issue.labels?.map((l: any) => l.name) || [],
    };
  } catch (error) {
    console.error('❌ Failed to fetch issue from GitHub:', error);
    process.exit(1);
  }
}

function getIssueData(issueNumber: number): Promise<IssueData> {
  // Check if issue data is provided via env vars (for testing or custom use)
  if (process.env.ISSUE_TITLE) {
    console.log('📋 Using issue data from environment variables');
    return Promise.resolve({
      number: issueNumber,
      title: process.env.ISSUE_TITLE,
      body: process.env.ISSUE_BODY || '',
      author: process.env.ISSUE_AUTHOR || 'unknown',
      labels: process.env.ISSUE_LABELS ? process.env.ISSUE_LABELS.split(',') : [],
    });
  }

  // Otherwise fetch from GitHub API
  return fetchIssueFromGitHub(issueNumber);
}

function buildPrompt(issue: IssueData): string {
  // Try external project-summary file first, then env var override, then built-in default
  const externalSummary = loadContextFile('project-summary.md');
  const projectContext = process.env.PROJECT_CONTEXT || externalSummary || DEFAULT_PROJECT_CONTEXT;

  return `## Issue Details

**Number**: #${issue.number}
**Title**: ${issue.title}
**Author**: @${issue.author}
**Labels**: ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}
**Body**:
${issue.body}

## Project Context (참고용)
${projectContext}

## 분석 요청

다음 구조로 한국어 분석을 JSON 형식으로 제공하세요:

{
  "summary": "이 이슈가 무엇에 대한 것인지 간략히",
  "type": "Bug | Feature Request | Documentation | Question | Enhancement | Refactor | Other 중 하나",
  "priority": "High | Medium | Low",
  "priority_reason": "우선순위 판단 근거",
  "technical_points": ["고려할 핵심 기술 측면", "..."],
  "challenges": ["잠재적 어려움이나 차단 요소", "..."],
  "suggested_approach": ["단계별 구현 제안", "..."],
  "related_areas": ["영향받을 수 있는 코드베이스 영역", "..."],
  "questions": ["이슈 작성자에게 명확화 질문 (필요 시)", "..."]
}

JSON만 출력하세요. 다른 텍스트 없이.`;
}

async function analyzeIssueWithClaude(issue: IssueData): Promise<AnalysisResult> {
  console.log('🤖 Analyzing issue with Claude API...');

  const client = new Anthropic({
    apiKey: CONFIG.anthropicApiKey,
  });

  const prompt = buildPrompt(issue);
  const systemPrompt = buildSystemPrompt();

  try {
    const message = await client.messages.create({
      model: CONFIG.model,
      max_tokens: CONFIG.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content using type narrowing (ContentBlock is a discriminated union)
    const textContent = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Parse JSON response (handle code blocks)
    let jsonStr = textContent.trim();

    // Remove markdown code block if present
    const jsonMatch = jsonStr.match(/```json?\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\w*\s*\n/, '').replace(/\n```\s*$/, '');
    }

    const analysis: AnalysisResult = JSON.parse(jsonStr);

    // Validate structure
    if (!analysis.summary || !analysis.type) {
      throw new Error('Invalid analysis structure: missing required fields');
    }

    // Ensure array fields are arrays (guard against malformed AI responses)
    const arrayFields = ['technical_points', 'challenges', 'suggested_approach', 'related_areas', 'questions'] as const;
    for (const field of arrayFields) {
      if (!Array.isArray(analysis[field])) {
        analysis[field] = [];
      }
    }

    console.log('✅ Analysis completed successfully');
    return analysis;

  } catch (error) {
    console.error('❌ Failed to analyze issue with Claude:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

function formatComment(analysis: AnalysisResult): string {
  let comment = `## 🤖 AI 이슈 분석\n\n`;
  comment += `### 요약\n${analysis.summary}\n\n`;
  comment += `### 분류\n`;
  comment += `- **유형**: ${analysis.type}\n`;
  comment += `- **우선순위**: ${analysis.priority}\n`;
  comment += `- **이유**: ${analysis.priority_reason}\n\n`;

  if (analysis.technical_points.length > 0) {
    comment += `### 기술적 고려사항\n`;
    analysis.technical_points.forEach(point => {
      comment += `- ${point}\n`;
    });
    comment += '\n';
  }

  if (analysis.challenges.length > 0) {
    comment += `### 예상 난관\n`;
    analysis.challenges.forEach(challenge => {
      comment += `- ${challenge}\n`;
    });
    comment += '\n';
  }

  if (analysis.suggested_approach.length > 0) {
    comment += `### 제안 접근법\n`;
    analysis.suggested_approach.forEach((step, idx) => {
      comment += `${idx + 1}. ${step}\n`;
    });
    comment += '\n';
  }

  if (analysis.related_areas.length > 0) {
    comment += `### 연관 영역\n`;
    analysis.related_areas.forEach(area => {
      comment += `- ${area}\n`;
    });
    comment += '\n';
  }

  if (analysis.questions.length > 0) {
    comment += `### 작성자에게 질문\n`;
    analysis.questions.forEach(question => {
      comment += `- ${question}\n`;
    });
    comment += '\n';
  }

  comment += `---\n*이 분석은 이슈 트리아지를 돕기 위해 Claude AI가 생성했습니다.*\n`;

  return comment;
}

async function postComment(issueNumber: number, body: string): Promise<void> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues/${issueNumber}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'oh-my-customcode-issue-analyzer',
      },
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    console.log('✅ Comment posted successfully');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 Starting GitHub Issue Analysis Script\n');

  // Validate environment
  validateEnvironment();

  // Get issue number
  const issueNumber = getIssueNumber();
  console.log(`📌 Target issue: #${issueNumber}\n`);

  // Fetch issue data
  const issue = await getIssueData(issueNumber);
  console.log(`📝 Issue: "${issue.title}"`);
  console.log(`👤 Author: @${issue.author}`);
  console.log(`🏷️  Labels: ${issue.labels.join(', ') || 'none'}\n`);

  // Analyze with Claude
  const analysis = await analyzeIssueWithClaude(issue);

  // Format comment (Korean with English technical terms)
  const comment = formatComment(analysis);

  console.log('\n📤 Posting comment to GitHub...');
  await postComment(issueNumber, comment);

  console.log('\n✨ Issue analysis completed successfully!');
}

// Run main function
main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

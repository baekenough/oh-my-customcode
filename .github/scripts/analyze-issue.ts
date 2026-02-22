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
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  maxTokens: 8000,
};

const DEFAULT_PROJECT_CONTEXT = `oh-my-customcode is an npm package for customizing Claude Code.
Key components: Agents (42), Skills (55), Rules (19), Guides (22).
Commands: omcustom init, list, doctor.
Tech: TypeScript/Bun, GitHub Actions, npm.`;

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
  const projectContext = process.env.PROJECT_CONTEXT || DEFAULT_PROJECT_CONTEXT;

  return `GitHub 이슈를 분석하고 한국어로 인사이트를 제공하세요.
기술 용어, 파일명, 코드 참조는 영어 그대로 유지하세요.

## Project Context
${projectContext}

## Issue Details
**Number**: #${issue.number}
**Title**: ${issue.title}
**Author**: @${issue.author}
**Labels**: ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}
**Body**:
${issue.body}

## 분석 항목

다음 구조로 한국어 분석을 제공하세요:

1. **요약**: 이 이슈가 무엇에 대한 것인지 간략히
2. **유형**: Bug, Feature Request, Documentation, Question, Enhancement, Refactor, Other 중 하나
3. **우선순위**: High/Medium/Low + 명확한 이유
4. **기술적 고려사항**: 고려할 핵심 기술 측면
5. **예상 난관**: 잠재적 어려움이나 차단 요소
6. **제안 접근법**: 단계별 구현 제안
7. **연관 영역**: 영향받을 수 있는 코드베이스 영역
8. **질문**: 이슈 작성자에게 명확화 질문 (필요 시)

JSON 형식으로 응답:
{
  "summary": "...",
  "type": "...",
  "priority": "...",
  "priority_reason": "...",
  "technical_points": ["...", "..."],
  "challenges": ["...", "..."],
  "suggested_approach": ["...", "..."],
  "related_areas": ["...", "..."],
  "questions": ["...", "..."]
}

중요:
- 실행 가능하고 구체적인 인사이트 제공
- 간결하지만 포괄적으로
- 정보가 부족하면 질문에 기재
- 기술 용어(API, CLI, TypeScript 등), 파일명(*.ts, CLAUDE.md 등), 코드(함수명, 변수명)는 영어 유지`;
}

async function analyzeIssueWithClaude(issue: IssueData): Promise<AnalysisResult> {
  console.log('🤖 Analyzing issue with Claude API...');

  const client = new Anthropic({
    apiKey: CONFIG.anthropicApiKey,
  });

  const prompt = buildPrompt(issue);

  try {
    const message = await client.messages.create({
      model: CONFIG.model,
      max_tokens: CONFIG.maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content
    const textContent = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
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

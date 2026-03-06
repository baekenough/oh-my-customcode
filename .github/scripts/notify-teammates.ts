#!/usr/bin/env bun

/**
 * oh-my-teammates Notification Script
 *
 * When oh-my-customcode releases a new version, analyzes the release changes
 * using Claude API and creates an issue in baekenough/oh-my-teammates for
 * applicable changes.
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Required — Claude API key
 * - GITHUB_TOKEN: Required — PAT with cross-repo `repo` scope (NOT default GITHUB_TOKEN)
 * - RELEASE_TAG: Required — e.g., "v0.18.5"
 * - RELEASE_BODY: Optional — release notes body from GitHub Release
 * - CHANGELOG_SECTION: Optional — extracted changelog section for this version
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Interfaces
// ============================================================================

interface TeammatesContext {
  packageJson: string;
  readme: string;
}

interface TeammatesChange {
  area: string;
  description: string;
  action: 'sync' | 'adapt' | 'review';
}

interface TeammatesAnalysis {
  applicable: boolean;
  summary: string;
  priority: 'High' | 'Medium' | 'Low';
  changes: TeammatesChange[];
  implementation_notes: string;
}

interface CreatedIssue {
  number: number;
  html_url: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  releaseTag: process.env.RELEASE_TAG,
  releaseBody: process.env.RELEASE_BODY || '',
  changelogSection: process.env.CHANGELOG_SECTION || '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  targetRepo: 'baekenough/oh-my-teammates',
  targetBranch: 'develop',
};

// ============================================================================
// Validation
// ============================================================================

function validateEnvironment(): void {
  const missing: string[] = [];

  if (!CONFIG.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!CONFIG.githubToken) missing.push('GITHUB_TOKEN');
  if (!CONFIG.releaseTag) missing.push('RELEASE_TAG');

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ============================================================================
// GitHub API Helpers
// ============================================================================

async function fetchTeammatesFile(path: string): Promise<string> {
  const [owner, repo] = CONFIG.targetRepo.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${CONFIG.targetBranch}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.githubToken}`,
      'Accept': 'application/vnd.github.v3.raw',
      'User-Agent': 'oh-my-customcode-notify-teammates',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error fetching ${path}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchTeammatesContext(): Promise<TeammatesContext> {
  console.log(`📥 Fetching oh-my-teammates context from ${CONFIG.targetRepo}...`);

  try {
    const [packageJson, readme] = await Promise.all([
      fetchTeammatesFile('package.json'),
      fetchTeammatesFile('README.md'),
    ]);

    console.log('✅ Fetched oh-my-teammates package.json and README.md');
    return { packageJson, readme };
  } catch (error) {
    console.error('❌ Failed to fetch oh-my-teammates context:', error);
    process.exit(1);
  }
}

async function createIssue(title: string, body: string, labels: string[]): Promise<CreatedIssue> {
  const [owner, repo] = CONFIG.targetRepo.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'oh-my-customcode-notify-teammates',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error creating issue: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const issue = await response.json();
  return {
    number: issue.number,
    html_url: issue.html_url,
  };
}

// ============================================================================
// Claude Analysis
// ============================================================================

function buildAnalysisPrompt(context: TeammatesContext): string {
  const releaseContent = CONFIG.releaseBody || CONFIG.changelogSection || '(릴리즈 노트 없음)';

  return `oh-my-customcode의 새 릴리즈가 oh-my-teammates에 미치는 영향을 분석하세요.
기술 용어, 파일명, 코드 참조는 영어 그대로 유지하고, 설명은 한국어로 작성하세요.

## oh-my-customcode란?
oh-my-customcode는 Claude Code를 커스터마이징하기 위한 npm 패키지입니다.
핵심 구성: Agents (41개), Skills (55개), Rules (18개), Guides (22개).
변경 가능한 영역: templates, hooks, rules, skills, agents, guides.

## oh-my-teammates란?
oh-my-teammates는 oh-my-customcode를 팀 협업용으로 확장한 프로젝트입니다.
peerDependencies: { "oh-my-customcode": ">=0.18.0" }

### oh-my-teammates package.json
\`\`\`json
${context.packageJson}
\`\`\`

### oh-my-teammates README.md (요약)
${context.readme.slice(0, 3000)}${context.readme.length > 3000 ? '\n...(이하 생략)' : ''}

## oh-my-customcode ${CONFIG.releaseTag} 릴리즈 변경사항
${releaseContent}

## 분석 지침

다음 기준으로 oh-my-teammates에 적용 가능한 변경사항을 분석하세요:

1. **적용 가능성 판단**: 아래 영역에 변경이 있는지 확인
   - templates: 이슈/PR 템플릿 변경
   - hooks: PreToolUse, PostToolUse 등 훅 변경
   - rules: R000-R018 규칙 변경
   - skills: 핵심 스킬 (routing, intent-detection 등) 변경
   - agents: 에이전트 구조/역할 변경
   - guides: 레퍼런스 문서 변경
   - core-api: 핵심 API 또는 명령어 변경

2. **액션 유형 결정**:
   - sync: oh-my-teammates에 그대로 반영 가능
   - adapt: oh-my-teammates 맥락에 맞게 수정 후 반영
   - review: 영향도 검토 필요, 직접 반영 여부 결정 필요

3. **우선순위 결정**:
   - High: 호환성 깨짐 또는 보안 관련
   - Medium: 기능 개선 또는 버그 수정
   - Low: 문서 또는 스타일 변경

변경사항이 oh-my-teammates와 무관하면 applicable: false로 응답하세요.
(예: oh-my-customcode 자체 빌드/배포 변경, 내부 CI/CD 변경 등)

JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "applicable": true,
  "summary": "한국어 요약",
  "priority": "High",
  "changes": [
    {
      "area": "hooks",
      "description": "한국어 변경 설명",
      "action": "sync"
    }
  ],
  "implementation_notes": "한국어 구현 참고사항"
}`;
}

function parseAnalysisResponse(responseText: string): TeammatesAnalysis {
  let jsonStr = responseText.trim();

  // Remove markdown code block if present
  const jsonMatch = jsonStr.match(/```json?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\s*\n/, '').replace(/\n```\s*$/, '');
  }

  const analysis: TeammatesAnalysis = JSON.parse(jsonStr);

  // Validate required fields
  if (typeof analysis.applicable !== 'boolean') {
    throw new Error('Invalid analysis structure: missing "applicable" field');
  }

  // Guard against malformed AI responses — ensure changes is always an array
  if (!Array.isArray(analysis.changes)) {
    analysis.changes = [];
  }

  // Validate action values
  const validActions = new Set(['sync', 'adapt', 'review']);
  analysis.changes = analysis.changes.filter(
    (change): change is TeammatesChange =>
      typeof change.area === 'string' &&
      typeof change.description === 'string' &&
      validActions.has(change.action),
  );

  return analysis;
}

async function analyzeWithClaude(context: TeammatesContext): Promise<TeammatesAnalysis> {
  console.log('🤖 Analyzing release changes with Claude API...');

  const client = new Anthropic({
    apiKey: CONFIG.anthropicApiKey,
  });

  const prompt = buildAnalysisPrompt(context);

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

    // Extract text content using type narrowing (ContentBlock is a discriminated union)
    const textContent = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const analysis = parseAnalysisResponse(textContent);

    console.log(`✅ Analysis completed — applicable: ${analysis.applicable}`);
    return analysis;
  } catch (error) {
    console.error('❌ Failed to analyze with Claude:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// ============================================================================
// Issue Formatting
// ============================================================================

function getActionEmoji(action: TeammatesChange['action']): string {
  switch (action) {
    case 'sync':
      return '🔄';
    case 'adapt':
      return '🔧';
    case 'review':
      return '👀';
  }
}

function getActionLabel(action: TeammatesChange['action']): string {
  switch (action) {
    case 'sync':
      return 'sync (직접 반영)';
    case 'adapt':
      return 'adapt (수정 반영)';
    case 'review':
      return 'review (검토 필요)';
  }
}

function formatIssueBody(analysis: TeammatesAnalysis): string {
  const version = CONFIG.releaseTag;
  const changelogContent = CONFIG.changelogSection || CONFIG.releaseBody || '(릴리즈 노트 없음)';

  let body = `## 🔄 oh-my-customcode ${version} 릴리즈 변경사항 분석\n\n`;
  body += `> 이 이슈는 oh-my-customcode의 새 릴리즈에서 oh-my-teammates에 적용 가능한 변경사항을 분석하여 자동 생성되었습니다.\n\n`;

  body += `### 릴리즈 정보\n`;
  body += `- **버전**: ${version}\n`;
  body += `- **우선순위**: ${analysis.priority}\n\n`;

  body += `### 적용 가능한 변경사항\n\n`;

  for (const change of analysis.changes) {
    const emoji = getActionEmoji(change.action);
    body += `#### ${emoji} ${change.area}\n`;
    body += `- **액션**: ${getActionLabel(change.action)}\n`;
    body += `- **설명**: ${change.description}\n\n`;
  }

  body += `### 구현 참고사항\n`;
  body += `${analysis.implementation_notes}\n\n`;

  body += `### 원본 릴리즈 노트\n`;
  body += `<details>\n`;
  body += `<summary>oh-my-customcode ${version} CHANGELOG</summary>\n\n`;
  body += `${changelogContent}\n\n`;
  body += `</details>\n\n`;

  body += `---\n*이 이슈는 oh-my-customcode 릴리즈 시 자동 생성되었습니다.*\n`;

  return body;
}

function formatIssueTitle(analysis: TeammatesAnalysis): string {
  return `[oh-my-customcode ${CONFIG.releaseTag}] ${analysis.summary}`;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 Starting oh-my-teammates Notification Script\n');

  // Validate environment
  validateEnvironment();

  console.log(`📌 Release: ${CONFIG.releaseTag}`);
  console.log(`🎯 Target repo: ${CONFIG.targetRepo}\n`);

  // Fetch oh-my-teammates context
  const context = await fetchTeammatesContext();

  // Analyze with Claude
  const analysis = await analyzeWithClaude(context);

  // Exit cleanly if no applicable changes
  if (!analysis.applicable) {
    console.log('\n✅ No applicable changes found for oh-my-teammates. No issue will be created.');
    process.exit(0);
  }

  console.log(`\n📋 Found ${analysis.changes.length} applicable change(s)`);
  console.log(`📊 Priority: ${analysis.priority}`);

  // Format issue
  const title = formatIssueTitle(analysis);
  const body = formatIssueBody(analysis);
  const labels = ['upstream-sync', 'automated'];

  console.log('\n📤 Creating issue in oh-my-teammates...');
  console.log(`   Title: ${title}`);

  try {
    const issue = await createIssue(title, body, labels);
    console.log(`\n✨ Issue created successfully!`);
    console.log(`   #${issue.number}: ${issue.html_url}`);
  } catch (error) {
    console.error('❌ Failed to create issue:', error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

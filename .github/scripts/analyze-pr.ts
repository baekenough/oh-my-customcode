#!/usr/bin/env bun

/**
 * GitHub PR Analysis Script
 *
 * Analyzes GitHub pull requests using Claude API and posts bilingual comments.
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Required
 * - GITHUB_TOKEN: Required
 * - GITHUB_REPOSITORY: Required (format: owner/repo)
 * - PR_NUMBER: Required
 * - PR_TITLE, PR_BODY, PR_AUTHOR: Optional overrides
 * - PROJECT_CONTEXT: Optional custom context
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Interfaces
// ============================================================================

interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface PrData {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  baseBranch: string;
  headBranch: string;
  changedFiles: ChangedFile[];
  diff: string;
}

interface AnalysisSection {
  summary: string;
  change_type: string;
  risk_level: string;
  risk_reason: string;
  code_quality: string[];
  potential_issues: string[];
  suggestions: string[];
  security_concerns: string[];
  test_coverage: string;
  verdict: string;
}

interface BilingualAnalysis {
  en: AnalysisSection;
  ko: AnalysisSection;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  githubRepo: process.env.GITHUB_REPOSITORY,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 12000,
};

const DEFAULT_PROJECT_CONTEXT = `oh-my-customcode is an npm package for customizing Claude Code.
Key components: Agents (34), Skills (42), Rules (18), Guides (13).
Commands: omcustom init, list, doctor.
Tech: TypeScript/Bun, GitHub Actions, npm.`;

const MAX_DIFF_LENGTH = 100000;
const MAX_PATCH_LENGTH = 5000;

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

function getPrNumber(): number {
  const prNum = process.env.PR_NUMBER;

  if (!prNum) {
    console.error('❌ PR number not provided. Set PR_NUMBER env var.');
    process.exit(1);
  }

  const num = parseInt(prNum, 10);
  if (isNaN(num) || num <= 0) {
    console.error(`❌ Invalid PR number: ${prNum}`);
    process.exit(1);
  }

  return num;
}

async function fetchPrFromGitHub(prNumber: number): Promise<PrData> {
  console.log(`📥 Fetching PR #${prNumber} from GitHub...`);

  const baseUrl = `https://api.github.com/repos/${CONFIG.githubRepo}`;
  const prUrl = `${baseUrl}/pulls/${prNumber}`;
  const filesUrl = `${baseUrl}/pulls/${prNumber}/files`;

  try {
    // Fetch PR details
    const prResponse = await fetch(prUrl, {
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'oh-my-customcode-pr-analyzer',
      },
    });

    if (!prResponse.ok) {
      throw new Error(`GitHub API error: ${prResponse.status} ${prResponse.statusText}`);
    }

    const pr = await prResponse.json();

    // Fetch changed files
    const filesResponse = await fetch(filesUrl, {
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'oh-my-customcode-pr-analyzer',
      },
    });

    if (!filesResponse.ok) {
      throw new Error(`GitHub API error: ${filesResponse.status} ${filesResponse.statusText}`);
    }

    const files = await filesResponse.json();

    // Fetch diff
    const diffResponse = await fetch(prUrl, {
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3.diff',
        'User-Agent': 'oh-my-customcode-pr-analyzer',
      },
    });

    if (!diffResponse.ok) {
      throw new Error(`GitHub API error: ${diffResponse.status} ${diffResponse.statusText}`);
    }

    let diff = await diffResponse.text();
    const diffTruncated = diff.length > MAX_DIFF_LENGTH;
    if (diffTruncated) {
      diff = diff.substring(0, MAX_DIFF_LENGTH);
    }

    // Process changed files
    const changedFiles: ChangedFile[] = files.map((file: any) => {
      let patch = file.patch;
      if (patch && patch.length > MAX_PATCH_LENGTH) {
        patch = patch.substring(0, MAX_PATCH_LENGTH) + '\n... [patch truncated]';
      }

      return {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch,
      };
    });

    return {
      number: pr.number,
      title: pr.title || '',
      body: pr.body || '',
      author: pr.user?.login || 'unknown',
      labels: pr.labels?.map((l: any) => l.name) || [],
      baseBranch: pr.base?.ref || 'unknown',
      headBranch: pr.head?.ref || 'unknown',
      changedFiles,
      diff: diffTruncated ? `${diff}\n\n... [diff truncated at ${MAX_DIFF_LENGTH} characters]` : diff,
    };

  } catch (error) {
    console.error('❌ Failed to fetch PR from GitHub:', error);
    process.exit(1);
  }
}

function getPrData(prNumber: number): Promise<PrData> {
  // Check if PR data is provided via env vars (for testing or custom use)
  if (process.env.PR_TITLE) {
    console.log('📋 Using PR data from environment variables');
    return Promise.resolve({
      number: prNumber,
      title: process.env.PR_TITLE,
      body: process.env.PR_BODY || '',
      author: process.env.PR_AUTHOR || 'unknown',
      labels: [],
      baseBranch: 'main',
      headBranch: 'feature',
      changedFiles: [],
      diff: '',
    });
  }

  // Otherwise fetch from GitHub API
  return fetchPrFromGitHub(prNumber);
}

function buildPrompt(pr: PrData): string {
  const projectContext = process.env.PROJECT_CONTEXT || DEFAULT_PROJECT_CONTEXT;

  // Build files summary
  const filesSummary = pr.changedFiles
    .map(f => `  - ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join('\n');

  return `Analyze this GitHub pull request and provide insights in BOTH English and Korean.

## Project Context
${projectContext}

## PR Details
**Number**: #${pr.number}
**Title**: ${pr.title}
**Author**: @${pr.author}
**Labels**: ${pr.labels.length > 0 ? pr.labels.join(', ') : 'none'}
**Base Branch**: ${pr.baseBranch}
**Head Branch**: ${pr.headBranch}

**Description**:
${pr.body}

## Changed Files (${pr.changedFiles.length} files)
${filesSummary}

## Diff
\`\`\`diff
${pr.diff}
\`\`\`

## Analysis Required

Provide BILINGUAL output (English AND Korean) with the following structure:

1. **Summary**: Brief overview of what this PR does
2. **Change Type**: Feature, Bug Fix, Refactor, Documentation, CI/CD, Performance, Security, or Other
3. **Risk Level**: High/Medium/Low with clear reasoning
4. **Code Quality**: Observations about code quality (readability, maintainability, patterns)
5. **Potential Issues**: Any bugs, edge cases, or problems you notice
6. **Suggestions**: Concrete improvement suggestions (if any)
7. **Security Concerns**: Any security-related observations (if applicable)
8. **Test Coverage**: Assessment of test coverage and quality
9. **Verdict**: Approve, Request Changes, or Comment (with brief reason)

Respond in JSON format with this structure:
{
  "en": {
    "summary": "...",
    "change_type": "...",
    "risk_level": "High|Medium|Low",
    "risk_reason": "...",
    "code_quality": ["...", "..."],
    "potential_issues": ["...", "..."],
    "suggestions": ["...", "..."],
    "security_concerns": ["...", "..."],
    "test_coverage": "...",
    "verdict": "Approve|Request Changes|Comment - reason"
  },
  "ko": {
    "summary": "...",
    "change_type": "...",
    "risk_level": "높음|보통|낮음",
    "risk_reason": "...",
    "code_quality": ["...", "..."],
    "potential_issues": ["...", "..."],
    "suggestions": ["...", "..."],
    "security_concerns": ["...", "..."],
    "test_coverage": "...",
    "verdict": "승인|변경 요청|코멘트 - 이유"
  }
}

Important:
- Provide actionable, specific insights based on the actual code changes
- Be concise but thorough
- Focus on what matters most for code review
- Keep both English and Korean versions semantically equivalent
- If there are no issues in a category, use an empty array or "None" as appropriate`;
}

async function analyzePrWithClaude(pr: PrData): Promise<BilingualAnalysis> {
  console.log('🤖 Analyzing PR with Claude API...');

  const client = new Anthropic({
    apiKey: CONFIG.anthropicApiKey,
  });

  const prompt = buildPrompt(pr);

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
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
    }

    const analysis: BilingualAnalysis = JSON.parse(jsonStr);

    // Validate structure
    if (!analysis.en || !analysis.ko) {
      throw new Error('Invalid analysis structure: missing en or ko');
    }

    console.log('✅ Analysis completed successfully');
    return analysis;

  } catch (error) {
    console.error('❌ Failed to analyze PR with Claude:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

function formatComment(analysis: AnalysisSection, language: 'en' | 'ko'): string {
  const headers = {
    en: {
      title: '🤖 AI PR Analysis',
      summary: 'Summary',
      classification: 'Classification',
      changeType: 'Change Type',
      riskLevel: 'Risk Level',
      reason: 'Reason',
      quality: 'Code Quality',
      issues: 'Potential Issues',
      suggestions: 'Suggestions',
      security: 'Security Concerns',
      tests: 'Test Coverage',
      verdict: 'Verdict',
      footer: 'This analysis was generated by Claude AI to assist with code review.',
    },
    ko: {
      title: '🤖 AI PR 분석',
      summary: '요약',
      classification: '분류',
      changeType: '변경 유형',
      riskLevel: '위험 수준',
      reason: '이유',
      quality: '코드 품질',
      issues: '잠재적 문제',
      suggestions: '개선 제안',
      security: '보안 관련',
      tests: '테스트 커버리지',
      verdict: '판정',
      footer: '이 분석은 코드 리뷰를 돕기 위해 Claude AI가 생성했습니다.',
    },
  };

  const h = headers[language];

  let comment = `## ${h.title}\n\n`;
  comment += `### ${h.summary}\n${analysis.summary}\n\n`;
  comment += `### ${h.classification}\n`;
  comment += `- **${h.changeType}**: ${analysis.change_type}\n`;
  comment += `- **${h.riskLevel}**: ${analysis.risk_level}\n`;
  comment += `- **${h.reason}**: ${analysis.risk_reason}\n\n`;

  if (analysis.code_quality.length > 0) {
    comment += `### ${h.quality}\n`;
    analysis.code_quality.forEach(point => {
      comment += `- ${point}\n`;
    });
    comment += '\n';
  }

  if (analysis.potential_issues.length > 0) {
    comment += `### ${h.issues}\n`;
    analysis.potential_issues.forEach(issue => {
      comment += `- ${issue}\n`;
    });
    comment += '\n';
  }

  if (analysis.suggestions.length > 0) {
    comment += `### ${h.suggestions}\n`;
    analysis.suggestions.forEach((suggestion, idx) => {
      comment += `${idx + 1}. ${suggestion}\n`;
    });
    comment += '\n';
  }

  if (analysis.security_concerns.length > 0) {
    comment += `### ${h.security}\n`;
    analysis.security_concerns.forEach(concern => {
      comment += `- ${concern}\n`;
    });
    comment += '\n';
  }

  comment += `### ${h.tests}\n${analysis.test_coverage}\n\n`;
  comment += `### ${h.verdict}\n${analysis.verdict}\n\n`;

  comment += `---\n*${h.footer}*\n`;

  return comment;
}

async function postComment(prNumber: number, body: string): Promise<void> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues/${prNumber}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'oh-my-customcode-pr-analyzer',
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
  console.log('🚀 Starting GitHub PR Analysis Script\n');

  // Validate environment
  validateEnvironment();

  // Get PR number
  const prNumber = getPrNumber();
  console.log(`📌 Target PR: #${prNumber}\n`);

  // Fetch PR data
  const pr = await getPrData(prNumber);
  console.log(`📝 PR: "${pr.title}"`);
  console.log(`👤 Author: @${pr.author}`);
  console.log(`🌿 Branch: ${pr.headBranch} → ${pr.baseBranch}`);
  console.log(`📄 Files changed: ${pr.changedFiles.length}`);
  console.log(`🏷️  Labels: ${pr.labels.join(', ') || 'none'}\n`);

  // Analyze with Claude
  const analysis = await analyzePrWithClaude(pr);

  // Format comments
  const commentEn = formatComment(analysis.en, 'en');
  const commentKo = formatComment(analysis.ko, 'ko');

  console.log('\n📤 Posting comments to GitHub...');

  // Post English comment
  console.log('  Posting English analysis...');
  await postComment(prNumber, commentEn);

  // Post Korean comment
  console.log('  Posting Korean analysis...');
  await postComment(prNumber, commentKo);

  console.log('\n✨ PR analysis completed successfully!');
}

// Run main function
main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

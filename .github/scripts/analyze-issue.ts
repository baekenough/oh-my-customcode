#!/usr/bin/env bun

/**
 * GitHub Issue Analysis Script (Universal)
 *
 * Analyzes GitHub issues using Claude API and posts bilingual comments.
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

interface AnalysisSection {
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
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  maxTokens: 8000,
};

const DEFAULT_PROJECT_CONTEXT = `oh-my-customcode is an npm package for customizing Claude Code.
Key components: Agents (42), Skills (53), Rules (19), Guides (22).
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

  return `Analyze this GitHub issue and provide insights in BOTH English and Korean.

## Project Context
${projectContext}

## Issue Details
**Number**: #${issue.number}
**Title**: ${issue.title}
**Author**: @${issue.author}
**Labels**: ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}
**Body**:
${issue.body}

## Analysis Required

Provide BILINGUAL output (English AND Korean) with the following structure:

1. **Summary**: Brief overview of what this issue is about
2. **Type**: Classify as one of: Bug, Feature Request, Documentation, Question, Enhancement, Refactor, Other
3. **Priority**: High/Medium/Low with clear reasoning
4. **Technical Points**: Key technical aspects to consider
5. **Challenges**: Potential difficulties or blockers
6. **Suggested Approach**: Step-by-step implementation suggestions
7. **Related Areas**: Other parts of the codebase that might be affected
8. **Questions**: Clarifying questions for the issue author (if needed)

Respond in JSON format with this structure:
{
  "en": {
    "summary": "...",
    "type": "...",
    "priority": "...",
    "priority_reason": "...",
    "technical_points": ["...", "..."],
    "challenges": ["...", "..."],
    "suggested_approach": ["...", "..."],
    "related_areas": ["...", "..."],
    "questions": ["...", "..."]
  },
  "ko": {
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
}

Important:
- Provide actionable, specific insights
- Be concise but comprehensive
- If information is missing, note it in questions
- Keep both English and Korean versions semantically equivalent`;
}

async function analyzeIssueWithClaude(issue: IssueData): Promise<BilingualAnalysis> {
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
    console.error('❌ Failed to analyze issue with Claude:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

function formatComment(analysis: AnalysisSection, language: 'en' | 'ko'): string {
  const headers = {
    en: {
      title: '🤖 AI Issue Analysis',
      summary: 'Summary',
      classification: 'Classification',
      type: 'Type',
      priority: 'Priority',
      reason: 'Reason',
      technical: 'Technical Points',
      challenges: 'Challenges',
      approach: 'Suggested Approach',
      related: 'Related Areas',
      questions: 'Questions for Author',
      footer: 'This analysis was generated by Claude AI to help with issue triage.',
    },
    ko: {
      title: '🤖 AI 이슈 분석',
      summary: '요약',
      classification: '분류',
      type: '유형',
      priority: '우선순위',
      reason: '이유',
      technical: '기술적 고려사항',
      challenges: '예상 난관',
      approach: '제안 접근법',
      related: '연관 영역',
      questions: '작성자에게 질문',
      footer: '이 분석은 이슈 트리아지를 돕기 위해 Claude AI가 생성했습니다.',
    },
  };

  const h = headers[language];

  let comment = `## ${h.title}\n\n`;
  comment += `### ${h.summary}\n${analysis.summary}\n\n`;
  comment += `### ${h.classification}\n`;
  comment += `- **${h.type}**: ${analysis.type}\n`;
  comment += `- **${h.priority}**: ${analysis.priority}\n`;
  comment += `- **${h.reason}**: ${analysis.priority_reason}\n\n`;

  if (analysis.technical_points.length > 0) {
    comment += `### ${h.technical}\n`;
    analysis.technical_points.forEach(point => {
      comment += `- ${point}\n`;
    });
    comment += '\n';
  }

  if (analysis.challenges.length > 0) {
    comment += `### ${h.challenges}\n`;
    analysis.challenges.forEach(challenge => {
      comment += `- ${challenge}\n`;
    });
    comment += '\n';
  }

  if (analysis.suggested_approach.length > 0) {
    comment += `### ${h.approach}\n`;
    analysis.suggested_approach.forEach((step, idx) => {
      comment += `${idx + 1}. ${step}\n`;
    });
    comment += '\n';
  }

  if (analysis.related_areas.length > 0) {
    comment += `### ${h.related}\n`;
    analysis.related_areas.forEach(area => {
      comment += `- ${area}\n`;
    });
    comment += '\n';
  }

  if (analysis.questions.length > 0) {
    comment += `### ${h.questions}\n`;
    analysis.questions.forEach(question => {
      comment += `- ${question}\n`;
    });
    comment += '\n';
  }

  comment += `---\n*${h.footer}*\n`;

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

  // Format comments
  const commentEn = formatComment(analysis.en, 'en');
  const commentKo = formatComment(analysis.ko, 'ko');

  console.log('\n📤 Posting comments to GitHub...');

  // Post English comment
  console.log('  Posting English analysis...');
  await postComment(issueNumber, commentEn);

  // Post Korean comment
  console.log('  Posting Korean analysis...');
  await postComment(issueNumber, commentKo);

  console.log('\n✨ Issue analysis completed successfully!');
}

// Run main function
main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

import { execSync } from 'node:child_process';

export interface UserFeedbackEntry {
  issueNumber: number;
  title: string;
  body: string;
  createdAt: string;
  /** Extracted target: agent name, skill name, or rule ID */
  target: string;
  targetType: 'agent' | 'skill' | 'rule' | 'general';
  sentiment: 'positive' | 'negative' | 'suggestion';
  feedbackSource: 'user_explicit';
}

/**
 * Parses a GitHub issue into a UserFeedbackEntry.
 * Extracts target, targetType, and sentiment from title/body text.
 * Precedence for targetType: rule > skill > agent > general.
 * Issue content is treated as plain text — never evaluated as code.
 */
export function parseIssueToFeedback(issue: {
  number: number;
  title: string;
  body: string;
  createdAt: string;
}): UserFeedbackEntry {
  const title = issue.title.toLowerCase();
  const body = (issue.body ?? '').toLowerCase();
  const combined = `${title} ${body}`;

  let target = 'general';
  let targetType: UserFeedbackEntry['targetType'] = 'general';

  // Agent patterns: "agent: xxx", "에이전트: xxx"
  const agentMatch = combined.match(/(?:agent|에이전트)[:\s]+([a-z][\w-]+)/);
  if (agentMatch) {
    target = agentMatch[1];
    targetType = 'agent';
  }

  // Skill patterns (overrides agent): "skill: xxx", "스킬: xxx"
  const skillMatch = combined.match(/(?:skill|스킬)[:\s]+([a-z][\w-]+)/);
  if (skillMatch) {
    target = skillMatch[1];
    targetType = 'skill';
  }

  // Rule patterns (highest precedence): "R0xx"
  const ruleMatch = combined.match(/\b(R\d{3})\b/i);
  if (ruleMatch) {
    target = ruleMatch[1].toUpperCase();
    targetType = 'rule';
  }

  // Sentiment detection from title keywords
  let sentiment: UserFeedbackEntry['sentiment'] = 'suggestion';
  if (
    title.includes('bug') ||
    title.includes('fail') ||
    title.includes('broken') ||
    title.includes('실패')
  ) {
    sentiment = 'negative';
  } else if (
    title.includes('great') ||
    title.includes('good') ||
    title.includes('좋') ||
    title.includes('잘')
  ) {
    sentiment = 'positive';
  }

  return {
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    createdAt: issue.createdAt,
    target,
    targetType,
    sentiment,
    feedbackSource: 'user_explicit',
  };
}

/**
 * Fetches GitHub issues labeled 'feedback' using the gh CLI.
 * Returns an empty array if gh is unavailable or there are no matching issues.
 * Applies a 10-second timeout to avoid hanging.
 */
export function fetchUserFeedbackIssues(): UserFeedbackEntry[] {
  try {
    const raw = execSync(
      'gh issue list --label feedback --state all --json number,title,body,createdAt --limit 50',
      { encoding: 'utf-8', timeout: 10000 }
    );
    const issues = JSON.parse(raw) as Array<{
      number: number;
      title: string;
      body: string;
      createdAt: string;
    }>;
    return issues.map(parseIssueToFeedback);
  } catch {
    return [];
  }
}

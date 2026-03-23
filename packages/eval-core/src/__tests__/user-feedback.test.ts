/**
 * Tests for user-feedback module: parseIssueToFeedback, fetchUserFeedbackIssues,
 * and userFeedbackToSuggestions (integration with feedback.ts).
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock node:child_process before any imports that use it.
// Bun hoists mock.module calls, so this applies to all subsequent imports.
const mockExecSync = mock(() => '[]');

mock.module('node:child_process', () => ({
  execSync: mockExecSync,
}));

import { fetchUserFeedbackIssues, parseIssueToFeedback } from '../query/user-feedback.js';
import { userFeedbackToSuggestions } from '../query/feedback.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: {
  number?: number;
  title?: string;
  body?: string;
  createdAt?: string;
}) {
  return {
    number: overrides.number ?? 1,
    title: overrides.title ?? 'Test issue',
    body: overrides.body ?? '',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// parseIssueToFeedback — target extraction
// ---------------------------------------------------------------------------

describe('parseIssueToFeedback', () => {
  describe('targetType detection', () => {
    it('defaults to general when no keywords match', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'Something is wrong' }));
      expect(entry.targetType).toBe('general');
      expect(entry.target).toBe('general');
    });

    it('detects agent from title "agent: xxx"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'agent: lang-golang-expert fails' }));
      expect(entry.targetType).toBe('agent');
      expect(entry.target).toBe('lang-golang-expert');
    });

    it('detects agent from Korean "에이전트: xxx"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: '에이전트: mgr-gitnerd 오류' }));
      expect(entry.targetType).toBe('agent');
      expect(entry.target).toBe('mgr-gitnerd');
    });

    it('detects skill from title "skill: xxx"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'skill: dev-review broken' }));
      expect(entry.targetType).toBe('skill');
      expect(entry.target).toBe('dev-review');
    });

    it('detects skill from Korean "스킬: xxx"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: '스킬: deep-plan 실패' }));
      expect(entry.targetType).toBe('skill');
      expect(entry.target).toBe('deep-plan');
    });

    it('detects rule from "R007" in title', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'R007 identification missing' }));
      expect(entry.targetType).toBe('rule');
      expect(entry.target).toBe('R007');
    });

    it('normalizes rule ID to uppercase', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'r009 not followed' }));
      expect(entry.targetType).toBe('rule');
      expect(entry.target).toBe('R009');
    });

    it('detects rule from body when not in title', () => {
      const entry = parseIssueToFeedback(
        makeIssue({ title: 'Parallel execution issue', body: 'The R009 rule is violated here' })
      );
      expect(entry.targetType).toBe('rule');
      expect(entry.target).toBe('R009');
    });

    it('rule overrides skill (rule has highest precedence)', () => {
      const entry = parseIssueToFeedback(
        makeIssue({ title: 'skill: dev-review violates R010' })
      );
      expect(entry.targetType).toBe('rule');
      expect(entry.target).toBe('R010');
    });

    it('rule overrides agent', () => {
      const entry = parseIssueToFeedback(
        makeIssue({ title: 'agent: mgr-gitnerd breaks R007 identification' })
      );
      expect(entry.targetType).toBe('rule');
      expect(entry.target).toBe('R007');
    });

    it('skill overrides agent', () => {
      const entry = parseIssueToFeedback(
        makeIssue({ title: 'agent: lang-python-expert using skill: python-best-practices fails' })
      );
      expect(entry.targetType).toBe('skill');
      expect(entry.target).toBe('python-best-practices');
    });
  });

  describe('sentiment detection', () => {
    it('defaults to suggestion', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'Please add feature X' }));
      expect(entry.sentiment).toBe('suggestion');
    });

    it('detects negative for "bug" in title', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'bug: routing miss in dev-lead' }));
      expect(entry.sentiment).toBe('negative');
    });

    it('detects negative for "fail" in title', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'agent fails consistently' }));
      expect(entry.sentiment).toBe('negative');
    });

    it('detects negative for "broken" in title', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'broken: dev-review skill' }));
      expect(entry.sentiment).toBe('negative');
    });

    it('detects negative for Korean "실패"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: '에이전트 실패 문제' }));
      expect(entry.sentiment).toBe('negative');
    });

    it('detects positive for "great"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'great improvement in routing' }));
      expect(entry.sentiment).toBe('positive');
    });

    it('detects positive for "good"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: 'good job on skill dev-review' }));
      expect(entry.sentiment).toBe('positive');
    });

    it('detects positive for Korean "좋"', () => {
      const entry = parseIssueToFeedback(makeIssue({ title: '좋은 에이전트 설계' }));
      expect(entry.sentiment).toBe('positive');
    });
  });

  describe('output fields', () => {
    it('preserves original title and body casing', () => {
      const entry = parseIssueToFeedback(
        makeIssue({ number: 42, title: 'Bug: Agent: lang-Python-Expert', body: 'Some body text' })
      );
      expect(entry.issueNumber).toBe(42);
      expect(entry.title).toBe('Bug: Agent: lang-Python-Expert');
      expect(entry.body).toBe('Some body text');
    });

    it('sets feedbackSource to user_explicit', () => {
      const entry = parseIssueToFeedback(makeIssue({}));
      expect(entry.feedbackSource).toBe('user_explicit');
    });

    it('handles null/undefined body gracefully', () => {
      const entry = parseIssueToFeedback({ number: 1, title: 'test', body: '', createdAt: '2026-01-01T00:00:00Z' });
      expect(entry.body).toBe('');
      expect(entry.targetType).toBe('general');
    });
  });
});

// ---------------------------------------------------------------------------
// fetchUserFeedbackIssues — mocked execSync
// ---------------------------------------------------------------------------

describe('fetchUserFeedbackIssues', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('returns empty array when gh returns empty list', () => {
    mockExecSync.mockImplementation(() => '[]');
    const result = fetchUserFeedbackIssues();
    expect(result).toEqual([]);
  });

  it('parses issues returned by gh CLI', () => {
    mockExecSync.mockImplementation(() =>
      JSON.stringify([
        {
          number: 10,
          title: 'bug: agent: lang-typescript-expert fails',
          body: '',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ])
    );
    const result = fetchUserFeedbackIssues();
    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(10);
    expect(result[0].targetType).toBe('agent');
    expect(result[0].sentiment).toBe('negative');
  });

  it('returns empty array when execSync throws (gh not available)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found: gh');
    });
    const result = fetchUserFeedbackIssues();
    expect(result).toEqual([]);
  });

  it('returns empty array when JSON is malformed', () => {
    mockExecSync.mockImplementation(() => 'not-json');
    const result = fetchUserFeedbackIssues();
    expect(result).toEqual([]);
  });

  it('passes correct gh CLI command with timeout', () => {
    mockExecSync.mockImplementation(() => '[]');
    fetchUserFeedbackIssues();
    expect(mockExecSync).toHaveBeenCalledWith(
      'gh issue list --label feedback --state all --json number,title,body,createdAt --limit 50',
      { encoding: 'utf-8', timeout: 10000 }
    );
  });
});

// ---------------------------------------------------------------------------
// userFeedbackToSuggestions — filtering and mapping
// ---------------------------------------------------------------------------

describe('userFeedbackToSuggestions', () => {
  it('returns empty array for empty input', () => {
    expect(userFeedbackToSuggestions([])).toEqual([]);
  });

  it('filters out general targetType entries', () => {
    const entries = [
      {
        issueNumber: 1,
        title: 'Something wrong',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'general',
        targetType: 'general' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    expect(userFeedbackToSuggestions(entries)).toEqual([]);
  });

  it('filters out non-negative sentiment entries', () => {
    const entries = [
      {
        issueNumber: 2,
        title: 'great skill',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'dev-review',
        targetType: 'skill' as const,
        sentiment: 'positive' as const,
        feedbackSource: 'user_explicit' as const,
      },
      {
        issueNumber: 3,
        title: 'add feature to dev-review',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'dev-review',
        targetType: 'skill' as const,
        sentiment: 'suggestion' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    expect(userFeedbackToSuggestions(entries)).toEqual([]);
  });

  it('maps negative agent entry to ImprovementSuggestion correctly', () => {
    const entries = [
      {
        issueNumber: 5,
        title: 'bug: agent: lang-golang-expert fails',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'lang-golang-expert',
        targetType: 'agent' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    const suggestions = userFeedbackToSuggestions(entries);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.target).toBe('lang-golang-expert');
    expect(s.targetType).toBe('agent');
    expect(s.actionType).toBe('revise');
    expect(s.confidence).toBe('medium');
    expect(s.description).toContain('#5');
    expect(s.evidence.metric).toBe('user_feedback');
    expect(s.evidence.value).toBe(1);
    expect(s.evidence.threshold).toBe(0);
    expect(s.evidence.sessionCount).toBe(1);
  });

  it('maps negative skill entry to ImprovementSuggestion', () => {
    const entries = [
      {
        issueNumber: 7,
        title: 'broken: skill: dev-review',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'dev-review',
        targetType: 'skill' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    const suggestions = userFeedbackToSuggestions(entries);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].targetType).toBe('skill');
  });

  it('maps negative rule entry to ImprovementSuggestion', () => {
    const entries = [
      {
        issueNumber: 9,
        title: 'R007 identification missing',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'R007',
        targetType: 'rule' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    const suggestions = userFeedbackToSuggestions(entries);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].targetType).toBe('rule');
    expect(suggestions[0].target).toBe('R007');
  });

  it('processes multiple entries, keeping only negative non-general ones', () => {
    const entries = [
      {
        issueNumber: 1,
        title: 'bug: agent: lang-go',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'lang-go',
        targetType: 'agent' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
      {
        issueNumber: 2,
        title: 'good feedback',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'lang-go',
        targetType: 'agent' as const,
        sentiment: 'positive' as const,
        feedbackSource: 'user_explicit' as const,
      },
      {
        issueNumber: 3,
        title: 'general issue',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'general',
        targetType: 'general' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
      {
        issueNumber: 4,
        title: 'broken: skill: deep-plan',
        body: '',
        createdAt: '2026-01-01T00:00:00Z',
        target: 'deep-plan',
        targetType: 'skill' as const,
        sentiment: 'negative' as const,
        feedbackSource: 'user_explicit' as const,
      },
    ];
    const suggestions = userFeedbackToSuggestions(entries);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].target).toBe('lang-go');
    expect(suggestions[1].target).toBe('deep-plan');
  });
});

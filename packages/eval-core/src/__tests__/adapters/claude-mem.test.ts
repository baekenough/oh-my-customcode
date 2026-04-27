/**
 * Tests for the claude-mem adapter and shared sensitivity detection.
 *
 * Coverage targets: normalizeClaudeMem, detectSensitivity
 * Epic: #1047 / Issue: #1070
 */

import { describe, expect, it } from 'bun:test';
import {
  detectSensitivity,
  normalizeClaudeMem,
  type ClaudeMemRecord,
} from '../../adapters/claude-mem.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPTS = {
  deviceId: 'macbook-test',
  project: '/Users/sangyi/workspace/projects/oh-my-customcode',
} as const;

function makeRaw(overrides: Partial<ClaudeMemRecord> = {}): ClaudeMemRecord {
  return {
    id: 'f7e8d9c0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    content: 'Session 88: v0.116.1 bootstrap hotfix shipped. Decisions: general-purpose fallback.',
    created_at: '2026-04-27T10:30:00Z',
    tags: ['session-summary', 'hotfix'],
    metadata: {
      project: 'oh-my-customcode',
      agent: 'sys-memory-keeper',
      sensitivity: 'project',
      vector_id: 'f7e8d9c0vector',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeClaudeMem — happy path
// ---------------------------------------------------------------------------

describe('normalizeClaudeMem', () => {
  it('populates all required fields from a complete raw record', () => {
    const raw = makeRaw();
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.id).toBe('f7e8d9c0-1a2b-3c4d-5e6f-7a8b9c0d1e2f');
    expect(record.source).toBe('claude-mem');
    expect(record.device_id).toBe(OPTS.deviceId);
    expect(record.project).toBe(OPTS.project);
    expect(record.agent).toBe('sys-memory-keeper');
    expect(record.timestamp).toBe('2026-04-27T10:30:00.000Z');
    expect(record.content).toBe(raw.content);
    expect(record.tags).toEqual(['session-summary', 'hotfix']);
    expect(record.sensitivity).toBe('project');
    expect(typeof record.hash).toBe('string');
    expect(record.hash.length).toBe(64); // SHA-256 hex
    expect(record.embedding_ref).toBe('claude-mem/f7e8d9c0vector');
  });

  it('generates a UUID id when raw.id is absent', () => {
    const raw = makeRaw({ id: undefined });
    const record = normalizeClaudeMem(raw, OPTS);

    // UUID v4 pattern
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('omits agent when metadata.agent is absent', () => {
    const raw = makeRaw({ metadata: { sensitivity: 'project' } });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.agent).toBeUndefined();
  });

  it('omits embedding_ref when metadata.vector_id is absent', () => {
    const raw = makeRaw({ metadata: { sensitivity: 'project' } });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.embedding_ref).toBeUndefined();
  });

  it('handles empty content gracefully', () => {
    const raw = makeRaw({ content: '' });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.content).toBe('');
    expect(record.summary).toBe('');
    expect(typeof record.hash).toBe('string');
  });

  it('handles a completely empty raw record', () => {
    const record = normalizeClaudeMem({}, OPTS);

    expect(record.source).toBe('claude-mem');
    expect(record.device_id).toBe(OPTS.deviceId);
    expect(record.project).toBe(OPTS.project);
    expect(record.content).toBe('');
    expect(record.tags).toEqual([]);
    expect(record.sensitivity).toBe('project');
    expect(typeof record.hash).toBe('string');
  });

  // -------------------------------------------------------------------------
  // summary extraction
  // -------------------------------------------------------------------------

  it('extracts first sentence as summary', () => {
    const raw = makeRaw({
      content: 'First sentence. Second sentence follows here.',
    });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.summary).toBe('First sentence.');
  });

  it('caps summary at 150 characters', () => {
    const raw = makeRaw({ content: 'A'.repeat(300) });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.summary.length).toBeLessThanOrEqual(150);
  });

  // -------------------------------------------------------------------------
  // tags normalisation
  // -------------------------------------------------------------------------

  it('normalises JSON-encoded tags string to array', () => {
    const raw = makeRaw({ tags: '["feedback","release"]' });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.tags).toEqual(['feedback', 'release']);
  });

  it('handles a JSON-bracket string that parses to non-array (falls back to comma-split)', () => {
    // "[invalid json" — JSON.parse will throw → comma-split fallback
    const raw = makeRaw({ tags: '[invalid json' });
    const record = normalizeClaudeMem(raw, OPTS);

    // Split on comma yields a single element (the whole string trimmed)
    expect(record.tags).toEqual(['[invalid json']);
  });

  it('normalises comma-separated tags string to array', () => {
    const raw = makeRaw({ tags: 'feedback, release' });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.tags).toEqual(['feedback', 'release']);
  });

  it('prefers raw.tags over metadata.tags', () => {
    const raw = makeRaw({
      tags: ['from-top-level'],
      metadata: { tags: ['from-metadata'] },
    });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.tags).toEqual(['from-top-level']);
  });

  // -------------------------------------------------------------------------
  // sensitivity escalation
  // -------------------------------------------------------------------------

  it('honours explicit sensitive declaration from metadata', () => {
    const raw = makeRaw({ metadata: { sensitivity: 'sensitive' } });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.sensitivity).toBe('sensitive');
  });

  it('honours explicit public declaration from metadata', () => {
    const raw = makeRaw({ metadata: { sensitivity: 'public' } });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.sensitivity).toBe('public');
  });

  it('overrides explicit public with secret when content matches secret pattern', () => {
    const raw = makeRaw({
      content: 'Key: sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890',
      metadata: { sensitivity: 'public' },
    });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.sensitivity).toBe('secret');
  });

  // -------------------------------------------------------------------------
  // hash determinism
  // -------------------------------------------------------------------------

  it('produces the same hash for the same content', () => {
    const raw = makeRaw({ content: 'deterministic content' });
    const r1 = normalizeClaudeMem(raw, OPTS);
    const r2 = normalizeClaudeMem(raw, OPTS);

    expect(r1.hash).toBe(r2.hash);
  });

  it('produces different hashes for different content', () => {
    const r1 = normalizeClaudeMem(makeRaw({ content: 'content-A' }), OPTS);
    const r2 = normalizeClaudeMem(makeRaw({ content: 'content-B' }), OPTS);

    expect(r1.hash).not.toBe(r2.hash);
  });

  // -------------------------------------------------------------------------
  // timestamp parsing
  // -------------------------------------------------------------------------

  it('parses ISO 8601 timestamp string', () => {
    const raw = makeRaw({ created_at: '2026-04-27T10:30:00Z' });
    const record = normalizeClaudeMem(raw, OPTS);

    // new Date(iso).toISOString() normalises to full form with milliseconds
    expect(record.timestamp).toBe(new Date('2026-04-27T10:30:00Z').toISOString());
  });

  it('parses Unix epoch (milliseconds) timestamp', () => {
    const epoch = 1745751000000; // 2026-04-27T10:30:00Z
    const raw = makeRaw({ created_at: epoch as unknown as string });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.timestamp).toBe(new Date(epoch).toISOString());
  });

  it('parses Date object as timestamp', () => {
    const d = new Date('2026-04-27T10:30:00Z');
    const raw = makeRaw({ created_at: d as unknown as string });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.timestamp).toBe(d.toISOString());
  });

  it('falls back to metadata.created_at when raw.created_at is absent', () => {
    const raw = makeRaw({
      created_at: undefined,
      metadata: { created_at: '2026-04-20T00:00:00Z' },
    });
    const record = normalizeClaudeMem(raw, OPTS);

    expect(record.timestamp).toBe('2026-04-20T00:00:00.000Z');
  });

  it('falls back to current time when no timestamp source is present', () => {
    const before = Date.now();
    const raw = makeRaw({ created_at: undefined, metadata: {} });
    const record = normalizeClaudeMem(raw, OPTS);
    const after = Date.now();

    const ts = new Date(record.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('falls back to current time when timestamp string is invalid', () => {
    const before = Date.now();
    const raw = makeRaw({ created_at: 'not-a-date', metadata: {} });
    const record = normalizeClaudeMem(raw, OPTS);
    const after = Date.now();

    const ts = new Date(record.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// detectSensitivity — one test per secret pattern + benign baseline
// ---------------------------------------------------------------------------

describe('detectSensitivity', () => {
  it('returns "project" for benign content', () => {
    expect(detectSensitivity('This is a normal session summary note.')).toBe('project');
  });

  it('detects OpenAI API key (sk-...)', () => {
    expect(detectSensitivity('key: sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890')).toBe('secret');
  });

  it('detects GitHub PAT (ghp_...)', () => {
    // ghp_ followed by exactly 36 alphanumeric characters
    expect(detectSensitivity('token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890')).toBe('secret');
  });

  it('detects GitHub OAuth app token (ghs_...)', () => {
    // ghs_ followed by exactly 36 alphanumeric characters
    expect(detectSensitivity('token ghs_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890')).toBe('secret');
  });

  it('detects AWS access key ID (AKIA...)', () => {
    expect(detectSensitivity('access_key: AKIAIOSFODNN7EXAMPLE')).toBe('secret');
  });

  it('detects Slack bot token (xoxb-...)', () => {
    expect(detectSensitivity('slack_token: xoxb-111-222-aBcDeFgHiJkL')).toBe('secret');
  });

  it('detects Slack user token (xoxp-...)', () => {
    expect(detectSensitivity('slack_token: xoxp-111-222-333-aBcDeFgHiJkL')).toBe('secret');
  });

  it('detects Anthropic API key (sk-ant-...)', () => {
    const key = 'sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890aBcDeFgH';
    expect(detectSensitivity(`key: ${key}`)).toBe('secret');
  });

  it('detects RSA private key block', () => {
    expect(detectSensitivity('-----BEGIN RSA PRIVATE KEY-----\nMIIEo...')).toBe('secret');
  });

  it('detects EC private key block', () => {
    expect(detectSensitivity('-----BEGIN EC PRIVATE KEY-----\nMHQ...')).toBe('secret');
  });

  it('detects OPENSSH private key block', () => {
    expect(detectSensitivity('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl...')).toBe('secret');
  });

  it('detects JWT token', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(detectSensitivity(`token: ${jwt}`)).toBe('secret');
  });

  it('detects generic password assignment (double-quoted)', () => {
    expect(detectSensitivity('password = "sup3rS3cr3t!!"')).toBe('secret');
  });

  it('detects generic password assignment (single-quoted)', () => {
    expect(detectSensitivity("password = 'sup3rS3cr3t!!'")).toBe('secret');
  });

  it('detects generic api_key assignment', () => {
    expect(detectSensitivity('api_key = "aBcDeFgHiJkLmNoPqRsTuVwXy"')).toBe('secret');
  });

  it('detects generic secret assignment', () => {
    expect(detectSensitivity('secret = "aBcDeFgHiJkLmNoPqRsTuVwXy"')).toBe('secret');
  });

  it('does not false-positive on short benign content resembling a prefix', () => {
    // 'sk-' but shorter than 30 chars
    expect(detectSensitivity('sk-short')).toBe('project');
  });
});

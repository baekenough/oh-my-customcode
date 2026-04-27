/**
 * Tests for native-memory adapter (#1072).
 *
 * Uses a temporary directory for all file I/O — never touches the real
 * ~/.claude/ or project MEMORY.md.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deriveAgent,
  deriveProject,
  parseMemoryFile,
  scanNativeMemory,
  type MemoryRecord,
  type NativeMemoryFile,
} from '../../adapters/native-memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/** Create a unique temp directory for each test. */
async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `native-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// parseMemoryFile — MEMORY.md with 3 sections
// ---------------------------------------------------------------------------

describe('parseMemoryFile: MEMORY.md with 3 sections', () => {
  const content = `
# Oh My Memory

## Preamble

This content before the first ### is ignored by the section splitter.

### Section Alpha
Alpha body line 1.
Alpha body line 2.

### Section Beta
Beta body.

### Section Gamma
Gamma body.
`.trimStart();

  it('produces 3 sections', () => {
    const result: NativeMemoryFile = parseMemoryFile(content, '/tmp/MEMORY.md');
    expect(result.sections).toHaveLength(3);
  });

  it('captures correct headers', () => {
    const result = parseMemoryFile(content, '/tmp/MEMORY.md');
    expect(result.sections[0]?.header).toBe('### Section Alpha');
    expect(result.sections[1]?.header).toBe('### Section Beta');
    expect(result.sections[2]?.header).toBe('### Section Gamma');
  });

  it('captures correct body for each section', () => {
    const result = parseMemoryFile(content, '/tmp/MEMORY.md');
    expect(result.sections[0]?.body).toContain('Alpha body line 1.');
    expect(result.sections[1]?.body).toContain('Beta body.');
    expect(result.sections[2]?.body).toContain('Gamma body.');
  });

  it('sets rawContent to full input', () => {
    const result = parseMemoryFile(content, '/tmp/MEMORY.md');
    expect(result.rawContent).toBe(content);
  });

  it('stores the provided filePath', () => {
    const result = parseMemoryFile(content, '/custom/path/MEMORY.md');
    expect(result.filePath).toBe('/custom/path/MEMORY.md');
  });
});

// ---------------------------------------------------------------------------
// parseMemoryFile — feedback_*.md → 1 record
// ---------------------------------------------------------------------------

describe('parseMemoryFile: feedback_*.md produces 1 section', () => {
  const content = `---
name: feedback example
type: feedback
---

Do not use Bash for .claude/ edits. Use Write/Edit instead.

**Why:** Bash triggers the sensitive-path guard.
**How to apply:** Always prefer Write/Edit for .claude/ file operations.
`;

  it('returns exactly 1 section', () => {
    const result = parseMemoryFile(content, '/tmp/feedback_sensitive_path.md');
    expect(result.sections).toHaveLength(1);
  });

  it('body contains the full file content', () => {
    const result = parseMemoryFile(content, '/tmp/feedback_sensitive_path.md');
    expect(result.sections[0]?.body).toBe(content);
  });

  it('header is empty string', () => {
    const result = parseMemoryFile(content, '/tmp/feedback_sensitive_path.md');
    expect(result.sections[0]?.header).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseMemoryFile — sessions_archive_*.md with 3 sessions
// ---------------------------------------------------------------------------

describe('parseMemoryFile: sessions_archive_*.md with 3 sessions', () => {
  const content = `
# Session Archive

Header text before first session.

### Session 1
Session 1 body.

### Session 2
Session 2 body.

### Session 3
Session 3 body.
`.trimStart();

  it('produces 3 sections', () => {
    const result = parseMemoryFile(content, '/tmp/sessions_archive_v0.19_v0.100.md');
    expect(result.sections).toHaveLength(3);
  });

  it('each section header starts with ### Session', () => {
    const result = parseMemoryFile(content, '/tmp/sessions_archive_v0.19_v0.100.md');
    for (const section of result.sections) {
      expect(section.header).toMatch(/^### Session /);
    }
  });

  it('captures correct session bodies', () => {
    const result = parseMemoryFile(content, '/tmp/sessions_archive_v0.19_v0.100.md');
    expect(result.sections[0]?.body).toContain('Session 1 body.');
    expect(result.sections[1]?.body).toContain('Session 2 body.');
    expect(result.sections[2]?.body).toContain('Session 3 body.');
  });
});

// ---------------------------------------------------------------------------
// deriveProject — path extraction
// ---------------------------------------------------------------------------

describe('deriveProject', () => {
  it('extracts project name from ~/.claude/projects encoded path (with -projects- anchor)', () => {
    const path =
      '/Users/sangyi/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode/memory/MEMORY.md';
    expect(deriveProject(path)).toBe('oh-my-customcode');
  });

  it('extracts project name with hyphenated project name', () => {
    const path =
      '/Users/sangyi/.claude/projects/-Users-sangyi-workspace-projects-my-cool-app/memory/MEMORY.md';
    expect(deriveProject(path)).toBe('my-cool-app');
  });

  it('extracts project name with -workspace- anchor when no -projects-', () => {
    const path =
      '/Users/sangyi/.claude/projects/-Users-sangyi-workspace-myapp/memory/feedback_x.md';
    expect(deriveProject(path)).toBe('myapp');
  });

  it('returns "global" for agent-memory paths', () => {
    const path =
      '/Users/sangyi/workspace/projects/oh-my-customcode/.claude/agent-memory/lang-typescript-expert/MEMORY.md';
    expect(deriveProject(path)).toBe('global');
  });

  it('returns "global" for ~/.claude/agent-memory paths', () => {
    const path = '/Users/sangyi/.claude/agent-memory/sys-memory-keeper/MEMORY.md';
    expect(deriveProject(path)).toBe('global');
  });
});

// ---------------------------------------------------------------------------
// deriveAgent — agent name extraction
// ---------------------------------------------------------------------------

describe('deriveAgent', () => {
  it('extracts agent name from project agent-memory path', () => {
    const path =
      '/proj/.claude/agent-memory/lang-typescript-expert/MEMORY.md';
    expect(deriveAgent(path)).toBe('lang-typescript-expert');
  });

  it('extracts agent name from user ~/.claude/agent-memory path', () => {
    const path = '/Users/sangyi/.claude/agent-memory/sys-memory-keeper/feedback_x.md';
    expect(deriveAgent(path)).toBe('sys-memory-keeper');
  });

  it('returns null for project conversation memory path', () => {
    const path =
      '/Users/sangyi/.claude/projects/-Users-sangyi-workspace-projects-oh-my-customcode/memory/MEMORY.md';
    expect(deriveAgent(path)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hash determinism
// ---------------------------------------------------------------------------

describe('hash determinism', () => {
  it('produces the same hash for identical content', () => {
    const content = 'Hello, memory!';
    const h1 = sha256(content);
    const h2 = sha256(content);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different content', () => {
    expect(sha256('content A')).not.toBe(sha256('content B'));
  });

  it('hash format is sha256-<hex>', () => {
    const h = sha256('test');
    expect(h).toMatch(/^sha256-[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// scanNativeMemory — integration over tmpdir
// ---------------------------------------------------------------------------

describe('scanNativeMemory: end-to-end in tmpdir', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns empty array when root does not exist', async () => {
    const records = await scanNativeMemory([join(tempRoot, 'nonexistent')], {
      deviceId: 'test-host',
    });
    expect(records).toHaveLength(0);
  });

  it('returns empty array when root has no .md files', async () => {
    await writeFile(join(tempRoot, 'README.txt'), 'ignored');
    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(0);
  });

  it('skips hidden files', async () => {
    await writeFile(join(tempRoot, '.hidden.md'), '# secret');
    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(0);
  });

  it('skips *.tmp files', async () => {
    await writeFile(join(tempRoot, 'notes.tmp'), 'temp data');
    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(0);
  });

  it('produces 1 record from a top-level feedback_*.md file', async () => {
    const content = '---\nname: test\ntype: feedback\n---\nDo not do X.\n';
    await writeFile(join(tempRoot, 'feedback_test.md'), content);

    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('native');
    expect(records[0]?.deviceId).toBe('test-host');
  });

  it('produces N records from MEMORY.md with N ### sections', async () => {
    const content = [
      '# Index',
      '',
      '### Section One',
      'Body one.',
      '',
      '### Section Two',
      'Body two.',
      '',
      '### Section Three',
      'Body three.',
    ].join('\n');

    const agentDir = join(tempRoot, 'my-agent');
    await mkdir(agentDir);
    await writeFile(join(agentDir, 'MEMORY.md'), content);

    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(3);
  });

  it('assigns agent name from sub-directory name', async () => {
    const agentDir = join(tempRoot, 'lang-typescript-expert');
    await mkdir(agentDir);
    await writeFile(join(agentDir, 'feedback_style.md'), 'Use single quotes.');

    const records = await scanNativeMemory([tempRoot], { deviceId: 'test-host' });
    expect(records).toHaveLength(1);
    expect(records[0]?.agent).toBe('lang-typescript-expert');
  });

  it('records have deterministic hash based on content', async () => {
    const body = 'Stable content for hash check.';
    await writeFile(join(tempRoot, 'feedback_hash.md'), body);

    const [r1] = await scanNativeMemory([tempRoot], { deviceId: 'host-a' });
    const [r2] = await scanNativeMemory([tempRoot], { deviceId: 'host-b' });

    expect(r1?.hash).toBeDefined();
    // Hash is content-based, not deviceId-based — same content → same hash.
    expect(r1?.hash).toBe(r2?.hash);
  });

  it('hash starts with sha256-', async () => {
    await writeFile(join(tempRoot, 'feedback_x.md'), 'x content');
    const [record] = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(record?.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  it('sets source to "native" on every record', async () => {
    const agentDir = join(tempRoot, 'some-agent');
    await mkdir(agentDir);
    await writeFile(join(agentDir, 'feedback_a.md'), 'record A');
    await writeFile(join(agentDir, 'feedback_b.md'), 'record B');

    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(records.every((r) => r.source === 'native')).toBe(true);
  });

  it('sets embeddingRef to null on every record', async () => {
    await writeFile(join(tempRoot, 'feedback_emb.md'), 'no embedding yet');
    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(records.every((r) => r.embeddingRef === null)).toBe(true);
  });

  it('scans multiple roots and aggregates results', async () => {
    const root1 = join(tempRoot, 'root1');
    const root2 = join(tempRoot, 'root2');
    await mkdir(root1);
    await mkdir(root2);
    await writeFile(join(root1, 'feedback_one.md'), 'from root1');
    await writeFile(join(root2, 'feedback_two.md'), 'from root2');

    const records = await scanNativeMemory([root1, root2], { deviceId: 'host' });
    expect(records).toHaveLength(2);
  });

  it('detects secret sensitivity in content', async () => {
    const secret = 'sk-ant-api-01-verylonganthropicapikey12345678901234567890';
    await writeFile(join(tempRoot, 'feedback_sec.md'), `Token: ${secret}`);

    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(records[0]?.sensitivity).toBe('secret');
  });

  it('assigns "project" sensitivity for normal content', async () => {
    await writeFile(join(tempRoot, 'feedback_norm.md'), 'Normal project memory content.');
    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(records[0]?.sensitivity).toBe('project');
  });

  it('produces 3 session records from sessions_archive_*.md', async () => {
    const content = [
      '# Archive',
      '',
      '### Session 10',
      'Session 10 work.',
      '',
      '### Session 11',
      'Session 11 work.',
      '',
      '### Session 12',
      'Session 12 work.',
    ].join('\n');

    const agentDir = join(tempRoot, 'agent-x');
    await mkdir(agentDir);
    await writeFile(join(agentDir, 'sessions_archive_v0.01_v0.12.md'), content);

    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    expect(records).toHaveLength(3);
    // Each summary should reference the session header.
    const summaries = records.map((r) => r.summary);
    expect(summaries).toContain('Session 10');
    expect(summaries).toContain('Session 11');
    expect(summaries).toContain('Session 12');
  });

  it('each record has a UUID-formatted id', async () => {
    await writeFile(join(tempRoot, 'feedback_id.md'), 'id test');
    const [record] = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(record?.id).toMatch(uuidRegex);
  });

  it('tags include "native" for all records', async () => {
    await writeFile(join(tempRoot, 'feedback_tags.md'), 'tags test');
    const [record] = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    const tags: string[] = JSON.parse(record?.tags ?? '[]');
    expect(tags).toContain('native');
  });

  it('tags include "feedback" for feedback_*.md files', async () => {
    await writeFile(join(tempRoot, 'feedback_check.md'), 'check');
    const [record] = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    const tags: string[] = JSON.parse(record?.tags ?? '[]');
    expect(tags).toContain('feedback');
  });

  it('tags include "index" for MEMORY.md files', async () => {
    const agentDir = join(tempRoot, 'agent-mem');
    await mkdir(agentDir);
    await writeFile(
      join(agentDir, 'MEMORY.md'),
      '### Only Section\nBody.\n'
    );

    const records = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    const tags: string[] = JSON.parse(records[0]?.tags ?? '[]');
    expect(tags).toContain('index');
  });

  it('timestamp is a valid ISO8601 string', async () => {
    await writeFile(join(tempRoot, 'feedback_ts.md'), 'ts check');
    const [record] = await scanNativeMemory([tempRoot], { deviceId: 'host' });
    const ts = record?.timestamp ?? '';
    expect(() => new Date(ts).toISOString()).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// deriveProject — edge cases
// ---------------------------------------------------------------------------

describe('deriveProject: edge cases', () => {
  it('falls back to last long segment when no known anchor present', () => {
    // Encoded path with no -workspace- or -projects- keyword.
    const path = '/Users/sangyi/.claude/projects/-Users-sangyi-myproject/memory/MEMORY.md';
    const result = deriveProject(path);
    // No anchor found — falls back to last segment with len >= 3.
    expect(result).toBe('myproject');
  });

  it('returns "global" for paths outside /.claude/projects/', () => {
    const path = '/Users/sangyi/.claude/agent-memory/sys-memory-keeper/MEMORY.md';
    expect(deriveProject(path)).toBe('global');
  });
});

// ---------------------------------------------------------------------------
// parseMemoryFile — summary from empty-header section
// ---------------------------------------------------------------------------

describe('parseMemoryFile: unsectioned file summary derivation', () => {
  it('uses first non-empty line as summary for feedback files', async () => {
    const dir = await makeTempDir();
    try {
      const content = '\n\nFirst real line.\nSecond line.\n';
      await writeFile(join(dir, 'feedback_summary.md'), content);
      const records = await scanNativeMemory([dir], { deviceId: 'host' });
      expect(records[0]?.summary).toBe('First real line.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('tags include "sessions" for sessions_archive_*.md', async () => {
    const dir = await makeTempDir();
    try {
      const agentDir = join(dir, 'agent-s');
      await mkdir(agentDir);
      await writeFile(join(agentDir, 'sessions_archive_v0.md'), '### Session 1\nBody.\n');
      const records = await scanNativeMemory([dir], { deviceId: 'host' });
      const tags: string[] = JSON.parse(records[0]?.tags ?? '[]');
      expect(tags).toContain('sessions');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('tags include "project" for project_*.md files', async () => {
    const dir = await makeTempDir();
    try {
      await writeFile(join(dir, 'project_context.md'), 'Project context content.');
      const records = await scanNativeMemory([dir], { deviceId: 'host' });
      const tags: string[] = JSON.parse(records[0]?.tags ?? '[]');
      expect(tags).toContain('project');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// MEMORY.md without any ### sections — fallback to full file
// ---------------------------------------------------------------------------

describe('parseMemoryFile: MEMORY.md with no sections falls back to full content', () => {
  it('produces 1 record when MEMORY.md has no ### headings', () => {
    const content = '# My Memory\n\nJust some prose. No triple-hash sections here.\n';
    const result = parseMemoryFile(content, '/tmp/MEMORY.md');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.body).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// MemoryRecord shape contract
// ---------------------------------------------------------------------------

describe('MemoryRecord shape', () => {
  it('conforms to required field set', async () => {
    const dir = await makeTempDir();
    try {
      await writeFile(join(dir, 'feedback_shape.md'), 'shape check');
      const [record] = await scanNativeMemory([dir], { deviceId: 'test-device' });

      // All required fields present.
      const r = record as MemoryRecord;
      expect(typeof r.id).toBe('string');
      expect(r.source).toBe('native');
      expect(typeof r.deviceId).toBe('string');
      expect(typeof r.project).toBe('string');
      expect(r.embeddingRef).toBeNull();
      expect(typeof r.timestamp).toBe('string');
      expect(typeof r.summary).toBe('string');
      expect(typeof r.content).toBe('string');
      expect(typeof r.tags).toBe('string');
      expect(typeof r.sensitivity).toBe('string');
      expect(typeof r.hash).toBe('string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

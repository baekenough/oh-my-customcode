/**
 * Native MEMORY.md scanner — #1072 (@omcustom/eval-core v0.1.0).
 *
 * Scans native auto-memory directories and normalises content into MemoryRecord
 * objects suitable for insertion into the `memory_records` table.
 *
 * Supported sources:
 *   - .claude/agent-memory/<agent>/      (project-scoped, git-tracked)
 *   - ~/.claude/agent-memory/<agent>/    (user-scoped)
 *   - ~/.claude/projects/<encoded>/memory/  (project conversation memory)
 *
 * File classification:
 *   - MEMORY.md         → section-split: each top-level `### Section` → 1 record
 *   - feedback_*.md     → 1 record per file
 *   - sessions_archive_*.md → session-split: each `### Session NN` block → 1 record
 *   - other *.md        → 1 record per file
 *   - Hidden files, *.tmp  → skipped
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { detectSensitivity, type SensitivityTier } from './sensitivity.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Raw parsed representation of a single memory file before normalisation. */
export interface NativeMemoryFile {
  /** Absolute path to the file. */
  filePath: string;
  /** File modification time (UTC). */
  mtime: Date;
  /** Raw file content. */
  rawContent: string;
  /** Parsed logical sections. Each section becomes one MemoryRecord. */
  sections: MemorySection[];
}

/** One logical section within a memory file. */
interface MemorySection {
  /** Section header line (or empty for unsectioned files). */
  header: string;
  /** Full text body of the section. */
  body: string;
}

/** Normalised record ready for the memory_records table. */
export interface MemoryRecord {
  id: string;
  source: 'native';
  deviceId: string;
  project: string;
  agent: string | null;
  timestamp: string;
  summary: string;
  content: string;
  tags: string; // JSON-stringified string[]
  sensitivity: SensitivityTier;
  hash: string;
  embeddingRef: null;
}

/** Options for scanNativeMemory. */
export interface ScanOptions {
  /** Device / hostname identifier used for deviceId field. */
  deviceId: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan one or more native auto-memory root directories and return a flat array
 * of normalised MemoryRecord objects.
 *
 * @param roots   Absolute paths to scan recursively (e.g. `~/.claude/agent-memory/`).
 * @param opts    Scan options — must supply `deviceId`.
 */
export async function scanNativeMemory(roots: string[], opts: ScanOptions): Promise<MemoryRecord[]> {
  const records: MemoryRecord[] = [];

  for (const root of roots) {
    const found = await scanRoot(root, opts.deviceId);
    records.push(...found);
  }

  return records;
}

/**
 * Parse one memory file into a NativeMemoryFile descriptor with logical sections.
 *
 * @param content   Full file content string.
 * @param filePath  Absolute path (used for skip/classification decisions).
 */
export function parseMemoryFile(content: string, filePath: string): NativeMemoryFile {
  // mtime is not available from content alone; callers that need it should stat first.
  // We use epoch as a placeholder — scanRoot always overwrites with real mtime.
  const sections = extractSections(content, filePath);
  return {
    filePath,
    mtime: new Date(0),
    rawContent: content,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Internal: root scanning
// ---------------------------------------------------------------------------

async function scanRoot(root: string, deviceId: string): Promise<MemoryRecord[]> {
  const records: MemoryRecord[] = [];

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    // Root doesn't exist or isn't readable — skip silently.
    return records;
  }

  for (const entry of entries) {
    const entryPath = join(root, entry);
    let entryStat: Awaited<ReturnType<typeof stat>>;
    try {
      entryStat = await stat(entryPath);
    } catch {
      continue;
    }

    if (entryStat.isDirectory()) {
      // Recurse into sub-directories.
      const sub = await scanDirectory(entryPath, root, deviceId);
      records.push(...sub);
    } else if (entryStat.isFile() && shouldProcess(entry)) {
      // Top-level file in the root (e.g. project memory root).
      const project = deriveProject(entryPath);
      const agent = null; // no agent sub-directory at root level
      const fileRecords = await processFile(entryPath, entryStat.mtime, project, agent, deviceId);
      records.push(...fileRecords);
    }
  }

  return records;
}

/**
 * Scan a single sub-directory (e.g. `.claude/agent-memory/<agent-name>/`).
 * The directory name is used as the agent name.
 */
async function scanDirectory(dir: string, root: string, deviceId: string): Promise<MemoryRecord[]> {
  const records: MemoryRecord[] = [];
  const agentName = basename(dir);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return records;
  }

  for (const entry of entries) {
    if (!shouldProcess(entry)) continue;

    const filePath = join(dir, entry);
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }

    if (!fileStat.isFile()) continue;

    const project = deriveProject(filePath);
    const agent = agentName;
    const fileRecords = await processFile(filePath, fileStat.mtime, project, agent, deviceId);
    records.push(...fileRecords);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Internal: file processing
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  mtime: Date,
  project: string,
  agent: string | null,
  deviceId: string
): Promise<MemoryRecord[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const parsed: NativeMemoryFile = {
    ...parseMemoryFile(content, filePath),
    mtime,
  };

  return parsed.sections.map((section) =>
    sectionToRecord(section, parsed, project, agent, deviceId)
  );
}

function sectionToRecord(
  section: MemorySection,
  file: NativeMemoryFile,
  project: string,
  agent: string | null,
  deviceId: string
): MemoryRecord {
  const content = section.body.trim();
  const summary = deriveSummary(section);
  const hash = sha256(content);
  const sensitivity = detectSensitivity(content);

  return {
    id: crypto.randomUUID(),
    source: 'native',
    deviceId,
    project,
    agent,
    timestamp: file.mtime.toISOString(),
    summary,
    content,
    tags: JSON.stringify(deriveTags(file.filePath)),
    sensitivity,
    hash,
    embeddingRef: null,
  };
}

// ---------------------------------------------------------------------------
// Internal: section extraction
// ---------------------------------------------------------------------------

function extractSections(content: string, filePath: string): MemorySection[] {
  const name = basename(filePath);

  if (name === 'MEMORY.md') {
    return splitByHeading(content, /^### /m, 'MEMORY.md');
  }

  if (/^sessions_archive_.*\.md$/.test(name)) {
    return splitByHeading(content, /^### Session /m, 'sessions_archive');
  }

  // All other files (feedback_*.md, topic files, etc.) → single record.
  return [{ header: '', body: content }];
}

/**
 * Split content into sections at each line matching `pattern`.
 * Content before the first match is discarded (usually YAML frontmatter or file header).
 */
function splitByHeading(content: string, pattern: RegExp, _hint: string): MemorySection[] {
  const lines = content.split('\n');
  const sections: MemorySection[] = [];
  let currentHeader = '';
  let currentLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (pattern.test(line)) {
      if (inSection && currentLines.length > 0) {
        sections.push({ header: currentHeader, body: currentLines.join('\n') });
      }
      currentHeader = line.trim();
      currentLines = [];
      inSection = true;
    } else if (inSection) {
      currentLines.push(line);
    }
    // Lines before the first section match are silently skipped.
  }

  // Flush final section.
  if (inSection && currentLines.length > 0) {
    sections.push({ header: currentHeader, body: currentLines.join('\n') });
  }

  // If no sections were found (e.g. the file has no matching headers), fall back to full file.
  if (sections.length === 0) {
    return [{ header: '', body: content }];
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Internal: derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derive project name from a file path.
 *
 * Handles two patterns:
 *   ~/.claude/projects/-Users-X-workspace-projects-<projectname>/memory/  → "<projectname>"
 *   .claude/agent-memory/<agent>/                                           → "global"
 *
 * Claude Code encodes the CWD by replacing each `/` with `-`.
 * Example: /Users/sangyi/workspace/projects/oh-my-customcode
 *       → -Users-sangyi-workspace-projects-oh-my-customcode
 *
 * To extract the project name we search for the `-projects-` segment
 * (or common workspace anchors) in the encoded string and take the remainder
 * up to the next path separator (`/`).
 */
export function deriveProject(filePath: string): string {
  // Match the encoded directory under ~/.claude/projects/.
  const projectsMatch = filePath.match(/\/projects\/(-[^/]+)(?:\/|$)/);
  if (projectsMatch) {
    const encoded = projectsMatch[1] ?? '';
    // Try to strip common workspace prefix patterns: -projects-, -workspace-projects-, etc.
    // Order matters — use the most specific anchor first.
    const anchors = ['-workspace-projects-', '-projects-', '-workspace-'];
    for (const anchor of anchors) {
      const idx = encoded.indexOf(anchor);
      if (idx !== -1) {
        return encoded.slice(idx + anchor.length);
      }
    }
    // No known anchor — fall back to everything after the last `-`-delimited segment
    // that is at least 3 chars (skip empty splits).
    const parts = encoded.split('-').filter((p) => p.length >= 3);
    return parts[parts.length - 1] ?? 'global';
  }

  return 'global';
}

/**
 * Derive agent name from a file path.
 *
 * Handles: `.claude/agent-memory/<agent-name>/MEMORY.md` → `<agent-name>`
 * All other paths → null.
 */
export function deriveAgent(filePath: string): string | null {
  const agentMatch = filePath.match(/agent-memory\/([^/]+)\//);
  if (agentMatch) {
    return agentMatch[1] ?? null;
  }
  return null;
}

function deriveSummary(section: MemorySection): string {
  if (section.header) {
    return section.header.replace(/^#{1,6}\s*/, '').trim();
  }
  // No header — use the first non-empty line of the body.
  const firstLine = section.body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine ?? '(empty)';
}

function deriveTags(filePath: string): string[] {
  const name = basename(filePath);
  const tags: string[] = ['native'];

  if (name === 'MEMORY.md') {
    tags.push('index');
  } else if (name.startsWith('feedback_')) {
    tags.push('feedback');
  } else if (name.startsWith('sessions_archive_')) {
    tags.push('sessions');
  } else if (name.startsWith('project_')) {
    tags.push('project');
  }

  return tags;
}

/**
 * Guard: skip hidden files (starting with `.`) and temp files (`*.tmp`).
 * Only process `.md` files.
 */
function shouldProcess(filename: string): boolean {
  if (filename.startsWith('.')) return false;
  if (filename.endsWith('.tmp')) return false;
  if (!filename.endsWith('.md')) return false;
  return true;
}

function sha256(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

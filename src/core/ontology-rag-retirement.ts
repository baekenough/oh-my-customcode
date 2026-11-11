/**
 * Retirement of ontology-rag in installed projects (#1960).
 *
 * oh-my-customcode no longer ships ontology-rag. `update` removes only what it wrote itself:
 * the `ontology-rag` server in `.mcp.json` when it is exactly one of the shapes init wrote. The
 * shipped `.claude/ontology/**` files go through the retired template list, and a project
 * `.venv` is never touched (it may belong to the user's own Python project): when ontology-rag is
 * installed there, the caller only prints a notice.
 */

import { randomBytes } from 'node:crypto';
import { chmod, lstat, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The project-relative MCP configuration file Claude Code reads. */
export const MCP_CONFIG_FILE = '.mcp.json';

/** The server name init registered in `.mcp.json`. */
export const ONTOLOGY_RAG_SERVER = 'ontology-rag';

/**
 * The `command` and `ONTOLOGY_DIR` values init wrote: `python` from 78046c8d (2026-02-13), then
 * `.venv/bin/python` from bf24062b (2026-02-17). Both built ONTOLOGY_DIR as
 * `join(layout.rootDir, 'ontology')`; `.codex` was a layout rootDir only before 2b4c6ef0
 * (Claude-only, 2026-02-13), so only the `python` shape can carry `.codex/ontology`.
 */
const WRITTEN_SHAPES: ReadonlyArray<{ command: string; ontologyDirs: readonly string[] }> = [
  { command: '.venv/bin/python', ontologyDirs: ['.claude/ontology'] },
  { command: 'python', ontologyDirs: ['.claude/ontology', '.codex/ontology'] },
];

const SERVER_ARGS = ['-m', 'ontology_rag.mcp_server'] as const;

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * Whether `entry` deep-equals, with exact key sets, an `ontology-rag` server entry init wrote:
 * `{type:'stdio', command, args:['-m','ontology_rag.mcp_server'], env:{ONTOLOGY_DIR}}` with one of
 * the {@link WRITTEN_SHAPES}. Anything else is a user's entry and is kept.
 */
export function isOmcustomOntologyRagEntry(entry: unknown): boolean {
  if (!isJsonObject(entry) || !hasExactKeys(entry, ['type', 'command', 'args', 'env'])) {
    return false;
  }
  const { type, command, args, env } = entry;
  if (type !== 'stdio') return false;
  if (
    !Array.isArray(args) ||
    args.length !== SERVER_ARGS.length ||
    !SERVER_ARGS.every((arg, index) => args[index] === arg)
  ) {
    return false;
  }
  if (!isJsonObject(env) || !hasExactKeys(env, ['ONTOLOGY_DIR'])) return false;
  const shape = WRITTEN_SHAPES.find((candidate) => candidate.command === command);
  const dir = env.ONTOLOGY_DIR;
  return shape !== undefined && typeof dir === 'string' && shape.ontologyDirs.includes(dir);
}

/** What {@link planMcpConfigRewrite} decided for one `.mcp.json` text. */
export type McpConfigPlan =
  /** No `ontology-rag` server entry: nothing to do or report. */
  | { kind: 'absent' }
  /** An `ontology-rag` entry that init did not write as is: kept. */
  | { kind: 'kept' }
  /** The text cannot be checked (malformed JSON, or not a JSON object). */
  | { kind: 'unreadable'; detail: string }
  /** The entry is init's: `content` is the file without it. */
  | { kind: 'remove'; content: string };

/**
 * Plan the rewrite of `.mcp.json` text. On removal the file is the `JSON.parse` result without
 * the `ontology-rag` server, written as `JSON.stringify(next, null, 2)` plus a newline; an emptied
 * `mcpServers` stays as `{}`. That round-trip keeps every other server and top-level key and
 * value, but not always their text or value: integer-like keys (`"2"`, `"10"`) move ahead of the
 * other keys in ascending order, the other keys keep their order, numbers are written back from
 * doubles (`1.0` becomes `1`, digits beyond double precision are lost, a number beyond double
 * range such as `1e400` becomes `null`, and `-0` becomes `0`), a duplicated key keeps only its
 * last value, and the original formatting is replaced.
 */
export function planMcpConfigRewrite(text: string): McpConfigPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { kind: 'unreadable', detail: err instanceof Error ? err.message : String(err) };
  }
  if (!isJsonObject(parsed)) return { kind: 'unreadable', detail: 'not a JSON object' };
  const servers = parsed.mcpServers;
  if (!isJsonObject(servers) || !Object.hasOwn(servers, ONTOLOGY_RAG_SERVER)) {
    return { kind: 'absent' };
  }
  if (!isOmcustomOntologyRagEntry(servers[ONTOLOGY_RAG_SERVER])) return { kind: 'kept' };
  const next = {
    ...parsed,
    mcpServers: Object.fromEntries(
      Object.entries(servers).filter(([name]) => name !== ONTOLOGY_RAG_SERVER)
    ),
  };
  return { kind: 'remove', content: `${JSON.stringify(next, null, 2)}\n` };
}

/** Why `.mcp.json` must not be rewritten even when it holds init's entry. */
export type McpConfigPreservedBy =
  /** The preserve settings cover `.mcp.json`. */
  | 'preserve-settings'
  /** The customization manifest exists but cannot be read, so every deletion is kept. */
  | 'unreadable-manifest';

/** Why an `ontology-rag` entry was left in `.mcp.json`. */
export type McpEntryKeptReason =
  /** It differs from every shape init wrote. */
  | 'modified'
  /** `.mcp.json` is covered by the preserve settings. */
  | 'preserved'
  /** The customization manifest cannot be read. */
  | 'manifest-unreadable'
  /** `.mcp.json` is a symlink or not a regular file. */
  | 'not-regular'
  /** The file changed while it was being backed up. */
  | 'changed';

/** The outcome for the `ontology-rag` server entry in `.mcp.json`. */
export type McpEntryRetirement =
  | { status: 'removed'; backupPath: string }
  | { status: 'would-remove' }
  | { status: 'kept'; reason: McpEntryKeptReason }
  | { status: 'unreadable'; detail: string }
  | { status: 'failed'; detail: string };

/** A backup of the original `.mcp.json` bytes, made by the caller. */
export interface McpConfigBackup {
  /** Where the original bytes were written. */
  path: string;
  /** Remove the backup again (the original was not rewritten). Must not throw. */
  discard(): Promise<void>;
}

export interface McpConfigRetirementOptions {
  dryRun: boolean;
  /** Non-null when `.mcp.json` must be kept as it is (checked before `dryRun`). */
  preservedBy: McpConfigPreservedBy | null;
  /**
   * Write `original` exclusively into this run's backup with the permission bits `mode` (those of
   * `.mcp.json`, so a private file gets a private backup) and verify it; throws when the backup
   * could not be made (then `.mcp.json` is not rewritten).
   */
  backup(original: Buffer, mode: number): Promise<McpConfigBackup>;
}

/** Strict UTF-8: invalid bytes throw instead of becoming U+FFFD; a BOM is kept in the text. */
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * {@link planMcpConfigRewrite} for the file bytes. Bytes that are not valid UTF-8 are unreadable:
 * decoding them leniently would rewrite other servers' entries with U+FFFD.
 */
function planMcpConfigBytes(original: Buffer): McpConfigPlan {
  let text: string;
  try {
    text = UTF8.decode(original);
  } catch {
    return { kind: 'unreadable', detail: 'not valid UTF-8' };
  }
  return planMcpConfigRewrite(text);
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Read `.mcp.json`, or null when it does not exist or cannot be read as a file. */
async function readIfPossible(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Write `content` to `path` through a temporary file in the same directory and a rename, so
 * `.mcp.json` is never left half-written. The temporary file is created with the original
 * permission bits (narrowed by the umask, never wider) before any content is in it, then set to
 * exactly those bits, so the replaced file keeps them.
 */
async function replaceFile(path: string, content: string, mode: number): Promise<void> {
  const temporary = `${path}.omcustom-${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: mode & 0o777 });
    await chmod(temporary, mode & 0o777);
    await rename(temporary, path);
  } catch (err) {
    await unlink(temporary).catch(() => undefined);
    throw err;
  }
}

/** What {@link inspectMcpConfig} found: a final outcome, or the file to continue with. */
type Inspection =
  | { kind: 'stop'; outcome: McpEntryRetirement | null }
  | { kind: 'file'; regular: boolean; mode: number; original: Buffer };

/** What {@link decideRetirement} concluded: a final outcome, or the content to write. */
type Decision =
  | { kind: 'stop'; outcome: McpEntryRetirement | null }
  | { kind: 'rewrite'; content: string };

/** lstat and read `.mcp.json`; stops when it is missing or cannot be read. */
async function inspectMcpConfig(path: string): Promise<Inspection> {
  let regular: boolean;
  let mode: number;
  try {
    const stat = await lstat(path);
    regular = stat.isFile();
    mode = stat.mode & 0o7777;
  } catch (err) {
    return { kind: 'stop', outcome: isMissing(err) ? null : failed(errorDetail(err)) };
  }

  const original = await readIfPossible(path);
  if (original === null) {
    return { kind: 'stop', outcome: regular ? failed('cannot read .mcp.json') : null };
  }
  return { kind: 'file', regular, mode, original };
}

function failed(detail: string): McpEntryRetirement {
  return { status: 'failed', detail };
}

function stop(outcome: McpEntryRetirement | null): Decision {
  return { kind: 'stop', outcome };
}

/** Decide, from the plan and the options, whether `.mcp.json` is to be rewritten. */
function decideRetirement(
  plan: McpConfigPlan,
  regular: boolean,
  options: McpConfigRetirementOptions
): Decision {
  if (!regular) {
    // A symlink is followed for reading only, so an entry it holds is reported, never removed.
    const holdsEntry = plan.kind === 'kept' || plan.kind === 'remove';
    return stop(holdsEntry ? { status: 'kept', reason: 'not-regular' } : null);
  }
  if (plan.kind === 'absent') return stop(null);
  if (plan.kind === 'unreadable') return stop({ status: 'unreadable', detail: plan.detail });
  if (plan.kind === 'kept') return stop({ status: 'kept', reason: 'modified' });
  if (options.preservedBy === 'preserve-settings') {
    return stop({ status: 'kept', reason: 'preserved' });
  }
  if (options.preservedBy === 'unreadable-manifest') {
    return stop({ status: 'kept', reason: 'manifest-unreadable' });
  }
  if (options.dryRun) return stop({ status: 'would-remove' });
  return { kind: 'rewrite', content: plan.content };
}

/**
 * Back up the original bytes, read the file again (a change since the first read, including a
 * symlink or other non-regular file in its place, keeps it and discards the backup), then replace
 * it with `content`. The window between that re-read and the `rename` is not locked: a change
 * made in it is overwritten (its bytes are not in the backup).
 */
async function rewriteWithBackup(
  path: string,
  original: Buffer,
  content: string,
  mode: number,
  options: McpConfigRetirementOptions
): Promise<McpEntryRetirement> {
  let backup: McpConfigBackup;
  try {
    backup = await options.backup(original, mode);
  } catch (err) {
    return failed(`backup failed: ${errorDetail(err)}`);
  }
  try {
    // lstat, not stat: a symlink put in place meanwhile is never written through.
    const current = (await lstat(path)).isFile() ? await readFile(path) : null;
    if (current === null || !current.equals(original)) {
      await backup.discard();
      return { status: 'kept', reason: 'changed' };
    }
    await replaceFile(path, content, mode);
  } catch (err) {
    await backup.discard();
    return failed(errorDetail(err));
  }
  return { status: 'removed', backupPath: backup.path };
}

/**
 * Remove init's `ontology-rag` server from `<targetDir>/.mcp.json` (#1960). Returns null when
 * there is nothing to report (no file, no entry). A symlink or non-regular file, a preserved
 * file and a user-edited entry are kept; malformed JSON is reported and left alone; a dry run
 * reports `would-remove` and writes nothing. Otherwise the original bytes are backed up through
 * `options.backup`, the file is read again (a change since the first read keeps it and discards
 * the backup), and the rewritten content replaces it. Never throws.
 */
export async function retireOntologyRagMcpServer(
  targetDir: string,
  options: McpConfigRetirementOptions
): Promise<McpEntryRetirement | null> {
  const path = join(targetDir, MCP_CONFIG_FILE);
  const inspection = await inspectMcpConfig(path);
  if (inspection.kind === 'stop') return inspection.outcome;

  const { regular, mode, original } = inspection;
  const plan = planMcpConfigBytes(original);
  const decision = decideRetirement(plan, regular, options);
  if (decision.kind === 'stop') return decision.outcome;
  return rewriteWithBackup(path, original, decision.content, mode, options);
}

/**
 * Whether `<targetDir>/.venv/lib/python*\/site-packages` holds an `ontology_rag-*.dist-info`
 * (a regular and an editable install both write one). Reads directories only; never throws.
 */
export async function hasOntologyRagInVenv(targetDir: string): Promise<boolean> {
  const lib = join(targetDir, '.venv', 'lib');
  let versions: string[];
  try {
    versions = await readdir(lib);
  } catch {
    return false;
  }
  for (const version of versions) {
    if (!version.startsWith('python')) continue;
    let packages: string[];
    try {
      packages = await readdir(join(lib, version, 'site-packages'));
    } catch {
      continue;
    }
    if (packages.some((name) => /^ontology_rag-.*\.dist-info$/i.test(name))) return true;
  }
  return false;
}

/**
 * Rules index merge - keep project rule entries of `.claude/rules/index.yaml` across an update
 *
 * `omcustom update` used to copy the template `.claude/rules/index.yaml` over the project's index,
 * which dropped the entries of project-specific rules (#1992). The update now leaves index.yaml out
 * of the rules copy and handles it in two steps:
 *
 * 1. {@link planRulesIndexUpdate} runs before the rules copy and writes nothing. It reads the
 *    project's index and the template index, appends the project rule entries to the template
 *    index ({@link carryProjectRuleEntries}) and decides to replace, keep or leave the file.
 * 2. {@link commitRulesIndexPlan} runs after the other update steps and before the lockfile is
 *    regenerated. It re-checks the file, writes a backup when one is needed and replaces the index
 *    with one rename of a temporary file. Every failure keeps the previous index and becomes a
 *    warning; it never throws. Because it is a rename, a hard-linked index is detached: the other
 *    link keeps the old bytes (measured on macOS with Bun: `HARDLINK success=true nlink=1
 *    same=false otherStale=true`).
 */

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as nodeFs from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Document,
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import { info } from '../utils/logger.js';
import type { Lockfile } from './lockfile.js';
import {
  loadRetiredTemplatePaths,
  type RetiredTemplatePathEntry,
} from './retired-template-paths.js';

/** The rules index file name, inside the rules component directory */
export const RULES_INDEX_FILE = 'index.yaml';

/** Input of {@link carryProjectRuleEntries}. File names are bare names such as `MUST-x.md`. */
export interface RuleIndexCarryInput {
  /** The project's index.yaml as it was before the update */
  existingContent: string;
  /** The template index.yaml */
  templateContent: string;
  /**
   * `*.md` regular files directly under the project's rules directory, read before the rules copy
   * (the copy only adds shipped files, so for project files this is the same as after it)
   */
  filesOnDisk: ReadonlySet<string>;
  /** Rule files oh-my-customcode ships or has shipped (template directory and retired list) */
  templateFiles: ReadonlySet<string>;
}

/** Why the existing index must stay as it is, and whose file is at fault */
export interface RuleIndexKeep {
  source: 'existing' | 'template';
  reason: string;
}

/** Result of {@link carryProjectRuleEntries}. */
export interface RuleIndexCarryResult {
  /**
   * The merged index, or null when nothing was carried: then the template bytes stand verbatim
   * (or, with `keep` set, the existing index stays)
   */
  content: string | null;
  /** File names whose entries were carried, in index order */
  carried: string[];
  /**
   * File names of entries that index no file in the rules directory (orphans). They are dropped
   * and reported together by the caller; they do not make the result lossy.
   */
  orphans: string[];
  /** One warning per lossy drop */
  warnings: string[];
  /**
   * True when content of the existing index is dropped: an entry with an unsupported path, an id
   * used by a template rule, a repeated file or id, a non-map item of the rules list, a top-level
   * key other than `rules`, an entry whose aliases had to be resolved (its comments are lost) or
   * that cannot be written. Exactly then `warnings` is not empty.
   *
   * Not detected (replaced by the template without a warning): edits inside template entries,
   * entries whose path is a template rule file, and comments outside carried entries. Carried
   * scalars, keys as well as values, are written again from their values, so their text can change
   * (measured: when the existing index declares `%YAML 1.1`, `on: yes` becomes `true: true`,
   * `0755` becomes `0o755` and `12345678901234567890` becomes `12345678901234567000`; in the
   * default YAML 1.2, `0755` becomes `755` and the big integer still loses precision); this is
   * not detected either. The
   * caller's backup on a hand-edited index (lock mismatch) covers these cases.
   */
  lossy: boolean;
  /** Set when the index must be kept unchanged (existing or template not usable) */
  keep: RuleIndexKeep | null;
}

/**
 * The bare rule file name an index `path` points at (`./MUST-x.md` and `MUST-x.md` both give
 * `MUST-x.md`, NFC-normalized), or null when the value is not a string naming a `*.md` file
 * directly in the rules directory (nested paths and `..` are rejected).
 */
export function ruleFileOfIndexPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let path = value;
  while (path.startsWith('./')) path = path.slice(2);
  if (path.includes('/') || path.includes('\\') || !path.endsWith('.md') || path === '.md') {
    return null;
  }
  return path.normalize('NFC');
}

/** A scalar `id` as a string; anything else (missing, a list, a map) yields null. */
function ruleIdOf(entry: YAMLMap): string | null {
  const id = entry.get('id', true);
  if (!isScalar(id) || id.value === null || id.value === undefined) return null;
  return String(id.value);
}

/** The map items of a rules sequence and how many items are not maps */
function ruleEntries(rules: YAMLSeq): { entries: YAMLMap[]; nonMaps: number } {
  const entries = rules.items.filter((item): item is YAMLMap => isMap(item));
  return { entries, nonMaps: rules.items.length - entries.length };
}

/** The `path` value of an entry, with an alias resolved in `doc` (undefined when unresolvable) */
function pathValueOf(entry: YAMLMap, doc: Document): unknown {
  const node = entry.get('path', true);
  if (!isAlias(node)) return entry.get('path');
  try {
    return node.toJS(doc);
  } catch {
    return undefined;
  }
}

interface CarryState {
  templateIds: ReadonlySet<string>;
  templateFiles: ReadonlySet<string>;
  filesOnDisk: ReadonlySet<string>;
  carriedIds: Set<string>;
  carriedFiles: Set<string>;
}

/** What to do with one existing entry */
type CarryDecision =
  | { carry: true; file: string }
  | { carry: false; orphan?: string; warning?: string };

function decideEntry(rawPath: unknown, id: string | null, state: CarryState): CarryDecision {
  const file = ruleFileOfIndexPath(rawPath);
  const idNote = id === null ? '' : ` (id ${id})`;
  if (file === null) {
    return {
      carry: false,
      warning: `Dropped the .claude/rules/index.yaml entry${idNote} with path ${JSON.stringify(rawPath) ?? 'undefined'}: unsupported path (only ./<name>.md directly in .claude/rules/ is kept).`,
    };
  }
  // Template rules are described by the template
  if (state.templateFiles.has(file)) return { carry: false };
  if (!state.filesOnDisk.has(file)) return { carry: false, orphan: file };
  if (id !== null && state.templateIds.has(id)) {
    return {
      carry: false,
      warning: `Dropped the .claude/rules/index.yaml entry for ${file}: its id ${id} is used by a template rule. If it is a project rule, give it a new id and re-add the entry.`,
    };
  }
  if (state.carriedFiles.has(file) || (id !== null && state.carriedIds.has(id))) {
    return {
      carry: false,
      warning: `Dropped a repeated .claude/rules/index.yaml entry for ${file}${idNote}: an earlier entry with the same file or id was kept.`,
    };
  }
  return { carry: true, file };
}

/** Rule files and ids the template index names, plus the shipped file names */
function templateKeys(
  entries: readonly YAMLMap[],
  shippedFiles: ReadonlySet<string>
): { templateFiles: Set<string>; templateIds: Set<string> } {
  const templateFiles = new Set(shippedFiles);
  const templateIds = new Set<string>();
  for (const entry of entries) {
    const file = ruleFileOfIndexPath(entry.get('path'));
    if (file !== null) templateFiles.add(file);
    const id = ruleIdOf(entry);
    if (id !== null) templateIds.add(id);
  }
  return { templateFiles, templateIds };
}

/** A result; it is lossy exactly when there are warnings (each warning reports a lossy drop) */
function carryResult(
  content: string | null,
  carried: string[],
  orphans: string[],
  warnings: string[]
): RuleIndexCarryResult {
  return { content, carried, orphans, warnings, lossy: warnings.length > 0, keep: null };
}

/** A result that keeps the existing index unchanged */
function keepResult(source: RuleIndexKeep['source'], reason: string): RuleIndexCarryResult {
  return {
    content: null,
    carried: [],
    orphans: [],
    warnings: [],
    lossy: false,
    keep: { source, reason },
  };
}

/** Every trimmed comment line of a document (document, collection and scalar comments) */
function commentLinesOf(doc: Document): Set<string> {
  const comments = new Set<string>();
  const add = (comment: string | null | undefined): void => {
    for (const line of (comment ?? '').split('\n')) {
      if (line.trim() !== '') comments.add(line.trim());
    }
  };
  add(doc.commentBefore);
  add(doc.comment);
  visit(doc, (_key, node) => {
    if (isNode(node)) {
      add(node.commentBefore);
      add(node.comment);
    }
  });
  return comments;
}

/** `comment` without its leading lines that, trimmed, are template comment lines; null if empty */
function withoutTemplateHeadings(
  comment: string | null | undefined,
  templateCommentLines: ReadonlySet<string>
): string | null {
  const lines = (comment ?? '').split('\n');
  while (lines.length > 0 && templateCommentLines.has((lines[0] ?? '').trim())) lines.shift();
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Whether every alias in `entry` points at an anchor defined earlier inside `entry`. Only such an
 * entry reads the same wherever it is placed, because an alias binds to the nearest earlier anchor
 * of that name.
 */
function isSelfContained(entry: YAMLMap): boolean {
  const anchors = new Set<string>();
  let selfContained = true;
  visit(entry, (_key, node) => {
    if (isAlias(node)) {
      if (!anchors.has(node.source)) selfContained = false;
    } else if (isNode(node) && node.anchor) {
      anchors.add(node.anchor);
    }
  });
  return selfContained;
}

/** A carried entry as appended to the template rules list */
type EntryNode = ReturnType<YAMLMap['clone']> | ReturnType<Document['createNode']>;

/**
 * A copy of `entry` for the template rules list and whether its aliases had to be resolved: a
 * self-contained entry is cloned (comments kept), any other one becomes a plain copy with its
 * aliases resolved in `existingDoc` (its comments are lost). Throws when the aliases cannot be
 * resolved.
 */
function copyEntry(
  templateDoc: Document,
  entry: YAMLMap,
  existingDoc: Document,
  templateCommentLines: ReadonlySet<string>
): { node: EntryNode; resolved: boolean } {
  if (isSelfContained(entry)) {
    const copy = entry.clone();
    copy.commentBefore = withoutTemplateHeadings(copy.commentBefore, templateCommentLines);
    copy.spaceBefore = true;
    return { node: copy, resolved: false };
  }
  const plain = templateDoc.createNode(entry.toJS(existingDoc));
  plain.spaceBefore = true;
  return { node: plain, resolved: true };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SERIALIZE = { lineWidth: 0 } as const;

/**
 * The template document as text with the appended entries. When it cannot be written, the
 * appended entries are added again one at a time and each one that makes the text unwritable is
 * dropped with a warning (this slower path runs only after a failure).
 */
function serializeWithEntries(
  templateDoc: Document,
  templateRules: YAMLSeq,
  appended: ReadonlyArray<{ file: string; node: EntryNode }>,
  warnings: string[]
): { content: string | null; carried: string[] } {
  if (appended.length === 0) return { content: null, carried: [] };
  try {
    return { content: templateDoc.toString(SERIALIZE), carried: appended.map((a) => a.file) };
  } catch {
    // Find the entries that cannot be written, below
  }
  templateRules.items.splice(templateRules.items.length - appended.length);
  const carried: string[] = [];
  for (const { file, node } of appended) {
    templateRules.items.push(node);
    try {
      templateDoc.toString(SERIALIZE);
      carried.push(file);
    } catch (err) {
      templateRules.items.pop();
      warnings.push(
        `Dropped the .claude/rules/index.yaml entry for ${file}: it cannot be written (${errorText(err)}).`
      );
    }
  }
  return { content: carried.length > 0 ? templateDoc.toString(SERIALIZE) : null, carried };
}

/** Where {@link appendProjectEntries} reports: the decision state, lossy warnings and orphans */
interface CarrySink {
  state: CarryState;
  warnings: string[];
  orphans: string[];
}

/** Record a decision that does not carry the entry */
function noteDropped(decision: { orphan?: string; warning?: string }, sink: CarrySink): void {
  if (decision.orphan !== undefined && !sink.orphans.includes(decision.orphan)) {
    sink.orphans.push(decision.orphan);
  }
  if (decision.warning !== undefined) sink.warnings.push(decision.warning);
}

/** Append the entries {@link decideEntry} carries and write the result */
function appendProjectEntries(
  existingEntries: readonly YAMLMap[],
  existingDoc: Document,
  templateDoc: Document,
  templateRules: YAMLSeq,
  sink: CarrySink
): { content: string | null; carried: string[] } {
  const { state, warnings } = sink;
  const templateCommentLines = commentLinesOf(templateDoc);
  const appended: Array<{ file: string; node: EntryNode }> = [];
  for (const entry of existingEntries) {
    const id = ruleIdOf(entry);
    const decision = decideEntry(pathValueOf(entry, existingDoc), id, state);
    if (!decision.carry) {
      noteDropped(decision, sink);
      continue;
    }
    let copy: ReturnType<typeof copyEntry>;
    try {
      copy = copyEntry(templateDoc, entry, existingDoc, templateCommentLines);
    } catch (err) {
      warnings.push(
        `Dropped the .claude/rules/index.yaml entry for ${decision.file}: its aliases cannot be resolved (${errorText(err)}).`
      );
      continue;
    }
    if (copy.resolved) {
      warnings.push(
        `Kept the .claude/rules/index.yaml entry for ${decision.file} with its aliases resolved; its comments were not kept.`
      );
    }
    templateRules.items.push(copy.node);
    appended.push({ file: decision.file, node: copy.node });
    state.carriedFiles.add(decision.file);
    if (id !== null) state.carriedIds.add(id);
  }
  return serializeWithEntries(templateDoc, templateRules, appended, warnings);
}

/** The rules sequence of a usable template document, or null */
function templateRulesOf(templateDoc: Document): YAMLSeq | null {
  if (templateDoc.errors.length > 0) return null;
  const rules = templateDoc.get('rules', true);
  return isSeq(rules) ? rules : null;
}

/**
 * The rules list of the existing document: its entries (none for an empty document or a map
 * without `rules`), or the reason the index must be kept (D-10).
 */
function existingRulesOf(existingDoc: Document): YAMLSeq | 'none' | RuleIndexKeep {
  const root = existingDoc.contents;
  // Empty, whitespace-only or comment-only: no entries
  if (root === null) return 'none';
  if (!isMap(root)) return { source: 'existing', reason: 'its top level is not a map' };
  if (!root.has('rules')) return 'none';
  const rules = root.get('rules', true);
  return isSeq(rules) ? rules : { source: 'existing', reason: 'its top-level rules is not a list' };
}

/**
 * Append to the template index the existing entries that describe a project rule file: a `*.md`
 * file that exists directly under the rules directory and is neither shipped (now or before) nor
 * named by a template entry. Template entries always win: an existing entry whose `id` is used by
 * a template rule, or that repeats an already carried file or `id`, is left out with a warning.
 * Entries that index no file are orphans: left out and listed in `orphans`, without a warning.
 *
 * The index is kept (`keep` set) when the existing index does not parse, its top level is not a
 * map or its `rules` is not a list, and when the template index has no readable rules list.
 * Comments and formatting of the template are kept byte for byte.
 */
export function carryProjectRuleEntries(input: RuleIndexCarryInput): RuleIndexCarryResult {
  const existingDoc = parseDocument(input.existingContent);
  if (existingDoc.errors.length > 0) {
    const detail = existingDoc.errors[0]?.message ?? 'parse error';
    return keepResult('existing', `it cannot be parsed as YAML (${detail})`);
  }
  const templateDoc = parseDocument(input.templateContent);
  const templateRules = templateRulesOf(templateDoc);
  if (templateRules === null) {
    return keepResult('template', 'the template index has no readable rules list');
  }
  const existingRules = existingRulesOf(existingDoc);
  if (existingRules !== 'none' && !isSeq(existingRules)) {
    return keepResult(existingRules.source, existingRules.reason);
  }

  const existing =
    existingRules === 'none' ? { entries: [], nonMaps: 0 } : ruleEntries(existingRules);
  const state: CarryState = {
    ...templateKeys(ruleEntries(templateRules).entries, input.templateFiles),
    filesOnDisk: new Set([...input.filesOnDisk].map((name) => name.normalize('NFC'))),
    carriedIds: new Set(),
    carriedFiles: new Set(),
  };
  const warnings = droppedOutsideEntries(existingDoc, templateDoc, existing.nonMaps);
  const orphans: string[] = [];

  try {
    const merged = appendProjectEntries(existing.entries, existingDoc, templateDoc, templateRules, {
      state,
      warnings,
      orphans,
    });
    return carryResult(merged.content, merged.carried, orphans, warnings);
  } catch (err) {
    return carryResult(null, [], orphans, [
      ...warnings,
      `Could not write the project rule entries into .claude/rules/index.yaml (${errorText(err)}); wrote the template version.`,
    ]);
  }
}

/** Warnings for non-map items of the rules list and top-level keys the template does not have */
function droppedOutsideEntries(
  existingDoc: Document,
  templateDoc: Document,
  nonMaps: number
): string[] {
  const warnings: string[] = [];
  if (nonMaps > 0) {
    warnings.push(
      `Dropped ${nonMaps} non-map item(s) from the rules list of .claude/rules/index.yaml.`
    );
  }
  const existingRoot = existingDoc.contents;
  const extraKeys = isMap(existingRoot)
    ? existingRoot.items
        .map((pair) => (isScalar(pair.key) ? String(pair.key.value) : String(pair.key)))
        .filter((key) => !templateDoc.has(key))
    : [];
  if (extraKeys.length > 0) {
    warnings.push(
      `Dropped the top-level key(s) ${extraKeys.join(', ')} of .claude/rules/index.yaml (the template does not have them).`
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Plan (before the rules copy) and commit (before the lockfile is regenerated)
// ---------------------------------------------------------------------------

/** What {@link commitRulesIndexPlan} does with the project's index */
export type RulesIndexPlan =
  /** Write nothing and push `warning` (one per keep) */
  | { action: 'keep'; indexPath: string; label: string; warning: string }
  /** Write nothing and say nothing: the new index would be byte-identical to the current one */
  | { action: 'unchanged'; indexPath: string; label: string }
  /**
   * Leave index.yaml to the rules copy (as before #1992): only when there is no index and the
   * template index cannot be read, so there is nothing to keep and nothing to write
   */
  | { action: 'copy'; indexPath: string; label: string }
  | {
      action: 'replace';
      indexPath: string;
      label: string;
      /** The index as read when planning; null when there was none */
      original: Buffer | null;
      /** The bytes to write: the template bytes verbatim, or the merged index */
      content: Buffer;
      /** Permission bits of the new file: the original's, else the template file's */
      mode: number;
      /** Why a byte-identical backup is written first; null for no backup */
      backupReason: string | null;
      carried: string[];
      /** Warnings pushed only after the index was replaced */
      warnings: string[];
    };

/** Input of {@link planRulesIndexUpdate} */
export interface RulesIndexPlanInput {
  /** The project's rules directory (`<targetDir>/.claude/rules`) */
  rulesDir: string;
  /** The template rules directory */
  templateRulesDir: string;
  /** The project-relative rules directory (`.claude/rules`): lockfile key and retired paths */
  componentPath: string;
  /** The lockfile read at the start of the update */
  lockfile: Lockfile | null;
}

const DELETE_REMEDY =
  'Fix the file, or delete it from your own terminal and run the update again to get the template version.';

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/** What a path is: missing, not a regular file (named), or a regular file with its mode */
type Entry = { kind: 'absent' } | { kind: 'other'; what: string } | { kind: 'file'; mode: number };

async function entryAt(path: string, lstat: RulesIndexCommitFs['lstat']): Promise<Entry> {
  try {
    const stats = await lstat(path);
    if (stats.isFile()) return { kind: 'file', mode: stats.mode };
    const what = stats.isSymbolicLink()
      ? 'a symbolic link'
      : stats.isDirectory()
        ? 'a directory'
        : 'not a regular file';
    return { kind: 'other', what };
  } catch (err) {
    const code = errorCode(err);
    // No index: missing, or the rules directory is not a directory
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'absent' };
    throw err;
  }
}

function keepPlan(indexPath: string, label: string, reason: string): RulesIndexPlan {
  return { action: 'keep', indexPath, label, warning: `Kept ${label} unchanged: ${reason}` };
}

function notRegularReason(what: string): string {
  return `it is ${what}, not a regular file, so the update does not replace it. To get the new index, replace it with a regular file and run the update again.`;
}

/** `*.md` names in `dir` that are (or link to) regular files */
async function listRuleFiles(dir: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const name of await nodeFs.readdir(dir)) {
    if (!name.endsWith('.md')) continue;
    try {
      if ((await nodeFs.stat(join(dir, name))).isFile()) names.add(name);
    } catch {
      // Dangling symlink or vanished entry: not a rule file on disk
    }
  }
  return names;
}

/** Rule file names oh-my-customcode ships now (template directory) or has shipped (retired) */
async function listShippedRuleFiles(
  templateRulesDir: string,
  componentPath: string
): Promise<Set<string>> {
  const names = await listRuleFiles(templateRulesDir);
  let retired: RetiredTemplatePathEntry[] = [];
  try {
    retired = await loadRetiredTemplatePaths();
  } catch {
    // An unreadable retired list is reported by orphan retirement; the template set still applies
  }
  for (const entry of retired) {
    const name = entry.path.slice(componentPath.length + 1);
    if (entry.path.startsWith(`${componentPath}/`) && !name.includes('/')) names.add(name);
  }
  return names;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Why the original must be backed up before it is replaced, or null: the merge dropped content,
 * or the index differs from what the lockfile recorded (hand-edited since the last lockfile
 * regeneration, or not recorded at all)
 */
function backupReasonFor(
  lossy: boolean,
  lockfile: Lockfile | null,
  lockKey: string,
  original: Buffer
): string | null {
  if (lossy) return 'some of its content could not be kept';
  const entry = lockfile?.files[lockKey];
  if (entry === undefined || entry.templateHash !== sha256(original)) {
    return 'it was edited since the last update';
  }
  return null;
}

function orphanWarning(label: string, componentPath: string, orphans: readonly string[]): string {
  return `Dropped the ${label} entries for ${orphans.join(', ')}: no file with exactly this name (case included) is in ${componentPath}/.`;
}

/** The replace or keep decision for an existing, readable index */
async function planExisting(
  input: RulesIndexPlanInput,
  paths: { indexPath: string; label: string },
  original: { bytes: Buffer; mode: number },
  template: Buffer
): Promise<RulesIndexPlan> {
  const { indexPath, label } = paths;
  let existingContent: string;
  try {
    existingContent = new TextDecoder('utf-8', { fatal: true }).decode(original.bytes);
  } catch {
    return keepPlan(indexPath, label, `it is not valid UTF-8. ${DELETE_REMEDY}`);
  }
  const merge = carryProjectRuleEntries({
    existingContent,
    templateContent: template.toString('utf-8'),
    filesOnDisk: await listRuleFiles(input.rulesDir),
    templateFiles: await listShippedRuleFiles(input.templateRulesDir, input.componentPath),
  });
  if (merge.keep !== null) {
    const remedy =
      merge.keep.source === 'template'
        ? 'Reinstall oh-my-customcode and run the update again.'
        : DELETE_REMEDY;
    return keepPlan(indexPath, label, `${merge.keep.reason}. ${remedy}`);
  }
  const content = merge.content === null ? template : Buffer.from(merge.content, 'utf-8');
  if (content.equals(original.bytes)) return { action: 'unchanged', indexPath, label };
  const warnings = [...merge.warnings];
  if (merge.orphans.length > 0) {
    warnings.push(orphanWarning(label, input.componentPath, merge.orphans));
  }
  return {
    action: 'replace',
    indexPath,
    label,
    original: original.bytes,
    content,
    mode: original.mode & 0o777,
    backupReason: backupReasonFor(merge.lossy, input.lockfile, label, original.bytes),
    carried: merge.carried,
    warnings,
  };
}

/** The plan once the project's index entry is known; throws only on unexpected errors */
async function planFor(
  input: RulesIndexPlanInput,
  paths: { indexPath: string; label: string },
  entry: Entry
): Promise<RulesIndexPlan> {
  const { indexPath, label } = paths;
  if (entry.kind === 'other') return keepPlan(indexPath, label, notRegularReason(entry.what));
  const templatePath = join(input.templateRulesDir, RULES_INDEX_FILE);
  let template: Buffer;
  let templateMode: number;
  try {
    template = await nodeFs.readFile(templatePath);
    templateMode = (await nodeFs.stat(templatePath)).mode;
  } catch (err) {
    if (entry.kind === 'absent') return { action: 'copy', indexPath, label };
    return keepPlan(
      indexPath,
      label,
      `the template index cannot be read (${errorText(err)}). Reinstall oh-my-customcode and run the update again.`
    );
  }
  if (entry.kind === 'absent') {
    return {
      action: 'replace',
      indexPath,
      label,
      original: null,
      content: template,
      mode: templateMode & 0o777,
      backupReason: null,
      carried: [],
      warnings: [],
    };
  }
  let bytes: Buffer;
  try {
    bytes = await nodeFs.readFile(indexPath);
  } catch (err) {
    return keepPlan(indexPath, label, `it cannot be read (${errorText(err)}). ${DELETE_REMEDY}`);
  }
  return planExisting(input, paths, { bytes, mode: entry.mode }, template);
}

/**
 * Decide what the update does with the project's rules index (#1992). Writes nothing and never
 * throws: an unexpected error keeps the index. Call it before the rules copy, which must then
 * skip index.yaml unless the plan is `copy`.
 */
export async function planRulesIndexUpdate(input: RulesIndexPlanInput): Promise<RulesIndexPlan> {
  const indexPath = join(input.rulesDir, RULES_INDEX_FILE);
  const paths = { indexPath, label: `${input.componentPath}/${RULES_INDEX_FILE}` };
  try {
    return await planFor(input, paths, await entryAt(indexPath, nodeFs.lstat));
  } catch (err) {
    return keepPlan(
      indexPath,
      paths.label,
      `it cannot be read (${errorText(err)}). ${DELETE_REMEDY}`
    );
  }
}

/** The filesystem operations of {@link commitRulesIndexPlan} (injectable for tests) */
export interface RulesIndexCommitFs {
  lstat(path: string): Promise<{
    isFile(): boolean;
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    mode: number;
  }>;
  readFile(path: string): Promise<Buffer>;
  access(path: string, mode: number): Promise<void>;
  writeFile(path: string, data: Buffer, options: { flag: 'wx'; mode?: number }): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const NODE_COMMIT_FS: RulesIndexCommitFs = {
  lstat: (path) => nodeFs.lstat(path),
  readFile: (path) => nodeFs.readFile(path),
  access: (path, mode) => nodeFs.access(path, mode),
  writeFile: (path, data, options) => nodeFs.writeFile(path, data, options),
  chmod: (path, mode) => nodeFs.chmod(path, mode),
  rename: (from, to) => nodeFs.rename(from, to),
  unlink: (path) => nodeFs.unlink(path),
};

/** What {@link commitRulesIndexPlan} did */
export type RulesIndexCommitOutcome = 'replaced' | 'kept' | 'unchanged';

type ReplacePlan = Extract<RulesIndexPlan, { action: 'replace' }>;

/** Whether the index is still what the plan read (D-12); a keep reason when it is not */
async function changedSincePlan(plan: ReplacePlan, fs: RulesIndexCommitFs): Promise<string | null> {
  let entry: Entry;
  try {
    entry = await entryAt(plan.indexPath, fs.lstat);
    if (entry.kind === 'other') return notRegularReason(entry.what);
    if (entry.kind === 'absent' && plan.original === null) return null;
    if (entry.kind === 'file' && plan.original !== null) {
      const bytes = await fs.readFile(plan.indexPath);
      if (bytes.equals(plan.original)) return null;
    }
  } catch (err) {
    return `it cannot be read (${errorText(err)}). Run the update again.`;
  }
  return 'it changed while the update was running. Run the update again.';
}

/** `<indexPath>.backup-<ISO timestamp with : and . replaced by ->` (the backupFile naming) */
function backupPathFor(indexPath: string, now: Date): string {
  return `${indexPath}.backup-${now.toISOString().replace(/[:.]/g, '-')}`;
}

/** Write the byte-identical backup; a keep reason when it cannot be written */
async function writeBackup(
  path: string,
  original: Buffer,
  fs: RulesIndexCommitFs
): Promise<string | null> {
  try {
    await fs.writeFile(path, original, { flag: 'wx' });
    return null;
  } catch (err) {
    // A file at `path` after a failure other than EEXIST was created by this write
    if (errorCode(err) !== 'EEXIST') await fs.unlink(path).catch(() => undefined);
    return `the backup ${path} could not be written (${errorText(err)}), and the index is not replaced without one. Free disk space or fix the permissions and run the update again.`;
  }
}

/** Why the replacement failed, and a warning naming a temporary file that could not be removed */
interface ReplaceFailure {
  reason: string;
  cleanupWarning: string | null;
}

/**
 * Write `content` to a new temporary file next to the index and rename it over the index. On a
 * failure the temporary file is removed and the failure is returned; null on success.
 */
async function replaceViaRename(
  plan: ReplacePlan,
  fs: RulesIndexCommitFs
): Promise<ReplaceFailure | null> {
  const temporary = `${plan.indexPath}.omcustom-${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  let created = false;
  try {
    await fs.writeFile(temporary, plan.content, { flag: 'wx', mode: plan.mode });
    created = true;
    await fs.chmod(temporary, plan.mode);
    await fs.rename(temporary, plan.indexPath);
    return null;
  } catch (err) {
    const reason = `the new index could not be written (${errorText(err)}).`;
    // An EEXIST from the exclusive create means the temporary name belongs to someone else
    const ours = created || errorCode(err) !== 'EEXIST';
    return { reason, cleanupWarning: ours ? await removeTemporary(temporary, fs) : null };
  }
}

/** Remove the temporary file; a warning naming it when that fails (null when removed or absent) */
async function removeTemporary(temporary: string, fs: RulesIndexCommitFs): Promise<string | null> {
  try {
    await fs.unlink(temporary);
    return null;
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return null;
    return `Could not remove the temporary file ${temporary} (${errorText(err)}); delete it from your own terminal.`;
  }
}

function savedWarning(label: string, backupPath: string, why: string): string {
  return `The previous ${label} was saved to ${backupPath} because ${why}. To restore it, copy it back with cp from your own terminal (not mv); delete the backup from your own terminal when you no longer need it.`;
}

/** Push the keep warning for `plan` and report the keep */
function kept(plan: RulesIndexPlan, reason: string, warnings: string[]): RulesIndexCommitOutcome {
  warnings.push(`Kept ${plan.label} unchanged: ${reason}`);
  return 'kept';
}

/**
 * The checks before the rename: the index is still what the plan read (D-12), it is writable
 * (D-7), and a needed backup was written (G6). Returns the backup path (null for none), or a keep
 * reason.
 */
async function prepareReplace(
  plan: ReplacePlan,
  fs: RulesIndexCommitFs,
  now: () => Date
): Promise<{ backupPath: string | null } | { keepReason: string }> {
  const changed = await changedSincePlan(plan, fs);
  if (changed !== null) return { keepReason: changed };
  if (plan.original === null) return { backupPath: null };
  try {
    await fs.access(plan.indexPath, fsConstants.W_OK);
  } catch (err) {
    return {
      keepReason: `it is read-only (${errorText(err)}). To get the new index, make it writable (chmod u+w) and run the update again.`,
    };
  }
  if (plan.backupReason === null) return { backupPath: null };
  const backupPath = backupPathFor(plan.indexPath, now());
  const failed = await writeBackup(backupPath, plan.original, fs);
  return failed === null ? { backupPath } : { keepReason: failed };
}

/**
 * Carry out a plan of {@link planRulesIndexUpdate}: the only write that changes the index is one
 * rename of a temporary file over it. Before it, the index is read again and must still be what
 * the plan read (D-12), it must be writable (D-7), and a needed backup must have been written
 * (G6); otherwise nothing is replaced. Warnings go to `warnings` (one per keep); never throws.
 */
export async function commitRulesIndexPlan(
  plan: RulesIndexPlan,
  warnings: string[],
  fs: RulesIndexCommitFs = NODE_COMMIT_FS,
  now: () => Date = () => new Date()
): Promise<RulesIndexCommitOutcome> {
  if (plan.action === 'keep') {
    warnings.push(plan.warning);
    return 'kept';
  }
  if (plan.action !== 'replace') return 'unchanged';

  const prepared = await prepareReplace(plan, fs, now);
  if ('keepReason' in prepared) return kept(plan, prepared.keepReason, warnings);
  const { backupPath } = prepared;
  const failure = await replaceViaRename(plan, fs);
  if (failure !== null) {
    const note =
      backupPath === null
        ? ''
        : ` A copy of it is at ${backupPath}; delete that copy from your own terminal if you do not need it.`;
    kept(plan, `${failure.reason}${note}`, warnings);
    if (failure.cleanupWarning !== null) warnings.push(failure.cleanupWarning);
    return 'kept';
  }
  warnings.push(...plan.warnings);
  if (backupPath !== null && plan.backupReason !== null) {
    warnings.push(savedWarning(plan.label, backupPath, plan.backupReason));
  }
  if (plan.carried.length > 0) {
    info('update.rules_index_entries_carried', {
      path: plan.label,
      files: plan.carried.join(', '),
    });
  }
  return 'replaced';
}

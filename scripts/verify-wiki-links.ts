import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { isMap, isNode, isScalar, isSeq, Parser, parseDocument } from 'yaml';

type Root = ReturnType<typeof fromMarkdown>;
type RootContent = Root['children'][number];

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  rawTarget: string;
  classification: string;
  message: string;
}

export interface Link {
  kind: 'standard' | 'wiki';
  target: string;
  rawTarget: string;
  offset: number;
}

export interface Extraction {
  links: Link[];
  aliases: string[];
  diagnostics: Diagnostic[];
  excluded: Record<string, number>;
}

export interface FileSystem {
  readFile(path: string): string;
  realpath(path: string): string;
  entries(path: string): string[];
  lstat(path: string): { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean };
  stat(path: string): { isDirectory(): boolean; isFile(): boolean };
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  documents: number;
  checked: number;
  skipped: Record<string, number>;
}

export const fileSystem: FileSystem = {
  readFile: (path) => readFileSync(path, 'utf8'),
  realpath: (path) => realpathSync(path),
  entries: (path) => readdirSync(path),
  lstat: (path) => lstatSync(path),
  stat: (path) => statSync(path),
};

interface Range {
  start: number;
  end: number;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Original UTF-16 source offsets; CRLF is one line break, as in mdast positions. */
export function sourcePosition(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let start = 0;
  for (let index = 0; index < offset; index++) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n' && index + 1 < offset) {
        index++;
      }
      line++;
      start = index + 1;
    } else if (source[index] === '\n') {
      line++;
      start = index + 1;
    }
  }
  return { line, column: offset - start + 1 };
}

function diagnostic(
  file: string,
  source: string,
  offset: number,
  rawTarget: string,
  classification: string,
  detail: string
): Diagnostic {
  return { file, ...sourcePosition(source, offset), rawTarget, classification, message: detail };
}

function mask(source: string, ranges: Range[]): string {
  const chars = source.split('');
  for (const { start, end } of ranges) {
    for (let offset = start; offset < end; offset++) {
      if (chars[offset] !== '\r' && chars[offset] !== '\n') {
        chars[offset] = ' ';
      }
    }
  }
  return chars.join('');
}

function escaped(source: string, offset: number): boolean {
  let count = 0;
  while (offset > 0 && source[--offset] === '\\') {
    count++;
  }
  return count % 2 === 1;
}

function wikiEnd(visible: string, source: string, offset: number): number {
  let end = offset + 2;
  while (end < visible.length && !/[\r\n]/.test(visible[end])) {
    if (visible.slice(end, end + 2) === ']]' && !escaped(source, end)) {
      break;
    }
    end++;
  }
  return end;
}

/** The declared [[page#fragment|label]] extension, not a Markdown parser replacement. */
function scanWiki(source: string, visible: string, file: string, output: Extraction): void {
  for (let offset = 0; offset < visible.length - 1; offset++) {
    if (visible.slice(offset, offset + 2) !== '[[' || escaped(source, offset)) {
      continue;
    }
    const end = wikiEnd(visible, source, offset);
    const closed = visible.slice(end, end + 2) === ']]';
    const inner = source.slice(offset + 2, end);
    const rawTarget = source.slice(offset, closed ? end + 2 : end);
    const target = inner.split('|', 1)[0].trim();
    if (!closed || /[[\]]/.test(inner) || target.length === 0) {
      output.diagnostics.push(
        diagnostic(
          file,
          source,
          offset,
          rawTarget,
          'malformed-wikilink',
          'Expected [[page#fragment|label]]'
        )
      );
    } else {
      output.links.push({ kind: 'wiki', target, rawTarget, offset });
    }
    offset = closed ? end + 1 : end - 1;
  }
}

function visit(tree: Root | RootContent, callback: (node: Root | RootContent) => void): void {
  callback(tree);
  if ('children' in tree) {
    for (const child of tree.children) {
      visit(child, callback);
    }
  }
}

function aliasesFrom(value: unknown): string[] {
  if (isScalar(value) && typeof value.value === 'string') {
    return [value.value];
  }
  if (!isSeq(value)) {
    throw new Error('aliases must be a string or string array');
  }
  return value.items.map((item) => {
    if (!isScalar(item) || typeof item.value !== 'string') {
      throw new Error('aliases must be a string or string array');
    }
    return item.value;
  });
}

function commentRange(token: Record<string, unknown>, base: number): Range | undefined {
  if (
    token.type !== 'comment' ||
    typeof token.offset !== 'number' ||
    typeof token.source !== 'string'
  ) {
    return undefined;
  }
  return { start: base + token.offset, end: base + token.offset + token.source.length };
}

function collectComments(token: unknown, base: number, ranges: Range[]): void {
  if (typeof token !== 'object' || token === null) {
    return;
  }
  const range = commentRange(token as Record<string, unknown>, base);
  if (range) {
    ranges.push(range);
  }
  for (const value of Object.values(token)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectComments(item, base, ranges);
      }
    } else if (typeof value === 'object') {
      collectComments(value, base, ranges);
    }
  }
}

function metadataRange(value: unknown, base: number): Range | undefined {
  if (!isNode(value) || !value.range) {
    return undefined;
  }
  return { start: base + value.range[0], end: base + value.range[1] };
}

function collectAliases(
  value: unknown,
  file: string,
  source: string,
  offset: number,
  output: Extraction
): void {
  try {
    const aliases = aliasesFrom(value);
    if (aliases.some((alias) => alias.trim().length === 0)) {
      throw new Error('aliases must not be blank');
    }
    output.aliases.push(...aliases);
  } catch (error: unknown) {
    output.diagnostics.push(diagnostic(file, source, offset, '', 'metadata', message(error)));
  }
}

function metadataRanges(
  yaml: string,
  base: number,
  source: string,
  file: string,
  output: Extraction
): Range[] {
  const document = parseDocument(yaml);
  const issues = [...document.errors, ...document.warnings];
  if (issues.length > 0) {
    for (const error of issues) {
      output.diagnostics.push(
        diagnostic(file, source, base + error.pos[0], '', 'metadata', error.message)
      );
    }
    return [];
  }
  if (document.contents === null) {
    return [];
  }
  if (!isMap(document.contents)) {
    throw new Error('Frontmatter must be a YAML mapping');
  }
  const related: Range[] = [];
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key)) {
      continue;
    }
    switch (pair.key.value) {
      case 'aliases':
        collectAliases(pair.value, file, source, base + (pair.key.range?.[0] ?? 0), output);
        break;
      case 'related': {
        const range = metadataRange(pair.value, base);
        if (range) {
          related.push(range);
        }
        break;
      }
    }
  }
  return related;
}

function extractMetadata(
  source: string,
  file: string,
  output: Extraction,
  excluded: Range[]
): void {
  const frontmatter = /^(?:\uFEFF)?---[^\S\r\n]*(?:\r\n|\n|\r)/.exec(source);
  if (!frontmatter) {
    return;
  }
  const closing = /^(?:---|\.\.\.)[^\S\r\n]*(?:\r\n|\n|\r|$)/gm;
  closing.lastIndex = frontmatter[0].length;
  const end = closing.exec(source);
  if (!end) {
    // Metadata requires a closed initial envelope. Without one, this is Markdown,
    // even when a following paragraph also happens to parse as a YAML mapping.
    return;
  }
  const base = frontmatter[0].length;
  const yaml = source.slice(base, end.index);
  excluded.push({ start: 0, end: end.index + end[0].length });
  const related = metadataRanges(yaml, base, source, file, output);
  const comments: Range[] = [];
  for (const token of new Parser().parse(yaml)) {
    collectComments(token, base, comments);
  }
  const visible = mask(source, comments);
  for (const range of related) {
    scanWiki(
      source,
      mask(visible, [
        { start: 0, end: range.start },
        { start: range.end, end: source.length },
      ]),
      file,
      output
    );
  }
  const total = (visible.slice(0, end.index).match(/\[\[/g) ?? []).length;
  const relatedCount = related.reduce(
    (count, range) => count + (visible.slice(range.start, range.end).match(/\[\[/g) ?? []).length,
    0
  );
  output.excluded['metadata-outside-related'] = total - relatedCount;
}

function collectMarkdownNode(
  node: Root | RootContent,
  source: string,
  definitions: Map<string, string>,
  output: Extraction,
  excluded: Range[]
): void {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    throw new Error('Parser did not provide source offsets');
  }
  if (
    [
      'code',
      'inlineCode',
      'html',
      'definition',
      'link',
      'linkReference',
      'image',
      'imageReference',
    ].includes(node.type)
  ) {
    excluded.push({ start, end });
  }
  if (['code', 'inlineCode', 'html'].includes(node.type)) {
    increment(output.excluded, node.type);
  }
  if (['image', 'imageReference'].includes(node.type)) {
    increment(output.excluded, 'image');
  }
  if (node.type !== 'link' && node.type !== 'linkReference') {
    return;
  }
  const target = node.type === 'link' ? node.url : definitions.get(node.identifier);
  if (target === undefined) {
    throw new Error('Parser produced a reference without a definition');
  }
  output.links.push({
    kind: 'standard',
    target,
    rawTarget: source.slice(start, end),
    offset: start,
  });
}

/** CommonMark links/references plus related-only metadata and the declared wiki extension. */
export function extractLinks(source: string, file: string): Extraction {
  const output: Extraction = { links: [], aliases: [], diagnostics: [], excluded: {} };
  const excluded: Range[] = [];
  try {
    extractMetadata(source, file, output, excluded);
  } catch (error: unknown) {
    output.diagnostics.push(diagnostic(file, source, 0, '', 'metadata', message(error)));
  }
  if (output.diagnostics.length > 0) {
    return output;
  }
  try {
    const tree = fromMarkdown(mask(source, excluded));
    const definitions = new Map<string, string>();
    visit(tree, (node) => {
      if (node.type === 'definition' && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, node.url);
      }
    });
    visit(tree, (node) => collectMarkdownNode(node, source, definitions, output, excluded));
    scanWiki(source, mask(source, excluded), file, output);
  } catch (error: unknown) {
    output.diagnostics.push(diagnostic(file, source, 0, '', 'parser', message(error)));
  }
  output.links.sort((a, b) => a.offset - b.offset);
  return output;
}

/** Component-aware containment (a root-other sibling is not a child of root). */
export function isContained(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return (
    suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
  );
}

interface Page {
  path: string;
  source: string;
  extraction: Extraction;
}

export interface WikiIndex {
  root: string;
  pages: Map<string, Set<string>>;
}

function key(name: string): string {
  return name.replace(/\.md$/i, '').replace(/ /g, '-').toLowerCase();
}

export function createWikiIndex(
  root: string,
  pages: Array<{ path: string; aliases: string[] }>
): WikiIndex {
  const index: WikiIndex = { root, pages: new Map() };
  for (const page of pages) {
    const path = relative(join(root, 'wiki'), page.path).split(sep).join('/');
    for (const name of [path, basename(path), ...page.aliases]) {
      const normalized = key(name);
      const candidates = index.pages.get(normalized) ?? new Set<string>();
      candidates.add(page.path);
      index.pages.set(normalized, candidates);
    }
  }
  return index;
}

export interface Resolution {
  classification: string;
  message: string;
  skipped: boolean;
}

function literalCase(root: string, target: string, fs: FileSystem): boolean {
  let current = root;
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    if (!fs.entries(current).includes(segment)) {
      return false;
    }
    current = join(current, segment);
  }
  return true;
}

function resolution(classification: string, detail: string, skipped = false): Resolution {
  return { classification, message: detail, skipped };
}

function wikiTarget(decoded: string, index: WikiIndex): string | Resolution {
  const wikiRoot = join(index.root, 'wiki');
  const normalized = decoded.replace(/^\/?wiki\//i, '').replace(/^\//, '');
  if (!isContained(wikiRoot, resolve(wikiRoot, normalized))) {
    return resolution('escape', 'Wikilink escapes wiki root');
  }
  const candidates = index.pages.get(key(normalized));
  if (!candidates || candidates.size === 0) {
    return resolution('missing', 'Wiki page or alias not found');
  }
  if (candidates.size > 1) {
    return resolution(
      'ambiguous',
      `Multiple pages: ${[...candidates]
        .sort()
        .map((path) => relative(index.root, path))
        .join(', ')}`
    );
  }
  return [...candidates][0];
}

function verifyTarget(target: string, link: Link, index: WikiIndex, fs: FileSystem): Resolution {
  if (!isContained(index.root, target)) {
    return resolution('escape', 'Target escapes repository root');
  }
  try {
    if (link.kind === 'standard' && !literalCase(index.root, target, fs)) {
      return resolution('missing-or-case', 'Missing target or literal path casing mismatch');
    }
    if (!isContained(index.root, fs.realpath(target))) {
      return resolution('escape', 'Target symlink escapes repository root');
    }
    fs.stat(target);
    return resolution('resolved', 'Local target exists');
  } catch (error: unknown) {
    return resolution('target-io', message(error));
  }
}

/** Pure destination selection; a returned path still requires filesystem verification. */
export function resolveDestination(
  link: Link,
  file: string,
  index: WikiIndex
): string | Resolution {
  if (/^[a-z][a-z\d+.-]*:/i.test(link.target) || link.target.startsWith('//')) {
    return resolution('external', 'External URI not checked', true);
  }
  if (link.target.startsWith('#')) {
    return resolution('anchor', 'Heading anchor not checked', true);
  }
  const pathPart = link.target.split(/[?#]/, 1)[0];
  if (!pathPart) {
    return resolution('anchor', 'Same-document query/anchor not checked', true);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return resolution('percent-encoding', 'Invalid percent escape');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return resolution('invalid-path', 'NUL and backslash paths are not supported');
  }
  const target =
    link.kind === 'wiki'
      ? wikiTarget(decoded, index)
      : decoded.startsWith('/')
        ? resolve(index.root, `.${decoded}`)
        : resolve(dirname(file), decoded);
  if (typeof target !== 'string') {
    return target;
  }
  if (!isContained(index.root, target)) {
    return resolution('escape', 'Target escapes repository root');
  }
  return target;
}

/** Read-only existence check; headings, images, HTML URLs and remote resources are excluded. */
export function resolveLink(
  link: Link,
  file: string,
  index: WikiIndex,
  fs: FileSystem = fileSystem
): Resolution {
  const target = resolveDestination(link, file, index);
  return typeof target === 'string' ? verifyTarget(target, link, index, fs) : target;
}

interface Discovery {
  root: string;
  fs: FileSystem;
  result: CheckResult;
  pages: Page[];
}

function inputError(context: Discovery, path: string, error: unknown): void {
  context.result.diagnostics.push(
    diagnostic(relative(context.root, path), '', 0, '', 'input-io', message(error))
  );
}

function readPage(context: Discovery, path: string): void {
  const { root, fs, result, pages } = context;
  if (!isContained(root, path) || !isContained(root, fs.realpath(path))) {
    throw new Error('Input document escapes repository root');
  }
  if (!fs.stat(path).isFile()) {
    throw new Error('Markdown input is not a regular file');
  }
  const source = fs.readFile(path);
  const extraction = extractLinks(source, relative(root, path));
  result.diagnostics.push(...extraction.diagnostics);
  for (const [category, count] of Object.entries(extraction.excluded)) {
    result.skipped[category] = (result.skipped[category] ?? 0) + count;
  }
  pages.push({ path, source, extraction });
}

function discoverEntry(context: Discovery, path: string): void {
  try {
    const info = context.fs.lstat(path);
    if (info.isSymbolicLink() && context.fs.stat(path).isDirectory()) {
      increment(context.result.skipped, 'directory-symlink');
    } else if (info.isDirectory()) {
      discover(context, path);
    } else if (/\.md$/i.test(path)) {
      readPage(context, path);
    }
  } catch (error: unknown) {
    inputError(context, path, error);
  }
}

function discover(context: Discovery, directory: string): void {
  try {
    if (
      !isContained(context.root, directory) ||
      !isContained(context.root, context.fs.realpath(directory))
    ) {
      throw new Error('Input directory escapes repository root');
    }
    for (const name of context.fs.entries(directory).sort()) {
      discoverEntry(context, join(directory, name));
    }
  } catch (error: unknown) {
    inputError(context, directory, error);
  }
}

function checkPageLinks(page: Page, index: WikiIndex, fs: FileSystem, result: CheckResult): void {
  for (const link of page.extraction.links) {
    const resolved = resolveLink(link, page.path, index, fs);
    if (resolved.skipped) {
      increment(result.skipped, resolved.classification);
    } else {
      result.checked++;
      if (resolved.classification !== 'resolved') {
        result.diagnostics.push(
          diagnostic(
            relative(index.root, page.path),
            page.source,
            link.offset,
            link.rawTarget,
            resolved.classification,
            resolved.message
          )
        );
      }
    }
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** All input containment checks precede reading Markdown or building its alias index. */
export function checkWiki(rootPath: string, fs: FileSystem = fileSystem): CheckResult {
  const result: CheckResult = { diagnostics: [], documents: 0, checked: 0, skipped: {} };
  let root: string;
  try {
    if (!isAbsolute(rootPath)) {
      throw new Error('Repository root must be absolute');
    }
    root = fs.realpath(rootPath);
    if (!fs.stat(root).isDirectory()) {
      throw new Error('Repository root must be a directory');
    }
  } catch (error: unknown) {
    result.diagnostics.push(diagnostic('.', '', 0, '', 'root-io', message(error)));
    return result;
  }
  const context: Discovery = { root, fs, result, pages: [] };
  const wiki = join(root, 'wiki');
  try {
    if (fs.lstat(wiki).isSymbolicLink()) {
      increment(result.skipped, 'directory-symlink');
    } else {
      discover(context, wiki);
    }
  } catch (error: unknown) {
    inputError(context, wiki, error);
  }
  result.documents = context.pages.length;
  if (result.documents === 0) {
    result.diagnostics.push(
      diagnostic('wiki', '', 0, '', 'empty-corpus', 'No contained Markdown documents scanned')
    );
  }
  const index = createWikiIndex(
    root,
    context.pages
      .filter((page) => page.extraction.diagnostics.length === 0)
      .map((page) => ({ path: page.path, aliases: page.extraction.aliases }))
  );
  for (const page of context.pages) {
    checkPageLinks(page, index, fs, result);
  }
  result.diagnostics.sort(
    (a, b) =>
      compareText(a.file, b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      compareText(a.classification, b.classification) ||
      compareText(a.rawTarget, b.rawTarget)
  );
  return result;
}

export function runCli(args: string[]): number {
  let root = resolve(import.meta.dir, '..');
  if (args.length !== 0) {
    if (args.length !== 2 || args[0] !== '--root' || !isAbsolute(args[1])) {
      console.error('Usage: bun run scripts/verify-wiki-links.ts [--root /absolute/repository]');
      return 2;
    }
    root = args[1];
  }
  const result = checkWiki(root);
  for (const entry of result.diagnostics) {
    console.error(JSON.stringify(entry));
  }
  console.log(
    JSON.stringify({
      documents: result.documents,
      checked: result.checked,
      skipped: result.skipped,
      errors: result.diagnostics.length,
    })
  );
  return result.diagnostics.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exitCode = runCli(process.argv.slice(2));
}

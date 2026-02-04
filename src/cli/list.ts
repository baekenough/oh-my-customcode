/**
 * omcustom list command
 * Lists installed agents, skills, guides, and rules
 */

import { basename, dirname, join, relative } from 'node:path';
import { i18n } from '../i18n/index.js';
import { fileExists, listFiles, readTextFile } from '../utils/fs.js';

/**
 * Types of components that can be listed
 */
export type ListType =
  | 'agents'
  | 'skills'
  | 'guides'
  | 'rules'
  | 'hooks'
  | 'contexts'
  | 'pipelines'
  | 'all';

/**
 * Options for the list command
 */
export interface ListOptions {
  /** Output format */
  format?: 'table' | 'json' | 'simple';
  /** Show detailed information */
  verbose?: boolean;
}

/**
 * Information about a single component
 */
export interface ComponentInfo {
  name: string;
  type: string;
  path: string;
  description?: string;
  version?: string;
  category?: string;
}

/**
 * Result of the list command
 */
export interface ListResult {
  success: boolean;
  type: ListType;
  components: ComponentInfo[];
  totalCount: number;
  errors?: string[];
}

/** Allowed top-level keys for backward compatibility parsing */
const ALLOWED_TOP_LEVEL_KEYS = new Set(['name', 'type', 'description', 'version', 'category']);

/**
 * Parse a single key-value pair from a YAML line
 * @returns [key, value] tuple or null if not a valid key-value pair
 */
function parseKeyValue(line: string): [string, string] | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;

  const key = line.substring(0, colonIndex).trim();
  const value = line.substring(colonIndex + 1).trim();

  if (!key || !value) return null;
  return [key, value];
}

/**
 * Check if line marks the end of metadata section (new top-level key)
 */
function isNewTopLevelSection(line: string, trimmed: string): boolean {
  const isIndented = line.startsWith(' ') || line.startsWith('\t');
  const isSectionHeader = trimmed.endsWith(':') && !trimmed.includes(' ');
  return !isIndented && isSectionHeader;
}

/**
 * Parse YAML-like content to extract metadata
 * Simple parser for extracting key-value pairs from index.yaml files
 */
function parseYamlMetadata(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let inMetadata = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'metadata:') {
      inMetadata = true;
      continue;
    }

    if (inMetadata && isNewTopLevelSection(line, trimmed)) {
      inMetadata = false;
    }

    const parsed = parseKeyValue(trimmed);
    if (!parsed) continue;

    const [key, value] = parsed;

    if (inMetadata) {
      result[key] = value;
      continue;
    }

    // Top-level key-value (backward compatibility)
    if (!trimmed.endsWith(':') && ALLOWED_TOP_LEVEL_KEYS.has(key) && !result[key]) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract agent type from filename (prefix-based)
 * Official Claude Code format: .claude/agents/{prefix}-{name}.md
 * Prefixes: lang-, be-, fe-, tool-, db-, arch-, infra-, qa-, mgr-, sys-, tutor-
 */
function extractAgentTypeFromFilename(filename: string): string {
  const name = basename(filename, '.md');
  const prefixMap: Record<string, string> = {
    lang: 'language',
    be: 'backend',
    fe: 'frontend',
    tool: 'tooling',
    db: 'database',
    arch: 'architect',
    infra: 'infrastructure',
    qa: 'qa',
    mgr: 'manager',
    sys: 'system',
    tutor: 'tutor',
  };

  const prefix = name.split('-')[0];
  return prefixMap[prefix] || 'unknown';
}

/**
 * Extract skill category from path
 * Official Claude Code format: .claude/skills/{category}/{name}/
 */
function extractSkillCategoryFromPath(skillPath: string, baseDir: string): string {
  const relativePath = relative(join(baseDir, '.claude', 'skills'), skillPath);
  const parts = relativePath.split('/').filter(Boolean);

  // Return the first part as category
  return parts[0] || 'unknown';
}

/**
 * Extract guide category from path
 * Path format: guides/{category}/{file}.md
 */
function extractGuideCategoryFromPath(guidePath: string, baseDir: string): string {
  const relativePath = relative(join(baseDir, 'guides'), guidePath);
  const parts = relativePath.split('/').filter(Boolean);

  // Return the first part as category
  return parts[0] || 'unknown';
}

/**
 * Extract rule priority from filename
 * Filename format: {PRIORITY}-{name}.md (e.g., MUST-safety.md)
 */
function extractRulePriorityFromFilename(filename: string): string {
  const name = basename(filename, '.md');
  const parts = name.split('-');
  return parts[0] || 'unknown';
}

/**
 * Options for extracting description from markdown content
 */
interface DescriptionExtractionOptions {
  /** Maximum length of description (truncates with "...") */
  maxLength?: number;
  /** Whether to clean markdown formatting (bold, italic) */
  cleanFormatting?: boolean;
}

/**
 * Check if line should be skipped during description extraction
 */
function shouldSkipLine(trimmed: string, inFrontmatter: boolean): boolean {
  if (inFrontmatter) return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('```')) return true;
  if (trimmed === '---') return true;
  return false;
}

/**
 * Clean markdown formatting from text
 */
function cleanMarkdownFormatting(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '');
}

/**
 * Truncate text to max length
 */
function truncateText(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Process and format extracted description
 */
function processDescription(
  text: string,
  options: { cleanFormatting: boolean; maxLength?: number }
): string {
  const cleaned = options.cleanFormatting ? cleanMarkdownFormatting(text) : text;
  return truncateText(cleaned, options.maxLength);
}

/**
 * Extract description from a blockquote line
 */
function extractFromBlockquote(
  trimmed: string,
  options: { cleanFormatting: boolean; maxLength?: number }
): string {
  const text = trimmed.replace(/^>\s*/, '').trim();
  return processDescription(text, options);
}

/**
 * Skip frontmatter in markdown lines
 */
function* skipFrontmatter(lines: string[]): Generator<{ trimmed: string; lineIndex: number }> {
  let inFrontmatter = false;
  let lineIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Frontmatter detection
    if (lineIndex === 0 && trimmed === '---') {
      inFrontmatter = true;
      lineIndex++;
      continue;
    }

    if (inFrontmatter && trimmed === '---') {
      inFrontmatter = false;
      lineIndex++;
      continue;
    }

    if (!inFrontmatter) {
      yield { trimmed, lineIndex };
    }

    lineIndex++;
  }
}

/**
 * Extract description from markdown content
 * Looks for first meaningful line (blockquote or regular text)
 */
function extractDescriptionFromMarkdown(
  content: string,
  options: DescriptionExtractionOptions = {}
): string | undefined {
  const { maxLength, cleanFormatting = false } = options;
  const lines = content.split('\n');

  for (const { trimmed } of skipFrontmatter(lines)) {
    // Skip unwanted lines
    if (shouldSkipLine(trimmed, false)) {
      continue;
    }

    // Extract from blockquote
    if (trimmed.startsWith('>')) {
      return extractFromBlockquote(trimmed, { cleanFormatting, maxLength });
    }

    // Regular non-empty line
    if (trimmed) {
      return processDescription(trimmed, { cleanFormatting, maxLength });
    }
  }

  return undefined;
}

/**
 * Try to read metadata from index.yaml file
 */
async function tryReadIndexYamlMetadata(
  indexYamlPath: string
): Promise<{ description?: string; version?: string }> {
  try {
    if (!(await fileExists(indexYamlPath))) return {};
    const content = await readTextFile(indexYamlPath);
    const metadata = parseYamlMetadata(content);
    return { description: metadata.description, version: metadata.version };
  } catch {
    return {};
  }
}

/**
 * Try to extract description from markdown file
 */
async function tryExtractMarkdownDescription(
  mdPath: string,
  options: DescriptionExtractionOptions = {}
): Promise<string | undefined> {
  try {
    const content = await readTextFile(mdPath);
    return extractDescriptionFromMarkdown(content, options);
  } catch {
    return undefined;
  }
}

/**
 * Get list of installed agents
 * Official Claude Code format: .claude/agents/{prefix}-{name}.md (flat structure)
 * @param targetDir - Target directory to scan
 * @returns List of agent information
 */
export async function getAgents(targetDir: string): Promise<ComponentInfo[]> {
  const agentsDir = join(targetDir, '.claude', 'agents');

  if (!(await fileExists(agentsDir))) return [];

  try {
    // In official Claude Code format, agents are flat .md files
    const agentMdFiles = await listFiles(agentsDir, { recursive: false, pattern: '*.md' });

    const agents = await Promise.all(
      agentMdFiles.map(async (agentMdPath) => {
        const filename = basename(agentMdPath);
        const name = basename(filename, '.md');
        const description = await tryExtractMarkdownDescription(agentMdPath);

        return {
          name,
          type: extractAgentTypeFromFilename(filename),
          path: relative(targetDir, agentMdPath),
          description,
          version: undefined,
        };
      })
    );

    return agents.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Get list of installed skills
 * Official Claude Code format: .claude/skills/{category}/{name}/SKILL.md
 * @param targetDir - Target directory to scan
 * @returns List of skill information
 */
export async function getSkills(targetDir: string): Promise<ComponentInfo[]> {
  const skillsDir = join(targetDir, '.claude', 'skills');

  if (!(await fileExists(skillsDir))) return [];

  try {
    const skillMdFiles = await listFiles(skillsDir, { recursive: true, pattern: 'SKILL.md' });

    const skills = await Promise.all(
      skillMdFiles.map(async (skillMdPath) => {
        const skillDir = dirname(skillMdPath);
        const indexYamlPath = join(skillDir, 'index.yaml');

        const { description, version } = await tryReadIndexYamlMetadata(indexYamlPath);

        return {
          name: basename(skillDir),
          type: 'skill',
          category: extractSkillCategoryFromPath(skillDir, targetDir),
          path: relative(targetDir, skillDir),
          description,
          version,
        };
      })
    );

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Get list of installed guides
 * @param targetDir - Target directory to scan
 * @returns List of guide information
 */
export async function getGuides(targetDir: string): Promise<ComponentInfo[]> {
  const guidesDir = join(targetDir, 'guides');

  if (!(await fileExists(guidesDir))) return [];

  try {
    const guideMdFiles = await listFiles(guidesDir, { recursive: true, pattern: '*.md' });

    const guides = await Promise.all(
      guideMdFiles.map(async (guideMdPath) => {
        const description = await tryExtractMarkdownDescription(guideMdPath, { maxLength: 100 });

        return {
          name: basename(guideMdPath, '.md'),
          type: 'guide',
          category: extractGuideCategoryFromPath(guideMdPath, targetDir),
          path: relative(targetDir, guideMdPath),
          description,
        };
      })
    );

    return guides.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Priority order for rule sorting */
const RULE_PRIORITY_ORDER: Record<string, number> = { MUST: 0, SHOULD: 1, MAY: 2 };

/**
 * Get list of installed rules
 * @param targetDir - Target directory to scan
 * @returns List of rule information
 */
export async function getRules(targetDir: string): Promise<ComponentInfo[]> {
  const rulesDir = join(targetDir, '.claude', 'rules');

  if (!(await fileExists(rulesDir))) return [];

  try {
    const ruleMdFiles = await listFiles(rulesDir, { recursive: false, pattern: '*.md' });

    const rules = await Promise.all(
      ruleMdFiles.map(async (ruleMdPath) => {
        const filename = basename(ruleMdPath);
        const description = await tryExtractMarkdownDescription(ruleMdPath, {
          cleanFormatting: true,
        });

        return {
          name: basename(ruleMdPath, '.md'),
          type: extractRulePriorityFromFilename(filename),
          path: relative(targetDir, ruleMdPath),
          description,
        };
      })
    );

    return rules.sort((a, b) => {
      const priorityDiff = (RULE_PRIORITY_ORDER[a.type] ?? 3) - (RULE_PRIORITY_ORDER[b.type] ?? 3);
      return priorityDiff !== 0 ? priorityDiff : a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

/**
 * Format component list as table
 * @param components - Components to format
 * @param type - Type of components
 */
export function formatAsTable(components: ComponentInfo[], type: ListType): void {
  if (components.length === 0) {
    console.log(i18n.t('cli.list.empty', { type }));
    return;
  }

  // Print header
  console.log('');
  console.log(i18n.t('cli.list.header', { type, count: components.length }));
  console.log('─'.repeat(80));

  // Calculate column widths
  const nameWidth = Math.max(20, ...components.map((c) => c.name.length));
  const typeWidth = Math.max(15, ...components.map((c) => (c.category || c.type).length));

  // Print column headers
  const nameHeader = 'Name'.padEnd(nameWidth);
  const typeHeader = (type === 'skills' ? 'Category' : 'Type').padEnd(typeWidth);
  console.log(`  ${nameHeader}  ${typeHeader}  Description`);
  console.log(`  ${'─'.repeat(nameWidth)}  ${'─'.repeat(typeWidth)}  ${'─'.repeat(40)}`);

  // Print each component
  for (const component of components) {
    const name = component.name.padEnd(nameWidth);
    const typeOrCategory = (component.category || component.type).padEnd(typeWidth);
    const description = component.description ? component.description.substring(0, 40) : '';
    console.log(`  ${name}  ${typeOrCategory}  ${description}`);
  }

  console.log('─'.repeat(80));
  console.log(i18n.t('cli.list.total', { count: components.length, type }));
  console.log('');
}

/**
 * Format component list as simple text
 * @param components - Components to format
 * @param type - Type of components
 */
export function formatAsSimple(components: ComponentInfo[], type: ListType): void {
  if (components.length === 0) {
    console.log(i18n.t('cli.list.empty', { type }));
    return;
  }

  console.log(`\n${type} (${components.length}):`);
  for (const component of components) {
    const typeInfo = component.category || component.type;
    console.log(`  ${component.name} [${typeInfo}]`);
  }
}

/**
 * Format component list as JSON
 * @param components - Components to format
 */
export function formatAsJson(components: ComponentInfo[]): void {
  console.log(JSON.stringify(components, null, 2));
}

/**
 * Get list of installed hooks
 * @param targetDir - Target directory to scan
 * @returns List of hook information
 */
export async function getHooks(targetDir: string): Promise<ComponentInfo[]> {
  const hooksDir = join(targetDir, '.claude', 'hooks');

  if (!(await fileExists(hooksDir))) return [];

  try {
    const hookFiles = await listFiles(hooksDir, { recursive: true, pattern: '*.sh' });
    const hookConfigs = await listFiles(hooksDir, { recursive: true, pattern: '*.json' });
    const hookYamls = await listFiles(hooksDir, { recursive: true, pattern: '*.yaml' });
    const allFiles = [...hookFiles, ...hookConfigs, ...hookYamls];

    return allFiles
      .map((hookPath) => ({
        name: basename(hookPath),
        type: 'hook',
        path: relative(targetDir, hookPath),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Get list of installed contexts
 * @param targetDir - Target directory to scan
 * @returns List of context information
 */
export async function getContexts(targetDir: string): Promise<ComponentInfo[]> {
  const contextsDir = join(targetDir, '.claude', 'contexts');

  if (!(await fileExists(contextsDir))) return [];

  try {
    const mdFiles = await listFiles(contextsDir, { recursive: false, pattern: '*.md' });
    const yamlFiles = await listFiles(contextsDir, { recursive: false, pattern: '*.yaml' });
    const allFiles = [...mdFiles, ...yamlFiles];

    const contexts = await Promise.all(
      allFiles.map(async (ctxPath) => {
        const ext = ctxPath.endsWith('.md') ? '.md' : '.yaml';
        const description =
          ext === '.md'
            ? await tryExtractMarkdownDescription(ctxPath, { maxLength: 100 })
            : undefined;

        return {
          name: basename(ctxPath, ext),
          type: 'context',
          path: relative(targetDir, ctxPath),
          description,
        };
      })
    );

    return contexts.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Get list of installed pipelines
 * @param targetDir - Target directory to scan
 * @returns List of pipeline information
 */
export async function getPipelines(targetDir: string): Promise<ComponentInfo[]> {
  const pipelinesDir = join(targetDir, 'pipelines');

  if (!(await fileExists(pipelinesDir))) return [];

  try {
    const pipelineFiles = await listFiles(pipelinesDir, { recursive: true, pattern: '*.yaml' });

    return pipelineFiles
      .map((pipePath) => ({
        name: basename(pipePath, '.yaml'),
        type: 'pipeline',
        category: relative(join(targetDir, 'pipelines'), dirname(pipePath)) || 'root',
        path: relative(targetDir, pipePath),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Mapping from component type to getter function */
const COMPONENT_GETTERS: Record<
  Exclude<ListType, 'all'>,
  (dir: string) => Promise<ComponentInfo[]>
> = {
  agents: getAgents,
  skills: getSkills,
  guides: getGuides,
  rules: getRules,
  hooks: getHooks,
  contexts: getContexts,
  pipelines: getPipelines,
};

/**
 * Format and display components based on format type
 */
function displayComponents(components: ComponentInfo[], type: ListType, format: string): void {
  if (format === 'json') {
    formatAsJson(components);
  } else if (format === 'simple') {
    formatAsSimple(components, type);
  } else {
    formatAsTable(components, type);
  }
}

/**
 * Handle displaying all component types
 */
async function handleListAll(targetDir: string, format: string): Promise<ComponentInfo[]> {
  const [agents, skills, guides, rules, hooks, contexts, pipelines] = await Promise.all([
    getAgents(targetDir),
    getSkills(targetDir),
    getGuides(targetDir),
    getRules(targetDir),
    getHooks(targetDir),
    getContexts(targetDir),
    getPipelines(targetDir),
  ]);

  if (format !== 'json') {
    displayComponents(agents, 'agents', format);
    displayComponents(skills, 'skills', format);
    displayComponents(guides, 'guides', format);
    displayComponents(rules, 'rules', format);
    displayComponents(hooks, 'hooks', format);
    displayComponents(contexts, 'contexts', format);
    displayComponents(pipelines, 'pipelines', format);
  }

  return [...agents, ...skills, ...guides, ...rules, ...hooks, ...contexts, ...pipelines];
}

/**
 * Execute the list command
 * @param type - Type of components to list
 * @param options - List command options
 * @returns Result of the list operation
 */
export async function listCommand(
  type: ListType = 'all',
  options: ListOptions = {}
): Promise<ListResult> {
  const targetDir = process.cwd();
  const format = options.format || 'table';

  console.log(i18n.t('cli.list.scanning'));

  try {
    const components =
      type === 'all'
        ? await handleListAll(targetDir, format)
        : await COMPONENT_GETTERS[type](targetDir);

    if (type === 'all' && format === 'json') {
      formatAsJson(components);
    } else if (type !== 'all') {
      displayComponents(components, type, format);
    }

    return { success: true, type, components, totalCount: components.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.list.failed'), errorMessage);

    return { success: false, type, components: [], totalCount: 0, errors: [errorMessage] };
  }
}

export default listCommand;

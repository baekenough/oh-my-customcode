/**
 * omcc list command
 * Lists installed agents, skills, and other components
 */

import { i18n } from '../i18n/index.js';

/**
 * Types of components that can be listed
 */
export type ListType = 'agents' | 'skills' | 'guides' | 'rules' | 'all';

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

/**
 * Get list of installed agents
 * @param targetDir - Target directory to scan
 * @returns List of agent information
 */
export async function getAgents(targetDir: string): Promise<ComponentInfo[]> {
  // TODO: Implement agent scanning
  // Scan agents/ directory and read AGENT.md/index.yaml files
  const agents: ComponentInfo[] = [];

  // Placeholder: Would scan agents/**/ directories
  // for each agent, read index.yaml for metadata

  return agents;
}

/**
 * Get list of installed skills
 * @param targetDir - Target directory to scan
 * @returns List of skill information
 */
export async function getSkills(targetDir: string): Promise<ComponentInfo[]> {
  // TODO: Implement skill scanning
  // Scan skills/ directory and read SKILL.md/index.yaml files
  const skills: ComponentInfo[] = [];

  return skills;
}

/**
 * Get list of installed guides
 * @param targetDir - Target directory to scan
 * @returns List of guide information
 */
export async function getGuides(targetDir: string): Promise<ComponentInfo[]> {
  // TODO: Implement guide scanning
  // Scan guides/ directory for markdown files
  const guides: ComponentInfo[] = [];

  return guides;
}

/**
 * Get list of installed rules
 * @param targetDir - Target directory to scan
 * @returns List of rule information
 */
export async function getRules(targetDir: string): Promise<ComponentInfo[]> {
  // TODO: Implement rule scanning
  // Scan .claude/rules/ directory for rule files
  const rules: ComponentInfo[] = [];

  return rules;
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
  console.log('-'.repeat(60));

  // Print each component
  for (const component of components) {
    const description = component.description ? ` - ${component.description}` : '';
    console.log(`  ${component.name}${description}`);
  }

  console.log('-'.repeat(60));
  console.log(i18n.t('cli.list.total', { count: components.length, type }));
  console.log('');
}

/**
 * Format component list as JSON
 * @param components - Components to format
 */
export function formatAsJson(components: ComponentInfo[]): void {
  console.log(JSON.stringify(components, null, 2));
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
    let components: ComponentInfo[] = [];

    // Gather components based on type
    switch (type) {
      case 'agents':
        components = await getAgents(targetDir);
        break;
      case 'skills':
        components = await getSkills(targetDir);
        break;
      case 'guides':
        components = await getGuides(targetDir);
        break;
      case 'rules':
        components = await getRules(targetDir);
        break;
      default: {
        // Gather all types
        const [agents, skills, guides, rules] = await Promise.all([
          getAgents(targetDir),
          getSkills(targetDir),
          getGuides(targetDir),
          getRules(targetDir),
        ]);

        // Display each type separately for "all"
        if (format === 'table') {
          formatAsTable(agents, 'agents');
          formatAsTable(skills, 'skills');
          formatAsTable(guides, 'guides');
          formatAsTable(rules, 'rules');
        }

        components = [...agents, ...skills, ...guides, ...rules];
        break;
      }
    }

    // Format output for single type
    if (type !== 'all') {
      if (format === 'json') {
        formatAsJson(components);
      } else {
        formatAsTable(components, type);
      }
    } else if (format === 'json') {
      formatAsJson(components);
    }

    return {
      success: true,
      type,
      components,
      totalCount: components.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.list.failed'), errorMessage);

    return {
      success: false,
      type,
      components: [],
      totalCount: 0,
      errors: [errorMessage],
    };
  }
}

export default listCommand;

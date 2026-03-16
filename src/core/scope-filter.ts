/**
 * Scope-based filtering for skill installation
 */

/**
 * Valid scope values for skill filtering.
 * Keep in sync with:
 * - packages/ontology-rag ontology schema (packages/ontology-rag/src/ontology_rag/ontology.py SkillInfo.scope)
 * - templates/.claude/skills/ SKILL.md frontmatter (scope field)
 * - .claude/rules/MUST-agent-design.md (R006) skill scope table
 */
export type SkillScope = 'core' | 'harness' | 'package';

/**
 * Valid domain values for agent domain gating
 */
export type AgentDomain = 'backend' | 'frontend' | 'data-engineering' | 'devops' | 'universal';

/**
 * Parse scope field from SKILL.md frontmatter content.
 * Only matches within YAML frontmatter (between --- delimiters).
 * Returns 'core' as default when scope is absent or file has no frontmatter.
 */
export function getSkillScope(content: string): SkillScope {
  const cleaned = content.replace(/^\uFEFF/, '');
  const frontmatter = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return 'core';
  const match = frontmatter[1].match(/^scope:\s*(core|harness|package)\s*$/m);
  return (match?.[1] as SkillScope) ?? 'core';
}

/**
 * Determine if a skill should be installed based on its scope
 */
export function shouldInstallSkill(scope: SkillScope): boolean {
  return scope !== 'package';
}

/**
 * Parse domain field from agent frontmatter content.
 * Only matches within YAML frontmatter (between --- delimiters).
 * Returns 'universal' as default when domain is absent or file has no frontmatter.
 */
export function getAgentDomain(content: string): AgentDomain {
  const cleaned = content.replace(/^\uFEFF/, '');
  const frontmatter = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return 'universal';
  const match = frontmatter[1].match(
    /^domain:\s*(backend|frontend|data-engineering|devops|universal)\s*$/m
  );
  return (match?.[1] as AgentDomain) ?? 'universal';
}

/**
 * Determine if an agent should be installed based on its domain and the requested domain filter.
 * When no domain filter is provided (undefined), all agents are installed (backward compatible).
 * Universal agents are always installed regardless of the domain filter.
 */
export function shouldInstallAgent(agentDomain: AgentDomain, filterDomain?: string): boolean {
  if (!filterDomain) return true;
  if (agentDomain === 'universal') return true;
  return agentDomain === filterDomain;
}

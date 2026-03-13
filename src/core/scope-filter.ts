/**
 * Scope-based filtering for skill installation
 */

export type SkillScope = 'core' | 'harness' | 'package';

/**
 * Parse scope field from SKILL.md frontmatter content.
 * Only matches within YAML frontmatter (between --- delimiters).
 * Returns 'core' as default when scope is absent or file has no frontmatter.
 */
export function getSkillScope(content: string): SkillScope {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
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

/**
 * Scope-based filtering for skill installation
 */

export type SkillScope = 'core' | 'harness' | 'package';

/**
 * Parse scope field from SKILL.md frontmatter content
 */
export function getSkillScope(content: string): SkillScope {
  const match = content.match(/^scope:\s*(core|harness|package)\s*$/m);
  return (match?.[1] as SkillScope) ?? 'core';
}

/**
 * Determine if a skill should be installed based on its scope
 */
export function shouldInstallSkill(scope: SkillScope): boolean {
  return scope !== 'package';
}

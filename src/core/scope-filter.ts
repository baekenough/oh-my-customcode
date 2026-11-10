/**
 * Scope-based filtering for skill installation
 */

import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Valid scope values for skill filtering.
 * Keep in sync with:
 * - packages/ontology-rag ontology schema (packages/ontology-rag/src/ontology_rag/ontology.py SkillInfo.scope)
 * - templates/.claude/skills/ SKILL.md frontmatter (scope field)
 * - .claude/rules/MUST-agent-design.md (R006) skill scope table
 */
export type SkillScope = 'core' | 'harness' | 'package';

/**
 * Names of the shipped skills that update must not install: `package`-scope skills that the
 * project does not have yet. One that is already installed stays and keeps being updated.
 */
export async function listSkippedPackageSkills(
  srcSkillsDir: string,
  destSkillsDir: string
): Promise<string[]> {
  const skipped: string[] = [];
  for (const entry of await readdir(srcSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let content: string;
    try {
      content = await readFile(join(srcSkillsDir, entry.name, 'SKILL.md'), 'utf-8');
    } catch {
      continue;
    }
    if (shouldInstallSkill(getSkillScope(content))) continue;
    try {
      await lstat(join(destSkillsDir, entry.name));
    } catch {
      skipped.push(entry.name);
    }
  }
  return skipped;
}

/**
 * Number of skill directories actually present in `skillsDir` (0 when it does not exist):
 * non-hidden entries that are directories, following symlinks.
 */
export async function countSkillDirectories(skillsDir: string): Promise<number> {
  try {
    let count = 0;
    for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        count++;
      } else if (entry.isSymbolicLink()) {
        // A symlinked skill directory counts; a dangling or file link does not
        try {
          if ((await stat(join(skillsDir, entry.name))).isDirectory()) count++;
        } catch {}
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Rewrite the skill count in the entry doc's directory tree line
 * (`skills/ ... # 스킬 (114 디렉토리)` / `# Skills (114 directories)`) to the deployed count.
 * Text without that line is returned unchanged.
 */
export function withDeployedSkillCount(content: string, count: number): string {
  return content.replace(
    /^(.*\bskills\/[^\n(]*\()\d+( 디렉토리\)| directories\))/m,
    (_match, head: string, tail: string) => `${head}${count}${tail}`
  );
}

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

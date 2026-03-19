import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROJECT_RULES = `oh-my-customcode project rules:
- Agent files: .claude/agents/{kebab-case}.md with YAML frontmatter (name, description, model, tools)
- Skill files: .claude/skills/{kebab-case}/SKILL.md with YAML frontmatter (name, description, scope)
- Guide files: guides/{name}/README.md (pure markdown, NO frontmatter)
- R006: Separate concerns — agents define WHAT, skills define HOW, guides are reference docs
- Naming: lang-* (languages), be-* (backends), fe-* (frontends), de-* (data engineering), db-* (databases), infra-* (infrastructure), mgr-* (managers), sec-* (security), qa-* (QA), arch-* (architecture), tool-* (tooling)
- Models: sonnet (general), opus (complex reasoning), haiku (fast/simple)
- Tools: always include Read, Grep, Glob. Add Write, Edit for code modification. Add Bash for execution.
- Memory scopes: user, project, local
- Scope values: core (universal), harness (agent/skill management), package (package-specific)`;

export interface ValidationResult {
	passed: boolean;
	warnings: string[];
	errors: string[];
	raw: string;
}

function buildValidationPrompt(type: 'agent' | 'skill' | 'guide', name: string): string {
	return `You are a validator for oh-my-customcode ${type} files.

Validate the ${type} "${name}" that was just created.

Check:
1. Frontmatter fields are valid (name, description format)
2. Referenced skills exist in .claude/skills/
3. File follows naming conventions
4. Body has required sections
5. No obvious issues

${PROJECT_RULES}

Output a JSON object with this exact structure:
{"passed": true/false, "warnings": ["..."], "errors": ["..."]}

Output ONLY the JSON. No other text.`;
}

export async function validateWithClaude(
	type: 'agent' | 'skill' | 'guide',
	name: string,
	root: string
): Promise<ValidationResult> {
	const prompt = buildValidationPrompt(type, name);

	try {
		const { stdout } = await execAsync(
			`claude -p ${escapeShellArg(prompt)} --no-input`,
			{
				timeout: 30000,
				maxBuffer: 1024 * 1024,
				cwd: root
			}
		);

		const raw = stdout.trim();
		// Strip markdown code-block fences if Claude wrapped the output
		const stripped = stripCodeBlock(raw);

		try {
			const parsed = JSON.parse(stripped);
			return {
				passed: Boolean(parsed.passed),
				warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
				errors: Array.isArray(parsed.errors) ? parsed.errors.map(String) : [],
				raw
			};
		} catch {
			// JSON parse failed — treat as passing (advisory only)
			return { passed: true, warnings: [], errors: [], raw };
		}
	} catch {
		// Claude CLI invocation failed — treat as passing (advisory only)
		return { passed: true, warnings: [], errors: [], raw: '' };
	}
}

export async function isClaudeAvailable(): Promise<boolean> {
	try {
		await execAsync('which claude');
		return true;
	} catch {
		return false;
	}
}

export async function generateAgentWithClaude(
	naturalLanguageInput: string,
	projectRoot: string
): Promise<string> {
	const prompt = buildPrompt(naturalLanguageInput);

	const { stdout } = await execAsync(
		`claude -p ${escapeShellArg(prompt)} --no-input`,
		{
			timeout: 60000,
			maxBuffer: 1024 * 1024,
			cwd: projectRoot
		}
	);

	// Strip markdown code-block fences if Claude wrapped the output
	const raw = stdout.trim();
	return stripCodeBlock(raw);
}

function stripCodeBlock(raw: string): string {
	// Remove leading ```markdown / ```yaml / ``` and trailing ```
	const fenced = raw.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
	if (fenced) return fenced[1].trim();
	return raw;
}

function escapeShellArg(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function generateGuideWithClaude(
	naturalLanguageInput: string,
	projectRoot: string
): Promise<string> {
	const prompt = buildGuidePrompt(naturalLanguageInput);

	const { stdout } = await execAsync(
		`claude -p ${escapeShellArg(prompt)} --no-input`,
		{
			timeout: 60000,
			maxBuffer: 1024 * 1024,
			cwd: projectRoot
		}
	);

	// Strip markdown code-block fences if Claude wrapped the output
	const raw = stdout.trim();
	return stripCodeBlock(raw);
}

function buildGuidePrompt(input: string): string {
	return `You are a guide document generator for oh-my-customcode.

Generate a complete guide README.md file based on this description:
"${input}"

Guides are pure markdown reference documents with NO frontmatter. They live in guides/{name}/README.md.

The file must follow this structure:

# {Guide Title}

## Overview
{Brief description of what this guide covers}

## Key Concepts
{Core concepts and terminology}

## Best Practices
{Recommended patterns and approaches}

## Examples
{Practical code examples or scenarios}

## References
{Links to official docs, related guides}

${PROJECT_RULES}

Rules:
- NO frontmatter (no --- blocks)
- Write in English
- Include practical, actionable content
- Use code blocks with language tags for examples
- Keep sections focused and concise

Output ONLY the markdown content. No explanations, no code blocks wrapping the output.`;
}

export async function generateSkillWithClaude(
	naturalLanguageInput: string,
	projectRoot: string
): Promise<string> {
	const prompt = buildSkillPrompt(naturalLanguageInput);

	const { stdout } = await execAsync(
		`claude -p ${escapeShellArg(prompt)} --no-input`,
		{
			timeout: 60000,
			maxBuffer: 1024 * 1024,
			cwd: projectRoot
		}
	);

	const raw = stdout.trim();
	return stripCodeBlock(raw);
}

function buildSkillPrompt(input: string): string {
	return `You are a skill file generator for oh-my-customcode.

Generate a complete skill SKILL.md file based on this description:
"${input}"

The file must follow this exact format:

---
name: {kebab-case-name}
description: {one-line English description}
scope: {core | harness | package}
---

## When to Use

{When this skill should be invoked}

## Instructions

{Step-by-step instructions for the agent executing this skill}

## Checklist

{Verification checklist}

${PROJECT_RULES}

Rules:
- name must be kebab-case
- Use existing naming conventions: *-best-practices for tech expertise, *-routing for orchestration
- description must be in English, one line
- scope: core for universal tools, harness for agent/skill management, package for package-specific
- Add "context: fork" to frontmatter only for routing/orchestration skills
- Body sections in English

Output ONLY the markdown file content. No explanations, no code blocks.`;
}

function buildPrompt(input: string): string {
	return `You are an agent file generator for oh-my-customcode.

Generate a complete agent markdown file based on this description:
"${input}"

The file must follow this exact format:

---
name: {kebab-case-name}
description: {one-line English description}
model: {sonnet | opus | haiku}
tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
---

# {Agent Title}

## Role
{What this agent does}

## Capabilities
{Bullet list of capabilities}

## Workflow
{Numbered steps}

${PROJECT_RULES}

Rules:
- name must be kebab-case (e.g., lang-rust-expert, be-fastapi-expert)
- Use existing naming conventions: lang-* for languages, be-* for backends, fe-* for frontends, de-* for data engineering, db-* for databases, infra-* for infrastructure, mgr-* for managers, sec-* for security, qa-* for QA, arch-* for architecture, tool-* for tooling
- description must be in English, one line
- model: use sonnet for general tasks, opus for complex reasoning/architecture, haiku for simple/fast tasks
- tools: always include Read, Grep, Glob. Add Write, Edit for code modification. Add Bash for execution.
- Body sections in English

Output ONLY the markdown file content. No explanations, no code blocks, no surrounding text.`;
}

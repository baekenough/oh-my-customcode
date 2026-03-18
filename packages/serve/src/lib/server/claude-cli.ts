import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

Rules:
- name must be kebab-case (e.g., lang-rust-expert, be-fastapi-expert)
- Use existing naming conventions: lang-* for languages, be-* for backends, fe-* for frontends, de-* for data engineering, db-* for databases, infra-* for infrastructure, mgr-* for managers, sec-* for security, qa-* for QA, arch-* for architecture, tool-* for tooling
- description must be in English, one line
- model: use sonnet for general tasks, opus for complex reasoning/architecture, haiku for simple/fast tasks
- tools: always include Read, Grep, Glob. Add Write, Edit for code modification. Add Bash for execution.
- Body sections in English

Output ONLY the markdown file content. No explanations, no code blocks, no surrounding text.`;
}

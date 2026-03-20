import { fail, redirect } from '@sveltejs/kit';
import { writeFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import type { Actions, PageServerLoad } from './$types';
import { getProjectRoot, getSkills } from '$lib/server/data';
import { parseNaturalLanguage, buildAgentMarkdown, sanitizeName } from '$lib/server/agent-generator';
import { parseFrontmatter } from '$lib/server/frontmatter';
import { isClaudeAvailable, generateAgentWithClaude } from '$lib/server/claude-cli';

export const load: PageServerLoad = async ({ parent }) => {
	const { root } = await parent();
	const skills = await getSkills(root);
	const claudeAvailable = await isClaudeAvailable();
	return {
		skillNames: skills.map((s) => s.name),
		claudeAvailable
	};
};

export const actions: Actions = {
	// Parse natural language and return structured data (no file write)
	analyze: async ({ request }) => {
		const data = await request.formData();
		const input = String(data.get('input') ?? '').trim();

		if (!input) {
			return fail(400, { error: 'Input is required' });
		}

		const root = await getProjectRoot();
		const claudeAvailable = await isClaudeAvailable();

		if (claudeAvailable) {
			try {
				const rawOutput = await generateAgentWithClaude(input, root);
				const { frontmatter, body } = parseFrontmatter(rawOutput);

				return {
					success: true,
					mode: 'claude' as const,
					name: String(frontmatter.name ?? ''),
					description: String(frontmatter.description ?? ''),
					model: String(frontmatter.model ?? 'sonnet'),
					domain: String(frontmatter.domain ?? 'universal'),
					tools: arrayField(frontmatter.tools),
					skills: arrayField(frontmatter.skills),
					body,
					raw: rawOutput
				};
			} catch (err) {
				// Claude CLI failed — fall back to keyword parser
				console.warn('[claude-cli] Claude generation failed, falling back to keyword parser:', err);
				const generated = parseNaturalLanguage(input);
				const markdown = buildAgentMarkdown(generated);
				return {
					success: true,
					mode: 'keyword-fallback' as const,
					name: generated.name,
					description: generated.description,
					model: generated.model,
					domain: generated.domain,
					tools: generated.tools,
					skills: generated.skills,
					body: generated.body,
					raw: markdown
				};
			}
		} else {
			const generated = parseNaturalLanguage(input);
			const markdown = buildAgentMarkdown(generated);
			return {
				success: true,
				mode: 'keyword' as const,
				name: generated.name,
				description: generated.description,
				model: generated.model,
				domain: generated.domain,
				tools: generated.tools,
				skills: generated.skills,
				body: generated.body,
				raw: markdown
			};
		}
	},

	// Save agent file
	save: async ({ request }) => {
		const data = await request.formData();
		const rawName = String(data.get('name') ?? '').trim();
		const content = String(data.get('content') ?? '').trim();

		// Sanitize name — kebab-case only
		const name = sanitizeName(rawName);

		if (!name) {
			return fail(400, { error: 'Agent name is required' });
		}
		if (!content) {
			return fail(400, { error: 'Agent content is required' });
		}

		// Validate name format (single-char names must also pass regex)
		if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && name.length >= 1) {
			return fail(400, { error: `Invalid agent name: "${name}". Use kebab-case (e.g., my-agent-expert)` });
		}

		const root = await getProjectRoot();
		const allowedDir = resolve(root, '.claude', 'agents');
		const agentPath = join(allowedDir, `${name}.md`);

		// Path containment check — prevent directory traversal
		if (!resolve(agentPath).startsWith(allowedDir + '/') && resolve(agentPath) !== allowedDir) {
			return fail(400, { error: 'Invalid path' });
		}

		// Check for existing file
		try {
			await access(agentPath);
			// File exists
			return fail(409, { error: `Agent "${name}" already exists. Choose a different name.` });
		} catch {
			// File does not exist — safe to write
		}

		await writeFile(agentPath, content + '\n', 'utf-8');

		throw redirect(303, `/agents/${name}`);
	}
};

function arrayField(val: unknown): string[] {
	if (Array.isArray(val)) return val.map(String);
	if (typeof val === 'string') return [val];
	return [];
}

import { fail, redirect } from '@sveltejs/kit';
import { writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import type { Actions, PageServerLoad } from './$types';
import { getProjectRoot, getSkills } from '$lib/server/data';
import { parseSkillNaturalLanguage, buildSkillMarkdown, sanitizeSkillName } from '$lib/server/skill-generator';
import { parseFrontmatter } from '$lib/server/frontmatter';
import { isClaudeAvailable, generateSkillWithClaude, validateWithClaude } from '$lib/server/claude-cli';

export const load: PageServerLoad = async () => {
	const root = await getProjectRoot();
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
				const rawOutput = await generateSkillWithClaude(input, root);
				const { frontmatter, body } = parseFrontmatter(rawOutput);

				return {
					success: true,
					mode: 'claude' as const,
					name: String(frontmatter.name ?? ''),
					description: String(frontmatter.description ?? ''),
					scope: String(frontmatter.scope ?? 'core'),
					contextFork: frontmatter.context === 'fork',
					body,
					raw: rawOutput
				};
			} catch (err) {
				// Claude CLI failed — fall back to keyword parser
				console.warn('[claude-cli] Claude generation failed, falling back to keyword parser:', err);
				const generated = parseSkillNaturalLanguage(input);
				const markdown = buildSkillMarkdown(generated);
				return {
					success: true,
					mode: 'keyword-fallback' as const,
					name: generated.name,
					description: generated.description,
					scope: generated.scope,
					contextFork: generated.contextFork,
					body: generated.body,
					raw: markdown
				};
			}
		} else {
			const generated = parseSkillNaturalLanguage(input);
			const markdown = buildSkillMarkdown(generated);
			return {
				success: true,
				mode: 'keyword' as const,
				name: generated.name,
				description: generated.description,
				scope: generated.scope,
				contextFork: generated.contextFork,
				body: generated.body,
				raw: markdown
			};
		}
	},

	// Save skill file
	save: async ({ request }) => {
		const data = await request.formData();
		const rawName = String(data.get('name') ?? '').trim();
		const content = String(data.get('content') ?? '').trim();

		// Sanitize name — kebab-case only
		const name = sanitizeSkillName(rawName);

		if (!name) {
			return fail(400, { error: 'Skill name is required' });
		}
		if (!content) {
			return fail(400, { error: 'Skill content is required' });
		}

		// Validate name format
		if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && name.length > 1) {
			return fail(400, { error: `Invalid skill name: "${name}". Use kebab-case (e.g., react-best-practices)` });
		}

		const root = await getProjectRoot();
		const skillDir = join(root, '.claude', 'skills', name);
		const skillPath = join(skillDir, 'SKILL.md');

		// Check for existing file
		try {
			await access(skillPath);
			// File exists
			return fail(409, { error: `Skill "${name}" already exists. Choose a different name.` });
		} catch {
			// File does not exist — safe to write
		}

		// Create skill directory
		await mkdir(skillDir, { recursive: true });
		await writeFile(skillPath, content + '\n', 'utf-8');

		// Run advisory validation via Claude CLI if available
		const claudeAvailable = await isClaudeAvailable();
		if (claudeAvailable) {
			const validation = await validateWithClaude('skill', name, root);
			// Only redirect immediately when fully passing (no warnings, no errors)
			if (validation.passed && validation.warnings.length === 0 && validation.errors.length === 0) {
				throw redirect(303, `/skills/${name}`);
			}
			return { saved: true, name, validation };
		}

		throw redirect(303, `/skills/${name}`);
	}
};

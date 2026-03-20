import type { PageServerLoad } from './$types';
import { getSkill } from '$lib/server/data';
import { renderMarkdown } from '$lib/server/markdown';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { root } = await parent();
	const skill = await getSkill(root, params.name);

	if (!skill) {
		error(404, `Skill "${params.name}" not found`);
	}

	const renderedBody = renderMarkdown(skill.body);

	const displayMeta = Object.entries(skill.frontmatter)
		.filter(([k]) => k !== 'name')
		.map(([key, val]) => ({
			key,
			value: Array.isArray(val) ? val.join(', ') : String(val)
		}));

	return { skill, renderedBody, displayMeta };
};

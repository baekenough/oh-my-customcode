import type { PageServerLoad } from './$types';
import { getAgent } from '$lib/server/data';
import { renderMarkdown } from '$lib/server/markdown';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { root } = await parent();
	const agent = await getAgent(root, params.name);

	if (!agent) {
		error(404, `Agent "${params.name}" not found`);
	}

	const renderedBody = renderMarkdown(agent.body);

	// Build clean frontmatter display (exclude body-level fields)
	const displayMeta = Object.entries(agent.frontmatter)
		.filter(([k]) => k !== 'name')
		.map(([key, val]) => ({
			key,
			value: Array.isArray(val) ? val.join(', ') : String(val)
		}));

	return { agent, renderedBody, displayMeta };
};

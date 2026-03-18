import type { PageServerLoad } from './$types';
import { getRule, getProjectRoot } from '$lib/server/data';
import { renderMarkdown } from '$lib/server/markdown';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const root = await getProjectRoot();
	const rule = await getRule(root, params.name);

	if (!rule) {
		error(404, `Rule "${params.name}" not found`);
	}

	const renderedBody = renderMarkdown(rule.body);
	return { rule, renderedBody };
};

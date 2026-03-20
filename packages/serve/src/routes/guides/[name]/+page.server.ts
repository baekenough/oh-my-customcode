import type { PageServerLoad } from './$types';
import { getGuide } from '$lib/server/data';
import { renderMarkdown } from '$lib/server/markdown';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { root } = await parent();
	const guide = await getGuide(root, params.name);

	if (!guide) {
		error(404, `Guide "${params.name}" not found`);
	}

	const renderedBody = renderMarkdown(guide.body);
	return { guide, renderedBody };
};

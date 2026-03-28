import type { PageServerLoad } from './$types';
import { buildGraphData } from '$lib/server/graph-builder.js';

export const load: PageServerLoad = async ({ parent }) => {
	const { root } = await parent();
	const graphData = await buildGraphData(root);
	return { graphData };
};

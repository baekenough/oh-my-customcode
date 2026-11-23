import type { PageServerLoad } from './$types';
import { getAgents } from '#lib/server/data.js';

export const load: PageServerLoad = async ({ parent }) => {
	const { root } = await parent();
	const agents = await getAgents(root);

	// Collect unique domains
	const domains = [...new Set(agents.map((a) => a.domain).filter(Boolean))].sort();

	return { agents, domains };
};

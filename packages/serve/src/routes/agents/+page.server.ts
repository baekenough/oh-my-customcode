import type { PageServerLoad } from './$types';
import { getAgents, getProjectRoot } from '$lib/server/data';

export const load: PageServerLoad = async () => {
	const root = await getProjectRoot();
	const agents = await getAgents(root);

	// Collect unique domains
	const domains = [...new Set(agents.map((a) => a.domain).filter(Boolean))].sort();

	return { agents, domains };
};

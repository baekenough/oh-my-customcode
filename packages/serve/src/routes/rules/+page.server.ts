import type { PageServerLoad } from './$types';
import { getRules, getProjectRoot } from '$lib/server/data';

export const load: PageServerLoad = async () => {
	const root = await getProjectRoot();
	const rules = await getRules(root);
	return { rules };
};

import type { PageServerLoad } from './$types';
import { getSkills } from '$lib/server/data';

export const load: PageServerLoad = async ({ parent }) => {
	const { root } = await parent();
	const skills = await getSkills(root);
	const scopes = [...new Set(skills.map((s) => s.scope))].sort();
	return { skills, scopes };
};

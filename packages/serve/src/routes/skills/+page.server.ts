import type { PageServerLoad } from './$types';
import { getSkills, getProjectRoot } from '$lib/server/data';

export const load: PageServerLoad = async () => {
	const root = await getProjectRoot();
	const skills = await getSkills(root);
	const scopes = [...new Set(skills.map((s) => s.scope))].sort();
	return { skills, scopes };
};

import type { PageServerLoad } from './$types';
import { getGuides } from '$lib/server/data';

export const load: PageServerLoad = async ({ parent }) => {
	const { root } = await parent();
	const guides = await getGuides(root);
	return { guides };
};

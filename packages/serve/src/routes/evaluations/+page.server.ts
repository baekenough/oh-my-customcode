import type { PageServerLoad } from './$types';
import { getEvaluations, getSessionSummaries } from '$lib/server/eval-reader';

export const load: PageServerLoad = async () => {
	const [evaluations, sessions] = await Promise.all([getEvaluations(), getSessionSummaries()]);
	return { evaluations, sessions };
};

import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveEvaluation } from '$lib/server/eval-reader';
import { getSessionSummaries } from '$lib/server/eval-reader';

export const load: PageServerLoad = async () => {
	const sessions = await getSessionSummaries();
	return { sessions };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		const sessionId = String(data.get('sessionId') ?? '').trim();
		const turnId = String(data.get('turnId') ?? '').trim() || undefined;
		const scoreRaw = Number(data.get('score') ?? 3);
		const verdict = String(data.get('verdict') ?? 'pass');
		const tagsRaw = String(data.get('tags') ?? '');
		const comment = String(data.get('comment') ?? '').trim();

		if (!sessionId) {
			return fail(400, { error: 'Session ID is required' });
		}

		const score = Math.min(5, Math.max(1, Math.round(scoreRaw)));

		if (!['pass', 'fail', 'needs_refinement'].includes(verdict)) {
			return fail(400, { error: 'Invalid verdict value' });
		}

		const tags = tagsRaw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		await saveEvaluation({
			sessionId,
			turnId,
			score,
			verdict,
			tags,
			comment,
			evaluatedAt: new Date().toISOString()
		});

		throw redirect(303, '/evaluations');
	}
};

import type { PageServerLoad } from './$types';
import { getAnalytics, type AnalyticsData } from '$lib/server/analytics';
import { readdir } from 'fs/promises';
import { join } from 'path';

interface ProjectDetail {
	agentCount: number;
	skillCount: number;
	guideCount: number;
	ruleCount: number;
}

async function getProjectDetail(root: string): Promise<ProjectDetail> {
	const count = async (dir: string, pattern?: string) => {
		try {
			const entries = await readdir(dir);
			return pattern ? entries.filter((e) => e.endsWith(pattern)).length : entries.length;
		} catch {
			return 0;
		}
	};

	// For skills, count directories containing SKILL.md
	let skillCount = 0;
	try {
		const skillDirs = await readdir(join(root, '.claude', 'skills'));
		for (const d of skillDirs) {
			try {
				await readdir(join(root, '.claude', 'skills', d)); // check it's a dir
				skillCount++;
			} catch {
				/* skip files */
			}
		}
	} catch {
		/* no skills dir */
	}

	return {
		agentCount: await count(join(root, '.claude', 'agents'), '.md'),
		skillCount,
		guideCount: await count(join(root, 'guides')),
		ruleCount: await count(join(root, '.claude', 'rules'), '.md')
	};
}

export const load: PageServerLoad = async ({ parent }) => {
	const { root, selectedProject } = await parent();

	// Analytics loaded separately so a failure doesn't break the entire page
	let analytics: AnalyticsData | null = null;
	try {
		analytics = await getAnalytics(root);
		// Treat zero-invocation data as "no analytics yet" so the UI can show
		// an appropriate empty state rather than zeros everywhere.
		if (analytics.totalInvocations === 0 && analytics.sessions.thisMonth === 0) {
			analytics = null;
		}
	} catch {
		analytics = null;
	}

	const projectDetail = await getProjectDetail(root);

	return {
		root,
		selectedProject,
		analytics,
		projectDetail
	};
};

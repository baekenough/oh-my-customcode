import type { PageServerLoad } from './$types';
import { getAnalytics, type AnalyticsData } from '$lib/server/analytics';
import { findProjectsForServe } from '$lib/server/projects';


export const load: PageServerLoad = async ({ parent }) => {
	const { root, selectedProject } = await parent();

	const allProjects = await findProjectsForServe();

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

	// Summary across all discovered projects
	const projectSummary = {
		total: allProjects.length,
		latest: allProjects.filter((p) => p.status === 'latest').length,
		outdated: allProjects.filter((p) => p.status === 'outdated').length,
		unknown: allProjects.filter((p) => p.status === 'unknown').length
	};

	return {
		root,
		selectedProject,
		projectSummary,
		projects: allProjects.slice(0, 6), // Show up to 6 projects on dashboard
		analytics
	};
};

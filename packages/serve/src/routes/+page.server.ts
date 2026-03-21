import type { PageServerLoad } from './$types';
import { getAgents, getSkills, getGuides, getRules } from '$lib/server/data';
import { getAnalytics, type AnalyticsData } from '$lib/server/analytics';
import { findProjectsForServe } from '$lib/server/projects';


export const load: PageServerLoad = async ({ parent }) => {
	const { root, selectedProject } = await parent();

	const [agents, skills, guides, rules, allProjects] = await Promise.all([
		getAgents(root),
		getSkills(root),
		getGuides(root),
		getRules(root),
		findProjectsForServe()
	]);

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

	// Project-level counts for currently selected project
	const projectStats = {
		agents: agents.length,
		skills: skills.length,
		guides: guides.length,
		rules: rules.length
	};

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
		projectStats,
		projectSummary,
		projects: allProjects.slice(0, 6), // Show up to 6 projects on dashboard
		analytics
	};
};

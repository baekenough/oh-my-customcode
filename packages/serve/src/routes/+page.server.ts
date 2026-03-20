import type { PageServerLoad } from './$types';
import { getAgents, getSkills } from '$lib/server/data';
import { getAnalytics } from '$lib/server/analytics';
import { findProjectsForServe } from '$lib/server/projects';

export const load: PageServerLoad = async ({ parent }) => {
	const { root, selectedProject } = await parent();

	const [agents, skills, analytics, allProjects] = await Promise.all([
		getAgents(root),
		getSkills(root),
		getAnalytics(root),
		findProjectsForServe()
	]);

	// Project-level counts for currently selected project
	const projectStats = {
		agents: agents.length,
		skills: skills.length
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

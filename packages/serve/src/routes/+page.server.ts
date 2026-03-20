import type { PageServerLoad } from './$types';
import { getAgents, getSkills, getGuides, getRules } from '$lib/server/data';
import { getAnalytics, type AnalyticsData } from '$lib/server/analytics';
import { findProjectsForServe } from '$lib/server/projects';

const AGENT_TYPES: { label: string; pattern: RegExp }[] = [
	{ label: 'SW Engineer / Language', pattern: /^lang-/ },
	{ label: 'SW Engineer / Backend', pattern: /^be-/ },
	{ label: 'SW Engineer / Frontend', pattern: /^fe-/ },
	{ label: 'SW Engineer / Tooling', pattern: /^tool-/ },
	{ label: 'Data Engineering', pattern: /^de-/ },
	{ label: 'Database', pattern: /^db-/ },
	{ label: 'Security', pattern: /^sec-/ },
	{ label: 'Architecture', pattern: /^arch-/ },
	{ label: 'Infrastructure', pattern: /^infra-/ },
	{ label: 'QA', pattern: /^qa-/ },
	{ label: 'Manager', pattern: /^mgr-/ },
	{ label: 'System', pattern: /^sys-/ }
];

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

	// Agent type breakdown for current project
	const typeBreakdown = AGENT_TYPES.map(({ label, pattern }) => ({
		label,
		count: agents.filter((a) => pattern.test(a.name)).length
	})).filter((t) => t.count > 0);
	const categorized = agents.filter((a) =>
		AGENT_TYPES.some(({ pattern }) => pattern.test(a.name))
	).length;
	const uncategorized = agents.length - categorized;
	if (uncategorized > 0) {
		typeBreakdown.push({ label: 'Other', count: uncategorized });
	}

	// Rule priority breakdown
	const priorityBreakdown = (['MUST', 'SHOULD', 'MAY'] as const).map((p) => ({
		priority: p,
		count: rules.filter((r) => r.priority === p).length
	}));

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
		typeBreakdown,
		priorityBreakdown,
		projectSummary,
		projects: allProjects.slice(0, 6), // Show up to 6 projects on dashboard
		analytics
	};
};

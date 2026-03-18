import type { PageServerLoad } from './$types';
import { getAgents, getSkills, getGuides, getRules, getProjectRoot } from '$lib/server/data';
import { getAnalytics } from '$lib/server/analytics';

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

export const load: PageServerLoad = async () => {
	const root = await getProjectRoot();
	const [agents, skills, guides, rules, analytics] = await Promise.all([
		getAgents(root),
		getSkills(root),
		getGuides(root),
		getRules(root),
		getAnalytics(root)
	]);

	// Build type breakdown
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

	// Skill scope breakdown
	const scopeBreakdown = (['core', 'harness', 'package'] as const).map((scope) => ({
		scope,
		count: skills.filter((s) => s.scope === scope).length
	}));

	// Rule priority breakdown
	const priorityBreakdown = (['MUST', 'SHOULD', 'MAY'] as const).map((p) => ({
		priority: p,
		count: rules.filter((r) => r.priority === p).length
	}));

	return {
		counts: {
			agents: agents.length,
			skills: skills.length,
			guides: guides.length,
			rules: rules.length
		},
		typeBreakdown,
		scopeBreakdown,
		priorityBreakdown,
		root,
		analytics
	};
};

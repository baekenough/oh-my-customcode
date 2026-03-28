import { getAgents, getSkills, getGuides } from './data.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
	id: string;
	label: string;
	type: 'agent' | 'skill' | 'guide';
	domain?: string;  // for agents
	scope?: string;   // for skills
	model?: string;   // for agents
}

export interface GraphEdge {
	source: string;
	target: string;
	relation: 'requires' | 'routes_to';
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export async function buildGraphData(root: string): Promise<GraphData> {
	const [agents, skills, guides] = await Promise.all([
		getAgents(root),
		getSkills(root),
		getGuides(root)
	]);

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	// Build a skill name set for validation
	const skillNames = new Set(skills.map((s) => s.name));

	// Agent nodes + requires edges
	for (const agent of agents) {
		nodes.push({
			id: agent.name,
			label: agent.name,
			type: 'agent',
			domain: agent.domain || undefined,
			model: agent.model || undefined
		});

		// agent.skills → requires edges
		for (const skillRef of agent.skills) {
			if (skillNames.has(skillRef)) {
				edges.push({ source: agent.name, target: skillRef, relation: 'requires' });
			}
		}
	}

	// Skill nodes (collect routes_to data for deferred edge creation)
	const pendingRoutesTo: Array<{ skillName: string; targets: string[] }> = [];

	for (const skill of skills) {
		nodes.push({
			id: skill.name,
			label: skill.name,
			type: 'skill',
			scope: skill.scope || 'core'
		});

		const routesTo = skill.frontmatter['routes_to'];
		if (Array.isArray(routesTo)) {
			pendingRoutesTo.push({
				skillName: skill.name,
				targets: routesTo.map((t) => String(t))
			});
		}
	}

	// Guide nodes (no edges from frontmatter)
	for (const guide of guides) {
		nodes.push({
			id: guide.name,
			label: guide.name,
			type: 'guide'
		});
	}

	// Build complete node ID set for edge target validation
	const allNodeIds = new Set(nodes.map((n) => n.id));

	// routes_to edges — only add when target node exists
	for (const { skillName, targets } of pendingRoutesTo) {
		for (const t of targets) {
			if (allNodeIds.has(t)) {
				edges.push({ source: skillName, target: t, relation: 'routes_to' });
			}
		}
	}

	return { nodes, edges };
}

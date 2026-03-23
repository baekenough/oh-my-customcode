import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { parseFrontmatter } from './frontmatter.js';

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

async function findProjectRoot(startDir: string): Promise<string> {
	let dir = startDir;
	for (let i = 0; i < 20; i++) {
		try {
			await stat(join(dir, 'CLAUDE.md'));
			return dir;
		} catch {
			const parent = join(dir, '..');
			if (parent === dir) break;
			dir = parent;
		}
	}

	// fallback — use cwd
	return startDir;
}

let _rootPromise: Promise<string> | null = null;

export async function getProjectRoot(): Promise<string> {
	// Always honor env var (may change between server restarts via child_process)
	if (process.env.OMX_PROJECT_ROOT) {
		return process.env.OMX_PROJECT_ROOT;
	}
	// Cache the filesystem traversal result for the process lifetime
	if (!_rootPromise) {
		_rootPromise = findProjectRoot(process.cwd());
	}
	return _rootPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentInfo {
	name: string;
	description: string;
	model: string;
	domain: string;
	tools: string[];
	skills: string[];
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface SkillInfo {
	name: string;
	description: string;
	scope: string;
	contextFork: boolean;
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface GuideInfo {
	name: string;
	exists: boolean;
}

export interface GuideDetail {
	name: string;
	body: string;
	frontmatter: Record<string, unknown>;
}

export interface RuleInfo {
	name: string;
	id: string;
	priority: string;
	description: string;
	frontmatter: Record<string, unknown>;
	body: string;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function getAgents(root: string): Promise<AgentInfo[]> {
	const dir = join(root, '.claude', 'agents');
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return [];
	}

	const agents: AgentInfo[] = [];
	for (const file of files) {
		if (!file.endsWith('.md')) continue;
		const name = basename(file, '.md');
		const content = await readFile(join(dir, file), 'utf-8');
		const { frontmatter, body } = parseFrontmatter(content);

		agents.push({
			name,
			description: String(frontmatter.description ?? ''),
			model: String(frontmatter.model ?? 'sonnet'),
			domain: String(frontmatter.domain ?? ''),
			tools: arrayField(frontmatter.tools),
			skills: arrayField(frontmatter.skills),
			frontmatter,
			body
		});
	}

	return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgent(root: string, name: string): Promise<AgentInfo | null> {
	const filePath = join(root, '.claude', 'agents', `${name}.md`);
	let content: string;
	try {
		content = await readFile(filePath, 'utf-8');
	} catch {
		return null;
	}
	const { frontmatter, body } = parseFrontmatter(content);
	return {
		name,
		description: String(frontmatter.description ?? ''),
		model: String(frontmatter.model ?? 'sonnet'),
		domain: String(frontmatter.domain ?? ''),
		tools: arrayField(frontmatter.tools),
		skills: arrayField(frontmatter.skills),
		frontmatter,
		body
	};
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function getSkills(root: string): Promise<SkillInfo[]> {
	const dir = join(root, '.claude', 'skills');
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	const skills: SkillInfo[] = [];
	for (const entry of entries) {
		const skillFile = join(dir, entry, 'SKILL.md');
		let content: string;
		try {
			content = await readFile(skillFile, 'utf-8');
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter(content);
		skills.push({
			name: String(frontmatter.name ?? entry),
			description: String(frontmatter.description ?? ''),
			scope: String(frontmatter.scope ?? 'core'),
			contextFork: frontmatter.context === 'fork',
			frontmatter,
			body
		});
	}

	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkill(root: string, name: string): Promise<SkillInfo | null> {
	const skillFile = join(root, '.claude', 'skills', name, 'SKILL.md');
	let content: string;
	try {
		content = await readFile(skillFile, 'utf-8');
	} catch {
		return null;
	}
	const { frontmatter, body } = parseFrontmatter(content);
	return {
		name: String(frontmatter.name ?? name),
		description: String(frontmatter.description ?? ''),
		scope: String(frontmatter.scope ?? 'core'),
		contextFork: frontmatter.context === 'fork',
		frontmatter,
		body
	};
}

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

export async function getGuides(root: string): Promise<GuideInfo[]> {
	const dir = join(root, 'guides');
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	const guides: GuideInfo[] = [];
	for (const entry of entries) {
		try {
			const s = await stat(join(dir, entry));
			if (s.isDirectory()) {
				guides.push({ name: entry, exists: true });
			}
		} catch {
			// skip
		}
	}

	return guides.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGuide(root: string, name: string): Promise<GuideDetail | null> {
	const readmePath = join(root, 'guides', name, 'README.md');
	let content: string;
	try {
		content = await readFile(readmePath, 'utf-8');
	} catch {
		// Try index.md fallback
		try {
			content = await readFile(join(root, 'guides', name, 'index.md'), 'utf-8');
		} catch {
			return null;
		}
	}
	const { frontmatter, body } = parseFrontmatter(content);
	return { name, body, frontmatter };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function getRules(root: string): Promise<RuleInfo[]> {
	const dir = join(root, '.claude', 'rules');
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return [];
	}

	const rules: RuleInfo[] = [];
	for (const file of files) {
		if (!file.endsWith('.md')) continue;
		const content = await readFile(join(dir, file), 'utf-8');
		const { frontmatter, body } = parseFrontmatter(content);

		// Extract priority and ID from filename: MUST-agent-design.md or body H1
		const filenameMatch = file.match(/^(MUST|SHOULD|MAY)-(.+)\.md$/i);
		const priority = filenameMatch ? filenameMatch[1].toUpperCase() : 'UNKNOWN';
		const ruleName = filenameMatch ? filenameMatch[2] : basename(file, '.md');

		// Extract ID from body: "R007" pattern
		const idMatch = body.match(/\bR\d{3}\b/);
		const id = idMatch ? idMatch[0] : '';

		rules.push({
			name: ruleName,
			id,
			priority,
			description: String(frontmatter.description ?? extractFirstHeading(body)),
			frontmatter,
			body
		});
	}

	return rules.sort((a, b) => {
		// Sort: MUST first, then SHOULD, then MAY; within group by ID
		const order: Record<string, number> = { MUST: 0, SHOULD: 1, MAY: 2, UNKNOWN: 3 };
		const po = (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
		if (po !== 0) return po;
		return a.id.localeCompare(b.id);
	});
}

export async function getRule(root: string, name: string): Promise<RuleInfo | null> {
	// name is the slug — try to find the file by checking all files
	const dir = join(root, '.claude', 'rules');
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return null;
	}

	// Match by name portion of filename
	const matched = files.find((f) => {
		const base = basename(f, '.md');
		// name could be "MUST-agent-design" or just "agent-design"
		return base === name || base.toLowerCase().endsWith(`-${name}`) || base === `MUST-${name}` || base === `SHOULD-${name}` || base === `MAY-${name}`;
	});

	if (!matched) return null;

	const content = await readFile(join(dir, matched), 'utf-8');
	const { frontmatter, body } = parseFrontmatter(content);

	const filenameMatch = matched.match(/^(MUST|SHOULD|MAY)-(.+)\.md$/i);
	const priority = filenameMatch ? filenameMatch[1].toUpperCase() : 'UNKNOWN';
	const ruleName = filenameMatch ? filenameMatch[2] : basename(matched, '.md');
	const idMatch = body.match(/\bR\d{3}\b/);
	const id = idMatch ? idMatch[0] : '';

	return {
		name: ruleName,
		id,
		priority,
		description: String(frontmatter.description ?? extractFirstHeading(body)),
		frontmatter,
		body
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayField(val: unknown): string[] {
	if (Array.isArray(val)) return val.map(String);
	if (typeof val === 'string') return [val];
	return [];
}

function extractFirstHeading(body: string): string {
	const match = body.match(/^#{1,3}\s+(.+)$/m);
	return match ? match[1].replace(/\*\*/g, '').trim() : '';
}

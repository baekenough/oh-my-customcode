// Keyword-based natural language parser for skill generation.
// No external API dependencies — pure keyword inference.

export interface GeneratedSkill {
	name: string;        // kebab-case
	description: string; // one-line English description
	scope: string;       // core | harness | package
	contextFork: boolean; // true for routing/orchestration skills
	body: string;        // skill instructions markdown
}

// ---------------------------------------------------------------------------
// Scope inference
// ---------------------------------------------------------------------------

const HARNESS_KEYWORDS = [
	'agent', 'skill', 'rule', 'hook', 'manifest', 'routing', 'sauron',
	'에이전트', '스킬', '규칙', '훅', '라우팅', 'creator', 'updater',
	'supplier', 'validation', 'sync', 'audit', 'template'
];

const PACKAGE_KEYWORDS = [
	'npm', 'publish', 'package', 'registry', 'release', 'version',
	'semver', 'changelog', 'dist', 'bundle', 'bun', '패키지', '배포', '릴리즈'
];

// ---------------------------------------------------------------------------
// Context fork inference (routing / orchestration skills)
// ---------------------------------------------------------------------------

const CONTEXT_FORK_KEYWORDS = [
	'routing', 'orchestration', 'pipeline', 'workflow', 'coordination',
	'multi-agent', 'multiagent', 'delegate', 'dispatch', 'route',
	'라우팅', '오케스트레이션', '파이프라인', '워크플로우', '위임', '분배'
];

// ---------------------------------------------------------------------------
// Tech keyword extraction for name generation
// ---------------------------------------------------------------------------

interface TechSlug {
	keyword: string;
	slug: string;
}

const TECH_SLUGS: TechSlug[] = [
	// Frontend frameworks
	{ keyword: 'react', slug: 'react' },
	{ keyword: 'vue', slug: 'vue' },
	{ keyword: 'svelte', slug: 'svelte' },
	{ keyword: 'angular', slug: 'angular' },
	{ keyword: 'nextjs', slug: 'nextjs' },
	{ keyword: 'next.js', slug: 'nextjs' },
	// Backend
	{ keyword: 'fastapi', slug: 'fastapi' },
	{ keyword: 'django', slug: 'django' },
	{ keyword: 'spring', slug: 'spring' },
	{ keyword: 'nestjs', slug: 'nestjs' },
	{ keyword: 'express', slug: 'express' },
	{ keyword: 'golang', slug: 'go' },
	{ keyword: 'python', slug: 'python' },
	{ keyword: 'rust', slug: 'rust' },
	{ keyword: 'kotlin', slug: 'kotlin' },
	{ keyword: 'typescript', slug: 'ts' },
	// Infrastructure
	{ keyword: 'kubernetes', slug: 'k8s' },
	{ keyword: 'k8s', slug: 'k8s' },
	{ keyword: 'docker', slug: 'docker' },
	{ keyword: 'terraform', slug: 'terraform' },
	{ keyword: 'aws', slug: 'aws' },
	// Data
	{ keyword: 'airflow', slug: 'airflow' },
	{ keyword: 'spark', slug: 'spark' },
	{ keyword: 'kafka', slug: 'kafka' },
	{ keyword: 'dbt', slug: 'dbt' },
	// DB
	{ keyword: 'postgresql', slug: 'postgres' },
	{ keyword: 'postgres', slug: 'postgres' },
	{ keyword: 'redis', slug: 'redis' },
	{ keyword: 'mongodb', slug: 'mongo' },
	{ keyword: 'supabase', slug: 'supabase' }
];

// Action verbs for action-target name pattern
const ACTION_VERB_MAP: Record<string, string> = {
	'review': 'review',
	'리뷰': 'review',
	'audit': 'audit',
	'감사': 'audit',
	'generate': 'generate',
	'생성': 'generate',
	'deploy': 'deploy',
	'배포': 'deploy',
	'test': 'test',
	'테스트': 'test',
	'analyze': 'analyze',
	'분석': 'analyze',
	'optimize': 'optimize',
	'최적화': 'optimize',
	'monitor': 'monitor',
	'모니터링': 'monitor',
	'debug': 'debug',
	'디버깅': 'debug',
	'migrate': 'migrate',
	'마이그레이션': 'migrate',
	'document': 'document',
	'문서화': 'document',
	'validate': 'validate',
	'검증': 'validate',
	'refactor': 'refactor',
	'리팩터': 'refactor'
};

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseSkillNaturalLanguage(input: string): GeneratedSkill {
	const lower = ` ${input.toLowerCase()} `;

	// --- Scope inference ---
	let scope = 'core';
	if (HARNESS_KEYWORDS.some((kw) => lower.includes(kw))) {
		scope = 'harness';
	} else if (PACKAGE_KEYWORDS.some((kw) => lower.includes(kw))) {
		scope = 'package';
	}

	// --- Context fork inference ---
	const contextFork = CONTEXT_FORK_KEYWORDS.some((kw) => lower.includes(kw));

	// --- Name generation ---
	// Try tech slug first → {tech}-best-practices
	let name = '';
	for (const { keyword, slug } of TECH_SLUGS) {
		if (lower.includes(keyword)) {
			// Check for action verbs to use action-target pattern
			for (const [verb, verbSlug] of Object.entries(ACTION_VERB_MAP)) {
				if (lower.includes(verb)) {
					name = `${verbSlug}-${slug}`;
					break;
				}
			}
			if (!name) {
				name = `${slug}-best-practices`;
			}
			break;
		}
	}

	// If no tech slug, try action verb + target noun
	if (!name) {
		let actionSlug = '';
		for (const [verb, verbSlug] of Object.entries(ACTION_VERB_MAP)) {
			if (lower.includes(verb)) {
				actionSlug = verbSlug;
				break;
			}
		}

		// Extract a target noun (first meaningful non-verb English word ≥ 3 chars)
		const words = input
			.split(/\s+/)
			.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
			.filter((w) => w.length >= 3 && /^[a-z]/.test(w) && !Object.keys(ACTION_VERB_MAP).includes(w));

		if (actionSlug && words.length > 0) {
			name = `${actionSlug}-${words[0]}`;
		} else if (actionSlug) {
			name = `${actionSlug}-skill`;
		} else if (words.length > 0) {
			// routing/orchestration pattern
			if (contextFork) {
				name = `${words[0]}-routing`;
			} else {
				name = `${words[0]}-best-practices`;
			}
		} else {
			name = 'custom-skill';
		}
	}

	// Ensure kebab-case
	name = sanitizeSkillName(name);

	// --- Description ---
	const firstSentence = input.split(/[.!?。\n]/)[0].trim();
	const description =
		firstSentence.length > 80 ? firstSentence.slice(0, 77) + '...' : firstSentence;

	// --- Body generation ---
	const body = buildSkillBody(input, scope, contextFork);

	return {
		name,
		description,
		scope,
		contextFork,
		body
	};
}

function buildSkillBody(input: string, scope: string, contextFork: boolean): string {
	// Extract bullet points from input if present
	const bulletLines = input
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => /^[-*•]/.test(l))
		.slice(0, 5)
		.map((l) => `- ${l.replace(/^[-*•]\s*/, '')}`);

	const whenSection =
		bulletLines.length > 0
			? bulletLines.join('\n')
			: defaultWhenToUse(scope, contextFork);

	return `## When to Use

${whenSection}

## Instructions

1. Analyze the context and requirements
2. Apply the skill's expertise to the task
3. Verify the output meets quality standards
4. Report results with actionable recommendations

## Checklist

- [ ] Requirements clearly understood
- [ ] Best practices applied
- [ ] Output reviewed for accuracy
- [ ] Results documented
`;
}

function defaultWhenToUse(scope: string, contextFork: boolean): string {
	if (contextFork) {
		return `- When routing tasks to specialized agents
- When coordinating multi-agent workflows
- When orchestrating complex pipelines`;
	}

	const defaults: Record<string, string> = {
		harness: `- When managing agents, skills, or rules
- When performing system maintenance tasks
- When validating structural integrity`,
		package: `- When publishing packages to registries
- When managing package versioning
- When auditing package dependencies`,
		core: `- When applying domain expertise to a task
- When reviewing code or configurations
- When implementing best practices`
	};

	return defaults[scope] ?? defaults.core;
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

export function buildSkillMarkdown(skill: GeneratedSkill): string {
	const contextLine = skill.contextFork ? '\ncontext: fork' : '';
	return `---
name: ${skill.name}
description: ${skill.description}
scope: ${skill.scope}${contextLine}
---

${skill.body}`;
}

// ---------------------------------------------------------------------------
// Name sanitization (kebab-case only)
// ---------------------------------------------------------------------------

export function sanitizeSkillName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

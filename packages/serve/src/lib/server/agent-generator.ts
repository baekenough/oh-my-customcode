// Keyword-based natural language parser for agent generation.
// No external API dependencies — pure keyword inference.

export interface GeneratedAgent {
	name: string;
	description: string;
	model: string;
	domain: string;
	tools: string[];
	skills: string[];
	body: string;
}

// ---------------------------------------------------------------------------
// Domain inference
// ---------------------------------------------------------------------------

interface DomainRule {
	domain: string;
	prefix: string;
	keywords: string[];
}

const DOMAIN_RULES: DomainRule[] = [
	{
		domain: 'backend',
		prefix: 'be',
		keywords: [
			'fastapi', 'django', 'flask', 'express', 'nestjs', 'spring', 'springboot',
			'api', 'rest', 'graphql', 'grpc', 'server', '서버', '백엔드', 'backend',
			'microservice', '마이크로서비스'
		]
	},
	{
		domain: 'frontend',
		prefix: 'fe',
		keywords: [
			'react', 'vue', 'svelte', 'angular', 'next.js', 'nextjs', 'nuxt',
			'flutter', 'ui', 'ux', 'frontend', '프론트', '프론트엔드',
			'component', '컴포넌트', 'tailwind', 'css', 'html', 'web'
		]
	},
	{
		domain: 'devops',
		prefix: 'infra',
		keywords: [
			'kubernetes', 'k8s', 'docker', 'helm', 'terraform', 'ansible',
			'ci/cd', 'cicd', 'github actions', 'jenkins', 'aws', 'gcp', 'azure',
			'devops', '인프라', 'infra', 'deployment', '배포', 'cloud', '클라우드',
			'kubectl', 'pod', 'container', '컨테이너'
		]
	},
	{
		domain: 'database',
		prefix: 'db',
		keywords: [
			'postgresql', 'postgres', 'mysql', 'sqlite', 'redis', 'mongodb',
			'supabase', 'database', 'db', '데이터베이스', 'sql', 'nosql',
			'orm', 'drizzle', 'prisma', 'migration', '마이그레이션'
		]
	},
	{
		domain: 'data-engineering',
		prefix: 'de',
		keywords: [
			'airflow', 'spark', 'kafka', 'dbt', 'snowflake', 'hadoop',
			'pipeline', '파이프라인', 'etl', 'elt', 'data engineering',
			'데이터 엔지니어링', 'streaming', 'batch', 'warehouse', 'lakehouse',
			'flink', 'beam', 'bigquery'
		]
	},
	{
		domain: 'security',
		prefix: 'sec',
		keywords: [
			'security', '보안', 'cve', 'vulnerability', '취약점', 'codeql',
			'sast', 'dast', 'pentest', 'auth', 'authentication', 'authorization',
			'oauth', 'jwt', 'encryption', '암호화', 'firewall', 'waf'
		]
	},
	{
		domain: 'qa',
		prefix: 'qa',
		keywords: [
			'test', 'testing', '테스트', 'qa', 'quality', '품질',
			'unit test', 'e2e', 'integration test', 'playwright', 'cypress',
			'jest', 'pytest', 'vitest', 'tdd', 'bdd', 'coverage'
		]
	},
	{
		domain: 'architecture',
		prefix: 'arch',
		keywords: [
			'architecture', '아키텍처', 'design pattern', 'design', '설계',
			'ddd', 'cqrs', 'event sourcing', 'microservices', 'system design',
			'documentation', 'docs', '문서', 'spec', 'adr'
		]
	}
];

// Language-specific domain overrides
const LANG_RULES: Array<{ keywords: string[]; prefix: string; domain: string }> = [
	{ keywords: ['go', 'golang'], prefix: 'lang-go', domain: 'backend' },
	{ keywords: ['python', 'py'], prefix: 'lang-python', domain: 'backend' },
	{ keywords: ['rust'], prefix: 'lang-rust', domain: 'backend' },
	{ keywords: ['kotlin'], prefix: 'lang-kotlin', domain: 'backend' },
	{ keywords: ['typescript', 'ts'], prefix: 'lang-ts', domain: 'backend' },
	{ keywords: ['java'], prefix: 'lang-java', domain: 'backend' }
];

// ---------------------------------------------------------------------------
// Model inference
// ---------------------------------------------------------------------------

const MODEL_RULES: Array<{ model: string; keywords: string[] }> = [
	{
		model: 'opus',
		keywords: ['opus', '복잡', 'complex', 'architecture', '아키텍처', 'design', '설계', 'reasoning', 'analysis']
	},
	{
		model: 'haiku',
		keywords: ['haiku', '빠른', 'fast', 'simple', 'search', '검색', '간단', 'lightweight', 'quick']
	}
];

// ---------------------------------------------------------------------------
// Tech keyword extraction for name generation
// ---------------------------------------------------------------------------

const TECH_KEYWORDS: Array<{ keyword: string; slug: string }> = [
	// Infra
	{ keyword: 'kubernetes', slug: 'k8s' },
	{ keyword: 'k8s', slug: 'k8s' },
	{ keyword: 'docker', slug: 'docker' },
	{ keyword: 'helm', slug: 'helm' },
	{ keyword: 'terraform', slug: 'terraform' },
	{ keyword: 'aws', slug: 'aws' },
	// DB
	{ keyword: 'postgresql', slug: 'postgres' },
	{ keyword: 'postgres', slug: 'postgres' },
	{ keyword: 'redis', slug: 'redis' },
	{ keyword: 'mongodb', slug: 'mongo' },
	{ keyword: 'supabase', slug: 'supabase' },
	// FE
	{ keyword: 'react', slug: 'react' },
	{ keyword: 'vue', slug: 'vue' },
	{ keyword: 'svelte', slug: 'svelte' },
	{ keyword: 'flutter', slug: 'flutter' },
	{ keyword: 'next.js', slug: 'nextjs' },
	{ keyword: 'nextjs', slug: 'nextjs' },
	// BE
	{ keyword: 'fastapi', slug: 'fastapi' },
	{ keyword: 'django', slug: 'django' },
	{ keyword: 'spring', slug: 'spring' },
	{ keyword: 'nestjs', slug: 'nestjs' },
	{ keyword: 'express', slug: 'express' },
	// DE
	{ keyword: 'airflow', slug: 'airflow' },
	{ keyword: 'spark', slug: 'spark' },
	{ keyword: 'kafka', slug: 'kafka' },
	{ keyword: 'dbt', slug: 'dbt' },
	{ keyword: 'snowflake', slug: 'snowflake' },
	// Lang
	{ keyword: 'golang', slug: 'go' },
	{ keyword: ' go ', slug: 'go' },
	{ keyword: 'python', slug: 'python' },
	{ keyword: 'rust', slug: 'rust' },
	{ keyword: 'kotlin', slug: 'kotlin' },
	{ keyword: 'typescript', slug: 'ts' }
];

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseNaturalLanguage(input: string): GeneratedAgent {
	const lower = ` ${input.toLowerCase()} `;

	// --- Model inference ---
	let model = 'sonnet';
	for (const rule of MODEL_RULES) {
		if (rule.keywords.some((kw) => lower.includes(kw))) {
			model = rule.model;
			break;
		}
	}

	// --- Domain inference ---
	let domain = 'universal';
	let prefix = 'agent';

	// Check language-specific rules first (higher specificity)
	for (const rule of LANG_RULES) {
		if (rule.keywords.some((kw) => lower.includes(` ${kw} `) || lower.includes(`${kw}\n`))) {
			domain = rule.domain;
			prefix = rule.prefix;
			break;
		}
	}

	// Fall back to domain rules
	if (domain === 'universal') {
		for (const rule of DOMAIN_RULES) {
			if (rule.keywords.some((kw) => lower.includes(kw))) {
				domain = rule.domain;
				prefix = rule.prefix;
				break;
			}
		}
	}

	// --- Tech keyword slug for name ---
	let techSlug = '';
	for (const { keyword, slug } of TECH_KEYWORDS) {
		if (lower.includes(keyword)) {
			techSlug = slug;
			break;
		}
	}

	// --- Name generation ---
	let name: string;
	if (techSlug) {
		name = `${prefix}-${techSlug}-expert`;
	} else {
		// Extract a meaningful word from input (first noun-like token ≥ 3 chars, non-Korean)
		const words = input
			.split(/\s+/)
			.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
			.filter((w) => w.length >= 3 && /^[a-z]/.test(w));
		const candidate = words[0] ?? 'custom';
		name = `${prefix}-${candidate}-expert`;
	}

	// Ensure kebab-case
	name = name.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

	// --- Description ---
	// Use first sentence of input, capped at 80 chars
	const firstSentence = input.split(/[.!?。\n]/)[0].trim();
	const description =
		firstSentence.length > 80 ? firstSentence.slice(0, 77) + '...' : firstSentence;

	// --- Default tools ---
	const tools = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'];

	// --- Body generation ---
	// Extract capability hints from input (lines starting with -, *, • or containing "가능", "can")
	const capabilityLines = input
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => /^[-*•]/.test(l) || l.includes('가능') || l.includes(' can '))
		.slice(0, 5)
		.map((l) => `- ${l.replace(/^[-*•]\s*/, '')}`);

	// If no explicit capability lines, extract tech terms
	const capabilitiesSection =
		capabilityLines.length > 0
			? capabilityLines.join('\n')
			: inferCapabilities(input, domain);

	const body = `# ${description}

## Role

${input.trim()}

## Capabilities

${capabilitiesSection}

## Workflow

1. Analyze the task requirements
2. Implement the solution following best practices
3. Verify the results
`;

	return {
		name,
		description,
		model,
		domain,
		tools,
		skills: [],
		body
	};
}

function inferCapabilities(input: string, domain: string): string {
	const domainDefaults: Record<string, string[]> = {
		backend: ['- Design and implement RESTful APIs', '- Write server-side business logic', '- Handle database interactions'],
		frontend: ['- Build responsive UI components', '- Implement client-side logic', '- Optimize rendering performance'],
		devops: ['- Write infrastructure as code', '- Configure CI/CD pipelines', '- Manage container deployments'],
		database: ['- Design database schemas', '- Write optimized queries', '- Manage migrations'],
		'data-engineering': ['- Build data pipelines', '- Transform and validate data', '- Optimize batch processing'],
		security: ['- Perform security audits', '- Identify vulnerabilities', '- Implement security controls'],
		qa: ['- Write unit and integration tests', '- Set up test automation', '- Analyze test coverage'],
		architecture: ['- Design system architecture', '- Document architectural decisions', '- Review code for patterns'],
		universal: ['- Analyze task requirements', '- Implement solutions', '- Review and verify results']
	};

	const lines = domainDefaults[domain] ?? domainDefaults.universal;
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Frontmatter builder
// ---------------------------------------------------------------------------

export function buildAgentMarkdown(agent: GeneratedAgent): string {
	const toolsList = agent.tools.map((t) => `  - ${t}`).join('\n');
	const skillsList =
		agent.skills.length > 0 ? `\nskills:\n${agent.skills.map((s) => `  - ${s}`).join('\n')}` : '';

	return `---
name: ${agent.name}
description: ${agent.description}
model: ${agent.model}
domain: ${agent.domain}
tools:
${toolsList}${skillsList}
---

${agent.body}`;
}

// ---------------------------------------------------------------------------
// Name sanitization (kebab-case only)
// ---------------------------------------------------------------------------

export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

// Keyword-based natural language parser for guide generation.
// No external API dependencies — pure keyword inference.
// Guides are pure markdown reference documents with NO frontmatter.

export interface GeneratedGuide {
	name: string; // kebab-case directory name
	body: string; // README.md content (pure markdown, NO frontmatter)
}

// ---------------------------------------------------------------------------
// Tech keyword extraction for name generation
// ---------------------------------------------------------------------------

const TECH_KEYWORDS: Array<{ keyword: string; slug: string }> = [
	// Infra
	{ keyword: 'kubernetes', slug: 'kubernetes' },
	{ keyword: 'k8s', slug: 'kubernetes' },
	{ keyword: 'docker', slug: 'docker' },
	{ keyword: 'helm', slug: 'helm' },
	{ keyword: 'terraform', slug: 'terraform' },
	{ keyword: 'aws', slug: 'aws' },
	{ keyword: 'gcp', slug: 'gcp' },
	{ keyword: 'azure', slug: 'azure' },
	// DB
	{ keyword: 'postgresql', slug: 'postgresql' },
	{ keyword: 'postgres', slug: 'postgresql' },
	{ keyword: 'redis', slug: 'redis' },
	{ keyword: 'mongodb', slug: 'mongodb' },
	{ keyword: 'supabase', slug: 'supabase' },
	{ keyword: 'sqlite', slug: 'sqlite' },
	// FE
	{ keyword: 'react', slug: 'react' },
	{ keyword: 'vue', slug: 'vue' },
	{ keyword: 'svelte', slug: 'svelte' },
	{ keyword: 'flutter', slug: 'flutter' },
	{ keyword: 'next.js', slug: 'nextjs' },
	{ keyword: 'nextjs', slug: 'nextjs' },
	{ keyword: 'tailwind', slug: 'tailwind' },
	// BE
	{ keyword: 'fastapi', slug: 'fastapi' },
	{ keyword: 'django', slug: 'django' },
	{ keyword: 'spring', slug: 'spring' },
	{ keyword: 'nestjs', slug: 'nestjs' },
	{ keyword: 'express', slug: 'express' },
	{ keyword: 'grpc', slug: 'grpc' },
	// DE
	{ keyword: 'airflow', slug: 'airflow' },
	{ keyword: 'spark', slug: 'spark' },
	{ keyword: 'kafka', slug: 'kafka' },
	{ keyword: 'dbt', slug: 'dbt' },
	{ keyword: 'snowflake', slug: 'snowflake' },
	// Lang
	{ keyword: 'golang', slug: 'golang' },
	{ keyword: ' go ', slug: 'golang' },
	{ keyword: 'python', slug: 'python' },
	{ keyword: 'rust', slug: 'rust' },
	{ keyword: 'kotlin', slug: 'kotlin' },
	{ keyword: 'typescript', slug: 'typescript' },
	{ keyword: 'javascript', slug: 'javascript' },
	{ keyword: 'java', slug: 'java' },
	// Concepts
	{ keyword: 'hooks', slug: 'hooks' },
	{ keyword: 'deployment', slug: 'deployment' },
	{ keyword: 'authentication', slug: 'authentication' },
	{ keyword: 'authorization', slug: 'authorization' },
	{ keyword: 'testing', slug: 'testing' },
	{ keyword: 'migration', slug: 'migration' },
	{ keyword: 'monitoring', slug: 'monitoring' },
	{ keyword: 'logging', slug: 'logging' },
	{ keyword: 'caching', slug: 'caching' },
	{ keyword: 'performance', slug: 'performance' },
	{ keyword: 'security', slug: 'security' },
	{ keyword: 'cicd', slug: 'cicd' },
	{ keyword: 'ci/cd', slug: 'cicd' }
];

// ---------------------------------------------------------------------------
// Qualifier extraction for compound names
// ---------------------------------------------------------------------------

const QUALIFIER_KEYWORDS: Array<{ keyword: string; slug: string }> = [
	{ keyword: 'best practices', slug: 'best-practices' },
	{ keyword: 'best practice', slug: 'best-practices' },
	{ keyword: 'getting started', slug: 'getting-started' },
	{ keyword: 'quick start', slug: 'quickstart' },
	{ keyword: 'guide', slug: 'guide' },
	{ keyword: 'tutorial', slug: 'tutorial' },
	{ keyword: 'patterns', slug: 'patterns' },
	{ keyword: 'reference', slug: 'reference' },
	{ keyword: 'cookbook', slug: 'cookbook' },
	{ keyword: 'advanced', slug: 'advanced' },
	{ keyword: 'basics', slug: 'basics' }
];

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseGuideNaturalLanguage(input: string): GeneratedGuide {
	const lower = ` ${input.toLowerCase()} `;

	// --- Tech keyword slug for name ---
	let techSlug = '';
	for (const { keyword, slug } of TECH_KEYWORDS) {
		if (lower.includes(keyword)) {
			techSlug = slug;
			break;
		}
	}

	// --- Qualifier for compound name ---
	let qualifierSlug = '';
	for (const { keyword, slug } of QUALIFIER_KEYWORDS) {
		if (lower.includes(keyword)) {
			qualifierSlug = slug;
			break;
		}
	}

	// --- Name generation ---
	let name: string;
	if (techSlug && qualifierSlug && qualifierSlug !== 'guide') {
		name = `${techSlug}-${qualifierSlug}`;
	} else if (techSlug) {
		name = techSlug;
	} else {
		// Extract meaningful words from input
		const words = input
			.split(/\s+/)
			.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
			.filter((w) => w.length >= 3 && /^[a-z]/.test(w))
			.slice(0, 3);
		name = words.join('-') || 'new-guide';
	}

	// Ensure kebab-case
	name = sanitizeGuideName(name);

	// --- Title generation ---
	const titleWords = input
		.split(/\s+/)
		.slice(0, 8)
		.join(' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
	const title = titleWords.length > 60 ? titleWords.slice(0, 57) + '...' : titleWords;

	// --- Body generation ---
	const body = buildGuideBody(title, name, input);

	return { name, body };
}

function buildGuideBody(title: string, name: string, input: string): string {
	return `# ${title}

## Overview

${input.trim()}

## Key Concepts

- Core concepts and terminology related to ${name}
- Fundamental principles and patterns
- Important distinctions and trade-offs

## Best Practices

- Follow established conventions for ${name}
- Write clear, maintainable, and testable code
- Document decisions and reasoning

## Examples

\`\`\`
# Example usage
# Replace with actual code examples for ${name}
\`\`\`

## References

- [Official Documentation](https://docs.example.com)
- Related guides in this project
`;
}

// ---------------------------------------------------------------------------
// Markdown builder (body only — NO frontmatter)
// ---------------------------------------------------------------------------

export function buildGuideMarkdown(guide: GeneratedGuide): string {
	// Guides are pure markdown — return body as-is (no frontmatter)
	return guide.body;
}

// ---------------------------------------------------------------------------
// Name sanitization (kebab-case only)
// ---------------------------------------------------------------------------

export function sanitizeGuideName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

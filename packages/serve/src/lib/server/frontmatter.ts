import { parse as parseYaml } from 'yaml';

export interface ParsedFile {
	frontmatter: Record<string, unknown>;
	body: string;
}

export function parseFrontmatter(content: string): ParsedFile {
	const trimmed = content.trimStart();

	if (!trimmed.startsWith('---')) {
		return { frontmatter: {}, body: content };
	}

	const end = trimmed.indexOf('\n---', 3);
	if (end === -1) {
		return { frontmatter: {}, body: content };
	}

	const yamlBlock = trimmed.slice(3, end).trim();
	const body = trimmed.slice(end + 4).trimStart();

	let frontmatter: Record<string, unknown> = {};
	try {
		const parsed = parseYaml(yamlBlock);
		if (parsed && typeof parsed === 'object') {
			frontmatter = parsed as Record<string, unknown>;
		}
	} catch {
		// malformed YAML — return empty frontmatter, keep body
	}

	return { frontmatter, body };
}

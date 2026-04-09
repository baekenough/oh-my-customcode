import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';

export interface ServeProjectInfo {
	name: string;
	slug: string;
	path: string;
	version: string | null;
	status: 'latest' | 'outdated' | 'unknown';
}

/** Registry entry shape (mirrors src/core/registry.ts) */
interface RegistryEntry {
	version: string;
	installedAt: string;
	updatedAt: string;
}

/** Registry file shape */
interface Registry {
	projects: Record<string, RegistryEntry>;
}

const CACHE_TTL_MS = 30_000;

// Module-level cache
let _cachedProjects: ServeProjectInfo[] | null = null;
let _cacheTimestamp = 0;

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function getTemplateVersion(): Promise<string> {
	try {
		const pkg = await readFile(join(process.cwd(), 'package.json'), 'utf-8');
		return (JSON.parse(pkg) as { version?: string }).version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

function computeStatus(
	version: string | null,
	currentVersion: string
): 'latest' | 'outdated' | 'unknown' {
	if (!version) return 'unknown';

	const normalizedInstalled = version.replace(/^v/, '');
	const normalizedCurrent = currentVersion.replace(/^v/, '');

	if (normalizedInstalled === normalizedCurrent) return 'latest';

	const parseVersion = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
	const [aMaj, aMin, aPatch] = parseVersion(normalizedInstalled);
	const [bMaj, bMin, bPatch] = parseVersion(normalizedCurrent);

	if (
		aMaj < bMaj ||
		(aMaj === bMaj && aMin < bMin) ||
		(aMaj === bMaj && aMin === bMin && aPatch < bPatch)
	) {
		return 'outdated';
	}

	return 'latest';
}

/**
 * Read the local registry file directly.
 * Avoids cross-package imports by reading the JSON file via fs.
 */
async function readLocalRegistry(): Promise<Registry> {
	const registryPath = join(homedir(), '.oh-my-customcode', 'projects.json');
	try {
		const content = await readFile(registryPath, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'projects' in parsed &&
			typeof (parsed as Registry).projects === 'object'
		) {
			return parsed as Registry;
		}
		return { projects: {} };
	} catch {
		return { projects: {} };
	}
}

/**
 * Find all omcustom projects on the machine via the local registry.
 * Falls back gracefully to an empty list if the registry cannot be read.
 * Results are cached for 30 seconds.
 *
 * @param _extraPaths - Ignored (kept for backward-compatible call sites); registry is the source of truth.
 */
export async function findProjectsForServe(_extraPaths: string[] = []): Promise<ServeProjectInfo[]> {
	const now = Date.now();
	if (_cachedProjects && now - _cacheTimestamp < CACHE_TTL_MS) {
		return _cachedProjects;
	}

	const currentVersion = await getTemplateVersion();
	const results: ServeProjectInfo[] = [];

	try {
		const registry = await readLocalRegistry();

		for (const [projectPath, entry] of Object.entries(registry.projects)) {
			const name = basename(projectPath);
			results.push({
				name,
				slug: slugify(name),
				path: projectPath,
				version: entry.version || null,
				status: computeStatus(entry.version || null, currentVersion),
			});
		}
	} catch {
		// Registry unavailable — return empty list rather than crashing
	}

	// Sort: latest first, then alphabetically by name
	results.sort((a, b) => {
		if (a.status === 'latest' && b.status !== 'latest') return -1;
		if (a.status !== 'latest' && b.status === 'latest') return 1;
		return a.name.localeCompare(b.name);
	});

	_cachedProjects = results;
	_cacheTimestamp = now;

	return results;
}

/** Invalidate the project cache (e.g., after a project update). */
export function invalidateProjectCache(): void {
	_cachedProjects = null;
	_cacheTimestamp = 0;
}

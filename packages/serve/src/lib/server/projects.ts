import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';

export interface ServeProjectInfo {
	name: string;
	slug: string;
	path: string;
	version: string | null;
	status: 'latest' | 'outdated' | 'unknown';
}

interface OmcustomLockFile {
	version?: string;
	templateVersion?: string;
	installedAt?: string;
	updatedAt?: string;
	[key: string]: unknown;
}

const DEFAULT_SEARCH_DIRS = ['workspace', 'projects', 'dev', 'src', 'code', 'repos', 'work'];
const MAX_SEARCH_DEPTH = 3;
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

async function readLockFile(dir: string): Promise<OmcustomLockFile | null> {
	try {
		const content = await readFile(join(dir, '.omcustom.lock.json'), 'utf-8');
		return JSON.parse(content) as OmcustomLockFile;
	} catch {
		return null;
	}
}

async function hasOmcustomMarkers(dir: string): Promise<boolean> {
	try {
		const [agentsStat, skillsStat] = await Promise.allSettled([
			stat(join(dir, '.claude', 'agents')),
			stat(join(dir, '.claude', 'skills'))
		]);
		return (
			agentsStat.status === 'fulfilled' &&
			agentsStat.value.isDirectory() &&
			skillsStat.status === 'fulfilled' &&
			skillsStat.value.isDirectory()
		);
	} catch {
		return false;
	}
}

async function searchDirectory(
	dir: string,
	depth: number,
	results: ServeProjectInfo[],
	currentVersion: string,
	seen: Set<string>
): Promise<void> {
	if (depth > MAX_SEARCH_DEPTH || seen.has(dir)) return;
	seen.add(dir);

	// Check if this directory is an omcustom project via lock file
	const lockFile = await readLockFile(dir);
	if (lockFile) {
		const version = lockFile.version || lockFile.templateVersion || null;
		const name = basename(dir);
		results.push({
			name,
			slug: slugify(name),
			path: dir,
			version,
			status: computeStatus(version, currentVersion)
		});
		// Do not recurse into a found project
		return;
	}

	// Check via directory markers
	if (await hasOmcustomMarkers(dir)) {
		const name = basename(dir);
		results.push({
			name,
			slug: slugify(name),
			path: dir,
			version: null,
			status: 'unknown'
		});
		// Do not recurse into a found project
		return;
	}

	// Recurse into subdirectories if within depth limit
	if (depth < MAX_SEARCH_DEPTH) {
		let entries: import('fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		const subdirs = entries.filter(
			(e) =>
				e.isDirectory() &&
				!e.name.startsWith('.') &&
				e.name !== 'node_modules' &&
				e.name !== 'dist' &&
				e.name !== 'build' &&
				e.name !== '.git'
		);

		await Promise.all(
			subdirs.map((subdir) =>
				searchDirectory(join(dir, subdir.name), depth + 1, results, currentVersion, seen)
			)
		);
	}
}

/**
 * Find all omcustom projects on the machine.
 * Results are cached for 30 seconds to avoid repeated FS scans.
 */
export async function findProjectsForServe(extraPaths: string[] = []): Promise<ServeProjectInfo[]> {
	const now = Date.now();
	if (_cachedProjects && now - _cacheTimestamp < CACHE_TTL_MS) {
		return _cachedProjects;
	}

	const currentVersion = await getTemplateVersion();
	const home = homedir();
	const seen = new Set<string>();
	const results: ServeProjectInfo[] = [];

	const searchPaths: string[] = DEFAULT_SEARCH_DIRS.map((d) => join(home, d));
	searchPaths.push(...extraPaths);

	await Promise.all(
		searchPaths.map((searchPath) =>
			searchDirectory(searchPath, 0, results, currentVersion, seen).catch(() => {
				// Silently skip directories that don't exist or can't be read
			})
		)
	);

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

/**
 * Framework version drift detection for omcustom doctor
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists } from '../utils/fs.js';

export interface FrameworkVersionResult {
  installed: string;
  latest: string;
  isOutdated: boolean;
  versionsBehind: number;
}

/**
 * Read installed framework version from .omcustomrc.json
 */
export async function getInstalledVersion(targetDir: string): Promise<string | null> {
  const rcPath = join(targetDir, '.omcustomrc.json');
  if (!(await fileExists(rcPath))) return null;

  try {
    const content = JSON.parse(await readFile(rcPath, 'utf-8'));
    return content.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Calculate versions behind (semver minor diff within same major, or flag major drift).
 * For 0.x.y versioning, compares minor versions. Cross-major returns accumulated minor diff.
 */
export function calculateVersionsBehind(installed: string, latest: string): number {
  const [installedMajor, installedMinor] = installed.split('.').map(Number);
  const [latestMajor, latestMinor] = latest.split('.').map(Number);
  if (latestMajor > installedMajor) {
    // Cross-major: report major gap as significant drift
    return (latestMajor - installedMajor) * 100 + latestMinor;
  }
  return Math.max(0, latestMinor - installedMinor);
}

/**
 * Check framework version drift
 */
export async function checkFrameworkVersion(
  targetDir: string,
  latestVersion: string
): Promise<FrameworkVersionResult | null> {
  const installed = await getInstalledVersion(targetDir);
  if (!installed) return null;

  const versionsBehind = calculateVersionsBehind(installed, latestVersion);

  return {
    installed,
    latest: latestVersion,
    isOutdated: installed !== latestVersion,
    versionsBehind,
  };
}

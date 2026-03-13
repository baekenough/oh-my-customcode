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
 * Calculate minor versions behind (simple semver minor diff)
 */
export function calculateVersionsBehind(installed: string, latest: string): number {
  const [, installedMinor] = installed.split('.').map(Number);
  const [, latestMinor] = latest.split('.').map(Number);
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

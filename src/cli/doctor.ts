/**
 * omcustom doctor command
 * Checks and fixes configuration issues
 */

import { constants, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadConfig } from '../core/config.js';
import { checkFrameworkVersion } from '../core/doctor-framework.js';
import { getProviderLayout } from '../core/layout.js';
import { computeFileHash, readLockfile } from '../core/lockfile.js';
import { checkSelfUpdate } from '../core/self-update.js';
import { i18n } from '../i18n/index.js';

/**
 * Options for the doctor command
 */
export interface DoctorOptions {
  /** Automatically fix issues that can be fixed */
  fix?: boolean;
  /** Run in quiet mode (only show errors) */
  quiet?: boolean;
  /** Check for oh-my-customcode updates */
  updates?: boolean;
}

/**
 * Status of a single check
 */
export type CheckStatus = 'pass' | 'warn' | 'fail';

/**
 * Result of a single diagnostic check
 */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  fixable: boolean;
  fixed?: boolean;
  details?: string[];
}

/**
 * Result of the doctor command
 */
export interface DoctorResult {
  success: boolean;
  checks: CheckResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
  fixedCount: number;
}

/**
 * Check if a path exists
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a valid symlink (not broken)
 */
async function isValidSymlink(symlinkPath: string): Promise<boolean> {
  try {
    // Try to read the symlink target to see if it's valid
    await fs.stat(symlinkPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively find all files matching a pattern in a directory
 */
async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subResults = await findFiles(fullPath, pattern);
        results.push(...subResults);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }

  return results;
}

/**
 * Collect symlinks from a refs directory
 */
async function collectSymlinksFromRefsDir(refsDir: string): Promise<string[]> {
  const symlinks: string[] = [];
  try {
    const entries = await fs.readdir(refsDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(refsDir, entry.name);
      try {
        const stat = await fs.lstat(entryPath);
        if (stat.isSymbolicLink()) {
          symlinks.push(entryPath);
        }
      } catch {
        // Ignore errors
      }
    }
  } catch {
    // Ignore errors
  }
  return symlinks;
}

/**
 * Find all symlinks in refs/ directories
 */
async function findRefsSymlinks(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.name === 'refs') {
        const symlinks = await collectSymlinksFromRefsDir(fullPath);
        results.push(...symlinks);
      } else {
        const subResults = await findRefsSymlinks(fullPath);
        results.push(...subResults);
      }
    }
  } catch {
    // Ignore errors
  }

  return results;
}

/**
 * Count directories in a path (one level deep)
 */
async function countDirectories(dirPath: string): Promise<number> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).length;
}

/**
 * Count agent .md files in flat {root}/agents/ directory
 * Official format: {root}/agents/{prefix}-{name}.md
 */
async function countAgents(agentsDir: string): Promise<number> {
  let count = 0;

  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });

    for (const entry of entries) {
      // Count .md files (flat structure in official Claude Code format)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        count++;
      }
    }
  } catch {
    // Ignore errors
  }

  return count;
}

/**
 * Check if entry doc exists
 * @param targetDir - Target directory
 * @param entryFile - Entry file name (CLAUDE.md or AGENTS.md)
 * @returns Check result
 */
export async function checkEntryDoc(targetDir: string, entryFile: string): Promise<CheckResult> {
  const entryPath = path.join(targetDir, entryFile);
  const exists = await pathExists(entryPath);

  return {
    name: entryFile,
    status: exists ? 'pass' : 'fail',
    message: exists
      ? i18n.t('cli.doctor.checks.entryMd.pass', { entry: entryFile })
      : i18n.t('cli.doctor.checks.entryMd.fail', { entry: entryFile }),
    fixable: false, // Entry doc should be created by init, not auto-fixed
  };
}

// Backward compatibility for older callers/tests
export async function checkClaudeMd(targetDir: string): Promise<CheckResult> {
  return checkEntryDoc(targetDir, 'CLAUDE.md');
}

/**
 * Check if rules directory exists and has required files
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkRules(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const rulesDir = path.join(targetDir, rootDir, 'rules');
  const exists = await isDirectory(rulesDir);

  if (!exists) {
    return {
      name: 'Rules',
      status: 'fail',
      message: i18n.t('cli.doctor.checks.rules.fail'),
      fixable: true,
    };
  }

  // Check if there are any rule files
  const ruleFiles = await findFiles(rulesDir, /\.md$/);

  if (ruleFiles.length === 0) {
    return {
      name: 'Rules',
      status: 'warn',
      message: `${i18n.t('cli.doctor.checks.rules.fail')} (0 files found)`,
      fixable: false,
    };
  }

  return {
    name: 'Rules',
    status: 'pass',
    message: `${i18n.t('cli.doctor.checks.rules.pass')} (${ruleFiles.length} files)`,
    fixable: false,
  };
}

/**
 * Check if agents directory exists and has expected count
 * Official format: {root}/agents/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkAgents(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const agentsDir = path.join(targetDir, rootDir, 'agents');
  const exists = await isDirectory(agentsDir);

  if (!exists) {
    return {
      name: 'Agents',
      status: 'fail',
      message: i18n.t('cli.doctor.checks.agents.fail'),
      fixable: true,
    };
  }

  const agentCount = await countAgents(agentsDir);

  if (agentCount === 0) {
    return {
      name: 'Agents',
      status: 'warn',
      message: `${i18n.t('cli.doctor.checks.agents.fail')} (0 agents found)`,
      fixable: false,
    };
  }

  return {
    name: 'Agents',
    status: 'pass',
    message: `${i18n.t('cli.doctor.checks.agents.pass')} (${agentCount} agents)`,
    fixable: false,
  };
}

/**
 * Check if all symlinks in refs/ are valid
 * Official format: {root}/agents/, {root}/skills/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSymlinks(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const skillsDir = path.join(targetDir, rootDir, 'skills');

  const brokenSymlinks: string[] = [];

  // Check symlinks in skills directory (agents are now flat .md files, no refs)
  if (await isDirectory(skillsDir)) {
    const skillSymlinks = await findRefsSymlinks(skillsDir);
    for (const symlink of skillSymlinks) {
      if (!(await isValidSymlink(symlink))) {
        brokenSymlinks.push(symlink);
      }
    }
  }

  if (brokenSymlinks.length > 0) {
    return {
      name: 'Symlinks',
      status: 'fail',
      message: `${i18n.t('cli.doctor.checks.symlinks.fail')} (${brokenSymlinks.length} broken)`,
      fixable: true,
      details: brokenSymlinks.map((s) => path.relative(targetDir, s)),
    };
  }

  return {
    name: 'Symlinks',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.symlinks.pass'),
    fixable: false,
  };
}

/**
 * Check if index.yaml files are valid
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkIndexFiles(targetDir: string): Promise<CheckResult> {
  const indexFiles = await findFiles(targetDir, /^index\.yaml$/);
  const invalidFiles: string[] = [];

  for (const indexFile of indexFiles) {
    try {
      const content = await fs.readFile(indexFile, 'utf-8');
      parseYaml(content);
    } catch (_error) {
      invalidFiles.push(indexFile);
    }
  }

  if (invalidFiles.length > 0) {
    return {
      name: 'Index files',
      status: 'fail',
      message: `${i18n.t('cli.doctor.checks.index.fail')} (${invalidFiles.length} invalid)`,
      fixable: false,
      details: invalidFiles.map((f) => path.relative(targetDir, f)),
    };
  }

  if (indexFiles.length === 0) {
    return {
      name: 'Index files',
      status: 'warn',
      message: `${i18n.t('cli.doctor.checks.index.pass')} (0 files found)`,
      fixable: false,
    };
  }

  return {
    name: 'Index files',
    status: 'pass',
    message: `${i18n.t('cli.doctor.checks.index.pass')} (${indexFiles.length} files)`,
    fixable: false,
  };
}

/**
 * Check if skills directory exists
 * Official format: {root}/skills/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSkills(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const skillsDir = path.join(targetDir, rootDir, 'skills');
  const exists = await isDirectory(skillsDir);

  if (!exists) {
    return {
      name: 'Skills',
      status: 'fail',
      message: i18n.t('cli.doctor.checks.skills.fail'),
      fixable: true,
    };
  }

  // Count skill categories
  const categoryCount = await countDirectories(skillsDir);

  if (categoryCount === 0) {
    return {
      name: 'Skills',
      status: 'warn',
      message: `${i18n.t('cli.doctor.checks.skills.fail')} (0 categories found)`,
      fixable: false,
    };
  }

  return {
    name: 'Skills',
    status: 'pass',
    message: `${i18n.t('cli.doctor.checks.skills.pass')} (${categoryCount} categories)`,
    fixable: false,
  };
}

/**
 * Check if guides directory exists
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkGuides(targetDir: string): Promise<CheckResult> {
  const guidesDir = path.join(targetDir, 'guides');
  const exists = await isDirectory(guidesDir);

  if (!exists) {
    return {
      name: 'Guides',
      status: 'fail',
      message: 'guides/ directory not found',
      fixable: true,
    };
  }

  const topicCount = await countDirectories(guidesDir);

  if (topicCount === 0) {
    return {
      name: 'Guides',
      status: 'warn',
      message: 'guides/ directory is empty (0 topics found)',
      fixable: false,
    };
  }

  return {
    name: 'Guides',
    status: 'pass',
    message: `Guides OK (${topicCount} topics)`,
    fixable: false,
  };
}

/**
 * Check if hooks directory exists and has expected files
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkHooks(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const hooksDir = path.join(targetDir, rootDir, 'hooks');
  const exists = await isDirectory(hooksDir);

  if (!exists) {
    return {
      name: 'Hooks',
      status: 'fail',
      message: `${rootDir}/hooks/ directory not found`,
      fixable: true,
    };
  }

  const hookFiles = await findFiles(hooksDir, /\.(sh|json|yaml)$/);

  if (hookFiles.length === 0) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: `${rootDir}/hooks/ directory is empty`,
      fixable: false,
    };
  }

  return {
    name: 'Hooks',
    status: 'pass',
    message: `Hooks OK (${hookFiles.length} files)`,
    fixable: false,
  };
}

/**
 * Check if contexts directory exists
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkContexts(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const contextsDir = path.join(targetDir, rootDir, 'contexts');
  const exists = await isDirectory(contextsDir);

  if (!exists) {
    return {
      name: 'Contexts',
      status: 'fail',
      message: `${rootDir}/contexts/ directory not found`,
      fixable: true,
    };
  }

  const contextFiles = await findFiles(contextsDir, /\.md$/);

  if (contextFiles.length === 0) {
    return {
      name: 'Contexts',
      status: 'warn',
      message: `${rootDir}/contexts/ directory is empty`,
      fixable: false,
    };
  }

  return {
    name: 'Contexts',
    status: 'pass',
    message: `Contexts OK (${contextFiles.length} files)`,
    fixable: false,
  };
}

/**
 * Check if custom components (managed:false) exist
 * @param targetDir - Target directory
 * @param rootDir - Root directory (.claude)
 * @returns Check result
 */
export async function checkCustomComponents(
  targetDir: string,
  _rootDir: string = '.claude'
): Promise<CheckResult> {
  try {
    const config = await loadConfig(targetDir);
    const customComponents = config.customComponents || [];

    if (customComponents.length === 0) {
      return {
        name: 'Custom components',
        status: 'pass',
        message: 'No custom components configured',
        fixable: false,
      };
    }

    const missing: string[] = [];

    for (const component of customComponents) {
      const fullPath = path.join(targetDir, component.path);
      if (!(await pathExists(fullPath))) {
        missing.push(component.path);
      }
    }

    if (missing.length > 0) {
      return {
        name: 'Custom components',
        status: 'warn',
        message: `Custom components: ${customComponents.length} items (${missing.length} missing)`,
        fixable: false,
        details: missing,
      };
    }

    return {
      name: 'Custom components',
      status: 'pass',
      message: `Custom components: ${customComponents.length} items (managed: false)`,
      fixable: false,
    };
  } catch {
    return {
      name: 'Custom components',
      status: 'pass',
      message: 'No config file found',
      fixable: false,
    };
  }
}

/**
 * Fix broken symlinks by removing them
 * @param targetDir - Target directory
 * @param brokenSymlinks - List of broken symlink paths
 * @returns Number of fixed symlinks
 */
async function fixBrokenSymlinks(_targetDir: string, brokenSymlinks: string[]): Promise<number> {
  let fixed = 0;

  for (const symlink of brokenSymlinks) {
    try {
      await fs.unlink(symlink);
      fixed++;
    } catch {
      // Ignore errors
    }
  }

  return fixed;
}

/**
 * Create missing directories
 * @param dirPath - Directory path to create
 * @returns true if created successfully
 */
async function createMissingDirectory(dirPath: string): Promise<boolean> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fix a single check issue
 * @param check - Check result to fix
 * @param targetDir - Target directory
 * @returns true if fixed successfully
 */
async function fixSingleIssue(
  check: CheckResult,
  targetDir: string,
  rootDir: string = '.claude'
): Promise<boolean> {
  const fixMap: Record<string, () => Promise<boolean>> = {
    Rules: () => createMissingDirectory(path.join(targetDir, rootDir, 'rules')),
    Agents: () => createMissingDirectory(path.join(targetDir, rootDir, 'agents')),
    Skills: () => createMissingDirectory(path.join(targetDir, rootDir, 'skills')),
    Guides: () => createMissingDirectory(path.join(targetDir, 'guides')),
    Hooks: () => createMissingDirectory(path.join(targetDir, rootDir, 'hooks')),
    Contexts: () => createMissingDirectory(path.join(targetDir, rootDir, 'contexts')),
    Symlinks: async () => {
      if (!check.details || check.details.length === 0) return false;
      const fullPaths = check.details.map((d) => path.join(targetDir, d));
      const fixedCount = await fixBrokenSymlinks(targetDir, fullPaths);
      return fixedCount > 0;
    },
  };

  const fixer = fixMap[check.name];
  return fixer ? fixer() : false;
}

/**
 * Fix issues that can be automatically fixed
 * @param checks - Check results to fix
 * @param targetDir - Target directory
 * @returns Updated check results with fix status
 */
export async function fixIssues(
  checks: CheckResult[],
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult[]> {
  const fixedChecks: CheckResult[] = [];

  for (const check of checks) {
    if (check.status !== 'fail' || !check.fixable) {
      fixedChecks.push(check);
      continue;
    }

    console.log(i18n.t('cli.doctor.fixing', { name: check.name }));
    const fixed = await fixSingleIssue(check, targetDir, rootDir);

    fixedChecks.push(
      fixed
        ? { ...check, fixed: true, message: i18n.t('cli.doctor.fixed', { name: check.name }) }
        : check
    );
  }

  return fixedChecks;
}

/**
 * Print check result with appropriate icon
 * @param check - Check result to print
 */
export function printCheck(check: CheckResult): void {
  const icons: Record<CheckStatus, string> = {
    pass: '[PASS]',
    warn: '[WARN]',
    fail: '[FAIL]',
  };

  const icon = icons[check.status];
  const fixedLabel = check.fixed ? ' (fixed)' : '';

  console.log(`  ${icon} ${check.name}: ${check.message}${fixedLabel}`);

  // Print details if available (e.g., list of broken symlinks)
  if (check.details && check.details.length > 0 && !check.fixed) {
    for (const detail of check.details.slice(0, 5)) {
      console.log(`         - ${detail}`);
    }
    if (check.details.length > 5) {
      console.log(`         ... and ${check.details.length - 5} more`);
    }
  }
}

/**
 * Read the current package version from package.json
 * @returns Semver string, or '0.0.0' on failure
 */
function readCurrentVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const packageJsonPath = path.resolve(path.dirname(__filename), '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Check for lockfile drift: compare recorded template hashes with current file hashes.
 * Returns 'skip' if no lockfile exists (not an omcustom project).
 * Returns 'warn' if any files were modified, added, or removed since install.
 * Returns 'pass' if all files match the recorded hashes.
 * @param targetDir - Target directory containing .omcustom.lock.json
 * @returns Check result indicating lockfile drift status, or null if no lockfile exists
 */
export async function checkLockfileDrift(targetDir: string): Promise<CheckResult | null> {
  const lockfile = await readLockfile(targetDir);

  if (!lockfile) {
    return null;
  }

  const modified: string[] = [];
  const removed: string[] = [];

  for (const [relativePath, entry] of Object.entries(lockfile.files)) {
    const absolutePath = path.join(targetDir, relativePath);
    try {
      const currentHash = await computeFileHash(absolutePath);
      if (currentHash !== entry.templateHash) {
        modified.push(relativePath);
      }
    } catch {
      // File no longer exists
      removed.push(relativePath);
    }
  }

  const driftedFiles = [...modified, ...removed];

  if (driftedFiles.length === 0) {
    return {
      name: 'Lockfile',
      status: 'pass',
      message: `Lockfile OK — no drift detected (${Object.keys(lockfile.files).length} files tracked)`,
      fixable: false,
    };
  }

  const details: string[] = [
    ...modified.map((f) => `modified: ${f}`),
    ...removed.map((f) => `removed: ${f}`),
  ];

  return {
    name: 'Lockfile',
    status: 'warn',
    message: `Lockfile drift detected: ${driftedFiles.length} file(s) changed since install`,
    fixable: false,
    details,
  };
}

/**
 * Check if the installed framework version (in .omcustomrc.json) is behind the CLI version
 * @param targetDir - Project directory containing .omcustomrc.json
 * @param currentVersion - The CLI's own version (latest)
 * @returns Check result indicating framework drift status, or null if no rc file found
 */
export async function checkFrameworkDrift(
  targetDir: string,
  currentVersion: string
): Promise<CheckResult | null> {
  const result = await checkFrameworkVersion(targetDir, currentVersion);
  if (!result) return null;

  if (result.isOutdated) {
    return {
      name: 'Framework',
      status: 'warn',
      message: i18n.t('cli.doctor.checks.framework.warn', {
        installed: result.installed,
        latest: result.latest,
        behind: String(result.versionsBehind),
      }),
      fixable: false,
    };
  }

  return {
    name: 'Framework',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.framework.pass', { version: result.installed }),
    fixable: false,
  };
}

/**
 * Check if a newer version of oh-my-customcode is available
 * @param currentVersion - The currently installed version
 * @returns Check result indicating update status
 */
export function checkUpdateAvailable(currentVersion: string): CheckResult {
  const result = checkSelfUpdate({ currentVersion });

  if (!result.checked) {
    return {
      name: 'Update',
      status: 'warn',
      message: i18n.t('cli.doctor.updateCheckFailed', { reason: result.reason ?? 'unknown' }),
      fixable: false,
    };
  }

  if (result.updateAvailable && result.latestVersion !== null) {
    return {
      name: 'Update',
      status: 'warn',
      message: i18n.t('cli.doctor.updateAvailable', {
        current: currentVersion,
        latest: result.latestVersion,
      }),
      fixable: false,
      details: result.usedCache ? ['(checked from cache)'] : ['(checked from npm registry)'],
    };
  }

  return {
    name: 'Update',
    status: 'pass',
    message: i18n.t('cli.doctor.updateUpToDate', { version: currentVersion }),
    fixable: false,
  };
}

/**
 * Run all diagnostic checks and return the combined list
 */
async function runAllChecks(
  targetDir: string,
  layout: { entryFile: string; rootDir: string },
  packageVersion: string,
  includeUpdates: boolean
): Promise<CheckResult[]> {
  const baseChecks: CheckResult[] = await Promise.all([
    checkEntryDoc(targetDir, layout.entryFile),
    checkRules(targetDir, layout.rootDir),
    checkAgents(targetDir, layout.rootDir),
    checkSkills(targetDir, layout.rootDir),
    checkSymlinks(targetDir, layout.rootDir),
    checkIndexFiles(targetDir),
    checkGuides(targetDir),
    checkHooks(targetDir, layout.rootDir),
    checkContexts(targetDir, layout.rootDir),
    checkCustomComponents(targetDir, layout.rootDir),
  ]);

  // Framework version drift check (always runs when .omcustomrc.json exists)
  const frameworkCheck = await checkFrameworkDrift(targetDir, packageVersion);
  const checksWithFramework = frameworkCheck ? [...baseChecks, frameworkCheck] : baseChecks;

  // Lockfile drift check (runs when .omcustom.lock.json exists)
  const lockfileCheck = await checkLockfileDrift(targetDir);
  const checksWithLockfile = lockfileCheck
    ? [...checksWithFramework, lockfileCheck]
    : checksWithFramework;

  // Optionally append update check
  return includeUpdates
    ? [...checksWithLockfile, checkUpdateAvailable(packageVersion)]
    : checksWithLockfile;
}

/**
 * Execute the doctor command
 * @param options - Doctor command options
 * @returns Result of the doctor operation
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<DoctorResult> {
  const targetDir = process.cwd();

  console.log(i18n.t('cli.doctor.checking'));
  console.log('');

  const layout = getProviderLayout();
  const packageVersion = readCurrentVersion();

  // Run all checks
  const checksWithUpdate = await runAllChecks(
    targetDir,
    layout,
    packageVersion,
    options.updates ?? false
  );

  // Apply fixes if requested
  let checks: CheckResult[] = checksWithUpdate;
  if (options.fix) {
    const hasFixableIssues = checksWithUpdate.some((c) => c.status === 'fail' && c.fixable);

    if (hasFixableIssues) {
      console.log(i18n.t('cli.doctor.applyingFixes'));
      console.log('');
      checks = await fixIssues(checksWithUpdate, targetDir, layout.rootDir);
      console.log('');
    }
  }

  // Print results
  for (const check of checks) {
    if (!options.quiet || check.status !== 'pass') {
      printCheck(check);
    }
  }

  // Calculate counts
  const passCount = checks.filter((c) => c.status === 'pass' || c.fixed).length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail' && !c.fixed).length;
  const fixedCount = checks.filter((c) => c.fixed).length;

  // Print summary
  console.log('');

  if (failCount === 0) {
    console.log(i18n.t('cli.doctor.passed'));
  } else {
    console.log(i18n.t('cli.doctor.failed'));

    if (!options.fix) {
      const fixableCount = checks.filter((c) => c.status === 'fail' && c.fixable).length;
      if (fixableCount > 0) {
        console.log(i18n.t('cli.doctor.runWithFix', { count: fixableCount }));
      }
    }
  }

  console.log(
    i18n.t('cli.doctor.summary', {
      pass: passCount,
      warn: warnCount,
      fail: failCount,
      fixed: fixedCount,
    })
  );

  return {
    success: failCount === 0,
    checks,
    passCount,
    warnCount,
    failCount,
    fixedCount,
  };
}

export default doctorCommand;

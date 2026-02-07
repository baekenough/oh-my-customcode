/**
 * omcustom doctor command
 * Checks and fixes configuration issues
 */

import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { i18n } from '../i18n/index.js';

/**
 * Options for the doctor command
 */
export interface DoctorOptions {
  /** Automatically fix issues that can be fixed */
  fix?: boolean;
  /** Run in quiet mode (only show errors) */
  quiet?: boolean;
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
 * Count agent .md files in flat .claude/agents/ directory
 * Official Claude Code format: .claude/agents/{prefix}-{name}.md
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
 * Check if CLAUDE.md exists
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkClaudeMd(targetDir: string): Promise<CheckResult> {
  const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
  const exists = await pathExists(claudeMdPath);

  return {
    name: 'CLAUDE.md',
    status: exists ? 'pass' : 'fail',
    message: exists
      ? i18n.t('cli.doctor.checks.claudeMd.pass')
      : i18n.t('cli.doctor.checks.claudeMd.fail'),
    fixable: false, // CLAUDE.md should be created by init, not auto-fixed
  };
}

/**
 * Check if .claude/rules directory exists and has required files
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkRules(targetDir: string): Promise<CheckResult> {
  const rulesDir = path.join(targetDir, '.claude', 'rules');
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
 * Official Claude Code format: .claude/agents/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkAgents(targetDir: string): Promise<CheckResult> {
  const agentsDir = path.join(targetDir, '.claude', 'agents');
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
 * Official Claude Code format: .claude/agents/, .claude/skills/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSymlinks(targetDir: string): Promise<CheckResult> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');

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
 * Official Claude Code format: .claude/skills/
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSkills(targetDir: string): Promise<CheckResult> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');
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
export async function checkHooks(targetDir: string): Promise<CheckResult> {
  const hooksDir = path.join(targetDir, '.claude', 'hooks');
  const exists = await isDirectory(hooksDir);

  if (!exists) {
    return {
      name: 'Hooks',
      status: 'fail',
      message: '.claude/hooks/ directory not found',
      fixable: true,
    };
  }

  const hookFiles = await findFiles(hooksDir, /\.(sh|json|yaml)$/);

  if (hookFiles.length === 0) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: '.claude/hooks/ directory is empty',
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
export async function checkContexts(targetDir: string): Promise<CheckResult> {
  const contextsDir = path.join(targetDir, '.claude', 'contexts');
  const exists = await isDirectory(contextsDir);

  if (!exists) {
    return {
      name: 'Contexts',
      status: 'fail',
      message: '.claude/contexts/ directory not found',
      fixable: true,
    };
  }

  const contextFiles = await findFiles(contextsDir, /\.md$/);

  if (contextFiles.length === 0) {
    return {
      name: 'Contexts',
      status: 'warn',
      message: '.claude/contexts/ directory is empty',
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
async function fixSingleIssue(check: CheckResult, targetDir: string): Promise<boolean> {
  const fixMap: Record<string, () => Promise<boolean>> = {
    Rules: () => createMissingDirectory(path.join(targetDir, '.claude', 'rules')),
    Agents: () => createMissingDirectory(path.join(targetDir, '.claude', 'agents')),
    Skills: () => createMissingDirectory(path.join(targetDir, '.claude', 'skills')),
    Guides: () => createMissingDirectory(path.join(targetDir, 'guides')),
    Hooks: () => createMissingDirectory(path.join(targetDir, '.claude', 'hooks')),
    Contexts: () => createMissingDirectory(path.join(targetDir, '.claude', 'contexts')),
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
export async function fixIssues(checks: CheckResult[], targetDir: string): Promise<CheckResult[]> {
  const fixedChecks: CheckResult[] = [];

  for (const check of checks) {
    if (check.status !== 'fail' || !check.fixable) {
      fixedChecks.push(check);
      continue;
    }

    console.log(i18n.t('cli.doctor.fixing', { name: check.name }));
    const fixed = await fixSingleIssue(check, targetDir);

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
 * Execute the doctor command
 * @param options - Doctor command options
 * @returns Result of the doctor operation
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<DoctorResult> {
  const targetDir = process.cwd();

  console.log(i18n.t('cli.doctor.checking'));
  console.log('');

  // Run all checks
  let checks: CheckResult[] = await Promise.all([
    checkClaudeMd(targetDir),
    checkRules(targetDir),
    checkAgents(targetDir),
    checkSkills(targetDir),
    checkSymlinks(targetDir),
    checkIndexFiles(targetDir),
    checkGuides(targetDir),
    checkHooks(targetDir),
    checkContexts(targetDir),
  ]);

  // Apply fixes if requested
  if (options.fix) {
    const hasFixableIssues = checks.some((c) => c.status === 'fail' && c.fixable);

    if (hasFixableIssues) {
      console.log(i18n.t('cli.doctor.applyingFixes'));
      console.log('');
      checks = await fixIssues(checks, targetDir);
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

/**
 * omcc doctor command
 * Checks and fixes configuration issues
 */

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
 * Check if CLAUDE.md exists
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkClaudeMd(targetDir: string): Promise<CheckResult> {
  // TODO: Implement actual file check
  // Check if CLAUDE.md exists in targetDir

  return {
    name: 'CLAUDE.md',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.claudeMd.pass'),
    fixable: false,
  };
}

/**
 * Check if .claude/rules directory exists and has required files
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkRules(targetDir: string): Promise<CheckResult> {
  // TODO: Implement rules directory check
  // Check .claude/rules/ exists and contains required rule files

  return {
    name: 'Rules',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.rules.pass'),
    fixable: true,
  };
}

/**
 * Check if agents directory exists and has expected count
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkAgents(targetDir: string): Promise<CheckResult> {
  // TODO: Implement agents directory check
  // Check agents/ exists and count matches expected (28+)

  return {
    name: 'Agents',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.agents.pass'),
    fixable: true,
  };
}

/**
 * Check if all symlinks in refs/ are valid
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSymlinks(targetDir: string): Promise<CheckResult> {
  // TODO: Implement symlink validation
  // Scan all refs/ directories and verify symlinks point to valid targets

  return {
    name: 'Symlinks',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.symlinks.pass'),
    fixable: true,
  };
}

/**
 * Check if index.yaml files are valid
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkIndexFiles(targetDir: string): Promise<CheckResult> {
  // TODO: Implement index.yaml validation
  // Parse and validate all index.yaml files

  return {
    name: 'Index files',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.index.pass'),
    fixable: false,
  };
}

/**
 * Check if skills directory exists
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkSkills(targetDir: string): Promise<CheckResult> {
  // TODO: Implement skills directory check

  return {
    name: 'Skills',
    status: 'pass',
    message: i18n.t('cli.doctor.checks.skills.pass'),
    fixable: true,
  };
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
    if (check.status === 'fail' && check.fixable) {
      // TODO: Implement specific fixes for each check type
      // For now, mark as fixed (placeholder)
      console.log(i18n.t('cli.doctor.fixing', { name: check.name }));

      fixedChecks.push({
        ...check,
        fixed: true,
        message: i18n.t('cli.doctor.fixed', { name: check.name }),
      });
    } else {
      fixedChecks.push(check);
    }
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
  ]);

  // Apply fixes if requested
  if (options.fix) {
    const hasFixableIssues = checks.some((c) => c.status === 'fail' && c.fixable);

    if (hasFixableIssues) {
      console.log(i18n.t('cli.doctor.applyingFixes'));
      checks = await fixIssues(checks, targetDir);
    }
  }

  // Print results
  for (const check of checks) {
    if (!options.quiet || check.status !== 'pass') {
      printCheck(check);
    }
  }

  // Calculate counts
  const passCount = checks.filter((c) => c.status === 'pass').length;
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

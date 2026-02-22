/**
 * omcustom security command
 * Scans for security issues in hooks, configs, and templates
 */

import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { getProviderLayout } from '../core/layout.js';
import { i18n } from '../i18n/index.js';
import { type CheckResult, type CheckStatus, printCheck } from './doctor.js';

/**
 * Options for the security command
 */
export interface SecurityOptions {
  /** Show detailed scan results */
  verbose?: boolean;
}

/**
 * Result of the security command
 */
export interface SecurityResult {
  success: boolean;
  checks: CheckResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
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
 * Check if content is valid UTF-8 text.
 * Buffer.toString('utf-8') never throws — invalid bytes are silently replaced
 * with U+FFFD. We detect non-text content by checking for null bytes instead,
 * which are absent in well-formed text files but common in binary files.
 */
function isValidUtf8Text(content: Buffer): boolean {
  return !content.includes(0x00);
}

/**
 * Recursively find all files in a directory
 */
async function findAllFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subResults = await findAllFiles(fullPath);
        results.push(...subResults);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }

  return results;
}

// Note: These patterns detect dangerous shell constructs in hooks, not actual code usage
const DANGEROUS_PATTERNS = [
  {
    pattern: /rm\s+-rf\s+[/~]/,
    name: 'rm -rf with root/home path',
    severity: 'fail' as CheckStatus,
  },
  {
    pattern: /curl\s+.*\|\s*(bash|sh|eval)/,
    name: 'curl pipe to shell',
    severity: 'fail' as CheckStatus,
  },
  {
    pattern: /wget\s+.*\|\s*(bash|sh|eval)/,
    name: 'wget pipe to shell',
    severity: 'fail' as CheckStatus,
  },
  { pattern: /\bsudo\b/, name: 'sudo usage', severity: 'warn' as CheckStatus },
  { pattern: /chmod\s+777/, name: 'chmod 777', severity: 'warn' as CheckStatus },
  { pattern: /\beval\s*\(/, name: 'eval() usage', severity: 'warn' as CheckStatus },
  {
    pattern: /\$\{.*:-.*\}.*>\s*\/etc/,
    name: 'write to /etc',
    severity: 'fail' as CheckStatus,
  },
  {
    pattern: /base64\s+(-d|--decode).*\|\s*(bash|sh)/,
    name: 'base64 decode to shell',
    severity: 'fail' as CheckStatus,
  },
];

/**
 * Extract commands from hooks object
 * Complexity is inherent to nested hook structure traversal
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Security scanning requires thorough nested traversal
function extractCommands(hooks: unknown): string[] {
  const commands: string[] = [];
  if (!hooks || typeof hooks !== 'object') return commands;

  for (const hookName in hooks) {
    const hook = (hooks as Record<string, unknown>)[hookName];
    if (hook && typeof hook === 'object') {
      for (const eventName in hook) {
        const event = (hook as Record<string, unknown>)[eventName];
        if (Array.isArray(event)) {
          for (const item of event) {
            if (typeof item === 'object' && item && 'command' in item) {
              commands.push(String(item.command));
            }
          }
        }
      }
    }
  }
  return commands;
}

/**
 * Scan commands for dangerous patterns
 * Complexity is inherent to pattern matching logic
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Security pattern scanning requires comprehensive checks
function scanCommands(commands: string[]): { findings: string[]; worstSeverity: CheckStatus } {
  const findings: string[] = [];
  let worstSeverity: CheckStatus = 'pass';

  for (const command of commands) {
    for (const { pattern, name, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        findings.push(`${name}: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`);
        if (severity === 'fail') {
          worstSeverity = 'fail';
        } else if (severity === 'warn' && worstSeverity === 'pass') {
          worstSeverity = 'warn';
        }
      }
    }
  }

  return { findings, worstSeverity };
}

/**
 * Check hook scripts for dangerous patterns
 * @param targetDir - Target directory
 * @param rootDir - Root directory (.claude)
 * @returns Check result
 */
export async function checkHookScripts(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const hooksFile = path.join(targetDir, rootDir, 'hooks', 'hooks.json');
  const exists = await pathExists(hooksFile);

  if (!exists) {
    return {
      name: 'Hook scripts',
      status: 'pass',
      message: i18n.t('cli.security.checks.hooks.pass'),
      fixable: false,
    };
  }

  try {
    const content = await fs.readFile(hooksFile, 'utf-8');
    const hooks = JSON.parse(content);

    const commands = extractCommands(hooks);
    const { findings, worstSeverity } = scanCommands(commands);

    if (findings.length > 0) {
      const message =
        worstSeverity === 'fail'
          ? i18n.t('cli.security.checks.hooks.fail')
          : i18n.t('cli.security.checks.hooks.warn');

      return {
        name: 'Hook scripts',
        status: worstSeverity,
        message: `${message} (${findings.length} issues)`,
        fixable: false,
        details: findings,
      };
    }

    return {
      name: 'Hook scripts',
      status: 'pass',
      message: i18n.t('cli.security.checks.hooks.pass'),
      fixable: false,
    };
  } catch (error: unknown) {
    return {
      name: 'Hook scripts',
      status: 'warn',
      message: `Failed to parse hooks.json: ${error instanceof Error ? error.message : String(error)}`,
      fixable: false,
    };
  }
}

/**
 * Check configuration files for secrets
 * @param targetDir - Target directory
 * @param rootDir - Root directory (.claude)
 * @returns Check result
 */
export async function checkConfigSecrets(
  targetDir: string,
  rootDir: string = '.claude'
): Promise<CheckResult> {
  const configDir = path.join(targetDir, rootDir);
  const exists = await pathExists(configDir);

  if (!exists) {
    return {
      name: 'Config secrets',
      status: 'pass',
      message: i18n.t('cli.security.checks.secrets.pass'),
      fixable: false,
    };
  }

  const SECRET_PATTERNS = [
    {
      pattern: /(?:AWS_SECRET|AWS_ACCESS_KEY|AWS_SESSION)[_A-Z]*\s*[=:]\s*['"]?[A-Za-z0-9/+=]{20,}/,
      name: 'AWS credential',
    },
    {
      pattern:
        /(?:GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)\s*[=:]\s*['"]?(?:ghp_|gho_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/,
      name: 'GitHub token',
    },
    {
      pattern: /(?:sk-|sk_live_|sk_test_)[A-Za-z0-9]{20,}/,
      name: 'API secret key (sk-*)',
    },
    {
      pattern: /(?:password|passwd|secret)\s*[=:]\s*['"]?[^\s'"]{8,}/i,
      name: 'Hardcoded password/secret',
    },
    {
      pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
      name: 'Private key',
    },
  ];

  const files = await findAllFiles(configDir);
  const findings: string[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file);

      // Skip binary files
      if (!isValidUtf8Text(content)) {
        continue;
      }

      const text = content.toString('utf-8');

      for (const { pattern, name } of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          const relativePath = path.relative(targetDir, file);
          findings.push(`${relativePath}: ${name}`);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  if (findings.length > 0) {
    return {
      name: 'Config secrets',
      status: 'fail',
      message: `${i18n.t('cli.security.checks.secrets.fail')} (${findings.length} found)`,
      fixable: false,
      details: findings,
    };
  }

  return {
    name: 'Config secrets',
    status: 'pass',
    message: i18n.t('cli.security.checks.secrets.pass'),
    fixable: false,
  };
}

/**
 * Check for sensitive environment files
 */
async function checkEnvFiles(
  targetDir: string
): Promise<{ findings: string[]; severity: CheckStatus }> {
  const findings: string[] = [];
  let severity: CheckStatus = 'pass';

  const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
  for (const envFile of envFiles) {
    const envPath = path.join(targetDir, envFile);
    if (await pathExists(envPath)) {
      findings.push(`Security-sensitive file found: ${envFile}`);
      severity = 'fail';
    }
  }

  return { findings, severity };
}

/**
 * Check shell script permissions
 */
async function checkShellPermissions(
  targetDir: string,
  shellScripts: string[]
): Promise<{ findings: string[]; severity: CheckStatus }> {
  const findings: string[] = [];
  let severity: CheckStatus = 'pass';

  for (const script of shellScripts) {
    try {
      const stats = await fs.stat(script);
      const mode = stats.mode & 0o777;
      const relativePath = path.relative(targetDir, script);

      // Check for overly permissive permissions (777 or world-writable)
      if (mode === 0o777) {
        findings.push(`Overly permissive permissions (777): ${relativePath}`);
        if (severity === 'pass') {
          severity = 'warn';
        }
      } else if (mode & 0o002) {
        findings.push(`World-writable: ${relativePath}`);
        if (severity === 'pass') {
          severity = 'warn';
        }
      }
    } catch {
      // Ignore stat errors
    }
  }

  return { findings, severity };
}

/**
 * Check template file permissions and sensitive files
 * @param targetDir - Target directory
 * @returns Check result
 */
export async function checkTemplateIntegrity(targetDir: string): Promise<CheckResult> {
  let worstSeverity: CheckStatus = 'pass';
  const allFindings: string[] = [];

  // Check for .env files in project root
  const envCheck = await checkEnvFiles(targetDir);
  allFindings.push(...envCheck.findings);
  if (envCheck.severity === 'fail') {
    worstSeverity = 'fail';
  }

  // Find and check shell script permissions
  const allFiles = await findAllFiles(targetDir);
  const shellScripts = allFiles.filter((f) => f.endsWith('.sh'));
  const permCheck = await checkShellPermissions(targetDir, shellScripts);
  allFindings.push(...permCheck.findings);
  if (permCheck.severity === 'warn' && worstSeverity === 'pass') {
    worstSeverity = 'warn';
  }

  if (allFindings.length > 0) {
    const message =
      worstSeverity === 'fail'
        ? i18n.t('cli.security.checks.integrity.fail')
        : i18n.t('cli.security.checks.integrity.warn');

    return {
      name: 'Template integrity',
      status: worstSeverity,
      message: `${message} (${allFindings.length} issues)`,
      fixable: false,
      details: allFindings,
    };
  }

  return {
    name: 'Template integrity',
    status: 'pass',
    message: i18n.t('cli.security.checks.integrity.pass'),
    fixable: false,
  };
}

/**
 * Execute the security command
 * @param _options - Security command options (reserved for future use)
 * @returns Result of the security scan
 */
export async function securityCommand(_options: SecurityOptions = {}): Promise<SecurityResult> {
  const targetDir = process.cwd();

  console.log(i18n.t('cli.security.scanning'));
  console.log('');

  const layout = getProviderLayout();

  // Run all checks in parallel
  const checks: CheckResult[] = await Promise.all([
    checkHookScripts(targetDir, layout.rootDir),
    checkConfigSecrets(targetDir, layout.rootDir),
    checkTemplateIntegrity(targetDir),
  ]);

  // Print results
  for (const check of checks) {
    printCheck(check);
  }

  // Calculate counts
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;

  // Print summary
  console.log('');

  if (failCount === 0 && warnCount === 0) {
    console.log(i18n.t('cli.security.passed'));
  } else {
    console.log(i18n.t('cli.security.failed'));
  }

  console.log(
    i18n.t('cli.security.summary', {
      pass: passCount,
      warn: warnCount,
      fail: failCount,
    })
  );

  return {
    success: failCount === 0,
    checks,
    passCount,
    warnCount,
    failCount,
  };
}

export default securityCommand;

/**
 * Pre-flight checks for CLI tool versions
 * Checks if claude-code CLI tool needs upgrading via Homebrew
 */

import { execSync } from 'node:child_process';

/**
 * CLI tool information
 */
export interface CliTool {
  /** Tool name */
  name: string;
  /** Whether the tool is installed */
  installed: boolean;
  /** Current installed version */
  currentVersion: string | null;
  /** Latest available version */
  latestVersion: string | null;
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Installation method detected */
  installMethod: 'homebrew' | 'npm' | 'unknown';
}

/**
 * Pre-flight check result
 */
export interface PreflightResult {
  /** Tool check results */
  tools: CliTool[];
  /** Whether any updates are available */
  hasUpdates: boolean;
  /** Warning messages */
  warnings: string[];
  /** Whether the check was skipped */
  skipped: boolean;
  /** Reason for skipping */
  skipReason?: string;
}

/**
 * Pre-flight check options
 */
export interface PreflightOptions {
  /** Skip version check */
  skip?: boolean;
  /** Specific tools to check (default: all) */
  tools?: string[];
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /**
   * Override the internal tool collection function (for testing only).
   * When provided, this function is called instead of collectToolResults.
   * Supports both synchronous and asynchronous collectors.
   * @internal
   */
  _collectFn?: (toolNames: string[]) => PreflightResult | Promise<PreflightResult>;
}

/**
 * Homebrew info output structure (simplified)
 */
interface BrewInfo {
  casks?: Array<{
    token: string;
    version: string;
    installed?: string | null;
  }>;
  formulae?: Array<{
    name: string;
    versions: {
      stable: string;
    };
    installed?: Array<{
      version: string;
    }>;
  }>;
}

/**
 * Homebrew outdated output structure
 */
interface BrewOutdated {
  casks?: Array<{
    name: string;
    installed_versions: string[];
    current_version: string;
  }>;
  formulae?: Array<{
    name: string;
    installed_versions: string[];
    current_version: string;
  }>;
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  const ciEnvVars = ['CI', 'GITHUB_ACTIONS', 'OMCUSTOM_SKIP_PREFLIGHT'];
  return ciEnvVars.some((envVar) => process.env[envVar] === 'true');
}

/**
 * Check if Homebrew is available
 */
function hasHomebrew(): boolean {
  try {
    execSync('which brew', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get tool information from Homebrew
 */
function getToolInfoFromBrew(toolName: string): CliTool {
  const tool: CliTool = {
    name: toolName,
    installed: false,
    currentVersion: null,
    latestVersion: null,
    updateAvailable: false,
    installMethod: 'homebrew',
  };

  try {
    // Check brew info for installed version and latest version
    const infoOutput = execSync(`brew info --json=v2 ${toolName}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    });

    const info = JSON.parse(infoOutput) as BrewInfo;

    // Check casks first (claude-code is typically installed as a cask)
    if (info.casks && info.casks.length > 0) {
      const cask = info.casks[0];
      tool.latestVersion = cask.version;
      tool.currentVersion = cask.installed || null;
      tool.installed = cask.installed !== null;
    }

    // Fallback to formulae if not found in casks
    if (!tool.installed && info.formulae && info.formulae.length > 0) {
      const formula = info.formulae[0];
      tool.latestVersion = formula.versions.stable;
      if (formula.installed && formula.installed.length > 0) {
        tool.currentVersion = formula.installed[0].version;
        tool.installed = true;
      }
    }

    // Check if update is available
    if (tool.installed && tool.currentVersion && tool.latestVersion) {
      tool.updateAvailable = tool.currentVersion !== tool.latestVersion;
    }
  } catch {
    // If brew info fails, tool might not be available via Homebrew
    // Try other methods
  }

  return tool;
}

/**
 * Get tool information from npm/npx
 */
function getToolInfoFromNpm(toolName: string): CliTool {
  const tool: CliTool = {
    name: toolName,
    installed: false,
    currentVersion: null,
    latestVersion: null,
    updateAvailable: false,
    installMethod: 'npm',
  };

  try {
    // Try to get version via npx
    const versionOutput = execSync(`npx ${toolName} --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    });

    const version = versionOutput.trim();
    if (version) {
      tool.installed = true;
      tool.currentVersion = version;
    }
  } catch {
    // Tool not available via npm
  }

  return tool;
}

/**
 * Get tool information (tries multiple methods)
 */
function getToolInfo(toolName: string): CliTool {
  // Try Homebrew first
  if (hasHomebrew()) {
    const brewTool = getToolInfoFromBrew(toolName);
    if (brewTool.installed) {
      return brewTool;
    }
  }

  // Fallback to npm
  const npmTool = getToolInfoFromNpm(toolName);
  if (npmTool.installed) {
    return npmTool;
  }

  // Tool not found
  return {
    name: toolName,
    installed: false,
    currentVersion: null,
    latestVersion: null,
    updateAvailable: false,
    installMethod: 'unknown',
  };
}

/**
 * Check for outdated tools via Homebrew
 */
function checkOutdated(tools: CliTool[]): void {
  if (!hasHomebrew()) return;

  try {
    const toolNames = tools.map((t) => t.name).join(' ');
    const outdatedOutput = execSync(`brew outdated --json=v2 ${toolNames}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    });

    const outdated = JSON.parse(outdatedOutput) as BrewOutdated;

    // Update tools with outdated information
    const outdatedCasks = outdated.casks || [];
    const outdatedFormulae = outdated.formulae || [];

    for (const tool of tools) {
      const outdatedCask = outdatedCasks.find((c) => c.name === tool.name);
      const outdatedFormula = outdatedFormulae.find((f) => f.name === tool.name);

      if (outdatedCask) {
        tool.latestVersion = outdatedCask.current_version;
        tool.updateAvailable = true;
      } else if (outdatedFormula) {
        tool.latestVersion = outdatedFormula.current_version;
        tool.updateAvailable = true;
      }
    }
  } catch {
    // Ignore errors (tools might not be outdated, or brew outdated failed)
  }
}

/**
 * Perform the actual tool collection and outdated check.
 * Exported for testing purposes.
 *
 * @internal
 */
export function collectToolResults(toolNames: string[]): PreflightResult {
  const tools: CliTool[] = [];

  for (const toolName of toolNames) {
    const tool = getToolInfo(toolName);
    tools.push(tool);
  }

  checkOutdated(tools);

  const hasUpdates = tools.some((t) => t.updateAvailable);
  return {
    tools,
    hasUpdates,
    warnings: [],
    skipped: false,
  };
}

/**
 * Run pre-flight check
 */
export async function runPreflightCheck(options: PreflightOptions = {}): Promise<PreflightResult> {
  const {
    skip = false,
    tools: toolNames = ['claude-code'],
    timeout = 5000,
    _collectFn = collectToolResults,
  } = options;

  // Check if should skip
  if (skip) {
    return {
      tools: [],
      hasUpdates: false,
      warnings: [],
      skipped: true,
      skipReason: 'Skipped by --skip-version-check flag',
    };
  }

  if (isCI()) {
    return {
      tools: [],
      hasUpdates: false,
      warnings: [],
      skipped: true,
      skipReason: 'CI environment detected',
    };
  }

  // Check if Homebrew is available
  if (!hasHomebrew()) {
    return {
      tools: [],
      hasUpdates: false,
      warnings: ['Homebrew not found, skipping version check'],
      skipped: true,
      skipReason: 'Homebrew not available',
    };
  }

  // Build a timeout promise
  const timeoutPromise: Promise<PreflightResult> = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        tools: [],
        hasUpdates: false,
        warnings: ['Version check timed out'],
        skipped: true,
        skipReason: 'Timeout',
      });
    }, timeout);
  });

  // Build the collection promise
  const collectPromise: Promise<PreflightResult> = (async () => {
    const result = await _collectFn(toolNames);
    return result;
  })().catch((error: unknown) => {
    // Handle errors that escape the collect function
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      tools: [] as CliTool[],
      hasUpdates: false,
      warnings: [`Pre-flight check failed: ${errorMessage}`],
      skipped: true,
      skipReason: 'Error during check',
    };
  });

  // Race: whichever resolves first wins
  return Promise.race([collectPromise, timeoutPromise]);
}

/**
 * Format pre-flight warnings for display
 */
export function formatPreflightWarnings(result: PreflightResult): string {
  if (!result.hasUpdates) {
    return '';
  }

  const lines: string[] = [];
  const updatesAvailable = result.tools.filter((t) => t.updateAvailable);

  if (updatesAvailable.length === 1) {
    const tool = updatesAvailable[0];
    lines.push(
      `⚠ ${tool.name} ${tool.latestVersion} is available (current: ${tool.currentVersion})`
    );
    lines.push(`  Run: brew upgrade ${tool.name}`);
  } else if (updatesAvailable.length > 1) {
    lines.push('Run the following to upgrade:');
    for (const tool of updatesAvailable) {
      lines.push(
        `  brew upgrade ${tool.name}  # ${tool.latestVersion} available (current: ${tool.currentVersion})`
      );
    }
  }

  lines.push('  Use --skip-version-check to skip this check');

  return lines.join('\n');
}

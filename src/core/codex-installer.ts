/**
 * Codex CLI auto-installer
 */

// execSync is used here with fully hardcoded command strings (no user input),
// so there is no shell injection risk. The npm global install pattern requires
// a real shell, making execFile unsuitable for the install commands.
import { type ExecSyncOptions, execSync } from 'node:child_process';
import { platform } from 'node:os';
import { info, warn } from '../utils/logger.js';

export interface InstallerDeps {
  exec: (cmd: string, opts?: ExecSyncOptions) => string | Buffer;
  getPlatform: () => NodeJS.Platform;
}

const defaultDeps: InstallerDeps = {
  exec: execSync as InstallerDeps['exec'],
  getPlatform: platform,
};

/**
 * Check if Codex CLI is installed
 */
export function isCodexInstalled(deps: InstallerDeps = defaultDeps): boolean {
  try {
    deps.exec('which codex', { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Codex CLI version if installed
 */
export function getCodexVersion(deps: InstallerDeps = defaultDeps): string | null {
  try {
    return (
      deps.exec('codex --version', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 3000,
      }) as string
    ).trim();
  } catch {
    return null;
  }
}

/**
 * Install Codex CLI
 * @returns true if installation succeeded
 */
export function installCodex(deps: InstallerDeps = defaultDeps): boolean {
  // Skip in CI/test environments
  if (process.env.CI || process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
    return false;
  }

  if (isCodexInstalled(deps)) {
    info('codex.already_installed');
    return true;
  }

  const os = deps.getPlatform();

  try {
    if (os === 'darwin') {
      // macOS: try brew first, fall back to npm
      try {
        info('codex.installing_brew');
        deps.exec('brew install openai-codex', {
          stdio: 'inherit',
          timeout: 120000,
        });
        return isCodexInstalled(deps);
      } catch {
        // brew failed, try npm
        info('codex.installing_npm');
        deps.exec('npm install -g @openai/codex', {
          stdio: 'inherit',
          timeout: 120000,
        });
        return isCodexInstalled(deps);
      }
    } else if (os === 'linux') {
      info('codex.installing_npm');
      deps.exec('npm install -g @openai/codex', {
        stdio: 'inherit',
        timeout: 120000,
      });
      return isCodexInstalled(deps);
    } else {
      warn('codex.unsupported_os', { os });
      return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn('codex.install_failed', { error: message });
    return false;
  }
}

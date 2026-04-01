/**
 * RTK (Rust Token Killer) auto-installer
 */

// execSync is used here with fully hardcoded command strings (no user input),
// so there is no shell injection risk. The curl|sh pipe pattern requires a real
// shell, making execFile unsuitable for the install commands.
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
 * Check if RTK is installed
 */
export function isRtkInstalled(deps: InstallerDeps = defaultDeps): boolean {
  try {
    deps.exec('which rtk', { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get RTK version if installed
 */
export function getRtkVersion(deps: InstallerDeps = defaultDeps): string | null {
  try {
    return (
      deps.exec('rtk --version', { encoding: 'utf-8', stdio: 'pipe', timeout: 3000 }) as string
    ).trim();
  } catch {
    return null;
  }
}

/**
 * Install RTK binary
 * @returns true if installation succeeded
 */
export function installRtk(deps: InstallerDeps = defaultDeps): boolean {
  // Skip in CI/test environments
  if (process.env.CI || process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
    return false;
  }

  if (isRtkInstalled(deps)) {
    info('rtk.already_installed');
    return true;
  }

  const os = deps.getPlatform();

  try {
    if (os === 'darwin') {
      // macOS: try brew first, fall back to curl
      try {
        info('rtk.installing_brew');
        deps.exec('brew install rtk-ai/tap/rtk', {
          stdio: 'inherit',
          timeout: 120000,
        });
        return true;
      } catch {
        // brew failed, try curl
        info('rtk.installing_curl');
        deps.exec(
          'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh',
          {
            stdio: 'inherit',
            timeout: 120000,
          }
        );
        return isRtkInstalled(deps);
      }
    } else if (os === 'linux') {
      info('rtk.installing_curl');
      deps.exec(
        'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh',
        {
          stdio: 'inherit',
          timeout: 120000,
        }
      );
      return isRtkInstalled(deps);
    } else {
      warn('rtk.unsupported_os', { os });
      return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn('rtk.install_failed', { error: message });
    return false;
  }
}

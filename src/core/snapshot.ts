/**
 * Snapshot installation for oh-my-customcode
 * Handles installing from a pre-configured team snapshot directory
 */

import { existsSync } from 'node:fs';
import { copyFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import packageJson from '../../package.json';
import { readLockFile, writeLockFile } from '../cli/projects.js';
import { i18n } from '../i18n/index.js';
import { fileExists } from '../utils/fs.js';
import { registerProject } from './registry.js';
import { getProviderLayout } from './layout.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Language for templates and messages (en|ko) */
  lang?: 'en' | 'ko';
  /** Whether to overwrite existing files */
  force?: boolean;
  /**
   * Install only agents for the specified domain.
   * Valid values: backend, frontend, data-engineering, devops.
   * When omitted, all agents are installed (backward compatible).
   */
  domain?: string;
  /** Skip interactive wizard, use defaults */
  yes?: boolean;
  /** Install from a pre-configured team snapshot directory */
  fromSnapshot?: string;
}

/**
 * Result of the init command
 */
export interface InitResult {
  success: boolean;
  message: string;
  installedPaths?: string[];
  errors?: string[];
}

/**
 * Check if provider root directory already exists
 */
async function checkExistingInstallation(targetDir: string): Promise<boolean> {
  const layout = getProviderLayout();
  const rootDir = join(targetDir, layout.rootDir);
  return fileExists(rootDir);
}

/**
 * Install from a pre-configured team snapshot
 */
export async function installFromSnapshot(
  targetDir: string,
  snapshotPath: string,
  options: InitOptions
): Promise<InitResult> {
  // Validate snapshot path
  if (!existsSync(snapshotPath)) {
    return {
      success: false,
      message: i18n.t('cli.init.failed'),
      errors: [`Snapshot path not found: ${snapshotPath}`],
    };
  }

  const layout = getProviderLayout();
  const snapshotClaude = join(snapshotPath, layout.rootDir);
  if (!existsSync(snapshotClaude)) {
    return {
      success: false,
      message: i18n.t('cli.init.failed'),
      errors: [`Invalid snapshot: missing ${layout.rootDir}/ directory in ${snapshotPath}`],
    };
  }

  console.log(`Installing from snapshot: ${snapshotPath}`);

  try {
    // Backup existing installation if present
    const exists = await checkExistingInstallation(targetDir);
    if (exists && !options.force) {
      console.log(i18n.t('cli.init.exists', { rootDir: layout.rootDir }));
      console.log(i18n.t('cli.init.backing_up'));

      const backupDir = join(
        targetDir,
        `.claude-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1)}`
      );
      await cp(join(targetDir, layout.rootDir), backupDir, { recursive: true });
      console.log(`  Backed up to: ${backupDir}`);
    }

    // Copy .claude/ from snapshot
    await cp(snapshotClaude, join(targetDir, layout.rootDir), {
      recursive: true,
      force: true,
    });

    // Copy guides/ from snapshot if present
    const snapshotGuides = join(snapshotPath, 'guides');
    if (existsSync(snapshotGuides)) {
      await cp(snapshotGuides, join(targetDir, 'guides'), {
        recursive: true,
        force: true,
      });
    }

    // Copy entry file (CLAUDE.md) from snapshot if present
    const snapshotEntry = join(snapshotPath, layout.entryFile);
    if (existsSync(snapshotEntry)) {
      await copyFile(snapshotEntry, join(targetDir, layout.entryFile));
    }

    // Update lock file
    try {
      const existing = await readLockFile(targetDir);
      await writeLockFile(targetDir, packageJson.version, existing);
    } catch {
      // Non-blocking
    }

    // Register project in the local registry (non-blocking)
    try {
      await registerProject(targetDir, packageJson.version);
    } catch {
      // Registry write is informational only — never block snapshot install
    }

    console.log(i18n.t('cli.init.success'));
    console.log(`\nInstalled from snapshot: ${snapshotPath}`);

    return {
      success: true,
      message: `Installed from snapshot: ${snapshotPath}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(i18n.t('cli.init.failed'), errorMessage);
    return {
      success: false,
      message: i18n.t('cli.init.failed'),
      errors: [errorMessage],
    };
  }
}

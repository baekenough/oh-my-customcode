/**
 * File preservation module for init backup
 *
 * Extracts critical user files before backup, restores them after installation.
 */

import { basename, join } from 'node:path';
import {
  copyDirectory,
  copyFile,
  ensureDirectory,
  fileExists,
  readJsonFile,
  writeJsonFile,
} from '../utils/fs.js';
import { debug, warn } from '../utils/logger.js';

/**
 * Files/directories that must be preserved during init backup.
 * These contain user customizations that cannot be regenerated from templates.
 */
export const DEFAULT_CRITICAL_FILES = ['settings.json', 'settings.local.json'] as const;

/**
 * Directories that must be preserved during init backup.
 */
export const DEFAULT_CRITICAL_DIRECTORIES = ['agent-memory', 'agent-memory-local'] as const;

/**
 * Framework files that contain AI behavioral constraints.
 * These MUST NOT be auto-updated without explicit user confirmation.
 * Overwriting these files could subvert AI safety controls.
 *
 * This list is hardcoded (not configurable) to prevent
 * a compromised config file from removing protection.
 */
export const PROTECTED_FRAMEWORK_FILES = ['CLAUDE.md', 'AGENTS.md'] as const;

/**
 * Glob patterns for protected rule files.
 * MUST-*.md files define AI behavioral constraints that should
 * never be silently overwritten during updates.
 */
export const PROTECTED_RULE_PATTERNS = ['rules/MUST-*.md'] as const;

/**
 * Check if a file path matches a protected framework file or pattern.
 * @param relativePath - Path relative to the .claude/ directory (or project root for entry docs)
 * @returns true if the file is protected
 */
export function isProtectedFile(relativePath: string): boolean {
  // Check exact matches (entry docs at project root level)
  const basename = relativePath.split('/').pop() ?? '';
  if ((PROTECTED_FRAMEWORK_FILES as readonly string[]).includes(basename)) {
    return true;
  }

  // Check rule patterns
  for (const pattern of PROTECTED_RULE_PATTERNS) {
    if (matchesGlobPattern(relativePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob pattern matcher for protected file checks.
 * Supports only the * wildcard (not **).
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '[^/]*'); // Convert * to match within single path segment
  const regex = new RegExp(`(^|/)${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Result of file preservation extraction
 */
export interface PreservationResult {
  /** Temporary directory where files were extracted */
  tempDir: string;
  /** Files successfully extracted */
  extractedFiles: string[];
  /** Directories successfully extracted */
  extractedDirs: string[];
  /** Files that failed to extract (with reasons) */
  failures: { path: string; reason: string }[];
}

/**
 * Result of file preservation restoration
 */
export interface RestorationResult {
  /** Files successfully restored */
  restoredFiles: string[];
  /** Directories successfully restored */
  restoredDirs: string[];
  /** Files that failed to restore (with reasons) */
  failures: { path: string; reason: string }[];
}

/**
 * Extract a single file to the temp directory.
 * Pushes to result.extractedFiles on success, result.failures on error.
 */
async function extractSingleFile(
  fileName: string,
  rootDir: string,
  tempDir: string,
  result: PreservationResult
): Promise<void> {
  const srcPath = join(rootDir, fileName);
  const destPath = join(tempDir, fileName);
  try {
    if (await fileExists(srcPath)) {
      await copyFile(srcPath, destPath);
      result.extractedFiles.push(fileName);
      debug('preserve.extracted_file', { file: fileName });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result.failures.push({ path: fileName, reason });
    warn('preserve.extract_failed', { file: fileName, error: reason });
  }
}

/**
 * Extract a single directory to the temp directory.
 * Pushes to result.extractedDirs on success, result.failures on error.
 */
async function extractSingleDir(
  dirName: string,
  rootDir: string,
  tempDir: string,
  result: PreservationResult
): Promise<void> {
  const srcPath = join(rootDir, dirName);
  const destPath = join(tempDir, dirName);
  try {
    if (await fileExists(srcPath)) {
      await copyDirectory(srcPath, destPath, { overwrite: true, preserveTimestamps: true });
      result.extractedDirs.push(dirName);
      debug('preserve.extracted_dir', { dir: dirName });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result.failures.push({ path: dirName, reason });
    warn('preserve.extract_dir_failed', { dir: dirName, error: reason });
  }
}

/**
 * Extract critical user files from .claude/ to a temp directory before backup.
 *
 * @param rootDir - The .claude directory path (e.g., /project/.claude)
 * @param tempDir - Temporary directory to extract files to
 * @param additionalFiles - Extra files to preserve beyond defaults
 * @returns PreservationResult
 */
export async function extractCriticalFiles(
  rootDir: string,
  tempDir: string,
  additionalFiles: string[] = []
): Promise<PreservationResult> {
  const result: PreservationResult = {
    tempDir,
    extractedFiles: [],
    extractedDirs: [],
    failures: [],
  };

  await ensureDirectory(tempDir);

  const filesToExtract = [...DEFAULT_CRITICAL_FILES, ...additionalFiles];
  for (const fileName of filesToExtract) {
    await extractSingleFile(fileName, rootDir, tempDir, result);
  }

  for (const dirName of DEFAULT_CRITICAL_DIRECTORIES) {
    await extractSingleDir(dirName, rootDir, tempDir, result);
  }

  return result;
}

/**
 * Restore previously extracted critical files back to .claude/ after installation.
 *
 * For JSON files (settings.json, settings.local.json), performs deep merge
 * to combine user customizations with new template defaults.
 * For directories, copies them back directly.
 *
 * @param rootDir - The .claude directory path
 * @param preservation - Result from extractCriticalFiles
 * @returns RestorationResult
 */
export async function restoreCriticalFiles(
  rootDir: string,
  preservation: PreservationResult
): Promise<RestorationResult> {
  const result: RestorationResult = {
    restoredFiles: [],
    restoredDirs: [],
    failures: [],
  };

  // Restore files (with deep merge for JSON files)
  for (const fileName of preservation.extractedFiles) {
    const preservedPath = join(preservation.tempDir, fileName);
    const targetPath = join(rootDir, fileName);

    try {
      if (fileName.endsWith('.json')) {
        await mergeJsonFile(preservedPath, targetPath);
      } else {
        await copyFile(preservedPath, targetPath);
      }
      result.restoredFiles.push(fileName);
      debug('preserve.restored_file', { file: fileName });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failures.push({ path: fileName, reason });
      warn('preserve.restore_failed', { file: fileName, error: reason });
    }
  }

  // Restore directories
  for (const dirName of preservation.extractedDirs) {
    const preservedPath = join(preservation.tempDir, dirName);
    const targetPath = join(rootDir, dirName);

    try {
      await copyDirectory(preservedPath, targetPath, {
        overwrite: false,
        preserveTimestamps: true,
      });
      result.restoredDirs.push(dirName);
      debug('preserve.restored_dir', { dir: dirName });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failures.push({ path: dirName, reason });
      warn('preserve.restore_dir_failed', { dir: dirName, error: reason });
    }
  }

  return result;
}

/**
 * Deep merge a preserved JSON file with the newly installed version.
 *
 * Strategy: preserved (user) values take precedence over new (template) values.
 * This ensures user customizations are never lost.
 */
export async function mergeJsonFile(preservedPath: string, targetPath: string): Promise<void> {
  const preservedData = await readJsonFile<Record<string, unknown>>(preservedPath);

  if (await fileExists(targetPath)) {
    const targetData = await readJsonFile<Record<string, unknown>>(targetPath);
    const merged = deepMerge(targetData, preservedData);
    await writeJsonFile(targetPath, merged);
    debug('preserve.merged_json', { file: basename(targetPath) });
  } else {
    // No new file installed, just copy preserved file back
    await copyFile(preservedPath, targetPath);
    debug('preserve.copied_json', { file: basename(targetPath) });
  }
}

/**
 * Deep merge two objects. Source values take precedence.
 * Arrays are replaced (not concatenated) to avoid duplicates.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      // Source (preserved user data) takes precedence
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Cleanup temporary preservation directory
 */
export async function cleanupPreservation(tempDir: string): Promise<void> {
  try {
    const { rm } = await import('node:fs/promises');
    await rm(tempDir, { recursive: true, force: true });
    debug('preserve.cleanup', { dir: tempDir });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn('preserve.cleanup_failed', { dir: tempDir, error: reason });
  }
}

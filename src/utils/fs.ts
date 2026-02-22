/**
 * File system utilities
 */

import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Result of path validation
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;
  /** Reason for rejection (if invalid) */
  reason?: string;
}

/**
 * Validate a preserveFiles path for security (path traversal prevention)
 *
 * @param filePath - The file path to validate
 * @param projectRoot - The project root directory
 * @returns Validation result with reason if invalid
 */
export function validatePreserveFilePath(
  filePath: string,
  projectRoot: string
): PathValidationResult {
  // Reject empty strings
  if (!filePath || filePath.trim() === '') {
    return {
      valid: false,
      reason: 'Path cannot be empty',
    };
  }

  // Reject absolute paths
  if (isAbsolute(filePath)) {
    return {
      valid: false,
      reason: 'Absolute paths are not allowed',
    };
  }

  // Resolve the path against the project root and verify it stays within bounds.
  // This handles all traversal patterns (../../etc/passwd) on both POSIX and Windows.
  const resolvedPath = resolve(projectRoot, filePath);
  const relativePath = relative(projectRoot, resolvedPath);

  // If relative path starts with .. or is absolute, it escaped the project root
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return {
      valid: false,
      reason: 'Path cannot traverse outside project root',
    };
  }

  return { valid: true };
}

/**
 * Options for copying directories
 */
export interface CopyOptions {
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** File patterns to exclude (glob patterns) */
  exclude?: string[];
  /** File patterns to include (glob patterns) */
  include?: string[];
  /** Preserve file timestamps */
  preserveTimestamps?: boolean;
  /** Preserve symlinks instead of following them */
  preserveSymlinks?: boolean;
  /** Paths to skip during copy (relative to dest root) */
  skipPaths?: string[];
}

/**
 * Check if a file or directory exists
 */
export async function fileExists(path: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectory(path: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.mkdir(path, { recursive: true });
}

/**
 * Check if entry should be skipped based on include/exclude patterns
 */
function shouldSkipEntry(entryName: string, options: CopyOptions): boolean {
  if (options.exclude?.some((pattern) => matchesPattern(entryName, pattern))) {
    return true;
  }
  if (options.include && !options.include.some((pattern) => matchesPattern(entryName, pattern))) {
    return true;
  }
  return false;
}

/**
 * Handle copying a symlink entry
 */
async function handleSymlink(
  srcPath: string,
  destPath: string,
  options: CopyOptions,
  fs: typeof import('node:fs/promises')
): Promise<void> {
  const destExists = await fileExists(destPath);
  if (destExists && !options.overwrite) {
    return;
  }

  if (options.preserveSymlinks !== false) {
    await copyPreservedSymlink(srcPath, destPath, destExists, fs);
  } else {
    await copyFollowedSymlink(srcPath, destPath, destExists, options, fs);
  }
}

/**
 * Copy symlink while preserving the link
 */
async function copyPreservedSymlink(
  srcPath: string,
  destPath: string,
  destExists: boolean,
  fs: typeof import('node:fs/promises')
): Promise<void> {
  const linkTarget = await fs.readlink(srcPath);
  if (destExists) {
    await fs.unlink(destPath);
  }
  await fs.symlink(linkTarget, destPath);
}

/**
 * Copy symlink by following it and copying the actual content
 */
async function copyFollowedSymlink(
  srcPath: string,
  destPath: string,
  destExists: boolean,
  options: CopyOptions,
  fs: typeof import('node:fs/promises')
): Promise<void> {
  const realPath = await fs.realpath(srcPath);
  const stat = await fs.stat(realPath);

  if (stat.isDirectory()) {
    await copyDirectory(realPath, destPath, options);
    return;
  }

  if (destExists) {
    await fs.unlink(destPath);
  }
  await fs.copyFile(realPath, destPath);
}

/**
 * Handle copying a regular file entry
 */
async function handleFile(
  srcPath: string,
  destPath: string,
  options: CopyOptions,
  fs: typeof import('node:fs/promises')
): Promise<void> {
  const destExists = await fileExists(destPath);
  if (destExists && !options.overwrite) {
    return;
  }

  await fs.copyFile(srcPath, destPath);

  if (options.preserveTimestamps) {
    const stats = await fs.stat(srcPath);
    await fs.utimes(destPath, stats.atime, stats.mtime);
  }
}

/**
 * Check if path should be skipped based on skipPaths option
 */
function shouldSkipPath(destPath: string, destRoot: string, skipPaths?: string[]): boolean {
  if (!skipPaths || skipPaths.length === 0) {
    return false;
  }

  const relativePath = relative(destRoot, destPath);

  for (const skipPath of skipPaths) {
    // If skipPath ends with '/', it means skip entire directory
    if (skipPath.endsWith('/')) {
      const dirPath = skipPath.slice(0, -1);
      if (relativePath === dirPath || relativePath.startsWith(dirPath + sep)) {
        return true;
      }
    } else {
      // Exact file match
      if (relativePath === skipPath) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Copy a directory recursively
 */
export async function copyDirectory(
  src: string,
  dest: string,
  options: CopyOptions = {}
): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  await ensureDirectory(dest);

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name, options)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Check if this path should be skipped
    if (shouldSkipPath(destPath, dest, options.skipPaths)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      await handleSymlink(srcPath, destPath, options, fs);
    } else if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, options);
    } else if (entry.isFile()) {
      await handleFile(srcPath, destPath, options, fs);
    }
  }
}

/**
 * Read a JSON file and parse it
 */
export async function readJsonFile<T>(path: string): Promise<T> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write data to a JSON file
 */
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const fs = await import('node:fs/promises');
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(path, content, 'utf-8');
}

/**
 * Read a text file
 */
export async function readTextFile(path: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(path, 'utf-8');
}

/**
 * Write a text file
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await ensureDirectory(dirname(path));
  await fs.writeFile(path, content, 'utf-8');
}

/**
 * Delete a file or directory
 */
export async function remove(path: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const stat = await fs.stat(path);

  if (stat.isDirectory()) {
    await fs.rm(path, { recursive: true, force: true });
  } else {
    await fs.unlink(path);
  }
}

/**
 * Get the package root directory
 */
export function getPackageRoot(): string {
  // In ESM, we need to derive the package root from import.meta.url
  // This works both in development and when installed as a package
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Navigate up from src/utils to package root
  return resolve(currentDir, '..', '..');
}

/**
 * Resolve a path relative to the templates directory
 */
export function resolveTemplatePath(relativePath: string): string {
  const packageRoot = getPackageRoot();
  return join(packageRoot, 'templates', relativePath);
}

/**
 * List files in a directory
 */
export async function listFiles(
  dir: string,
  options: { recursive?: boolean; pattern?: string } = {}
): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const files: string[] = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && options.recursive) {
      const subFiles = await listFiles(fullPath, options);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      if (!options.pattern || matchesPattern(entry.name, options.pattern)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Get file stats
 */
export async function getFileStats(path: string): Promise<{
  size: number;
  created: Date;
  modified: Date;
  isDirectory: boolean;
  isFile: boolean;
}> {
  const fs = await import('node:fs/promises');
  const stats = await fs.stat(path);

  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
  };
}

/**
 * Copy a single file
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await ensureDirectory(dirname(dest));
  await fs.copyFile(src, dest);
}

/**
 * Move a file or directory
 */
export async function move(src: string, dest: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await ensureDirectory(dirname(dest));
  await fs.rename(src, dest);
}

/**
 * Create a temporary directory
 */
export async function createTempDir(prefix = 'omcustom-'): Promise<string> {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');

  const tempBase = os.tmpdir();
  const tempDir = path.join(tempBase, `${prefix}${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  return tempDir;
}

/**
 * Calculate file checksum (MD5)
 */
export async function calculateChecksum(path: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const crypto = await import('node:crypto');

  const content = await fs.readFile(path);
  const hash = crypto.createHash('md5');
  hash.update(content);

  return hash.digest('hex');
}

/**
 * Check if two files are identical
 */
export async function filesAreIdentical(path1: string, path2: string): Promise<boolean> {
  const [checksum1, checksum2] = await Promise.all([
    calculateChecksum(path1),
    calculateChecksum(path2),
  ]);

  return checksum1 === checksum2;
}

/**
 * Simple pattern matching (supports * wildcard)
 */
function matchesPattern(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Get relative path from base
 */
export function getRelativePath(basePath: string, fullPath: string): string {
  return relative(basePath, fullPath);
}

/**
 * Normalize path separators for cross-platform compatibility
 */
export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(inputPath: string): boolean {
  return isAbsolute(inputPath);
}

/**
 * Resolve path relative to current working directory
 */
export function resolvePath(...paths: string[]): string {
  return resolve(...paths);
}

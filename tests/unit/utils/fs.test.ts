import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  calculateChecksum,
  copyDirectory,
  copyFile,
  createTempDir,
  ensureDirectory,
  fileExists,
  filesAreIdentical,
  getFileStats,
  getPackageRoot,
  getRelativePath,
  isAbsolutePath,
  listFiles,
  move,
  normalizePath,
  readJsonFile,
  readTextFile,
  remove,
  resolvePath,
  resolveTemplatePath,
  validatePreserveFilePath,
  writeJsonFile,
  writeTextFile,
} from '../../../src/utils/fs.js';

describe('fs utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-fs-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      const exists = await fileExists(filePath);

      expect(exists).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const filePath = join(tempDir, 'nonexistent.txt');

      const exists = await fileExists(filePath);

      expect(exists).toBe(false);
    });

    it('should return true when directory exists', async () => {
      const dirPath = join(tempDir, 'subdir');
      await mkdir(dirPath);

      const exists = await fileExists(dirPath);

      expect(exists).toBe(true);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory if not exists', async () => {
      const dirPath = join(tempDir, 'newdir');

      await ensureDirectory(dirPath);

      const exists = await fileExists(dirPath);
      expect(exists).toBe(true);
    });

    it('should not error if directory already exists', async () => {
      const dirPath = join(tempDir, 'existingdir');
      await mkdir(dirPath);

      // Should not throw
      await ensureDirectory(dirPath);

      const exists = await fileExists(dirPath);
      expect(exists).toBe(true);
    });

    it('should create nested directories', async () => {
      const deepPath = join(tempDir, 'a', 'b', 'c', 'd');

      await ensureDirectory(deepPath);

      const exists = await fileExists(deepPath);
      expect(exists).toBe(true);
    });
  });

  describe('copyDirectory', () => {
    it('should copy directory contents recursively', async () => {
      // Create source structure
      const srcDir = join(tempDir, 'src');
      await mkdir(srcDir);
      await writeFile(join(srcDir, 'file1.txt'), 'content1');
      await mkdir(join(srcDir, 'subdir'));
      await writeFile(join(srcDir, 'subdir', 'file2.txt'), 'content2');

      const destDir = join(tempDir, 'dest');

      await copyDirectory(srcDir, destDir);

      expect(await fileExists(join(destDir, 'file1.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'subdir', 'file2.txt'))).toBe(true);

      const content1 = await readFile(join(destDir, 'file1.txt'), 'utf-8');
      const content2 = await readFile(join(destDir, 'subdir', 'file2.txt'), 'utf-8');
      expect(content1).toBe('content1');
      expect(content2).toBe('content2');
    });

    it('should overwrite files when overwrite option is true', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await mkdir(destDir);
      await writeFile(join(srcDir, 'file.txt'), 'new content');
      await writeFile(join(destDir, 'file.txt'), 'old content');

      await copyDirectory(srcDir, destDir, { overwrite: true });

      const content = await readFile(join(destDir, 'file.txt'), 'utf-8');
      expect(content).toBe('new content');
    });

    it('should not overwrite files when overwrite option is false', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await mkdir(destDir);
      await writeFile(join(srcDir, 'file.txt'), 'new content');
      await writeFile(join(destDir, 'file.txt'), 'old content');

      await copyDirectory(srcDir, destDir, { overwrite: false });

      const content = await readFile(join(destDir, 'file.txt'), 'utf-8');
      expect(content).toBe('old content');
    });

    it('should exclude files matching exclude patterns', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await writeFile(join(srcDir, 'file.txt'), 'content');
      await writeFile(join(srcDir, 'file.log'), 'log content');

      await copyDirectory(srcDir, destDir, { exclude: ['*.log'] });

      expect(await fileExists(join(destDir, 'file.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'file.log'))).toBe(false);
    });

    it('should only include files matching include patterns', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await writeFile(join(srcDir, 'file.txt'), 'content');
      await writeFile(join(srcDir, 'file.md'), 'markdown');
      await writeFile(join(srcDir, 'file.log'), 'log');

      await copyDirectory(srcDir, destDir, { include: ['*.txt', '*.md'] });

      expect(await fileExists(join(destDir, 'file.txt'))).toBe(true);
      expect(await fileExists(join(destDir, 'file.md'))).toBe(true);
      expect(await fileExists(join(destDir, 'file.log'))).toBe(false);
    });

    it('should handle symlinks correctly when preserveSymlinks is true', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await writeFile(join(srcDir, 'target.txt'), 'target content');
      await symlink(join(srcDir, 'target.txt'), join(srcDir, 'link.txt'));

      await copyDirectory(srcDir, destDir, { preserveSymlinks: true });

      expect(await fileExists(join(destDir, 'link.txt'))).toBe(true);
    });

    it('should not overwrite symlinks when overwrite is false', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await mkdir(destDir);
      await writeFile(join(srcDir, 'target.txt'), 'source target');
      await symlink(join(srcDir, 'target.txt'), join(srcDir, 'link.txt'));
      // Create existing symlink at destination
      await writeFile(join(destDir, 'existing-target.txt'), 'existing target');
      await symlink(join(destDir, 'existing-target.txt'), join(destDir, 'link.txt'));

      await copyDirectory(srcDir, destDir, { preserveSymlinks: true, overwrite: false });

      // Original symlink should still exist, not be overwritten
      expect(await fileExists(join(destDir, 'link.txt'))).toBe(true);
    });

    it('should overwrite symlinks when overwrite is true', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await mkdir(destDir);
      await writeFile(join(srcDir, 'target.txt'), 'source target');
      await symlink(join(srcDir, 'target.txt'), join(srcDir, 'link.txt'));
      // Create existing file at destination
      await writeFile(join(destDir, 'link.txt'), 'old content');

      await copyDirectory(srcDir, destDir, { preserveSymlinks: true, overwrite: true });

      expect(await fileExists(join(destDir, 'link.txt'))).toBe(true);
    });

    it('should follow symlinks when preserveSymlinks is false', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await writeFile(join(srcDir, 'target.txt'), 'target content');
      await symlink(join(srcDir, 'target.txt'), join(srcDir, 'link.txt'));

      await copyDirectory(srcDir, destDir, { preserveSymlinks: false });

      expect(await fileExists(join(destDir, 'link.txt'))).toBe(true);
      // The content should be the file content, not a symlink
      const content = await readFile(join(destDir, 'link.txt'), 'utf-8');
      expect(content).toBe('target content');
    });

    it('should follow symlinks to directories when preserveSymlinks is false', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');
      const targetDir = join(srcDir, 'target-dir');

      await mkdir(srcDir);
      await mkdir(targetDir);
      await writeFile(join(targetDir, 'file.txt'), 'file in target dir');
      await symlink(targetDir, join(srcDir, 'link-dir'));

      await copyDirectory(srcDir, destDir, { preserveSymlinks: false });

      // The directory should be copied
      expect(await fileExists(join(destDir, 'link-dir', 'file.txt'))).toBe(true);
      const content = await readFile(join(destDir, 'link-dir', 'file.txt'), 'utf-8');
      expect(content).toBe('file in target dir');
    });

    it('should overwrite when following symlinks with overwrite true', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await mkdir(destDir);
      await writeFile(join(srcDir, 'target.txt'), 'new target content');
      await symlink(join(srcDir, 'target.txt'), join(srcDir, 'link.txt'));
      // Create existing file at destination
      await writeFile(join(destDir, 'link.txt'), 'old content');

      await copyDirectory(srcDir, destDir, { preserveSymlinks: false, overwrite: true });

      const content = await readFile(join(destDir, 'link.txt'), 'utf-8');
      expect(content).toBe('new target content');
    });

    it('should preserve timestamps when preserveTimestamps is true', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');

      await mkdir(srcDir);
      await writeFile(join(srcDir, 'file.txt'), 'content');

      // Get original stats
      const srcStats = await stat(join(srcDir, 'file.txt'));

      await copyDirectory(srcDir, destDir, { preserveTimestamps: true });

      const destStats = await stat(join(destDir, 'file.txt'));

      // Modification times should be close (within 1 second)
      expect(Math.abs(srcStats.mtime.getTime() - destStats.mtime.getTime())).toBeLessThan(1000);
    });
  });

  describe('readJsonFile', () => {
    it('should parse JSON file contents', async () => {
      const filePath = join(tempDir, 'test.json');
      const data = { key: 'value', number: 42, nested: { a: 1 } };
      await writeFile(filePath, JSON.stringify(data));

      const result = await readJsonFile<typeof data>(filePath);

      expect(result).toEqual(data);
    });

    it('should throw on invalid JSON', async () => {
      const filePath = join(tempDir, 'invalid.json');
      await writeFile(filePath, 'not valid json');

      await expect(readJsonFile(filePath)).rejects.toThrow();
    });

    it('should throw on non-existent file', async () => {
      const filePath = join(tempDir, 'nonexistent.json');

      await expect(readJsonFile(filePath)).rejects.toThrow();
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON file with pretty formatting', async () => {
      const filePath = join(tempDir, 'output.json');
      const data = { key: 'value', nested: { a: 1 } };

      await writeJsonFile(filePath, data);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('\n'); // Pretty printed
      expect(JSON.parse(content)).toEqual(data);
    });

    it('should overwrite existing file', async () => {
      const filePath = join(tempDir, 'output.json');
      await writeFile(filePath, '{"old": "data"}');

      await writeJsonFile(filePath, { new: 'data' });

      const result = await readJsonFile<{ new: string }>(filePath);
      expect(result.new).toBe('data');
    });
  });

  describe('readTextFile', () => {
    it('should read text file content', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'Hello, World!');

      const content = await readTextFile(filePath);

      expect(content).toBe('Hello, World!');
    });

    it('should handle UTF-8 content', async () => {
      const filePath = join(tempDir, 'unicode.txt');
      await writeFile(filePath, '한글 테스트 🎉');

      const content = await readTextFile(filePath);

      expect(content).toBe('한글 테스트 🎉');
    });

    it('should throw on non-existent file', async () => {
      const filePath = join(tempDir, 'nonexistent.txt');

      await expect(readTextFile(filePath)).rejects.toThrow();
    });
  });

  describe('writeTextFile', () => {
    it('should write text file', async () => {
      const filePath = join(tempDir, 'output.txt');

      await writeTextFile(filePath, 'Test content');

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should create parent directories if needed', async () => {
      const filePath = join(tempDir, 'nested', 'dir', 'output.txt');

      await writeTextFile(filePath, 'Test content');

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should handle UTF-8 content', async () => {
      const filePath = join(tempDir, 'unicode.txt');

      await writeTextFile(filePath, '한글 콘텐츠 ✨');

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('한글 콘텐츠 ✨');
    });
  });

  describe('remove', () => {
    it('should delete a file', async () => {
      const filePath = join(tempDir, 'file.txt');
      await writeFile(filePath, 'content');

      await remove(filePath);

      expect(await fileExists(filePath)).toBe(false);
    });

    it('should delete a directory recursively', async () => {
      const dirPath = join(tempDir, 'subdir');
      await mkdir(dirPath);
      await writeFile(join(dirPath, 'file.txt'), 'content');

      await remove(dirPath);

      expect(await fileExists(dirPath)).toBe(false);
    });

    it('should throw on non-existent path', async () => {
      const filePath = join(tempDir, 'nonexistent');

      await expect(remove(filePath)).rejects.toThrow();
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content');
      await writeFile(join(tempDir, 'file2.txt'), 'content');

      const files = await listFiles(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toContain(join(tempDir, 'file1.txt'));
      expect(files).toContain(join(tempDir, 'file2.txt'));
    });

    it('should list files recursively when recursive option is true', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content');
      await mkdir(join(tempDir, 'subdir'));
      await writeFile(join(tempDir, 'subdir', 'file2.txt'), 'content');

      const files = await listFiles(tempDir, { recursive: true });

      expect(files).toHaveLength(2);
      expect(files).toContain(join(tempDir, 'file1.txt'));
      expect(files).toContain(join(tempDir, 'subdir', 'file2.txt'));
    });

    it('should not list files recursively by default', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content');
      await mkdir(join(tempDir, 'subdir'));
      await writeFile(join(tempDir, 'subdir', 'file2.txt'), 'content');

      const files = await listFiles(tempDir);

      expect(files).toHaveLength(1);
      expect(files).toContain(join(tempDir, 'file1.txt'));
    });

    it('should filter files by pattern', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content');
      await writeFile(join(tempDir, 'file.md'), 'content');
      await writeFile(join(tempDir, 'file.log'), 'content');

      const files = await listFiles(tempDir, { pattern: '*.txt' });

      expect(files).toHaveLength(1);
      expect(files).toContain(join(tempDir, 'file.txt'));
    });
  });

  describe('getFileStats', () => {
    it('should return file stats', async () => {
      const filePath = join(tempDir, 'file.txt');
      await writeFile(filePath, 'test content');

      const stats = await getFileStats(filePath);

      expect(stats.size).toBeGreaterThan(0);
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.created).toBeInstanceOf(Date);
      expect(stats.modified).toBeInstanceOf(Date);
    });

    it('should return directory stats', async () => {
      const dirPath = join(tempDir, 'subdir');
      await mkdir(dirPath);

      const stats = await getFileStats(dirPath);

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('should throw on non-existent path', async () => {
      const filePath = join(tempDir, 'nonexistent');

      await expect(getFileStats(filePath)).rejects.toThrow();
    });
  });

  describe('copyFile', () => {
    it('should copy a single file', async () => {
      const srcPath = join(tempDir, 'src.txt');
      const destPath = join(tempDir, 'dest.txt');
      await writeFile(srcPath, 'source content');

      await copyFile(srcPath, destPath);

      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe('source content');
    });

    it('should create parent directories if needed', async () => {
      const srcPath = join(tempDir, 'src.txt');
      const destPath = join(tempDir, 'nested', 'dir', 'dest.txt');
      await writeFile(srcPath, 'source content');

      await copyFile(srcPath, destPath);

      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe('source content');
    });
  });

  describe('move', () => {
    it('should move a file', async () => {
      const srcPath = join(tempDir, 'src.txt');
      const destPath = join(tempDir, 'dest.txt');
      await writeFile(srcPath, 'content');

      await move(srcPath, destPath);

      expect(await fileExists(srcPath)).toBe(false);
      expect(await fileExists(destPath)).toBe(true);
      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe('content');
    });

    it('should move a directory', async () => {
      const srcDir = join(tempDir, 'src');
      const destDir = join(tempDir, 'dest');
      await mkdir(srcDir);
      await writeFile(join(srcDir, 'file.txt'), 'content');

      await move(srcDir, destDir);

      expect(await fileExists(srcDir)).toBe(false);
      expect(await fileExists(join(destDir, 'file.txt'))).toBe(true);
    });

    it('should create parent directories if needed', async () => {
      const srcPath = join(tempDir, 'src.txt');
      const destPath = join(tempDir, 'nested', 'dir', 'dest.txt');
      await writeFile(srcPath, 'content');

      await move(srcPath, destPath);

      expect(await fileExists(destPath)).toBe(true);
    });
  });

  describe('createTempDir', () => {
    it('should create temporary directory', async () => {
      const tempDirPath = await createTempDir();

      expect(await fileExists(tempDirPath)).toBe(true);

      // Cleanup
      await rm(tempDirPath, { recursive: true, force: true });
    });

    it('should use custom prefix', async () => {
      const tempDirPath = await createTempDir('myprefix-');

      expect(tempDirPath).toContain('myprefix-');

      // Cleanup
      await rm(tempDirPath, { recursive: true, force: true });
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate MD5 checksum', async () => {
      const filePath = join(tempDir, 'file.txt');
      await writeFile(filePath, 'test content');

      const checksum = await calculateChecksum(filePath);

      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(32); // MD5 hash length
    });

    it('should return same checksum for same content', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      await writeFile(file1, 'identical content');
      await writeFile(file2, 'identical content');

      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);

      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksum for different content', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      await writeFile(file1, 'content 1');
      await writeFile(file2, 'content 2');

      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('filesAreIdentical', () => {
    it('should return true for identical files', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      await writeFile(file1, 'same content');
      await writeFile(file2, 'same content');

      const identical = await filesAreIdentical(file1, file2);

      expect(identical).toBe(true);
    });

    it('should return false for different files', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      await writeFile(file1, 'content 1');
      await writeFile(file2, 'content 2');

      const identical = await filesAreIdentical(file1, file2);

      expect(identical).toBe(false);
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path from base', () => {
      const basePath = '/home/user/project';
      const fullPath = '/home/user/project/src/file.ts';

      const relative = getRelativePath(basePath, fullPath);

      expect(relative).toBe('src/file.ts');
    });

    it('should handle same directory', () => {
      const basePath = '/home/user/project';
      const fullPath = '/home/user/project';

      const relative = getRelativePath(basePath, fullPath);

      expect(relative).toBe('');
    });
  });

  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      const path = 'path\\to\\file.txt';

      const normalized = normalizePath(path);

      expect(normalized).toBe('path/to/file.txt');
    });

    it('should leave forward slashes unchanged', () => {
      const path = 'path/to/file.txt';

      const normalized = normalizePath(path);

      expect(normalized).toBe('path/to/file.txt');
    });
  });

  describe('isAbsolutePath', () => {
    it('should return true for absolute path', () => {
      expect(isAbsolutePath('/home/user/file.txt')).toBe(true);
    });

    it('should return false for relative path', () => {
      expect(isAbsolutePath('relative/path/file.txt')).toBe(false);
      expect(isAbsolutePath('./file.txt')).toBe(false);
      expect(isAbsolutePath('../file.txt')).toBe(false);
    });
  });

  describe('resolvePath', () => {
    it('should resolve relative paths', () => {
      const resolved = resolvePath('/base', 'relative', 'path');

      expect(resolved).toBe(resolve('/base', 'relative', 'path'));
    });

    it('should resolve single path', () => {
      const resolved = resolvePath('/absolute/path');

      expect(resolved).toBe('/absolute/path');
    });
  });

  describe('getPackageRoot', () => {
    it('should return the package root directory', () => {
      const root = getPackageRoot();

      expect(root).toBeDefined();
      expect(typeof root).toBe('string');
      // Should be an absolute path
      expect(root.startsWith('/')).toBe(true);
      // Should contain oh-my-customcode in the path
      expect(root).toContain('oh-my-customcode');
    });
  });

  describe('resolveTemplatePath', () => {
    it('should resolve path relative to templates directory', () => {
      const templatePath = resolveTemplatePath('CLAUDE.md');

      expect(templatePath).toBeDefined();
      expect(templatePath).toContain('templates');
      expect(templatePath).toContain('CLAUDE.md');
    });

    it('should handle nested paths', () => {
      const templatePath = resolveTemplatePath('rules/example.md');

      expect(templatePath).toContain('templates');
      expect(templatePath).toContain('rules');
      expect(templatePath).toContain('example.md');
    });
  });

  describe('validatePreserveFilePath', () => {
    it('should return valid for a simple relative path', () => {
      const result = validatePreserveFilePath('src/file.ts', '/project/root');

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return valid for a nested relative path', () => {
      const result = validatePreserveFilePath('deep/nested/path/file.txt', '/project/root');

      expect(result.valid).toBe(true);
    });

    it('should return valid for a simple filename', () => {
      const result = validatePreserveFilePath('file.txt', '/project/root');

      expect(result.valid).toBe(true);
    });

    it('should return invalid for empty string', () => {
      const result = validatePreserveFilePath('', '/project/root');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot be empty');
    });

    it('should return invalid for whitespace-only string', () => {
      const result = validatePreserveFilePath('   ', '/project/root');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot be empty');
    });

    it('should return invalid for absolute path', () => {
      const result = validatePreserveFilePath('/etc/passwd', '/project/root');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Absolute paths are not allowed');
    });

    it('should return invalid for path traversal with ../', () => {
      const result = validatePreserveFilePath('../../etc/passwd', '/project/root');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot traverse outside project root');
    });

    it('should return invalid for path traversal with nested ../', () => {
      const result = validatePreserveFilePath('subdir/../../../etc/passwd', '/project/root');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot traverse outside project root');
    });

    it('should return valid for path with safe dot-dot that stays within root', () => {
      // subdir/../file.ts normalizes to file.ts which is still inside root
      const result = validatePreserveFilePath('subdir/../file.ts', '/project/root');

      expect(result.valid).toBe(true);
    });
  });
});

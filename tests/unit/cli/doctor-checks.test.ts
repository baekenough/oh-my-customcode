/**
 * Additional doctor check tests for uncovered warning paths
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkContexts, checkGuides, checkHooks } from '../../../src/cli/doctor.js';

describe('doctor check warning paths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-doctor-checks-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('checkGuides', () => {
    it('should warn when guides directory exists but is empty (0 topics)', async () => {
      // Setup: create empty guides directory
      const guidesDir = join(tempDir, 'guides');
      await mkdir(guidesDir, { recursive: true });

      const result = await checkGuides(tempDir);

      expect(result.status).toBe('warn');
      expect(result.name).toBe('Guides');
      expect(result.message).toContain('0 topics found');
      expect(result.fixable).toBe(false);
    });

    it('should pass when guides directory has subdirectories', async () => {
      // Setup: create guides directory with topics
      const guidesDir = join(tempDir, 'guides');
      await mkdir(join(guidesDir, 'golang'), { recursive: true });
      await mkdir(join(guidesDir, 'python'), { recursive: true });

      const result = await checkGuides(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('2 topics');
    });

    it('should fail when guides directory does not exist', async () => {
      // No guides directory created

      const result = await checkGuides(tempDir);

      expect(result.status).toBe('fail');
      expect(result.message).toContain('not found');
      expect(result.fixable).toBe(true);
    });
  });

  describe('checkHooks', () => {
    it('should warn when hooks directory exists but is empty', async () => {
      // Setup: create empty hooks directory
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });

      const result = await checkHooks(tempDir);

      expect(result.status).toBe('warn');
      expect(result.name).toBe('Hooks');
      expect(result.message).toContain('directory is empty');
      expect(result.fixable).toBe(false);
    });

    it('should pass when hooks directory has hook files', async () => {
      // Setup: create hooks directory with files
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'hooks.json'), '{}');
      await writeFile(join(hooksDir, 'pre-commit.sh'), '#!/bin/bash\necho "test"');

      const result = await checkHooks(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('2 files');
    });

    it('should fail when hooks directory does not exist', async () => {
      // No hooks directory created

      const result = await checkHooks(tempDir);

      expect(result.status).toBe('fail');
      expect(result.message).toContain('not found');
      expect(result.fixable).toBe(true);
    });

    it('should count only .sh, .json, and .yaml files', async () => {
      // Setup: create hooks directory with mixed files
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'hooks.json'), '{}');
      await writeFile(join(hooksDir, 'pre-commit.sh'), '#!/bin/bash');
      await writeFile(join(hooksDir, 'config.yaml'), 'key: value');
      await writeFile(join(hooksDir, 'readme.txt'), 'not a hook'); // Should not be counted
      await writeFile(join(hooksDir, 'readme.md'), '# Hooks'); // Should not be counted

      const result = await checkHooks(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('3 files'); // Only .sh, .json, .yaml
    });
  });

  describe('checkContexts', () => {
    it('should warn when contexts directory exists but is empty', async () => {
      // Setup: create empty contexts directory
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });

      const result = await checkContexts(tempDir);

      expect(result.status).toBe('warn');
      expect(result.name).toBe('Contexts');
      expect(result.message).toContain('directory is empty');
      expect(result.fixable).toBe(false);
    });

    it('should pass when contexts directory has markdown files', async () => {
      // Setup: create contexts directory with files
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(join(contextsDir, 'dev.md'), '# Development context');
      await writeFile(join(contextsDir, 'prod.md'), '# Production context');

      const result = await checkContexts(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('2 files');
    });

    it('should fail when contexts directory does not exist', async () => {
      // No contexts directory created

      const result = await checkContexts(tempDir);

      expect(result.status).toBe('fail');
      expect(result.message).toContain('not found');
      expect(result.fixable).toBe(true);
    });

    it('should count only .md files', async () => {
      // Setup: create contexts directory with mixed files
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(join(contextsDir, 'dev.md'), '# Dev');
      await writeFile(join(contextsDir, 'staging.md'), '# Staging');
      await writeFile(join(contextsDir, 'config.json'), '{}'); // Should not be counted
      await writeFile(join(contextsDir, 'readme.txt'), 'not markdown'); // Should not be counted

      const result = await checkContexts(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('2 files'); // Only .md files
    });
  });

  describe('edge cases', () => {
    it('should handle guides directory with files but no subdirectories', async () => {
      // Setup: create guides directory with files (not subdirectories)
      const guidesDir = join(tempDir, 'guides');
      await mkdir(guidesDir, { recursive: true });
      await writeFile(join(guidesDir, 'README.md'), '# Guides');
      await writeFile(join(guidesDir, 'index.md'), '# Index');

      const result = await checkGuides(tempDir);

      // Should warn because countDirectories only counts directories, not files
      expect(result.status).toBe('warn');
      expect(result.message).toContain('0 topics');
    });

    it('should handle custom rootDir parameter for hooks', async () => {
      // Test with custom root directory
      const customRoot = '.custom';
      const hooksDir = join(tempDir, customRoot, 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'hooks.json'), '{}');

      const result = await checkHooks(tempDir, customRoot);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('Hooks OK');
    });

    it('should handle custom rootDir parameter for contexts', async () => {
      // Test with custom root directory
      const customRoot = '.custom';
      const contextsDir = join(tempDir, customRoot, 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(join(contextsDir, 'dev.md'), '# Dev');

      const result = await checkContexts(tempDir, customRoot);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('Contexts OK');
    });

    it('should handle nested subdirectories in guides', async () => {
      // Setup: create nested structure in guides
      const guidesDir = join(tempDir, 'guides');
      await mkdir(join(guidesDir, 'golang', 'advanced'), { recursive: true });
      await mkdir(join(guidesDir, 'python'), { recursive: true });

      const result = await checkGuides(tempDir);

      // countDirectories only counts one level deep
      expect(result.status).toBe('pass');
      expect(result.message).toContain('2 topics'); // golang and python
    });
  });
});

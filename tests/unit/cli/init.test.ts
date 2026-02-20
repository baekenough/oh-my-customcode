import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../../../src/core/installer.js';

describe('init command', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-init-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('basic initialization', () => {
    it('should create CLAUDE.md in target directory', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify CLAUDE.md exists
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      const claudeMdStats = await stat(claudeMdPath);
      expect(claudeMdStats.isFile()).toBe(true);

      // Verify content has correct structure (English template)
      const content = await readFile(claudeMdPath, 'utf-8');
      expect(content).toContain('AI Agent System');
      expect(content).toContain('oh-my-customcode');
    });

    it('should create .claude directory structure', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify .claude directory exists
      const claudeDir = join(tempDir, '.claude');
      const claudeDirStats = await stat(claudeDir);
      expect(claudeDirStats.isDirectory()).toBe(true);

      // Verify .claude/rules/ exists
      const rulesDir = join(tempDir, '.claude', 'rules');
      const rulesDirStats = await stat(rulesDir);
      expect(rulesDirStats.isDirectory()).toBe(true);

      // Verify .claude/hooks/ exists
      const hooksDir = join(tempDir, '.claude', 'hooks');
      const hooksDirStats = await stat(hooksDir);
      expect(hooksDirStats.isDirectory()).toBe(true);

      // Verify .claude/contexts/ exists
      const contextsDir = join(tempDir, '.claude', 'contexts');
      const contextsDirStats = await stat(contextsDir);
      expect(contextsDirStats.isDirectory()).toBe(true);
    });

    it('should create agents directory structure', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify agents directory exists (official Claude Code format: .claude/agents)
      const agentsDir = join(tempDir, '.claude', 'agents');
      const agentsDirStats = await stat(agentsDir);
      expect(agentsDirStats.isDirectory()).toBe(true);
    });

    it('should create skills directory structure', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify skills directory exists (official Claude Code format: .claude/skills)
      const skillsDir = join(tempDir, '.claude', 'skills');
      const skillsDirStats = await stat(skillsDir);
      expect(skillsDirStats.isDirectory()).toBe(true);
    });

    it('should install skills-sh-search skill', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify skills-sh-search skill is installed with valid SKILL.md
      const skillMdPath = join(tempDir, '.claude', 'skills', 'skills-sh-search', 'SKILL.md');
      const skillMdStats = await stat(skillMdPath);
      expect(skillMdStats.isFile()).toBe(true);

      const { readFile } = await import('node:fs/promises');
      const content = await readFile(skillMdPath, 'utf-8');
      expect(content).toContain('name: skills-sh-search');
      expect(content).toContain('skills.sh');
    });

    it('should create guides directory', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      // Verify guides directory exists
      const guidesDir = join(tempDir, 'guides');
      const guidesDirStats = await stat(guidesDir);
      expect(guidesDirStats.isDirectory()).toBe(true);
    });

    // commands/ removed in official Claude Code format (absorbed into skills)
  });

  describe('--lang option', () => {
    it('should create English CLAUDE.md when lang is en', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);

      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      const content = await readFile(claudeMdPath, 'utf-8');

      // English version should contain English text
      expect(content).toContain('AI Agent System');
      expect(content).toContain('STOP AND READ BEFORE EVERY RESPONSE');
      // Should NOT contain Korean text
      expect(content).not.toContain('AI 에이전트 시스템');
    });

    it('should create Korean CLAUDE.md when lang is ko', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'ko',
      });

      expect(result.success).toBe(true);

      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      const content = await readFile(claudeMdPath, 'utf-8');

      // Korean version should contain Korean text
      expect(content).toContain('AI 에이전트 시스템');
      expect(content).toContain('모든 응답 전 반드시 확인');
      // Should NOT contain English header
      expect(content).not.toContain('# AI Agent System');
    });
  });

  describe('--force option', () => {
    it('should overwrite existing CLAUDE.md when force is true', async () => {
      // Create existing CLAUDE.md with different content
      const existingContent = '# Existing CLAUDE.md\n\nThis is existing content.';
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, existingContent);

      // Install with force=true
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: true,
      });

      expect(result.success).toBe(true);

      // Verify CLAUDE.md was overwritten
      const content = await readFile(claudeMdPath, 'utf-8');
      expect(content).toContain('AI Agent System');
      expect(content).not.toContain('This is existing content');
    });

    it('should overwrite existing .claude directory when force is true', async () => {
      // Create existing .claude directory with a custom file
      const claudeDir = join(tempDir, '.claude');
      const rulesDir = join(claudeDir, 'rules');
      await import('node:fs/promises').then((fs) => fs.mkdir(rulesDir, { recursive: true }));
      const customRulePath = join(rulesDir, 'CUSTOM-rule.md');
      await writeFile(customRulePath, '# Custom Rule');

      // Install with force=true
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: true,
      });

      expect(result.success).toBe(true);

      // Verify .claude directory exists and has template files
      const ruleFiles = await readdir(rulesDir);
      // Should have standard rule files from templates
      expect(ruleFiles.length).toBeGreaterThan(0);
    });
  });

  describe('without --force option', () => {
    it('should not overwrite existing CLAUDE.md without force flag', async () => {
      // Create existing CLAUDE.md
      const existingContent = '# Existing CLAUDE.md\n\nThis is existing content.';
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, existingContent);

      // Install without force
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: false,
        backup: false,
      });

      // Should succeed but with warnings
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Existing files found');

      // Verify CLAUDE.md was NOT overwritten
      const content = await readFile(claudeMdPath, 'utf-8');
      expect(content).toContain('This is existing content');
      expect(content).not.toContain('AI Agent System');
    });

    it('should skip existing directories without force flag', async () => {
      // Create existing .claude directory with custom content
      const claudeDir = join(tempDir, '.claude');
      const rulesDir = join(claudeDir, 'rules');
      await import('node:fs/promises').then((fs) => fs.mkdir(rulesDir, { recursive: true }));
      const customRulePath = join(rulesDir, 'CUSTOM-rule.md');
      const customContent = '# My Custom Rule';
      await writeFile(customRulePath, customContent);

      // Install without force
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: false,
        backup: false,
      });

      expect(result.success).toBe(true);

      // Verify custom file is preserved (not overwritten)
      const content = await readFile(customRulePath, 'utf-8');
      expect(content).toBe(customContent);
    });

    it('should add warning when existing files are found', async () => {
      // Create existing CLAUDE.md
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, '# Existing');

      // Install without force
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: false,
        backup: false,
      });

      // Check warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('CLAUDE.md'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('--force'))).toBe(true);
    });
  });

  describe('--backup option', () => {
    it('should backup existing files when backup is true', async () => {
      // Create existing CLAUDE.md
      const existingContent = '# Existing CLAUDE.md';
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, existingContent);

      // Install with backup=true
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        backup: true,
      });

      expect(result.success).toBe(true);
      expect(result.backedUpPaths.length).toBeGreaterThan(0);

      // Verify backup directory was created
      const entries = await readdir(tempDir);
      const backupDir = entries.find((e) => e.startsWith('.claude-backup-'));
      expect(backupDir).toBeDefined();

      // Verify CLAUDE.md was overwritten with new content
      const content = await readFile(claudeMdPath, 'utf-8');
      expect(content).toContain('AI Agent System');
    });
  });

  describe('installedComponents tracking', () => {
    it('should track installed entry-md component', async () => {
      const result = await install({
        targetDir: tempDir,
        language: 'en',
      });

      expect(result.success).toBe(true);
      // CLAUDE.md should always be installed in a fresh directory
      expect(result.installedComponents).toContain('entry-md');
    });

    it('should track skipped components when they already exist', async () => {
      // Create existing CLAUDE.md
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      await writeFile(claudeMdPath, '# Existing');

      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: false,
        backup: false,
      });

      expect(result.success).toBe(true);
      expect(result.skippedComponents).toContain('entry-md');
    });

    it('should install components with force=true even when directories exist', async () => {
      // First install creates the directory structure
      await install({ targetDir: tempDir, language: 'en' });

      // Second install with force should re-install all components
      const result = await install({
        targetDir: tempDir,
        language: 'en',
        force: true,
      });

      expect(result.success).toBe(true);
      // With force, all components should be in installedComponents
      expect(result.installedComponents).toContain('entry-md');
      expect(result.installedComponents).toContain('rules');
      expect(result.installedComponents).toContain('agents');
    });
  });
});

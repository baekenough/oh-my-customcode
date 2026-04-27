/**
 * E2E tests for `omcustom list` command
 * Tests the actual CLI command execution end-to-end
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';
import { unregisterProject } from '../../src/core/registry.js';

describe('E2E: omcustom list', () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(() => {
    // Path to the CLI entry point (run with bun)
    // Using dirname to get the project root from the test file location
    const projectRoot = join(import.meta.dir, '../..');
    cliPath = join(projectRoot, 'src/cli/index.ts');
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-e2e-list-'));
    // Change to temp directory for the test
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Reset to a safe directory before cleanup
    process.chdir(tmpdir());
    await unregisterProject(tempDir);
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI command using Bun.spawn
   */
  async function runCli(
    ...args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = spawn({
      cmd: ['bun', 'run', cliPath, '--skip-version-check', ...args],
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        OMCUSTOM_REGISTRY_DIR: join(tempDir, '.omcustom-registry'),
        OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP: '1',
      },
    });

    // Add timeout to prevent hanging in CI
    // Increased from 10s to 30s for slower CI environments
    const timeout = 30000; // 30 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ]);

      return { exitCode, stdout, stderr };
    } catch (error) {
      // Ensure process is killed on error
      try {
        proc.kill();
      } catch {
        // Ignore kill errors
      }
      throw error;
    }
  }

  /**
   * Helper to initialize a project first
   */
  async function initProject(): Promise<void> {
    await runCli('init');
  }

  /**
   * Helper to create a test agent
   * Official Claude Code format: .claude/agents/{prefix}-{name}.md (flat structure)
   */
  async function createTestAgent(
    type: string,
    name: string,
    options?: { description?: string; version?: string }
  ): Promise<void> {
    const agentsDir = join(tempDir, '.claude', 'agents');
    await mkdir(agentsDir, { recursive: true });

    // Agent files are flat .md files with prefix based on type
    // Official Claude Code type mappings:
    // - manager → mgr-
    // - language specialist → lang-
    // - backend specialist → be-
    // - frontend specialist → fe-
    // - infrastructure specialist → infra-
    // - orchestrator → orch-
    let prefix: string;
    switch (type) {
      case 'language':
      case 'sw-engineer':
        prefix = 'lang';
        break;
      case 'backend':
      case 'backend-engineer':
        prefix = 'be';
        break;
      case 'frontend':
      case 'frontend-engineer':
        prefix = 'fe';
        break;
      case 'infrastructure':
      case 'infra-engineer':
        prefix = 'infra';
        break;
      case 'manager':
        prefix = 'mgr';
        break;
      case 'orchestrator':
        prefix = 'orch';
        break;
      default:
        prefix = 'mgr';
    }

    // Flat .md file with frontmatter format
    const agentMd = `---
type: ${type}
description: ${options?.description || `A test ${name} agent`}
${options?.version ? `version: ${options.version}` : ''}
---

# ${name.charAt(0).toUpperCase() + name.slice(1)} Agent

> ${options?.description || `A test ${name} agent`}

## Overview

This is a test agent for end-to-end testing.

## Capabilities

- Test capability 1
- Test capability 2
`;
    await writeFile(join(agentsDir, `${prefix}-${name}.md`), agentMd);
  }

  /**
   * Helper to create a test skill
   * Official Claude Code format: .claude/skills/{category}/{name}/SKILL.md
   */
  async function createTestSkill(
    category: string,
    name: string,
    options?: { description?: string; version?: string }
  ): Promise<void> {
    const skillDir = join(tempDir, '.claude', 'skills', category, name);
    await mkdir(skillDir, { recursive: true });

    const skillMd = `# ${name.charAt(0).toUpperCase() + name.slice(1)} Skill

> ${options?.description || `A test ${name} skill`}

## Usage

This is a test skill.
`;
    await writeFile(join(skillDir, 'SKILL.md'), skillMd);

    if (options?.version || options?.description) {
      const indexYaml = `metadata:
  name: ${name}
  category: ${category}
  description: ${options?.description || `A test ${name} skill`}
  version: ${options?.version || '1.0.0'}
`;
      await writeFile(join(skillDir, 'index.yaml'), indexYaml);
    }
  }

  /**
   * Helper to create a test guide
   */
  async function createTestGuide(
    category: string,
    name: string,
    description?: string
  ): Promise<void> {
    const guideDir = join(tempDir, 'guides', category);
    await mkdir(guideDir, { recursive: true });

    const content = `# ${name.charAt(0).toUpperCase() + name.slice(1)} Guide

${description || `This is a guide about ${name}.`}

## Content

Guide content here.
`;
    await writeFile(join(guideDir, `${name}.md`), content);
  }

  /**
   * Helper to create a test rule
   */
  async function createTestRule(
    priority: string,
    name: string,
    description?: string
  ): Promise<void> {
    const rulesDir = join(tempDir, '.claude', 'rules');
    await mkdir(rulesDir, { recursive: true });

    const content = `# ${name.charAt(0).toUpperCase() + name.slice(1)} Rules

> **Priority**: ${priority} - ${description || `${name} rules`}

## Rules

Rule content here.
`;
    await writeFile(join(rulesDir, `${priority}-${name}.md`), content);
  }

  describe('listing after init', () => {
    beforeEach(async () => {
      await initProject();
    });

    it('should show scanning message', async () => {
      const result = await runCli('list');

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      // Should show scanning message (Korean: "검색 중" or English: "scan")
      expect(
        output.includes('검색') || output.includes('스캔') || output.toLowerCase().includes('scan')
      ).toBe(true);
    });

    it('should list all component types with default command', async () => {
      // Create some test components
      await createTestAgent('language', 'test-agent');
      await createTestSkill('development', 'test-skill');
      await createTestGuide('testing', 'test-guide');

      const result = await runCli('list');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should show agents section
      expect(output.toLowerCase()).toContain('agent');
      // Should show the test agent (official Claude Code format: {prefix}-{name})
      expect(output).toContain('lang-test-agent');
    });

    it('should handle empty installation gracefully', async () => {
      // Clear the agents directory content (keep structure)
      // Official Claude Code format: .claude/agents/ contains flat .md files with prefixes
      const agentsDir = join(tempDir, '.claude', 'agents');
      const entries = await readdir(agentsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          await rm(join(agentsDir, entry.name), { force: true });
        }
      }

      const result = await runCli('list', 'agents');

      expect(result.exitCode).toBe(0);
      // Should handle empty list gracefully
    });
  });

  describe('filtering by type', () => {
    beforeEach(async () => {
      await initProject();
      // Create test data
      await createTestAgent('language', 'golang-expert', {
        description: 'Go language expert',
        version: '2.0.0',
      });
      await createTestAgent('backend', 'fastapi-expert', {
        description: 'FastAPI framework expert',
        version: '1.0.0',
      });
      await createTestSkill('development', 'go-best-practices', {
        description: 'Go best practices skill',
        version: '1.0.0',
      });
      await createTestGuide('architecture', 'clean-architecture', 'Clean architecture principles');
      await createTestRule('MUST', 'safety', 'Critical safety rules');
    });

    it('should list only agents when "agents" type is specified', async () => {
      const result = await runCli('list', 'agents');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should contain agents (official Claude Code format: {prefix}-{name})
      // language → lang-, backend → be-
      expect(output).toContain('lang-golang-expert');
      expect(output).toContain('be-fastapi-expert');

      // Should NOT contain skills (unless in header)
      expect(output.split('\n').filter((l) => l.includes('go-best-practices')).length).toBe(0);
    });

    it('should list only skills when "skills" type is specified', async () => {
      const result = await runCli('list', 'skills');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should contain skills
      expect(output).toContain('go-best-practices');

      // Should NOT contain agents (official Claude Code format: {prefix}-{name})
      expect(output.split('\n').filter((l) => l.includes('lang-golang-expert')).length).toBe(0);
    });

    it('should list only guides when "guides" type is specified', async () => {
      const result = await runCli('list', 'guides');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should contain guides
      expect(output).toContain('clean-architecture');
    });

    it('should list only rules when "rules" type is specified', async () => {
      const result = await runCli('list', 'rules');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should contain rules
      expect(output).toContain('MUST-safety');
    });

    it('should list all components when "all" type is specified', async () => {
      const result = await runCli('list', 'all');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should contain all types (official Claude Code format: {prefix}-{name} for agents)
      expect(output).toContain('lang-golang-expert');
      expect(output).toContain('go-best-practices');
      expect(output).toContain('clean-architecture');
      expect(output).toContain('MUST-safety');
    });
  });

  describe('--format option', () => {
    beforeEach(async () => {
      await initProject();
      await createTestAgent('language', 'test-agent', {
        description: 'Test agent description',
        version: '1.2.3',
      });
    });

    it('should output valid JSON when --format json is specified', async () => {
      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      // Extract JSON from output (may have scanning message before)
      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');

      // Should parse as valid JSON
      let parsed: unknown[];
      expect(() => {
        parsed = JSON.parse(jsonOutput);
      }).not.toThrow();

      // Should be an array
      expect(Array.isArray(parsed)).toBe(true);

      // Should contain agent data (official Claude Code format: {prefix}-{name})
      const agent = parsed?.find(
        (a: unknown) => (a as { name: string }).name === 'lang-test-agent'
      );
      expect(agent).toBeDefined();
      expect((agent as { type: string }).type).toBe('language');
    });

    it('should output JSON with correct structure', async () => {
      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');
      const parsed = JSON.parse(jsonOutput) as Array<{
        name?: string;
        type?: string;
        path?: string;
        description?: string;
        version?: string;
      }>;

      // Find test-agent (official Claude Code format: {prefix}-{name})
      const agent = parsed.find((a) => a.name === 'lang-test-agent');
      expect(agent).toBeDefined();

      // Check structure (flat .md files with frontmatter in .claude/agents/)
      expect(agent?.name).toBe('lang-test-agent');
      expect(agent?.type).toBe('language');
      expect(agent?.path).toContain('.claude/agents/lang-test-agent.md');
      expect(agent?.description).toBeDefined();
      // version may be in frontmatter or undefined
    });

    it('should output table format by default', async () => {
      const result = await runCli('list', 'agents');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Table format indicators
      expect(output).toContain('Name');
      expect(output).toContain('Type');
      expect(output).toContain('Description');
      // Should have separator lines
      expect(output).toContain('─');
    });

    it('should output simple format when --format simple is specified', async () => {
      const result = await runCli('list', 'agents', '--format', 'simple');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Simple format: {prefix}-name [type] (official Claude Code format)
      expect(output).toMatch(/lang-test-agent\s*\[language\]/);
    });

    it('should use short flag -f for format', async () => {
      const result = await runCli('list', 'agents', '-f', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');

      // Should be valid JSON
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
    });
  });

  describe('JSON output validation', () => {
    beforeEach(async () => {
      await initProject();
    });

    it('should output empty array for empty list', async () => {
      // Create empty agents directory structure (official Claude Code format: .claude/agents/)
      const agentsDir = join(tempDir, '.claude', 'agents');
      // Clear any files from initProject() to test empty listing
      await rm(agentsDir, { recursive: true, force: true });
      await mkdir(agentsDir, { recursive: true });
      // No {prefix}-{name}.md files, so should be empty

      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');
      const parsed = JSON.parse(jsonOutput);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it('should include all required fields in JSON output', async () => {
      await createTestAgent('manager', 'creator', {
        description: 'Creates new agents',
        version: '2.0.0',
      });

      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');
      const parsed = JSON.parse(jsonOutput) as Array<Record<string, unknown>>;

      const creator = parsed.find((a) => a.name === 'mgr-creator');
      expect(creator).toBeDefined();

      // Required fields
      expect(creator?.name).toBeDefined();
      expect(creator?.type).toBeDefined();
      expect(creator?.path).toBeDefined();
    });

    it('should handle special characters in descriptions', async () => {
      await createTestAgent('language', 'special-agent', {
        description: 'Agent with "quotes" and <special> chars & more',
        version: '1.0.0',
      });

      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');

      // Should still be valid JSON
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput) as Array<{ name?: string; description?: string }>;
      const agent = parsed.find((a) => a.name === 'lang-special-agent');
      expect(agent?.description).toContain('quotes');
    });
  });

  describe('multiple components', () => {
    beforeEach(async () => {
      await initProject();
    });

    it('should list multiple agents sorted alphabetically', async () => {
      await createTestAgent('language', 'python-expert');
      await createTestAgent('language', 'golang-expert');
      await createTestAgent('language', 'rust-expert');

      const result = await runCli('list', 'agents', '--format', 'json');

      expect(result.exitCode).toBe(0);

      const lines = result.stdout.trim().split('\n');
      let jsonStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[') || lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
      const jsonOutput = lines.slice(jsonStartIndex).join('\n');
      const parsed = JSON.parse(jsonOutput) as Array<{ name: string }>;

      const names = parsed.map((a) => a.name);

      // Should contain all agents (official Claude Code format: {prefix}-{name})
      expect(names).toContain('lang-golang-expert');
      expect(names).toContain('lang-python-expert');
      expect(names).toContain('lang-rust-expert');

      // Should be sorted alphabetically
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should show correct counts in output', async () => {
      await createTestAgent('language', 'agent1');
      await createTestAgent('language', 'agent2');
      await createTestAgent('manager', 'agent3');

      const result = await runCli('list', 'agents');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // Should show count somewhere
      expect(output).toMatch(/3|three/i);
    });
  });
});

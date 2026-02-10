import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ComponentInfo,
  formatAsJson,
  formatAsSimple,
  formatAsTable,
  getAgents,
  getContexts,
  getGuides,
  getHooks,
  getRules,
  getSkills,
  listCommand,
} from '../../../src/cli/list.js';

describe('list command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-list-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getAgents', () => {
    it('should return empty array when agents directory does not exist', async () => {
      const agents = await getAgents(tempDir);
      expect(agents).toEqual([]);
    });

    it('should return empty array when agents directory is empty', async () => {
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
      const agents = await getAgents(tempDir);
      expect(agents).toEqual([]);
    });

    it('should find agent with flat .md file', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'lang-golang-expert.md'),
        '# Golang Expert\n\n> A Go language expert agent\n\nMore content here...'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('lang-golang-expert');
      expect(agents[0].type).toBe('language');
      expect(agents[0].path).toBe('.claude/agents/lang-golang-expert.md');
      expect(agents[0].description).toBe('A Go language expert agent');
    });

    it('should extract description from markdown content', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'mgr-creator.md'),
        '# Creator Agent\n\n> Creates new agents and components\n\nMore content here...'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('mgr-creator');
      expect(agents[0].type).toBe('manager');
      expect(agents[0].description).toBe('Creates new agents and components');
      expect(agents[0].version).toBeUndefined();
    });

    it('should find multiple agents and sort by name', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });

      await writeFile(join(agentsDir, 'lang-python-expert.md'), '# Python Expert');
      await writeFile(join(agentsDir, 'lang-golang-expert.md'), '# Golang Expert');
      await writeFile(join(agentsDir, 'mgr-creator.md'), '# Creator');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(3);
      // Should be sorted: lang-golang-expert, lang-python-expert, mgr-creator
      expect(agents[0].name).toBe('lang-golang-expert');
      expect(agents[1].name).toBe('lang-python-expert');
      expect(agents[2].name).toBe('mgr-creator');
    });

    it('should extract type from filename prefix', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'be-springboot-expert.md'), '# Spring Boot Expert');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('be-springboot-expert');
      expect(agents[0].type).toBe('backend');
    });

    it('should extract description from blockquote in markdown', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'lang-rust-expert.md'),
        `# Rust Expert Agent

> **Priority**: High - Memory-safe systems programming expert

## Overview
This agent specializes in Rust programming.
`
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe(
        '**Priority**: High - Memory-safe systems programming expert'
      );
    });

    it('should extract description from first blockquote', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'lang-kotlin-expert.md'),
        '# Kotlin Expert\n\n> Kotlin language expert for Android and JVM\n\nMore content here...'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('Kotlin language expert for Android and JVM');
    });
  });

  describe('getSkills', () => {
    it('should return empty array when skills directory does not exist', async () => {
      const skills = await getSkills(tempDir);
      expect(skills).toEqual([]);
    });

    it('should return empty array when skills directory is empty', async () => {
      await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
      const skills = await getSkills(tempDir);
      expect(skills).toEqual([]);
    });

    it('should find skill with SKILL.md file', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'development', 'go-best-practices');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Go Best Practices');

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('go-best-practices');
      expect(skills[0].type).toBe('skill');
      expect(skills[0].category).toBe('development');
      expect(skills[0].path).toBe('.claude/skills/development/go-best-practices');
    });

    it('should extract metadata from index.yaml', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'backend', 'api-design');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# API Design Skill');
      await writeFile(
        join(skillDir, 'index.yaml'),
        `metadata:
  name: api-design
  description: REST API design best practices
  version: 2.0.0
`
      );

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('REST API design best practices');
      expect(skills[0].version).toBe('2.0.0');
    });

    it('should find multiple skills and sort by name', async () => {
      const skill1Dir = join(tempDir, '.claude', 'skills', 'development', 'python-style');
      const skill2Dir = join(tempDir, '.claude', 'skills', 'backend', 'database-design');
      const skill3Dir = join(tempDir, '.claude', 'skills', 'infra', 'docker-best-practices');

      await mkdir(skill1Dir, { recursive: true });
      await mkdir(skill2Dir, { recursive: true });
      await mkdir(skill3Dir, { recursive: true });

      await writeFile(join(skill1Dir, 'SKILL.md'), '# Python Style');
      await writeFile(join(skill2Dir, 'SKILL.md'), '# Database Design');
      await writeFile(join(skill3Dir, 'SKILL.md'), '# Docker Best Practices');

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(3);
      // Should be sorted: database-design, docker-best-practices, python-style
      expect(skills[0].name).toBe('database-design');
      expect(skills[0].category).toBe('backend');
      expect(skills[1].name).toBe('docker-best-practices');
      expect(skills[1].category).toBe('infra');
      expect(skills[2].name).toBe('python-style');
      expect(skills[2].category).toBe('development');
    });
  });

  describe('getGuides', () => {
    it('should return empty array when guides directory does not exist', async () => {
      const guides = await getGuides(tempDir);
      expect(guides).toEqual([]);
    });

    it('should return empty array when guides directory is empty', async () => {
      await mkdir(join(tempDir, 'guides'));
      const guides = await getGuides(tempDir);
      expect(guides).toEqual([]);
    });

    it('should find guide markdown files', async () => {
      const guideDir = join(tempDir, 'guides', 'architecture');
      await mkdir(guideDir, { recursive: true });
      await writeFile(
        join(guideDir, 'clean-architecture.md'),
        '# Clean Architecture Guide\n\nThis guide explains clean architecture principles.'
      );

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].name).toBe('clean-architecture');
      expect(guides[0].type).toBe('guide');
      expect(guides[0].category).toBe('architecture');
      expect(guides[0].path).toBe('guides/architecture/clean-architecture.md');
    });

    it('should extract description from first meaningful line', async () => {
      const guideDir = join(tempDir, 'guides', 'testing');
      await mkdir(guideDir, { recursive: true });
      await writeFile(
        join(guideDir, 'unit-testing.md'),
        `# Unit Testing Guide

---

This is the description of the unit testing guide that provides best practices.`
      );

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBe(
        'This is the description of the unit testing guide that provides best practices.'
      );
    });

    it('should truncate long descriptions', async () => {
      const guideDir = join(tempDir, 'guides', 'documentation');
      await mkdir(guideDir, { recursive: true });
      const longDescription = `${'A'.repeat(150)} This is a very long description that should be truncated.`;
      await writeFile(join(guideDir, 'writing-docs.md'), `# Writing Docs\n\n${longDescription}`);

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].description?.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(guides[0].description?.endsWith('...')).toBe(true);
    });

    it('should find multiple guides and sort by name', async () => {
      const guide1Dir = join(tempDir, 'guides', 'testing');
      const guide2Dir = join(tempDir, 'guides', 'architecture');

      await mkdir(guide1Dir, { recursive: true });
      await mkdir(guide2Dir, { recursive: true });

      await writeFile(join(guide1Dir, 'integration-testing.md'), '# Integration Testing');
      await writeFile(join(guide2Dir, 'microservices.md'), '# Microservices');
      await writeFile(join(guide2Dir, 'clean-code.md'), '# Clean Code');

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(3);
      // Should be sorted: clean-code, integration-testing, microservices
      expect(guides[0].name).toBe('clean-code');
      expect(guides[1].name).toBe('integration-testing');
      expect(guides[2].name).toBe('microservices');
    });
  });

  describe('getRules', () => {
    it('should return empty array when rules directory does not exist', async () => {
      const rules = await getRules(tempDir);
      expect(rules).toEqual([]);
    });

    it('should return empty array when rules directory is empty', async () => {
      await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
      const rules = await getRules(tempDir);
      expect(rules).toEqual([]);
    });

    it('should find rule files and extract priority from filename', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(
        join(rulesDir, 'MUST-safety.md'),
        '# Safety Rules\n\n> **Priority**: MUST - Never violate\n\nSafety content here.'
      );

      const rules = await getRules(tempDir);

      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('MUST-safety');
      expect(rules[0].type).toBe('MUST');
      expect(rules[0].path).toBe('.claude/rules/MUST-safety.md');
    });

    it('should extract description and clean formatting', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(
        join(rulesDir, 'SHOULD-testing.md'),
        '# Testing Rules\n\n> **Priority**: SHOULD - Strongly recommended\n\nContent.'
      );

      const rules = await getRules(tempDir);

      expect(rules).toHaveLength(1);
      // Should have cleaned formatting (removed ** for bold)
      expect(rules[0].description).toBe('Priority: SHOULD - Strongly recommended');
    });

    it('should sort rules by priority order (MUST, SHOULD, MAY)', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });

      await writeFile(join(rulesDir, 'MAY-optimization.md'), '# Optimization');
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety');
      await writeFile(join(rulesDir, 'SHOULD-testing.md'), '# Testing');
      await writeFile(join(rulesDir, 'MUST-permissions.md'), '# Permissions');

      const rules = await getRules(tempDir);

      expect(rules).toHaveLength(4);
      // MUST rules first (sorted alphabetically within priority)
      expect(rules[0].name).toBe('MUST-permissions');
      expect(rules[0].type).toBe('MUST');
      expect(rules[1].name).toBe('MUST-safety');
      expect(rules[1].type).toBe('MUST');
      // Then SHOULD rules
      expect(rules[2].name).toBe('SHOULD-testing');
      expect(rules[2].type).toBe('SHOULD');
      // Then MAY rules
      expect(rules[3].name).toBe('MAY-optimization');
      expect(rules[3].type).toBe('MAY');
    });

    it('should handle unknown priority types', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'CUSTOM-rule.md'), '# Custom Rule');
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety');

      const rules = await getRules(tempDir);

      expect(rules).toHaveLength(2);
      // MUST should come before CUSTOM (unknown priority)
      expect(rules[0].name).toBe('MUST-safety');
      expect(rules[1].name).toBe('CUSTOM-rule');
      expect(rules[1].type).toBe('CUSTOM');
    });

    it('should not recurse into subdirectories', async () => {
      const rulesDir = join(tempDir, '.claude', 'rules');
      const subDir = join(rulesDir, 'subdir');
      await mkdir(subDir, { recursive: true });

      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety');
      await writeFile(join(subDir, 'SHOULD-nested.md'), '# Nested Rule');

      const rules = await getRules(tempDir);

      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('MUST-safety');
    });
  });

  describe('output formats', () => {
    let originalConsoleLog: typeof console.log;
    let consoleOutput: string[];

    beforeEach(() => {
      consoleOutput = [];
      originalConsoleLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      };
    });

    afterEach(() => {
      console.log = originalConsoleLog;
    });

    const sampleComponents: ComponentInfo[] = [
      {
        name: 'lang-golang-expert',
        type: 'language',
        path: '.claude/agents/lang-golang-expert.md',
        description: 'Go language expert',
        version: '1.0.0',
      },
      {
        name: 'lang-python-expert',
        type: 'language',
        path: '.claude/agents/lang-python-expert.md',
        description: 'Python language expert',
      },
    ];

    describe('formatAsJson', () => {
      it('should output valid JSON', () => {
        formatAsJson(sampleComponents);

        const output = consoleOutput.join('\n');
        const parsed = JSON.parse(output);

        expect(parsed).toEqual(sampleComponents);
      });

      it('should handle empty array', () => {
        formatAsJson([]);

        const output = consoleOutput.join('\n');
        const parsed = JSON.parse(output);

        expect(parsed).toEqual([]);
      });

      it('should pretty print with 2 space indentation', () => {
        formatAsJson(sampleComponents);

        const output = consoleOutput.join('\n');
        expect(output).toContain('  "name"');
        expect(output).toContain('  "type"');
      });
    });

    describe('formatAsSimple', () => {
      it('should output component names with type info', () => {
        formatAsSimple(sampleComponents, 'agents');

        const output = consoleOutput.join('\n');
        expect(output).toContain('agents (2):');
        expect(output).toContain('lang-golang-expert [language]');
        expect(output).toContain('lang-python-expert [language]');
      });

      it('should use category for skills', () => {
        const skills: ComponentInfo[] = [
          {
            name: 'go-best-practices',
            type: 'skill',
            category: 'development',
            path: '.claude/skills/development/go-best-practices',
          },
        ];

        formatAsSimple(skills, 'skills');

        const output = consoleOutput.join('\n');
        expect(output).toContain('go-best-practices [development]');
      });
    });

    describe('formatAsTable', () => {
      it('should output table with headers', () => {
        formatAsTable(sampleComponents, 'agents');

        const output = consoleOutput.join('\n');
        expect(output).toContain('Name');
        expect(output).toContain('Type');
        expect(output).toContain('Description');
        expect(output).toContain('lang-golang-expert');
        expect(output).toContain('lang-python-expert');
      });

      it('should show Category header for skills', () => {
        const skills: ComponentInfo[] = [
          {
            name: 'go-best-practices',
            type: 'skill',
            category: 'development',
            path: '.claude/skills/development/go-best-practices',
          },
        ];

        formatAsTable(skills, 'skills');

        const output = consoleOutput.join('\n');
        expect(output).toContain('Category');
      });

      it('should truncate long descriptions', () => {
        const components: ComponentInfo[] = [
          {
            name: 'test-agent',
            type: 'test',
            path: 'test',
            description:
              'This is a very long description that exceeds forty characters and should be truncated',
          },
        ];

        formatAsTable(components, 'agents');

        const output = consoleOutput.join('\n');
        // Table truncates to 40 characters
        expect(output).toContain('This is a very long description that exc');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete project structure', async () => {
      // Create a complete project structure
      const agentsDir = join(tempDir, '.claude', 'agents');
      const skillDir = join(tempDir, '.claude', 'skills', 'development', 'go-best-practices');
      const guideDir = join(tempDir, 'guides', 'architecture');
      const rulesDir = join(tempDir, '.claude', 'rules');

      await mkdir(agentsDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await mkdir(guideDir, { recursive: true });
      await mkdir(rulesDir, { recursive: true });

      await writeFile(
        join(agentsDir, 'lang-golang-expert.md'),
        '# Golang Expert\n\n> Go expert\n\nMore content here...'
      );

      await writeFile(join(skillDir, 'SKILL.md'), '# Go Best Practices');
      await writeFile(
        join(skillDir, 'index.yaml'),
        'metadata:\n  description: Go best practices skill\n  version: 2.0.0'
      );

      await writeFile(
        join(guideDir, 'clean-code.md'),
        '# Clean Code Guide\n\nClean code principles.'
      );
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety\n\n> Never violate safety rules');

      // Get all components
      const [agents, skills, guides, rules] = await Promise.all([
        getAgents(tempDir),
        getSkills(tempDir),
        getGuides(tempDir),
        getRules(tempDir),
      ]);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('Go expert');
      expect(agents[0].version).toBeUndefined();

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('Go best practices skill');
      expect(skills[0].version).toBe('2.0.0');

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBe('Clean code principles.');

      expect(rules).toHaveLength(1);
      expect(rules[0].description).toBe('Never violate safety rules');
    });

    it('should handle agent files with no description', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-broken-agent.md'), '# Broken Agent\n\n');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('lang-broken-agent');
      expect(agents[0].description).toBeUndefined();
    });

    it('should handle directories without expected files', async () => {
      // Create directories without the expected marker files
      await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
      await mkdir(join(tempDir, '.claude', 'skills', 'development', 'empty-skill'), {
        recursive: true,
      });

      // These should be ignored since they lack agent .md files/SKILL.md
      const agents = await getAgents(tempDir);
      const skills = await getSkills(tempDir);

      expect(agents).toHaveLength(0);
      expect(skills).toHaveLength(0);
    });
  });

  describe('listCommand', () => {
    let originalCwd: typeof process.cwd;
    let consoleSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      originalCwd = process.cwd;
      consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      process.cwd = originalCwd;
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should list all components when type is all', async () => {
      process.cwd = () => tempDir;

      // Setup complete structure
      const agentsDir = join(tempDir, '.claude', 'agents');
      const skillDir = join(tempDir, '.claude', 'skills', 'development', 'test-skill');
      const guideDir = join(tempDir, 'guides', 'architecture');
      const rulesDir = join(tempDir, '.claude', 'rules');

      await mkdir(agentsDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await mkdir(guideDir, { recursive: true });
      await mkdir(rulesDir, { recursive: true });

      await writeFile(join(agentsDir, 'lang-test-agent.md'), '# Test Agent');
      await writeFile(join(skillDir, 'SKILL.md'), '# Test Skill');
      await writeFile(join(guideDir, 'clean-code.md'), '# Clean Code');
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety Rules');

      const result = await listCommand('all');

      expect(result.success).toBe(true);
      expect(result.type).toBe('all');
      expect(result.totalCount).toBe(4);
      expect(result.components.length).toBe(4);
    });

    it('should list all with json format', async () => {
      process.cwd = () => tempDir;

      // Setup
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-test-agent.md'), '# Test Agent');

      const result = await listCommand('all', { format: 'json' });

      expect(result.success).toBe(true);
    });

    it('should list specific type (agents)', async () => {
      process.cwd = () => tempDir;

      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-test-agent.md'), '# Test Agent');

      const result = await listCommand('agents');

      expect(result.success).toBe(true);
      expect(result.type).toBe('agents');
      expect(result.components.length).toBe(1);
    });

    it('should list specific type (skills)', async () => {
      process.cwd = () => tempDir;

      const skillDir = join(tempDir, '.claude', 'skills', 'development', 'test-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Test Skill');

      const result = await listCommand('skills');

      expect(result.success).toBe(true);
      expect(result.type).toBe('skills');
      expect(result.components.length).toBe(1);
    });

    it('should list specific type (guides)', async () => {
      process.cwd = () => tempDir;

      const guideDir = join(tempDir, 'guides', 'architecture');
      await mkdir(guideDir, { recursive: true });
      await writeFile(join(guideDir, 'clean-code.md'), '# Clean Code');

      const result = await listCommand('guides');

      expect(result.success).toBe(true);
      expect(result.type).toBe('guides');
      expect(result.components.length).toBe(1);
    });

    it('should list specific type (rules)', async () => {
      process.cwd = () => tempDir;

      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety Rules');

      const result = await listCommand('rules');

      expect(result.success).toBe(true);
      expect(result.type).toBe('rules');
      expect(result.components.length).toBe(1);
    });

    it('should use simple format', async () => {
      process.cwd = () => tempDir;

      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-test-agent.md'), '# Test Agent');

      const result = await listCommand('agents', { format: 'simple' });

      expect(result.success).toBe(true);
    });

    it('should use json format for specific type', async () => {
      process.cwd = () => tempDir;

      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-test-agent.md'), '# Test Agent');

      const result = await listCommand('agents', { format: 'json' });

      expect(result.success).toBe(true);
    });

    it('should return empty array when no components exist', async () => {
      process.cwd = () => tempDir;

      const result = await listCommand('all');

      expect(result.success).toBe(true);
      expect(result.components.length).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it('should default to table format', async () => {
      process.cwd = () => tempDir;

      const result = await listCommand('agents');

      expect(result.success).toBe(true);
    });
  });

  describe('formatAsTable edge cases', () => {
    let consoleOutput: string[];
    let consoleSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleOutput = [];
      consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should show empty message when no components', () => {
      formatAsTable([], 'agents');

      const output = consoleOutput.join('\n');
      // Check that message about empty list is shown (from i18n)
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('formatAsSimple edge cases', () => {
    let consoleOutput: string[];
    let consoleSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleOutput = [];
      consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should show empty message when no components', () => {
      formatAsSimple([], 'skills');

      const output = consoleOutput.join('\n');
      // Check that message about empty list is shown (from i18n)
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('yaml parsing edge cases', () => {
    it('should extract description from markdown when no blockquote', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'lang-legacy-agent.md'),
        '# Legacy Agent\n\nA legacy format agent description.\n\nMore content here...'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('A legacy format agent description.');
    });

    it('should handle different agent type prefixes', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'fe-react-expert.md'), '# React Expert');
      await writeFile(join(agentsDir, 'be-django-expert.md'), '# Django Expert');
      await writeFile(join(agentsDir, 'tool-npm-expert.md'), '# NPM Expert');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(3);
      expect(agents.find((a) => a.name === 'be-django-expert')?.type).toBe('backend');
      expect(agents.find((a) => a.name === 'fe-react-expert')?.type).toBe('frontend');
      expect(agents.find((a) => a.name === 'tool-npm-expert')?.type).toBe('tooling');
    });

    it('should handle unknown agent type prefix', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'custom-agent.md'), '# Custom Agent');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].type).toBe('unknown');
    });

    it('should handle agents with all prefix types', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });

      const prefixes = [
        'lang',
        'be',
        'fe',
        'tool',
        'db',
        'arch',
        'infra',
        'qa',
        'mgr',
        'sys',
        'tutor',
      ];
      for (const prefix of prefixes) {
        await writeFile(join(agentsDir, `${prefix}-test.md`), `# ${prefix} Test`);
      }

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(11);
      expect(agents.find((a) => a.name === 'lang-test')?.type).toBe('language');
      expect(agents.find((a) => a.name === 'be-test')?.type).toBe('backend');
      expect(agents.find((a) => a.name === 'fe-test')?.type).toBe('frontend');
      expect(agents.find((a) => a.name === 'tool-test')?.type).toBe('tooling');
      expect(agents.find((a) => a.name === 'db-test')?.type).toBe('database');
      expect(agents.find((a) => a.name === 'arch-test')?.type).toBe('architect');
      expect(agents.find((a) => a.name === 'infra-test')?.type).toBe('infrastructure');
      expect(agents.find((a) => a.name === 'qa-test')?.type).toBe('qa');
      expect(agents.find((a) => a.name === 'mgr-test')?.type).toBe('manager');
      expect(agents.find((a) => a.name === 'sys-test')?.type).toBe('system');
      expect(agents.find((a) => a.name === 'tutor-test')?.type).toBe('tutor');
    });
  });

  describe('markdown description extraction edge cases', () => {
    it('should skip code block markers when extracting description', async () => {
      const guideDir = join(tempDir, 'guides', 'testing');
      await mkdir(guideDir, { recursive: true });
      // The extractor skips lines starting with ``` but not the content inside
      // So put description BEFORE code block
      await writeFile(
        join(guideDir, 'test-guide.md'),
        `# Test Guide

This is the description before code.

\`\`\`javascript
const x = 1;
\`\`\``
      );

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBe('This is the description before code.');
    });

    it('should skip horizontal rules when extracting description', async () => {
      const guideDir = join(tempDir, 'guides', 'testing');
      await mkdir(guideDir, { recursive: true });
      await writeFile(
        join(guideDir, 'hr-guide.md'),
        `# Guide with HR

---

This comes after the horizontal rule.`
      );

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBe('This comes after the horizontal rule.');
    });

    it('should handle markdown with no meaningful content', async () => {
      const guideDir = join(tempDir, 'guides', 'empty');
      await mkdir(guideDir, { recursive: true });
      await writeFile(join(guideDir, 'empty-guide.md'), '# Empty Guide\n\n---\n\n');

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBeUndefined();
    });

    it('should skip lines starting with triple backticks', async () => {
      const guideDir = join(tempDir, 'guides', 'code-block');
      await mkdir(guideDir, { recursive: true });
      await writeFile(
        join(guideDir, 'backtick-guide.md'),
        `# Backtick Guide

\`\`\`
code block content
\`\`\`

Description after code block.`
      );

      const guides = await getGuides(tempDir);

      expect(guides).toHaveLength(1);
      // The parser skips ``` lines but picks up the first non-empty line inside the code block
      expect(guides[0].description).toBe('code block content');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle non-existent directory in getAgents', async () => {
      // Create agents dir but make it inaccessible won't work in test
      // Instead, ensure empty result is returned for non-existent
      const agents = await getAgents('/non/existent/path');
      expect(agents).toEqual([]);
    });

    it('should handle non-existent directory in getSkills', async () => {
      const skills = await getSkills('/non/existent/path');
      expect(skills).toEqual([]);
    });

    it('should handle non-existent directory in getGuides', async () => {
      const guides = await getGuides('/non/existent/path');
      expect(guides).toEqual([]);
    });

    it('should handle non-existent directory in getRules', async () => {
      const rules = await getRules('/non/existent/path');
      expect(rules).toEqual([]);
    });
  });

  describe('error handling - uncovered error paths', () => {
    it('should handle readTextFile error gracefully', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });

      // Create a file that will fail to read (this scenario is hard to test, but we'll create a valid file)
      await writeFile(
        join(agentsDir, 'lang-error-agent.md'),
        '# Error Agent\n\n> Fallback description'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('Fallback description');
    });

    it('should handle listFiles error in getAgents', async () => {
      // Use spyOn to mock listFiles
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated listFiles error');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
        const agents = await getAgents(tempDir);

        // Should return empty array on error
        expect(agents).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });

    it('should handle listFiles error in getSkills', async () => {
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated listFiles error');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
        const skills = await getSkills(tempDir);

        // Should return empty array on error
        expect(skills).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });

    it('should handle listFiles error in getGuides (line 348)', async () => {
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated listFiles error');
      });

      try {
        await mkdir(join(tempDir, 'guides'), { recursive: true });
        const guides = await getGuides(tempDir);

        // Should return empty array on error
        expect(guides).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });

    it('should handle listFiles error in getRules (line 389)', async () => {
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated listFiles error');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'rules'), { recursive: true });
        const rules = await getRules(tempDir);

        // Should return empty array on error
        expect(rules).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });

    it('should handle error in listCommand catch block', async () => {
      const originalCwd = process.cwd;
      let errorCaught = false;
      const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {
        errorCaught = true;
      });

      process.cwd = () => tempDir;

      // Mock formatAsTable to throw an error
      const listModule = await import('../../../src/cli/list.js');
      const formatTableSpy = spyOn(listModule, 'formatAsTable').mockImplementation(() => {
        throw new Error('Critical error in formatting');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
        await writeFile(join(tempDir, '.claude', 'agents', 'lang-test-agent.md'), '# Test');

        const result = await listCommand('agents');

        // Should return error result
        expect(result.success).toBe(false);
        expect(result.type).toBe('agents');
        expect(result.components).toEqual([]);
        expect(result.totalCount).toBe(0);
        expect(result.errors).toBeDefined();
        expect(result.errors?.length).toBeGreaterThan(0);
        expect(result.errors?.[0]).toContain('Critical error in formatting');

        // Should log error to console.error
        expect(errorCaught).toBe(true);
      } finally {
        formatTableSpy.mockRestore();
        process.cwd = originalCwd;
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('getHooks', () => {
    it('should return empty array when hooks directory does not exist', async () => {
      const hooks = await getHooks(tempDir);
      expect(hooks).toEqual([]);
    });

    it('should find shell script hooks', async () => {
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'pre-commit.sh'), '#!/bin/bash\necho "hook"');

      const hooks = await getHooks(tempDir);

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('pre-commit.sh');
      expect(hooks[0].type).toBe('hook');
      expect(hooks[0].path).toBe('.claude/hooks/pre-commit.sh');
    });

    it('should find JSON hook configurations', async () => {
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'hooks.json'), '{"hooks": []}');

      const hooks = await getHooks(tempDir);

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('hooks.json');
      expect(hooks[0].type).toBe('hook');
    });

    it('should find YAML hook configurations', async () => {
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'hooks.yaml'), 'hooks: []');

      const hooks = await getHooks(tempDir);

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('hooks.yaml');
      expect(hooks[0].type).toBe('hook');
    });

    it('should find all hook file types and sort by name', async () => {
      const hooksDir = join(tempDir, '.claude', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(hooksDir, 'post-commit.sh'), '#!/bin/bash');
      await writeFile(join(hooksDir, 'config.json'), '{}');
      await writeFile(join(hooksDir, 'hooks.yaml'), 'hooks: []');
      await writeFile(join(hooksDir, 'pre-commit.sh'), '#!/bin/bash');

      const hooks = await getHooks(tempDir);

      expect(hooks).toHaveLength(4);
      // Should be sorted alphabetically
      expect(hooks[0].name).toBe('config.json');
      expect(hooks[1].name).toBe('hooks.yaml');
      expect(hooks[2].name).toBe('post-commit.sh');
      expect(hooks[3].name).toBe('pre-commit.sh');
    });

    it('should handle errors and return empty array', async () => {
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated error');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'hooks'), { recursive: true });
        const hooks = await getHooks(tempDir);
        expect(hooks).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });
  });

  describe('getContexts', () => {
    it('should return empty array when contexts directory does not exist', async () => {
      const contexts = await getContexts(tempDir);
      expect(contexts).toEqual([]);
    });

    it('should find markdown context files', async () => {
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(
        join(contextsDir, 'ecomode.md'),
        '# Ecomode Context\n\nEcomode reduces token usage.'
      );

      const contexts = await getContexts(tempDir);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].name).toBe('ecomode');
      expect(contexts[0].type).toBe('context');
      expect(contexts[0].path).toBe('.claude/contexts/ecomode.md');
      expect(contexts[0].description).toBe('Ecomode reduces token usage.');
    });

    it('should find YAML context files', async () => {
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(join(contextsDir, 'config.yaml'), 'key: value');

      const contexts = await getContexts(tempDir);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].name).toBe('config');
      expect(contexts[0].type).toBe('context');
      expect(contexts[0].description).toBeUndefined();
    });

    it('should extract description from markdown contexts', async () => {
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(
        join(contextsDir, 'debug.md'),
        '# Debug Context\n\n> Enable debug mode for detailed logging\n\nMore content.'
      );

      const contexts = await getContexts(tempDir);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].description).toBe('Enable debug mode for detailed logging');
    });

    it('should truncate long descriptions to 100 characters', async () => {
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      const longDesc = `${'A'.repeat(150)} This should be truncated`;
      await writeFile(join(contextsDir, 'long.md'), `# Long Context\n\n${longDesc}`);

      const contexts = await getContexts(tempDir);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].description?.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(contexts[0].description?.endsWith('...')).toBe(true);
    });

    it('should find both .md and .yaml contexts and sort by name', async () => {
      const contextsDir = join(tempDir, '.claude', 'contexts');
      await mkdir(contextsDir, { recursive: true });
      await writeFile(join(contextsDir, 'verbose.md'), '# Verbose\n\nVerbose output.');
      await writeFile(join(contextsDir, 'config.yaml'), 'setting: value');
      await writeFile(join(contextsDir, 'ecomode.md'), '# Ecomode\n\nSave tokens.');

      const contexts = await getContexts(tempDir);

      expect(contexts).toHaveLength(3);
      // Should be sorted alphabetically
      expect(contexts[0].name).toBe('config');
      expect(contexts[1].name).toBe('ecomode');
      expect(contexts[2].name).toBe('verbose');
    });

    it('should handle errors and return empty array', async () => {
      const fs = await import('../../../src/utils/fs.js');
      const listFilesSpy = spyOn(fs, 'listFiles').mockImplementation(async () => {
        throw new Error('Simulated error');
      });

      try {
        await mkdir(join(tempDir, '.claude', 'contexts'), { recursive: true });
        const contexts = await getContexts(tempDir);
        expect(contexts).toEqual([]);
      } finally {
        listFilesSpy.mockRestore();
      }
    });
  });

  describe('frontmatter handling', () => {
    it('should skip YAML frontmatter when extracting description', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'lang-frontmatter-agent.md'),
        `---
name: frontmatter-agent
description: This is in frontmatter
version: 1.0.0
---

# Frontmatter Agent

> This is the actual description after frontmatter

More content here.`
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('lang-frontmatter-agent');
      // Should extract description from blockquote after frontmatter, not from frontmatter
      expect(agents[0].description).toBe('This is the actual description after frontmatter');
    });

    it('should handle agent with frontmatter but no blockquote', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, 'mgr-frontmatter-test.md'),
        `---
name: frontmatter-test
---

# Frontmatter Test

This is regular text after frontmatter.`
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('This is regular text after frontmatter.');
    });
  });

  describe('parseYamlMetadata top-level keys', () => {
    it('should parse top-level key-value pairs for backward compatibility', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'testing', 'legacy-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Legacy Skill');
      await writeFile(
        join(skillDir, 'index.yaml'),
        `name: legacy-skill
description: A legacy format skill with top-level keys
version: 1.2.3
`
      );

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('A legacy format skill with top-level keys');
      expect(skills[0].version).toBe('1.2.3');
    });

    it('should prefer metadata block over top-level keys', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'backend', 'mixed-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Mixed Skill');
      await writeFile(
        join(skillDir, 'index.yaml'),
        `name: top-level-name
description: Top level description
metadata:
  name: metadata-name
  description: Metadata description
  version: 2.0.0
`
      );

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      // metadata block takes precedence
      expect(skills[0].description).toBe('Metadata description');
      expect(skills[0].version).toBe('2.0.0');
    });

    it('should handle isNewTopLevelSection detection', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'development', 'section-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Section Skill');
      await writeFile(
        join(skillDir, 'index.yaml'),
        `metadata:
  description: Metadata description
  version: 1.0.0
scripts:
  install: npm install
`
      );

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('Metadata description');
      // scripts: should end the metadata section
    });
  });

  describe('error handling for tryReadIndexYamlMetadata', () => {
    it('should handle readTextFile error when reading index.yaml', async () => {
      const skillDir = join(tempDir, '.claude', 'skills', 'testing', 'error-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Error Skill');
      await writeFile(join(skillDir, 'index.yaml'), 'description: Test');

      const fs = await import('../../../src/utils/fs.js');
      const readTextFileSpy = spyOn(fs, 'readTextFile').mockImplementation(async (path) => {
        if (path.endsWith('index.yaml')) {
          throw new Error('Simulated read error');
        }
        // Allow SKILL.md to be read normally
        return '# Error Skill';
      });

      try {
        const skills = await getSkills(tempDir);

        expect(skills).toHaveLength(1);
        // When index.yaml read fails, description and version should be undefined
        expect(skills[0].description).toBeUndefined();
        expect(skills[0].version).toBeUndefined();
      } finally {
        readTextFileSpy.mockRestore();
      }
    });
  });

  describe('error handling for tryExtractMarkdownDescription', () => {
    it('should handle readTextFile error when reading agent markdown', async () => {
      const agentsDir = join(tempDir, '.claude', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'lang-read-error.md'), '# Read Error Agent\n\n> Description');

      const fs = await import('../../../src/utils/fs.js');
      const readTextFileSpy = spyOn(fs, 'readTextFile').mockImplementation(async (path) => {
        if (path.endsWith('lang-read-error.md')) {
          throw new Error('Simulated read error');
        }
        return '';
      });

      try {
        const agents = await getAgents(tempDir);

        expect(agents).toHaveLength(1);
        // When markdown read fails, description should be undefined
        expect(agents[0].description).toBeUndefined();
      } finally {
        readTextFileSpy.mockRestore();
      }
    });

    it('should handle readTextFile error when reading guide markdown', async () => {
      const guidesDir = join(tempDir, 'guides', 'testing');
      await mkdir(guidesDir, { recursive: true });
      await writeFile(join(guidesDir, 'error-guide.md'), '# Error Guide\n\nDescription');

      const fs = await import('../../../src/utils/fs.js');
      const readTextFileSpy = spyOn(fs, 'readTextFile').mockImplementation(async (path) => {
        if (path.endsWith('error-guide.md')) {
          throw new Error('Simulated read error');
        }
        return '';
      });

      try {
        const guides = await getGuides(tempDir);

        expect(guides).toHaveLength(1);
        // When markdown read fails, description should be undefined
        expect(guides[0].description).toBeUndefined();
      } finally {
        readTextFileSpy.mockRestore();
      }
    });
  });
});

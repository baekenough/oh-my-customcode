import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ComponentInfo,
  type ListType,
  formatAsJson,
  formatAsSimple,
  formatAsTable,
  getAgents,
  getGuides,
  getRules,
  getSkills,
} from '../../../src/cli/list.js';

describe('list command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-list-test-'));
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
      await mkdir(join(tempDir, 'agents'));
      const agents = await getAgents(tempDir);
      expect(agents).toEqual([]);
    });

    it('should find agent with AGENT.md file', async () => {
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'golang-expert');
      await mkdir(agentDir, { recursive: true });
      await writeFile(
        join(agentDir, 'AGENT.md'),
        '# Golang Expert\n\n> A Go language expert agent\n\nMore content here...'
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('golang-expert');
      expect(agents[0].type).toBe('sw-engineer');
      expect(agents[0].path).toBe('agents/sw-engineer/golang-expert');
      expect(agents[0].description).toBe('A Go language expert agent');
    });

    it('should extract description from index.yaml when available', async () => {
      const agentDir = join(tempDir, 'agents', 'manager', 'creator');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Creator Agent');
      await writeFile(
        join(agentDir, 'index.yaml'),
        `metadata:
  name: creator
  type: manager
  description: Creates new agents and components
  version: 1.0.0
`
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('creator');
      expect(agents[0].description).toBe('Creates new agents and components');
      expect(agents[0].version).toBe('1.0.0');
    });

    it('should find multiple agents and sort by name', async () => {
      // Create three agents
      const agent1Dir = join(tempDir, 'agents', 'sw-engineer', 'python-expert');
      const agent2Dir = join(tempDir, 'agents', 'sw-engineer', 'golang-expert');
      const agent3Dir = join(tempDir, 'agents', 'manager', 'creator');

      await mkdir(agent1Dir, { recursive: true });
      await mkdir(agent2Dir, { recursive: true });
      await mkdir(agent3Dir, { recursive: true });

      await writeFile(join(agent1Dir, 'AGENT.md'), '# Python Expert');
      await writeFile(join(agent2Dir, 'AGENT.md'), '# Golang Expert');
      await writeFile(join(agent3Dir, 'AGENT.md'), '# Creator');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(3);
      // Should be sorted: creator, golang-expert, python-expert
      expect(agents[0].name).toBe('creator');
      expect(agents[1].name).toBe('golang-expert');
      expect(agents[2].name).toBe('python-expert');
    });

    it('should handle nested agent types', async () => {
      const agentDir = join(tempDir, 'agents', 'backend-engineer', 'java', 'springboot-expert');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Spring Boot Expert');

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('springboot-expert');
      expect(agents[0].type).toBe('backend-engineer/java');
    });

    it('should extract description from blockquote in AGENT.md', async () => {
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'rust-expert');
      await mkdir(agentDir, { recursive: true });
      await writeFile(
        join(agentDir, 'AGENT.md'),
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

    it('should prefer index.yaml description over AGENT.md', async () => {
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'kotlin-expert');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '> AGENT.md description');
      await writeFile(
        join(agentDir, 'index.yaml'),
        `metadata:
  description: index.yaml description
`
      );

      const agents = await getAgents(tempDir);

      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('index.yaml description');
    });
  });

  describe('getSkills', () => {
    it('should return empty array when skills directory does not exist', async () => {
      const skills = await getSkills(tempDir);
      expect(skills).toEqual([]);
    });

    it('should return empty array when skills directory is empty', async () => {
      await mkdir(join(tempDir, 'skills'));
      const skills = await getSkills(tempDir);
      expect(skills).toEqual([]);
    });

    it('should find skill with SKILL.md file', async () => {
      const skillDir = join(tempDir, 'skills', 'development', 'go-best-practices');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Go Best Practices');

      const skills = await getSkills(tempDir);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('go-best-practices');
      expect(skills[0].type).toBe('skill');
      expect(skills[0].category).toBe('development');
      expect(skills[0].path).toBe('skills/development/go-best-practices');
    });

    it('should extract metadata from index.yaml', async () => {
      const skillDir = join(tempDir, 'skills', 'backend', 'api-design');
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
      const skill1Dir = join(tempDir, 'skills', 'development', 'python-style');
      const skill2Dir = join(tempDir, 'skills', 'backend', 'database-design');
      const skill3Dir = join(tempDir, 'skills', 'infra', 'docker-best-practices');

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
        name: 'golang-expert',
        type: 'sw-engineer',
        path: 'agents/sw-engineer/golang-expert',
        description: 'Go language expert',
        version: '1.0.0',
      },
      {
        name: 'python-expert',
        type: 'sw-engineer',
        path: 'agents/sw-engineer/python-expert',
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
        expect(output).toContain('golang-expert [sw-engineer]');
        expect(output).toContain('python-expert [sw-engineer]');
      });

      it('should use category for skills', () => {
        const skills: ComponentInfo[] = [
          {
            name: 'go-best-practices',
            type: 'skill',
            category: 'development',
            path: 'skills/development/go-best-practices',
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
        expect(output).toContain('golang-expert');
        expect(output).toContain('python-expert');
      });

      it('should show Category header for skills', () => {
        const skills: ComponentInfo[] = [
          {
            name: 'go-best-practices',
            type: 'skill',
            category: 'development',
            path: 'skills/development/go-best-practices',
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
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'golang-expert');
      const skillDir = join(tempDir, 'skills', 'development', 'go-best-practices');
      const guideDir = join(tempDir, 'guides', 'architecture');
      const rulesDir = join(tempDir, '.claude', 'rules');

      await mkdir(agentDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await mkdir(guideDir, { recursive: true });
      await mkdir(rulesDir, { recursive: true });

      await writeFile(join(agentDir, 'AGENT.md'), '# Golang Expert');
      await writeFile(
        join(agentDir, 'index.yaml'),
        'metadata:\n  description: Go expert\n  version: 1.0.0'
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
      expect(agents[0].version).toBe('1.0.0');

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('Go best practices skill');
      expect(skills[0].version).toBe('2.0.0');

      expect(guides).toHaveLength(1);
      expect(guides[0].description).toBe('Clean code principles.');

      expect(rules).toHaveLength(1);
      expect(rules[0].description).toBe('Never violate safety rules');
    });

    it('should handle malformed index.yaml gracefully', async () => {
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'broken-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Broken Agent\n\n> Fallback description');
      await writeFile(
        join(agentDir, 'index.yaml'),
        `this is not valid yaml
  - broken: [[[
  incomplete`
      );

      const agents = await getAgents(tempDir);

      // Should still work and fall back to AGENT.md description
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('broken-agent');
      expect(agents[0].description).toBe('Fallback description');
    });

    it('should handle directories without expected files', async () => {
      // Create directories without the expected marker files
      await mkdir(join(tempDir, 'agents', 'sw-engineer', 'empty-agent'), { recursive: true });
      await mkdir(join(tempDir, 'skills', 'development', 'empty-skill'), { recursive: true });

      // These should be ignored since they lack AGENT.md/SKILL.md
      const agents = await getAgents(tempDir);
      const skills = await getSkills(tempDir);

      expect(agents).toHaveLength(0);
      expect(skills).toHaveLength(0);
    });
  });
});

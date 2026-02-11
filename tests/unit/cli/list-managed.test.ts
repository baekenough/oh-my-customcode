import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgents, getGuides, getRules, getSkills } from '../../../src/cli/list.js';
import {
  type CustomComponentConfig,
  getDefaultConfig,
  saveConfig,
} from '../../../src/core/config.js';

describe('list command managed field', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-list-managed-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createConfig(customComponents: CustomComponentConfig[]): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    config.customComponents = customComponents;
    await saveConfig(tempDir, config);
  }

  interface FileStructure {
    [path: string]: string;
  }

  async function createDirStructure(structure: FileStructure): Promise<void> {
    for (const [path, content] of Object.entries(structure)) {
      const fullPath = join(tempDir, path);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  describe('getAgents managed field', () => {
    it('should mark template agents as managed: true', async () => {
      await createConfig([]); // No custom components
      await createDirStructure({
        '.claude/agents/lang-golang-expert.md': '---\nname: lang-golang-expert\n---\n# Go Expert',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(1);
      expect(agents[0].managed).toBe(true);
    });

    it('should mark custom agents as managed: false', async () => {
      await createConfig([
        {
          type: 'agent',
          name: 'custom-agent',
          path: '.claude/agents/custom-agent.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/agents/lang-golang-expert.md': '---\nname: lang-golang-expert\n---\n# Go Expert',
        '.claude/agents/custom-agent.md': '---\nname: custom-agent\n---\n# Custom Agent',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(2);

      const customAgent = agents.find((a) => a.name === 'custom-agent');
      const templateAgent = agents.find((a) => a.name === 'lang-golang-expert');

      expect(customAgent?.managed).toBe(false);
      expect(templateAgent?.managed).toBe(true);
    });

    it('should handle multiple custom agents', async () => {
      await createConfig([
        {
          type: 'agent',
          name: 'custom-agent-1',
          path: '.claude/agents/custom-agent-1.md',
          managed: false,
        },
        {
          type: 'agent',
          name: 'custom-agent-2',
          path: '.claude/agents/custom-agent-2.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/agents/lang-golang-expert.md': '# Go Expert',
        '.claude/agents/custom-agent-1.md': '# Custom Agent 1',
        '.claude/agents/custom-agent-2.md': '# Custom Agent 2',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(3);

      const customAgent1 = agents.find((a) => a.name === 'custom-agent-1');
      const customAgent2 = agents.find((a) => a.name === 'custom-agent-2');
      const templateAgent = agents.find((a) => a.name === 'lang-golang-expert');

      expect(customAgent1?.managed).toBe(false);
      expect(customAgent2?.managed).toBe(false);
      expect(templateAgent?.managed).toBe(true);
    });
  });

  describe('getSkills managed field', () => {
    it('should mark template skills as managed: true', async () => {
      await createConfig([]);
      await createDirStructure({
        '.claude/skills/development/template-skill/SKILL.md': '# Template Skill',
      });

      const skills = await getSkills(tempDir, '.claude');
      expect(skills.length).toBe(1);
      expect(skills[0].managed).toBe(true);
    });

    it('should mark custom skills as managed: false', async () => {
      await createConfig([
        {
          type: 'skill',
          name: 'custom-skill',
          path: '.claude/skills/development/custom-skill',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/skills/development/template-skill/SKILL.md': '# Template Skill',
        '.claude/skills/development/custom-skill/SKILL.md': '# Custom Skill',
      });

      const skills = await getSkills(tempDir, '.claude');
      expect(skills.length).toBe(2);

      const customSkill = skills.find((s) => s.name === 'custom-skill');
      const templateSkill = skills.find((s) => s.name === 'template-skill');

      expect(customSkill?.managed).toBe(false);
      expect(templateSkill?.managed).toBe(true);
    });

    it('should handle skills in different categories', async () => {
      await createConfig([
        {
          type: 'skill',
          name: 'custom-backend-skill',
          path: '.claude/skills/backend/custom-backend-skill',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/skills/development/template-skill/SKILL.md': '# Template Skill',
        '.claude/skills/backend/custom-backend-skill/SKILL.md': '# Custom Backend Skill',
      });

      const skills = await getSkills(tempDir, '.claude');
      expect(skills.length).toBe(2);

      const customSkill = skills.find((s) => s.name === 'custom-backend-skill');
      const templateSkill = skills.find((s) => s.name === 'template-skill');

      expect(customSkill?.managed).toBe(false);
      expect(customSkill?.category).toBe('backend');
      expect(templateSkill?.managed).toBe(true);
      expect(templateSkill?.category).toBe('development');
    });
  });

  describe('getRules managed field', () => {
    it('should mark template rules as managed: true', async () => {
      await createConfig([]);
      await createDirStructure({
        '.claude/rules/MUST-safety.md': '# Safety Rules',
      });

      const rules = await getRules(tempDir, '.claude');
      expect(rules.length).toBe(1);
      expect(rules[0].managed).toBe(true);
    });

    it('should mark custom rules as managed: false', async () => {
      await createConfig([
        {
          type: 'rule',
          name: 'CUSTOM-rule',
          path: '.claude/rules/CUSTOM-rule.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/rules/MUST-safety.md': '# Safety Rules',
        '.claude/rules/CUSTOM-rule.md': '# Custom Rule',
      });

      const rules = await getRules(tempDir, '.claude');
      expect(rules.length).toBe(2);

      const customRule = rules.find((r) => r.name === 'CUSTOM-rule');
      const templateRule = rules.find((r) => r.name === 'MUST-safety');

      expect(customRule?.managed).toBe(false);
      expect(templateRule?.managed).toBe(true);
    });

    it('should handle multiple custom rules with different priorities', async () => {
      await createConfig([
        {
          type: 'rule',
          name: 'CUSTOM-rule-1',
          path: '.claude/rules/CUSTOM-rule-1.md',
          managed: false,
        },
        {
          type: 'rule',
          name: 'SHOULD-custom',
          path: '.claude/rules/SHOULD-custom.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/rules/MUST-safety.md': '# Safety Rules',
        '.claude/rules/CUSTOM-rule-1.md': '# Custom Rule 1',
        '.claude/rules/SHOULD-custom.md': '# Custom SHOULD Rule',
      });

      const rules = await getRules(tempDir, '.claude');
      expect(rules.length).toBe(3);

      const customRule1 = rules.find((r) => r.name === 'CUSTOM-rule-1');
      const customShouldRule = rules.find((r) => r.name === 'SHOULD-custom');
      const mustRule = rules.find((r) => r.name === 'MUST-safety');

      expect(customRule1?.managed).toBe(false);
      expect(customShouldRule?.managed).toBe(false);
      expect(mustRule?.managed).toBe(true);
    });
  });

  describe('getGuides managed field', () => {
    it('should mark template guides as managed: true', async () => {
      await createConfig([]);
      await createDirStructure({
        'guides/template/guide.md': '# Template Guide',
      });

      const guides = await getGuides(tempDir);
      expect(guides.length).toBe(1);
      expect(guides[0].managed).toBe(true);
    });

    it('should mark custom guides as managed: false', async () => {
      await createConfig([
        {
          type: 'guide',
          name: 'custom-guide',
          path: 'guides/custom/guide.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        'guides/template/guide.md': '# Template Guide',
        'guides/custom/guide.md': '# Custom Guide',
      });

      const guides = await getGuides(tempDir);
      expect(guides.length).toBe(2);

      const customGuide = guides.find((g) => g.path === 'guides/custom/guide.md');
      const templateGuide = guides.find((g) => g.path === 'guides/template/guide.md');

      expect(customGuide?.managed).toBe(false);
      expect(templateGuide?.managed).toBe(true);
    });

    it('should handle guides in different categories', async () => {
      await createConfig([
        {
          type: 'guide',
          name: 'my-custom-testing-guide',
          path: 'guides/testing/custom-testing.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        'guides/architecture/clean-code.md': '# Clean Code',
        'guides/testing/custom-testing.md': '# Custom Testing Guide',
      });

      const guides = await getGuides(tempDir);
      expect(guides.length).toBe(2);

      const customGuide = guides.find((g) => g.path === 'guides/testing/custom-testing.md');
      const templateGuide = guides.find((g) => g.path === 'guides/architecture/clean-code.md');

      expect(customGuide?.managed).toBe(false);
      expect(customGuide?.category).toBe('testing');
      expect(templateGuide?.managed).toBe(true);
      expect(templateGuide?.category).toBe('architecture');
    });
  });

  describe('no customComponents configured', () => {
    it('should mark all components as managed: true when no customComponents', async () => {
      await createConfig([]); // Empty custom components
      await createDirStructure({
        '.claude/agents/agent1.md': '---\nname: agent1\n---\n# Agent 1',
        '.claude/skills/development/skill1/SKILL.md': '# Skill 1',
        '.claude/rules/MUST-rule1.md': '# Rule 1',
      });

      const agents = await getAgents(tempDir, '.claude');
      const skills = await getSkills(tempDir, '.claude');
      const rules = await getRules(tempDir, '.claude');

      expect(agents.every((a) => a.managed === true)).toBe(true);
      expect(skills.every((s) => s.managed === true)).toBe(true);
      expect(rules.every((r) => r.managed === true)).toBe(true);
    });

    it('should handle undefined customComponents gracefully', async () => {
      // Don't set customComponents at all (will be undefined in loadConfig)
      const config = getDefaultConfig();
      config.version = '0.1.0';
      config.installedAt = '2025-01-01T00:00:00Z';
      config.customComponents = undefined;
      await saveConfig(tempDir, config);

      await createDirStructure({
        '.claude/agents/agent1.md': '# Agent 1',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(1);
      expect(agents[0].managed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle component not in config but present in filesystem', async () => {
      await createConfig([
        {
          type: 'agent',
          name: 'custom-agent',
          path: '.claude/agents/custom-agent.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/agents/lang-golang-expert.md': '# Go Expert',
        '.claude/agents/custom-agent.md': '# Custom Agent',
        '.claude/agents/another-agent.md': '# Another Agent',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(3);

      const customAgent = agents.find((a) => a.name === 'custom-agent');
      const goAgent = agents.find((a) => a.name === 'lang-golang-expert');
      const anotherAgent = agents.find((a) => a.name === 'another-agent');

      expect(customAgent?.managed).toBe(false);
      expect(goAgent?.managed).toBe(true);
      expect(anotherAgent?.managed).toBe(true);
    });

    it('should handle component in config but not in filesystem', async () => {
      await createConfig([
        {
          type: 'agent',
          name: 'missing-agent',
          path: '.claude/agents/missing-agent.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/agents/lang-golang-expert.md': '# Go Expert',
      });

      const agents = await getAgents(tempDir, '.claude');
      expect(agents.length).toBe(1);

      const goAgent = agents.find((a) => a.name === 'lang-golang-expert');
      expect(goAgent?.managed).toBe(true);
    });

    it('should handle mixed component types in config', async () => {
      await createConfig([
        {
          type: 'agent',
          name: 'custom-agent',
          path: '.claude/agents/custom-agent.md',
          managed: false,
        },
        {
          type: 'skill',
          name: 'custom-skill',
          path: '.claude/skills/development/custom-skill',
          managed: false,
        },
        {
          type: 'rule',
          name: 'CUSTOM-rule',
          path: '.claude/rules/CUSTOM-rule.md',
          managed: false,
        },
      ]);
      await createDirStructure({
        '.claude/agents/custom-agent.md': '# Custom Agent',
        '.claude/agents/lang-golang-expert.md': '# Go Expert',
        '.claude/skills/development/custom-skill/SKILL.md': '# Custom Skill',
        '.claude/skills/development/template-skill/SKILL.md': '# Template Skill',
        '.claude/rules/CUSTOM-rule.md': '# Custom Rule',
        '.claude/rules/MUST-safety.md': '# Safety',
      });

      const agents = await getAgents(tempDir, '.claude');
      const skills = await getSkills(tempDir, '.claude');
      const rules = await getRules(tempDir, '.claude');

      // Verify agents
      expect(agents.length).toBe(2);
      expect(agents.find((a) => a.name === 'custom-agent')?.managed).toBe(false);
      expect(agents.find((a) => a.name === 'lang-golang-expert')?.managed).toBe(true);

      // Verify skills
      expect(skills.length).toBe(2);
      expect(skills.find((s) => s.name === 'custom-skill')?.managed).toBe(false);
      expect(skills.find((s) => s.name === 'template-skill')?.managed).toBe(true);

      // Verify rules
      expect(rules.length).toBe(2);
      expect(rules.find((r) => r.name === 'CUSTOM-rule')?.managed).toBe(false);
      expect(rules.find((r) => r.name === 'MUST-safety')?.managed).toBe(true);
    });
  });
});

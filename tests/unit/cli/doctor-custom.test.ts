import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCustomComponents } from '../../../src/cli/doctor.js';
import {
  type CustomComponentConfig,
  getDefaultConfig,
  saveConfig,
} from '../../../src/core/config.js';

describe('doctor custom components', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-doctor-custom-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Helper to create config with custom components
  async function createConfigWithCustomComponents(
    customComponents: CustomComponentConfig[]
  ): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    config.customComponents = customComponents;
    await saveConfig(tempDir, config);
  }

  // Helper to create directory structure
  async function createDirStructure(structure: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(structure)) {
      const fullPath = join(tempDir, path);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  it('should pass when no custom components configured', async () => {
    await createConfigWithCustomComponents([]);

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('No custom components configured');
    expect(result.fixable).toBe(false);
  });

  it('should pass when all custom component paths exist', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'custom-agent',
        path: '.claude/agents/custom-agent.md',
        managed: false,
      },
      {
        type: 'skill',
        name: 'custom-skill',
        path: '.claude/skills/custom-skill/',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Create the custom component paths
    await createDirStructure({
      '.claude/agents/custom-agent.md': 'Custom agent content',
      '.claude/skills/custom-skill/SKILL.md': 'Custom skill content',
    });

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('2 items');
    expect(result.message).toContain('managed: false');
    expect(result.fixable).toBe(false);
  });

  it('should warn when custom component path is missing', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'existing-agent',
        path: '.claude/agents/existing-agent.md',
        managed: false,
      },
      {
        type: 'agent',
        name: 'missing-agent',
        path: '.claude/agents/missing-agent.md',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Create only one component
    await createDirStructure({
      '.claude/agents/existing-agent.md': 'Existing agent content',
    });

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('warn');
    expect(result.message).toContain('2 items');
    expect(result.message).toContain('1 missing');
    expect(result.fixable).toBe(false);
    expect(result.details).toBeDefined();
    expect(result.details?.length).toBe(1);
    expect(result.details?.[0]).toBe('.claude/agents/missing-agent.md');
  });

  it('should report custom component count', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'agent1',
        path: '.claude/agents/agent1.md',
        managed: false,
      },
      {
        type: 'skill',
        name: 'skill1',
        path: '.claude/skills/skill1/',
        managed: false,
      },
      {
        type: 'rule',
        name: 'rule1',
        path: '.claude/rules/rule1.md',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Create all components
    await createDirStructure({
      '.claude/agents/agent1.md': 'Agent 1',
      '.claude/skills/skill1/SKILL.md': 'Skill 1',
      '.claude/rules/rule1.md': 'Rule 1',
    });

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('3 items');
    expect(result.message).toContain('managed: false');
  });

  it('should handle all missing components', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'missing1',
        path: '.claude/agents/missing1.md',
        managed: false,
      },
      {
        type: 'skill',
        name: 'missing2',
        path: '.claude/skills/missing2/',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Don't create any files

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('warn');
    expect(result.message).toContain('2 items');
    expect(result.message).toContain('2 missing');
    expect(result.details?.length).toBe(2);
    expect(result.details).toContain('.claude/agents/missing1.md');
    expect(result.details).toContain('.claude/skills/missing2/');
  });

  it('should pass when config file does not exist', async () => {
    // Don't create config file

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    // When config doesn't exist, it defaults to empty customComponents
    expect(result.message).toContain('No custom components configured');
    expect(result.fixable).toBe(false);
  });

  it('should handle directory paths (trailing /)', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'skill',
        name: 'custom-skill',
        path: '.claude/skills/custom-skill/',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Create skill directory
    await createDirStructure({
      '.claude/skills/custom-skill/SKILL.md': 'Skill content',
      '.claude/skills/custom-skill/script.sh': 'Script',
    });

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('1 items');
  });

  it('should handle mixed existing and missing components', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'agent1',
        path: '.claude/agents/agent1.md',
        managed: false,
      },
      {
        type: 'agent',
        name: 'agent2',
        path: '.claude/agents/agent2.md',
        managed: false,
      },
      {
        type: 'skill',
        name: 'skill1',
        path: '.claude/skills/skill1/',
        managed: false,
      },
      {
        type: 'skill',
        name: 'skill2',
        path: '.claude/skills/skill2/',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    // Create only agent1 and skill1
    await createDirStructure({
      '.claude/agents/agent1.md': 'Agent 1',
      '.claude/skills/skill1/SKILL.md': 'Skill 1',
    });

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('warn');
    expect(result.message).toContain('4 items');
    expect(result.message).toContain('2 missing');
    expect(result.details?.length).toBe(2);
    expect(result.details).toContain('.claude/agents/agent2.md');
    expect(result.details).toContain('.claude/skills/skill2/');
  });

  it('should handle empty customComponents array', async () => {
    await createConfigWithCustomComponents([]);

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('No custom components configured');
  });

  it('should not be fixable (managed:false paths are user responsibility)', async () => {
    const customComponents: CustomComponentConfig[] = [
      {
        type: 'agent',
        name: 'missing',
        path: '.claude/agents/missing.md',
        managed: false,
      },
    ];

    await createConfigWithCustomComponents(customComponents);

    const result = await checkCustomComponents(tempDir, '.claude');

    expect(result.status).toBe('warn');
    expect(result.fixable).toBe(false);
  });
});

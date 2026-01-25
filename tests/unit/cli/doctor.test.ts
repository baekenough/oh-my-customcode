import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CheckResult,
  checkAgents,
  checkClaudeMd,
  checkIndexFiles,
  checkRules,
  checkSkills,
  checkSymlinks,
  fixIssues,
} from '../../../src/cli/doctor.js';

describe('doctor command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-doctor-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('checkClaudeMd', () => {
    it('should pass when CLAUDE.md exists', async () => {
      // Setup: create CLAUDE.md
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Project\n\nThis is a test project.');

      const result = await checkClaudeMd(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('CLAUDE.md');
      expect(result.fixable).toBe(false);
    });

    it('should fail when CLAUDE.md is missing', async () => {
      // No CLAUDE.md created

      const result = await checkClaudeMd(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('CLAUDE.md');
      expect(result.fixable).toBe(false); // CLAUDE.md should be created by init
    });
  });

  describe('checkRules', () => {
    it('should pass when .claude/rules exists with rule files', async () => {
      // Setup: create rules directory with files
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety Rules\n\nBe safe.');
      await writeFile(join(rulesDir, 'SHOULD-style.md'), '# Style Rules\n\nBe stylish.');

      const result = await checkRules(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Rules');
      expect(result.message).toContain('2 files');
    });

    it('should fail when .claude/rules directory is missing', async () => {
      // No rules directory created

      const result = await checkRules(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('Rules');
      expect(result.fixable).toBe(true);
    });

    it('should warn when rules directory exists but is empty', async () => {
      // Setup: create empty rules directory
      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });

      const result = await checkRules(tempDir);

      expect(result.status).toBe('warn');
      expect(result.message).toContain('0 files');
    });
  });

  describe('checkAgents', () => {
    it('should pass when agents directory exists with valid agents', async () => {
      // Setup: create agents with AGENT.md files
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'golang-expert');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Golang Expert\n\nI am a Go expert.');

      const result = await checkAgents(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Agents');
      expect(result.message).toContain('1 agents');
    });

    it('should fail when agents directory is missing', async () => {
      // No agents directory

      const result = await checkAgents(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('Agents');
      expect(result.fixable).toBe(true);
    });

    it('should warn when agents directory exists but has no valid agents', async () => {
      // Setup: create agents directory without AGENT.md files
      const agentsDir = join(tempDir, 'agents', 'sw-engineer', 'incomplete-agent');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, 'index.yaml'), 'name: incomplete');

      const result = await checkAgents(tempDir);

      expect(result.status).toBe('warn');
      expect(result.message).toContain('0 agents');
    });

    it('should count multiple agents correctly', async () => {
      // Setup: create multiple agents
      const agent1 = join(tempDir, 'agents', 'sw-engineer', 'golang-expert');
      const agent2 = join(tempDir, 'agents', 'sw-engineer', 'python-expert');
      const agent3 = join(tempDir, 'agents', 'backend-engineer', 'fastapi-expert');
      await mkdir(agent1, { recursive: true });
      await mkdir(agent2, { recursive: true });
      await mkdir(agent3, { recursive: true });
      await writeFile(join(agent1, 'AGENT.md'), '# Golang Expert');
      await writeFile(join(agent2, 'AGENT.md'), '# Python Expert');
      await writeFile(join(agent3, 'AGENT.md'), '# FastAPI Expert');

      const result = await checkAgents(tempDir);

      expect(result.status).toBe('pass');
      expect(result.message).toContain('3 agents');
    });
  });

  describe('checkSkills', () => {
    it('should pass when skills directory exists with categories', async () => {
      // Setup: create skills directory with categories
      const skillsDir = join(tempDir, 'skills');
      await mkdir(join(skillsDir, 'development'), { recursive: true });
      await mkdir(join(skillsDir, 'backend'), { recursive: true });

      const result = await checkSkills(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Skills');
      expect(result.message).toContain('2 categories');
    });

    it('should fail when skills directory is missing', async () => {
      // No skills directory

      const result = await checkSkills(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('Skills');
      expect(result.fixable).toBe(true);
    });

    it('should warn when skills directory exists but is empty', async () => {
      // Setup: create empty skills directory
      await mkdir(join(tempDir, 'skills'), { recursive: true });

      const result = await checkSkills(tempDir);

      expect(result.status).toBe('warn');
      expect(result.message).toContain('0 categories');
    });
  });

  describe('checkSymlinks', () => {
    it('should pass when no broken symlinks exist', async () => {
      // Setup: create agent with valid symlink in refs/
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      const refsDir = join(agentDir, 'refs');
      const guidesDir = join(tempDir, 'guides', 'test-guide');
      await mkdir(refsDir, { recursive: true });
      await mkdir(guidesDir, { recursive: true });
      await writeFile(join(guidesDir, 'README.md'), '# Test Guide');

      // Create valid symlink
      await symlink(guidesDir, join(refsDir, 'test-guide'));

      const result = await checkSymlinks(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Symlinks');
    });

    it('should pass when no symlinks exist (no agents/skills dirs)', async () => {
      // No agents or skills directories

      const result = await checkSymlinks(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Symlinks');
    });

    it('should fail when broken symlinks exist', async () => {
      // Setup: create agent with broken symlink in refs/
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      const refsDir = join(agentDir, 'refs');
      await mkdir(refsDir, { recursive: true });

      // Create broken symlink pointing to non-existent path
      await symlink('/non/existent/path', join(refsDir, 'broken-link'));

      const result = await checkSymlinks(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('Symlinks');
      expect(result.message).toContain('1 broken');
      expect(result.fixable).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details?.length).toBe(1);
    });

    it('should detect multiple broken symlinks', async () => {
      // Setup: create multiple broken symlinks
      const agent1Refs = join(tempDir, 'agents', 'sw-engineer', 'agent1', 'refs');
      const agent2Refs = join(tempDir, 'agents', 'backend-engineer', 'agent2', 'refs');
      await mkdir(agent1Refs, { recursive: true });
      await mkdir(agent2Refs, { recursive: true });

      await symlink('/missing/path1', join(agent1Refs, 'broken1'));
      await symlink('/missing/path2', join(agent2Refs, 'broken2'));

      const result = await checkSymlinks(tempDir);

      expect(result.status).toBe('fail');
      expect(result.message).toContain('2 broken');
      expect(result.details?.length).toBe(2);
    });
  });

  describe('checkIndexFiles', () => {
    it('should pass when all index.yaml files are valid', async () => {
      // Setup: create valid index.yaml files
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(
        join(agentDir, 'index.yaml'),
        'metadata:\n  name: test-agent\n  type: worker\n'
      );

      const result = await checkIndexFiles(tempDir);

      expect(result.status).toBe('pass');
      expect(result.name).toBe('Index files');
      expect(result.message).toContain('1 files');
    });

    it('should fail when index.yaml has invalid YAML syntax', async () => {
      // Setup: create invalid index.yaml
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'index.yaml'), 'invalid:\n  yaml: [\n  broken syntax');

      const result = await checkIndexFiles(tempDir);

      expect(result.status).toBe('fail');
      expect(result.name).toBe('Index files');
      expect(result.message).toContain('1 invalid');
      expect(result.fixable).toBe(false);
      expect(result.details).toBeDefined();
    });

    it('should warn when no index.yaml files exist', async () => {
      // No index.yaml files

      const result = await checkIndexFiles(tempDir);

      expect(result.status).toBe('warn');
      expect(result.message).toContain('0 files');
    });

    it('should report multiple invalid files', async () => {
      // Setup: create multiple invalid index.yaml files
      const agent1Dir = join(tempDir, 'agents', 'sw-engineer', 'agent1');
      const agent2Dir = join(tempDir, 'agents', 'sw-engineer', 'agent2');
      await mkdir(agent1Dir, { recursive: true });
      await mkdir(agent2Dir, { recursive: true });
      await writeFile(join(agent1Dir, 'index.yaml'), 'broken: [syntax');
      await writeFile(join(agent2Dir, 'index.yaml'), 'also: {bad');

      const result = await checkIndexFiles(tempDir);

      expect(result.status).toBe('fail');
      expect(result.message).toContain('2 invalid');
    });
  });

  describe('fixIssues', () => {
    it('should create missing rules directory', async () => {
      // Setup: check that shows rules missing
      const checks: CheckResult[] = [
        {
          name: 'Rules',
          status: 'fail',
          message: 'Rules directory is missing',
          fixable: true,
        },
      ];

      // Suppress console output during test
      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

      const fixedChecks = await fixIssues(checks, tempDir);

      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBe(true);

      // Verify directory was created
      const { stat } = await import('node:fs/promises');
      const rulesDir = join(tempDir, '.claude', 'rules');
      const dirStat = await stat(rulesDir);
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('should create missing agents directory', async () => {
      const checks: CheckResult[] = [
        {
          name: 'Agents',
          status: 'fail',
          message: 'Agents directory is missing',
          fixable: true,
        },
      ];

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      const fixedChecks = await fixIssues(checks, tempDir);
      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBe(true);

      const { stat } = await import('node:fs/promises');
      const agentsDir = join(tempDir, 'agents');
      const dirStat = await stat(agentsDir);
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('should create missing skills directory', async () => {
      const checks: CheckResult[] = [
        {
          name: 'Skills',
          status: 'fail',
          message: 'Skills directory is missing',
          fixable: true,
        },
      ];

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      const fixedChecks = await fixIssues(checks, tempDir);
      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBe(true);

      const { stat } = await import('node:fs/promises');
      const skillsDir = join(tempDir, 'skills');
      const dirStat = await stat(skillsDir);
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('should remove broken symlinks', async () => {
      // Setup: create broken symlink
      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      const refsDir = join(agentDir, 'refs');
      await mkdir(refsDir, { recursive: true });
      const brokenSymlink = join(refsDir, 'broken-link');
      await symlink('/non/existent/path', brokenSymlink);

      const checks: CheckResult[] = [
        {
          name: 'Symlinks',
          status: 'fail',
          message: 'Some symlinks are broken',
          fixable: true,
          details: ['agents/sw-engineer/test-agent/refs/broken-link'],
        },
      ];

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      const fixedChecks = await fixIssues(checks, tempDir);
      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBe(true);

      // Verify symlink was removed
      const { access } = await import('node:fs/promises');
      let symlinkExists = true;
      try {
        await access(brokenSymlink);
      } catch {
        symlinkExists = false;
      }
      expect(symlinkExists).toBe(false);
    });

    it('should not modify passing checks', async () => {
      const checks: CheckResult[] = [
        {
          name: 'CLAUDE.md',
          status: 'pass',
          message: 'CLAUDE.md exists',
          fixable: false,
        },
      ];

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      const fixedChecks = await fixIssues(checks, tempDir);
      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBeUndefined();
      expect(fixedChecks[0].status).toBe('pass');
    });

    it('should not modify non-fixable failed checks', async () => {
      const checks: CheckResult[] = [
        {
          name: 'Index files',
          status: 'fail',
          message: 'Some index.yaml files are invalid',
          fixable: false,
        },
      ];

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      const fixedChecks = await fixIssues(checks, tempDir);
      consoleSpy.mockRestore();

      expect(fixedChecks[0].fixed).toBeUndefined();
      expect(fixedChecks[0].status).toBe('fail');
    });
  });

  describe('healthy installation', () => {
    it('should return all passing checks for complete installation', async () => {
      // Setup: create a complete, healthy installation
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Project\n\nHealthy project.');

      const rulesDir = join(tempDir, '.claude', 'rules');
      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'MUST-safety.md'), '# Safety');

      const agentDir = join(tempDir, 'agents', 'sw-engineer', 'test-agent');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'AGENT.md'), '# Test Agent');
      await writeFile(join(agentDir, 'index.yaml'), 'metadata:\n  name: test-agent\n');

      const skillsDir = join(tempDir, 'skills', 'development');
      await mkdir(skillsDir, { recursive: true });

      // Run all checks
      const results = await Promise.all([
        checkClaudeMd(tempDir),
        checkRules(tempDir),
        checkAgents(tempDir),
        checkSkills(tempDir),
        checkSymlinks(tempDir),
        checkIndexFiles(tempDir),
      ]);

      // All checks should pass
      expect(results.every((r) => r.status === 'pass')).toBe(true);
      expect(results.filter((r) => r.status === 'fail').length).toBe(0);
    });
  });

  describe('unhealthy installation', () => {
    it('should detect all missing components in empty directory', async () => {
      // Run all checks on empty directory
      const results = await Promise.all([
        checkClaudeMd(tempDir),
        checkRules(tempDir),
        checkAgents(tempDir),
        checkSkills(tempDir),
        checkSymlinks(tempDir),
        checkIndexFiles(tempDir),
      ]);

      // CLAUDE.md, Rules, Agents, Skills should fail
      const failedChecks = results.filter((r) => r.status === 'fail');
      expect(failedChecks.length).toBe(4);

      const failedNames = failedChecks.map((r) => r.name);
      expect(failedNames).toContain('CLAUDE.md');
      expect(failedNames).toContain('Rules');
      expect(failedNames).toContain('Agents');
      expect(failedNames).toContain('Skills');

      // Symlinks should pass (no symlinks = no broken symlinks)
      const symlinkCheck = results.find((r) => r.name === 'Symlinks');
      expect(symlinkCheck?.status).toBe('pass');

      // Index files should warn (no files found)
      const indexCheck = results.find((r) => r.name === 'Index files');
      expect(indexCheck?.status).toBe('warn');
    });
  });
});

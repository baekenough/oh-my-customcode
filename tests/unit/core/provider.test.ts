import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProvider, type ProviderDetection } from '../../../src/core/provider.js';

describe('provider detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-provider-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('normalizeProvider (via detectProvider)', () => {
    it('should normalize "claude" value', async () => {
      const result = await detectProvider({
        override: 'claude' as const,
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('override:option');
    });

    it('should normalize "codex" value', async () => {
      const result = await detectProvider({
        override: 'codex' as const,
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('override:option');
    });

    it('should handle "auto" override by skipping it', async () => {
      // "auto" override should be skipped, falling back to default
      const result = await detectProvider({
        override: 'auto',
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('low');
    });

    it('should handle empty string override', async () => {
      // Empty string should skip override and use default
      const result = await detectProvider({
        override: '' as const,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle null override', async () => {
      const result = await detectProvider({
        override: null as unknown as undefined,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle undefined override', async () => {
      const result = await detectProvider({
        override: undefined,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });
  });

  describe('detectFromEnv - env variable overrides', () => {
    it('should detect OMCUSTOM_PROVIDER=claude', async () => {
      const result = await detectProvider({
        env: { OMCUSTOM_PROVIDER: 'claude' },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('env:OMCUSTOM_PROVIDER');
    });

    it('should detect OMCUSTOM_PROVIDER=codex', async () => {
      const result = await detectProvider({
        env: { OMCUSTOM_PROVIDER: 'codex' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('env:OMCUSTOM_PROVIDER');
    });

    it('should detect LLM_SERVICE=claude', async () => {
      const result = await detectProvider({
        env: { LLM_SERVICE: 'claude' },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('env:LLM_SERVICE');
    });

    it('should detect LLM_SERVICE=codex', async () => {
      const result = await detectProvider({
        env: { LLM_SERVICE: 'codex' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('env:LLM_SERVICE');
    });

    it('should skip auto value in env overrides', async () => {
      const result = await detectProvider({
        env: { OMCUSTOM_PROVIDER: 'auto' },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should prioritize OMCUSTOM_PROVIDER over LLM_SERVICE', async () => {
      const result = await detectProvider({
        env: {
          OMCUSTOM_PROVIDER: 'claude',
          LLM_SERVICE: 'codex',
        },
      });

      expect(result.provider).toBe('claude');
      expect(result.reason).toBe('env:OMCUSTOM_PROVIDER');
    });
  });

  describe('detectFromEnv - codex signals', () => {
    it('should detect codex from OPENAI_API_KEY', async () => {
      const result = await detectProvider({
        env: { OPENAI_API_KEY: 'sk-test-key' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('env');
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('env:OPENAI_API_KEY');
    });

    it('should detect codex from OPENAI_ORG_ID', async () => {
      const result = await detectProvider({
        env: { OPENAI_ORG_ID: 'org-123' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('env');
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('env:OPENAI_ORG_ID');
    });

    it('should detect codex from OPENAI_PROJECT', async () => {
      const result = await detectProvider({
        env: { OPENAI_PROJECT: 'proj-123' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('env');
      expect(result.reason).toBe('env:OPENAI_PROJECT');
    });

    it('should detect codex from CODEX_HOME', async () => {
      const result = await detectProvider({
        env: { CODEX_HOME: '/path/to/codex' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('env');
      expect(result.reason).toBe('env:CODEX_HOME');
    });

    it('should detect codex from CODEX_PROJECT', async () => {
      const result = await detectProvider({
        env: { CODEX_PROJECT: 'my-project' },
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('env');
      expect(result.reason).toBe('env:CODEX_PROJECT');
    });

    it('should detect codex from multiple signals (first one wins)', async () => {
      const result = await detectProvider({
        env: {
          OPENAI_API_KEY: 'sk-test',
          CODEX_HOME: '/codex',
        },
      });

      expect(result.provider).toBe('codex');
      expect(result.reason).toBe('env:OPENAI_API_KEY');
    });
  });

  describe('detectFromEnv - both signals present', () => {
    it('should return null when both claude and codex signals exist', async () => {
      // When both signal types exist, detectFromEnv returns null (ambiguous)
      // This should fall through to default
      const result = await detectProvider({
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-test',
          OPENAI_API_KEY: 'sk-test',
        },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('low');
    });

    it('should return null when multiple signals from both providers', async () => {
      const result = await detectProvider({
        env: {
          CLAUDE_CODE: '1',
          CODEX_HOME: '/codex',
        },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });
  });

  describe('detectFromProject - claude markers', () => {
    it('should detect claude from CLAUDE.md', async () => {
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Claude Instructions');

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('project');
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('project:claude');
    });

    it('should detect claude from .claude directory', async () => {
      await mkdir(join(tempDir, '.claude'));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('project');
      expect(result.reason).toBe('project:claude');
    });

    it('should detect claude from both CLAUDE.md and .claude', async () => {
      await mkdir(join(tempDir, '.claude'));
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Claude');

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('project');
    });
  });

  describe('detectFromProject - codex markers', () => {
    it('should detect codex from AGENTS.md', async () => {
      await writeFile(join(tempDir, 'AGENTS.md'), '# Codex Agents');

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('project');
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('project:codex');
    });

    it('should detect codex from .codex directory', async () => {
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('project');
      expect(result.reason).toBe('project:codex');
    });

    it('should detect codex from both AGENTS.md and .codex', async () => {
      await mkdir(join(tempDir, '.codex'));
      await writeFile(join(tempDir, 'AGENTS.md'), '# Codex Agents');

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('project');
    });

    it('should prioritize config over project when both exist', async () => {
      // Create codex project markers
      await mkdir(join(tempDir, '.codex'));

      // Create config with claude preference
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'claude' }));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('config');
      expect(result.confidence).toBe('high');
    });
  });

  describe('detectFromConfig', () => {
    it('should detect provider from .omcustomrc.json', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'codex' }));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('config');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('config:provider');
    });

    it('should handle config file with auto provider', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'auto' }));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      // auto should be skipped, falling to default
      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle config file with no provider field', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ otherField: 'value' }));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle invalid JSON in config file', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), 'invalid json{}}');

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      // Should fall through to default on invalid JSON
      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle non-existent config file', async () => {
      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle config with uppercase provider value', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'CLAUDE' }));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('config');
    });
  });

  describe('detectProvider - override option', () => {
    it('should use override=claude immediately', async () => {
      // Even with codex env signals, override wins
      const result = await detectProvider({
        override: 'claude',
        env: { OPENAI_API_KEY: 'sk-test' },
        targetDir: tempDir,
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('override:option');
    });

    it('should use override=codex immediately', async () => {
      // Even with claude markers, override wins
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Claude');

      const result = await detectProvider({
        override: 'codex',
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('codex');
      expect(result.source).toBe('override');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('override:option');
    });
  });

  describe('detectProvider - preferProject option', () => {
    it('should check project markers before env when preferProject=true', async () => {
      // Create codex project marker
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        preferProject: true,
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
      });

      // Project marker should win over env signal
      expect(result.provider).toBe('codex');
      expect(result.source).toBe('project');
    });

    it('should check env before project when preferProject=false', async () => {
      // Create codex project marker
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        preferProject: false,
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
      });

      // Env signal should win over project marker
      expect(result.provider).toBe('claude');
      expect(result.source).toBe('env');
    });

    it('should check project after env when preferProject=false and no env match', async () => {
      // Create codex project marker
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        preferProject: false,
        env: {},
      });

      // No env signals, so project marker is used
      expect(result.provider).toBe('codex');
      expect(result.source).toBe('project');
    });
  });

  describe('detectProvider - default fallback', () => {
    it('should return default when no signals found', async () => {
      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBe('default');
    });

    it('should return default when no options provided and clean env', async () => {
      const result = await detectProvider({ env: {} });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should return default when only targetDir provided but no markers', async () => {
      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });
  });

  describe('priority order', () => {
    it('should prioritize: override > config > preferProject > env > !preferProject > default', async () => {
      // Setup all detection sources
      await mkdir(join(tempDir, '.codex'));
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'claude' }));

      const env = { OPENAI_API_KEY: 'sk-test' };

      // Override wins
      const withOverride = await detectProvider({
        override: 'codex',
        targetDir: tempDir,
        preferProject: true,
        env,
      });
      expect(withOverride.source).toBe('override');

      // Config wins (no override)
      const withConfig = await detectProvider({
        targetDir: tempDir,
        preferProject: true,
        env,
      });
      expect(withConfig.source).toBe('config');
    });

    it('should use env when preferProject=false and no config', async () => {
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        preferProject: false,
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
      });

      expect(result.source).toBe('env');
      expect(result.provider).toBe('claude');
    });

    it('should use project when preferProject=false but no env signals', async () => {
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        preferProject: false,
        env: {},
      });

      expect(result.source).toBe('project');
      expect(result.provider).toBe('codex');
    });
  });

  describe('complex scenarios', () => {
    it('should handle case sensitivity in normalization', async () => {
      const result = await detectProvider({
        override: 'CODEX' as const,
      });

      expect(result.provider).toBe('codex');
    });

    it('should handle whitespace in provider values', async () => {
      const result = await detectProvider({
        env: { OMCUSTOM_PROVIDER: '  claude  ' },
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('override');
    });

    it('should ignore invalid provider names', async () => {
      const result = await detectProvider({
        env: { OMCUSTOM_PROVIDER: 'invalid-provider' },
      });

      // Invalid provider should be skipped, falling to default
      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle both project markers present (ambiguous)', async () => {
      // Both claude and codex markers
      await mkdir(join(tempDir, '.claude'));
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      // When both markers exist, detectFromProject returns null
      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should handle CLAUDE.md and .codex together (ambiguous)', async () => {
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Claude');
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        targetDir: tempDir,
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });
  });

  describe('edge cases with targetDir', () => {
    it('should skip config check when no targetDir provided', async () => {
      // Even though we're in a dir with config, no targetDir means no config check
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ provider: 'codex' }));

      const result = await detectProvider({
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should skip project check when no targetDir provided', async () => {
      await mkdir(join(tempDir, '.codex'));

      const result = await detectProvider({
        env: {},
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });
  });

  describe('return type validation', () => {
    it('should return valid ProviderDetection type', async () => {
      const result: ProviderDetection = await detectProvider();

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reason');

      expect(['claude', 'codex']).toContain(result.provider);
      expect(['override', 'config', 'env', 'project', 'default']).toContain(result.source);
      expect(['high', 'medium', 'low']).toContain(result.confidence);
      expect(typeof result.reason).toBe('string');
    });
  });
});

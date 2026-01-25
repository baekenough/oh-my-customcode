import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type AgentConfig,
  type OmccConfig,
  configExists,
  deleteConfig,
  getAgentConfig,
  getConfigPath,
  getConfigValue,
  getConfiguredAgents,
  getDefaultConfig,
  getDefaultPreferences,
  loadConfig,
  mergeConfig,
  removeAgentConfig,
  saveConfig,
  setAgentConfig,
  setConfigValue,
  updateConfig,
  validateConfig,
} from '../../../src/core/config.js';

describe('config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-config-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getDefaultConfig', () => {
    it('should return config with correct structure', () => {
      const config = getDefaultConfig();

      expect(config.configVersion).toBe(1);
      expect(config.version).toBe('0.0.0');
      expect(config.language).toBe('en');
      expect(config.installedAt).toBe('');
      expect(config.lastUpdated).toBe('');
      expect(config.installedComponents).toEqual([]);
      expect(config.componentVersions).toEqual({});
      expect(config.agents).toEqual({});
      expect(config.preferences).toBeDefined();
      expect(config.sourceRepo).toBe('https://github.com/baekenough/baekgom-agents');
      expect(config.autoUpdate).toBeDefined();
    });
  });

  describe('getDefaultPreferences', () => {
    it('should return default preferences with correct values', () => {
      const prefs = getDefaultPreferences();

      expect(prefs.logLevel).toBe('info');
      expect(prefs.colors).toBe(true);
      expect(prefs.showProgress).toBe(true);
      expect(prefs.confirmPrompts).toBe(true);
      expect(prefs.autoBackup).toBe(true);
    });
  });

  describe('getConfigPath', () => {
    it('should return correct config path for given directory', () => {
      const path = getConfigPath('/some/project/dir');
      expect(path).toBe('/some/project/dir/.omccrc.json');
    });

    it('should handle paths with trailing slash', () => {
      const path = getConfigPath(tempDir);
      expect(path).toBe(join(tempDir, '.omccrc.json'));
    });
  });

  describe('loadConfig', () => {
    it('should return default config when config file does not exist', async () => {
      const config = await loadConfig(tempDir);

      expect(config.configVersion).toBe(1);
      expect(config.version).toBe('0.0.0');
      expect(config.language).toBe('en');
    });

    it('should load config from existing file', async () => {
      // Create a config file
      const customConfig: Partial<OmccConfig> = {
        configVersion: 1,
        version: '1.2.3',
        language: 'ko',
        installedAt: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
        installedComponents: ['agent1', 'agent2'],
      };
      await writeFile(join(tempDir, '.omccrc.json'), JSON.stringify(customConfig));

      const config = await loadConfig(tempDir);

      expect(config.version).toBe('1.2.3');
      expect(config.language).toBe('ko');
      expect(config.installedComponents).toEqual(['agent1', 'agent2']);
    });

    it('should merge with default config for missing fields', async () => {
      // Create a partial config file
      const partialConfig = {
        configVersion: 1,
        version: '1.0.0',
        language: 'ko',
      };
      await writeFile(join(tempDir, '.omccrc.json'), JSON.stringify(partialConfig));

      const config = await loadConfig(tempDir);

      // Check merged values
      expect(config.version).toBe('1.0.0');
      expect(config.language).toBe('ko');
      // Check default values for missing fields
      expect(config.preferences).toBeDefined();
      expect(config.preferences?.logLevel).toBe('info');
      expect(config.autoUpdate).toBeDefined();
    });

    it('should handle invalid JSON gracefully', async () => {
      // Create an invalid JSON file
      await writeFile(join(tempDir, '.omccrc.json'), 'invalid json content');

      const config = await loadConfig(tempDir);

      // Should return default config
      expect(config.configVersion).toBe(1);
      expect(config.version).toBe('0.0.0');
    });

    it('should migrate config from older version', async () => {
      // Create a config with version 0
      const oldConfig = {
        configVersion: 0,
        version: '0.5.0',
        language: 'en',
        installedAt: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
        installedComponents: [],
      };
      await writeFile(join(tempDir, '.omccrc.json'), JSON.stringify(oldConfig));

      const config = await loadConfig(tempDir);

      // Should be migrated to version 1
      expect(config.configVersion).toBe(1);
      expect(config.preferences).toBeDefined();
      expect(config.autoUpdate).toBeDefined();
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const config = getDefaultConfig();
      config.version = '2.0.0';
      config.language = 'ko';

      await saveConfig(tempDir, config);

      const savedContent = await readFile(join(tempDir, '.omccrc.json'), 'utf-8');
      const savedConfig = JSON.parse(savedContent);

      expect(savedConfig.version).toBe('2.0.0');
      expect(savedConfig.language).toBe('ko');
    });

    it('should update lastUpdated timestamp', async () => {
      const config = getDefaultConfig();
      const beforeSave = new Date();

      await saveConfig(tempDir, config);

      const savedContent = await readFile(join(tempDir, '.omccrc.json'), 'utf-8');
      const savedConfig = JSON.parse(savedContent);
      const lastUpdated = new Date(savedConfig.lastUpdated);

      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'path');
      const config = getDefaultConfig();

      await saveConfig(nestedDir, config);

      const savedContent = await readFile(join(nestedDir, '.omccrc.json'), 'utf-8');
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig.configVersion).toBe(1);
    });
  });

  describe('mergeConfig', () => {
    it('should merge overrides into defaults', () => {
      const defaults = getDefaultConfig();
      const overrides: Partial<OmccConfig> = {
        version: '3.0.0',
        language: 'ko',
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.version).toBe('3.0.0');
      expect(merged.language).toBe('ko');
      expect(merged.configVersion).toBe(1); // From defaults
    });

    it('should deeply merge preferences', () => {
      const defaults = getDefaultConfig();
      const overrides: Partial<OmccConfig> = {
        preferences: {
          logLevel: 'debug',
          colors: false,
          showProgress: true,
          confirmPrompts: true,
          autoBackup: true,
        },
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.preferences?.logLevel).toBe('debug');
      expect(merged.preferences?.colors).toBe(false);
    });

    it('should deeply merge autoUpdate', () => {
      const defaults = getDefaultConfig();
      const overrides: Partial<OmccConfig> = {
        autoUpdate: {
          enabled: true,
          checkIntervalHours: 12,
          autoApplyMinor: true,
        },
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.autoUpdate?.enabled).toBe(true);
      expect(merged.autoUpdate?.checkIntervalHours).toBe(12);
      expect(merged.autoUpdate?.autoApplyMinor).toBe(true);
    });

    it('should merge componentVersions', () => {
      const defaults = getDefaultConfig();
      defaults.componentVersions = { agent1: '1.0.0' };

      const overrides: Partial<OmccConfig> = {
        componentVersions: { agent2: '2.0.0' },
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.componentVersions).toEqual({
        agent1: '1.0.0',
        agent2: '2.0.0',
      });
    });

    it('should merge agents', () => {
      const defaults = getDefaultConfig();
      defaults.agents = {
        agent1: {
          version: '1.0.0',
          source: 'local',
          lastUpdated: '2025-01-01T00:00:00Z',
          hasLocalModifications: false,
          enabled: true,
        },
      };

      const overrides: Partial<OmccConfig> = {
        agents: {
          agent2: {
            version: '2.0.0',
            source: 'local',
            lastUpdated: '2025-01-01T00:00:00Z',
            hasLocalModifications: false,
            enabled: true,
          },
        },
      };

      const merged = mergeConfig(defaults, overrides);

      expect(merged.agents).toHaveProperty('agent1');
      expect(merged.agents).toHaveProperty('agent2');
    });
  });

  describe('updateConfig', () => {
    it('should update specific config values', async () => {
      // First save a config
      const initialConfig = getDefaultConfig();
      await saveConfig(tempDir, initialConfig);

      // Update it
      const updated = await updateConfig(tempDir, { version: '5.0.0' });

      expect(updated.version).toBe('5.0.0');

      // Verify file was updated
      const savedContent = await readFile(join(tempDir, '.omccrc.json'), 'utf-8');
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig.version).toBe('5.0.0');
    });
  });

  describe('getConfigValue', () => {
    it('should return specific config value', async () => {
      const config = getDefaultConfig();
      config.version = '1.5.0';
      await saveConfig(tempDir, config);

      const version = await getConfigValue(tempDir, 'version');

      expect(version).toBe('1.5.0');
    });
  });

  describe('setConfigValue', () => {
    it('should set specific config value', async () => {
      const config = getDefaultConfig();
      await saveConfig(tempDir, config);

      await setConfigValue(tempDir, 'language', 'ko');

      const savedContent = await readFile(join(tempDir, '.omccrc.json'), 'utf-8');
      const savedConfig = JSON.parse(savedContent);
      expect(savedConfig.language).toBe('ko');
    });
  });

  describe('configExists', () => {
    it('should return true when config exists', async () => {
      const config = getDefaultConfig();
      await saveConfig(tempDir, config);

      const exists = await configExists(tempDir);

      expect(exists).toBe(true);
    });

    it('should return false when config does not exist', async () => {
      const exists = await configExists(tempDir);

      expect(exists).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    it('should delete config file', async () => {
      const config = getDefaultConfig();
      await saveConfig(tempDir, config);

      await deleteConfig(tempDir);

      const exists = await configExists(tempDir);
      expect(exists).toBe(false);
    });

    it('should not error when config does not exist', async () => {
      // Should not throw
      await deleteConfig(tempDir);

      const exists = await configExists(tempDir);
      expect(exists).toBe(false);
    });
  });

  describe('agent config management', () => {
    const testAgent: AgentConfig = {
      version: '1.0.0',
      source: 'local',
      lastUpdated: '2025-01-01T00:00:00Z',
      hasLocalModifications: false,
      enabled: true,
    };

    beforeEach(async () => {
      const config = getDefaultConfig();
      await saveConfig(tempDir, config);
    });

    describe('getAgentConfig', () => {
      it('should return agent config when exists', async () => {
        await setAgentConfig(tempDir, 'test-agent', testAgent);

        const agentConfig = await getAgentConfig(tempDir, 'test-agent');

        expect(agentConfig).toBeDefined();
        expect(agentConfig?.version).toBe('1.0.0');
        expect(agentConfig?.enabled).toBe(true);
      });

      it('should return undefined when agent does not exist', async () => {
        const agentConfig = await getAgentConfig(tempDir, 'nonexistent-agent');

        expect(agentConfig).toBeUndefined();
      });
    });

    describe('setAgentConfig', () => {
      it('should set agent config', async () => {
        await setAgentConfig(tempDir, 'new-agent', testAgent);

        const agentConfig = await getAgentConfig(tempDir, 'new-agent');
        expect(agentConfig).toEqual(testAgent);
      });

      it('should update existing agent config', async () => {
        await setAgentConfig(tempDir, 'test-agent', testAgent);

        const updatedAgent: AgentConfig = {
          ...testAgent,
          version: '2.0.0',
          hasLocalModifications: true,
        };
        await setAgentConfig(tempDir, 'test-agent', updatedAgent);

        const agentConfig = await getAgentConfig(tempDir, 'test-agent');
        expect(agentConfig?.version).toBe('2.0.0');
        expect(agentConfig?.hasLocalModifications).toBe(true);
      });
    });

    describe('removeAgentConfig', () => {
      it('should remove agent config', async () => {
        await setAgentConfig(tempDir, 'test-agent', testAgent);
        await removeAgentConfig(tempDir, 'test-agent');

        const agentConfig = await getAgentConfig(tempDir, 'test-agent');
        expect(agentConfig).toBeUndefined();
      });

      it('should not error when agent does not exist', async () => {
        // Should not throw
        await removeAgentConfig(tempDir, 'nonexistent-agent');
      });
    });

    describe('getConfiguredAgents', () => {
      it('should return all configured agents', async () => {
        await setAgentConfig(tempDir, 'agent1', testAgent);
        await setAgentConfig(tempDir, 'agent2', { ...testAgent, version: '2.0.0' });

        const agents = await getConfiguredAgents(tempDir);

        expect(Object.keys(agents)).toHaveLength(2);
        expect(agents.agent1).toBeDefined();
        expect(agents.agent2).toBeDefined();
      });

      it('should return empty object when no agents configured', async () => {
        const agents = await getConfiguredAgents(tempDir);

        expect(agents).toEqual({});
      });
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid config', () => {
      const validConfig: OmccConfig = {
        configVersion: 1,
        version: '1.0.0',
        language: 'en',
        installedAt: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
        installedComponents: [],
      };

      expect(validateConfig(validConfig)).toBe(true);
    });

    it('should return true for config with language ko', () => {
      const validConfig: OmccConfig = {
        configVersion: 1,
        version: '1.0.0',
        language: 'ko',
        installedAt: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
        installedComponents: [],
      };

      expect(validateConfig(validConfig)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateConfig(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateConfig('string')).toBe(false);
      expect(validateConfig(123)).toBe(false);
      expect(validateConfig(undefined)).toBe(false);
    });

    it('should return false for missing configVersion', () => {
      const invalidConfig = {
        version: '1.0.0',
        language: 'en',
      };

      expect(validateConfig(invalidConfig)).toBe(false);
    });

    it('should return false for invalid configVersion type', () => {
      const invalidConfig = {
        configVersion: '1',
        version: '1.0.0',
        language: 'en',
      };

      expect(validateConfig(invalidConfig)).toBe(false);
    });

    it('should return false for missing version', () => {
      const invalidConfig = {
        configVersion: 1,
        language: 'en',
      };

      expect(validateConfig(invalidConfig)).toBe(false);
    });

    it('should return false for invalid language', () => {
      const invalidConfig = {
        configVersion: 1,
        version: '1.0.0',
        language: 'fr',
      };

      expect(validateConfig(invalidConfig)).toBe(false);
    });
  });
});

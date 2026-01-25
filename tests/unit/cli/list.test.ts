import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('list command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcc-list-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('listPlugins', () => {
    it('should list all installed plugins', async () => {
      // TODO: Implement test
      // - Setup .claude directory with plugins
      // - Call listPlugins
      // - Verify returns list of plugin names
      expect(true).toBe(true);
    });

    it('should return empty array when no plugins installed', async () => {
      // TODO: Implement test
      // - Setup empty .claude directory
      // - Call listPlugins
      // - Verify returns []
      expect(true).toBe(true);
    });

    it('should include plugin metadata in results', async () => {
      // TODO: Implement test
      // - Setup plugins with index.yaml
      // - Call listPlugins with verbose option
      // - Verify metadata is included
      expect(true).toBe(true);
    });
  });

  describe('listRules', () => {
    it('should list all active rules', async () => {
      // TODO: Implement test
      // - Setup .claude/rules with rule files
      // - Call listRules
      // - Verify returns rule names and priorities
      expect(true).toBe(true);
    });

    it('should categorize rules by priority', async () => {
      // TODO: Implement test
      // - Setup MUST, SHOULD, MAY rules
      // - Call listRules with categorize option
      // - Verify proper categorization
      expect(true).toBe(true);
    });
  });

  describe('listTemplates', () => {
    it('should list available templates from registry', async () => {
      // TODO: Implement test
      // - Mock registry response
      // - Call listTemplates
      // - Verify returns template list
      expect(true).toBe(true);
    });
  });
});

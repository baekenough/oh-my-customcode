/**
 * End-to-end tests for the installer's Agent Teams env step (#1934).
 *
 * Runs install() for real against a temp project. Only the Codex installer is replaced, since it
 * would shell out to package managers; the original module is re-registered in afterAll so the
 * mock does not leak into other test files (#1772).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Capture the real module before any mock.module call (bun's mock.module persists across files).
const realCodexInstaller = { ...(await import('../../../src/core/codex-installer.js')) };

afterAll(() => {
  mock.module('../../../src/core/codex-installer.js', () => realCodexInstaller);
});

const KEY = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

describe('installer Agent Teams env step (#1934)', () => {
  let tempDir: string;
  let settingsPath: string;
  let consoleSpies: Array<ReturnType<typeof spyOn>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-agent-teams-test-'));
    settingsPath = join(tempDir, '.claude', 'settings.json');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {})
    );
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => true,
      installCodex: () => true,
      getCodexVersion: () => '1.0.0',
    }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    mock.restore();
  });

  async function runInstall(options: { agentTeams?: boolean; backup?: boolean } = {}) {
    const { install } = await import('../../../src/core/installer.js');
    return install({ targetDir: tempDir, skipConfirm: true, ...options });
  }

  async function seedSettings(text: string): Promise<void> {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, text, 'utf-8');
  }

  async function readSettings(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(settingsPath, 'utf-8'));
  }

  function agentTeamsWarnings(warnings: string[]): string[] {
    return warnings.filter((w) => w.includes('Agent Teams env not enabled'));
  }

  it('creates .claude/settings.json with the env flag on a fresh install', async () => {
    const result = await runInstall({ agentTeams: true });

    expect(result.success).toBe(true);
    expect(await readSettings()).toEqual({ env: { [KEY]: '1' } });
    expect((await readFile(settingsPath, 'utf-8')).endsWith('\n')).toBe(true);
    expect(agentTeamsWarnings(result.warnings)).toEqual([]);
  });

  it('merges into an existing settings.json, preserving other keys and env entries', async () => {
    await seedSettings(
      JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, env: { FOO: 'bar' } }, null, 2)
    );

    const result = await runInstall({ agentTeams: true });

    expect(result.success).toBe(true);
    expect(await readSettings()).toEqual({
      permissions: { allow: ['Bash(ls:*)'] },
      env: { FOO: 'bar', [KEY]: '1' },
    });
  });

  it.each(['0', '1', 'false'])('keeps an existing explicit value "%s"', async (value) => {
    const original = JSON.stringify({ env: { [KEY]: value } }, null, 2);
    await seedSettings(original);

    const result = await runInstall({ agentTeams: true });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it('leaves invalid JSON byte-identical and adds a warning to the install result', async () => {
    const original = '{ not json';
    await seedSettings(original);

    const result = await runInstall({ agentTeams: true });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
    expect(agentTeamsWarnings(result.warnings)).toHaveLength(1);
    expect(agentTeamsWarnings(result.warnings)[0]).toContain(settingsPath);
  });

  it('leaves a non-object env byte-identical and adds a warning', async () => {
    const original = '{"env":"oops"}';
    await seedSettings(original);

    const result = await runInstall({ agentTeams: true });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
    expect(agentTeamsWarnings(result.warnings)).toHaveLength(1);
  });

  it('writes nothing when agentTeams is not enabled (--no-agent-teams)', async () => {
    const result = await runInstall({ agentTeams: false });

    expect(result.success).toBe(true);
    await expect(stat(settingsPath)).rejects.toThrow();
    expect(agentTeamsWarnings(result.warnings)).toEqual([]);
  });

  it('removes nothing from an existing settings.json when agentTeams is not enabled', async () => {
    const original = JSON.stringify({ env: { [KEY]: '1', FOO: 'bar' } }, null, 2);
    await seedSettings(original);

    const result = await runInstall({ agentTeams: false });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it('does not write the env unless the option is passed (installer-level default is off)', async () => {
    const result = await runInstall();

    expect(result.success).toBe(true);
    await expect(stat(settingsPath)).rejects.toThrow();
  });

  describe('--backup restore ordering', () => {
    it('merges the flag into the restored settings.json (nothing lost, nothing clobbered)', async () => {
      await seedSettings(
        JSON.stringify(
          { permissions: { deny: ['Bash(rm:*)'] }, env: { FOO: 'bar' }, model: 'sonnet' },
          null,
          2
        )
      );

      const result = await runInstall({ agentTeams: true, backup: true });

      expect(result.success).toBe(true);
      expect(result.backedUpPaths).toHaveLength(1);
      expect(await readSettings()).toEqual({
        permissions: { deny: ['Bash(rm:*)'] },
        env: { FOO: 'bar', [KEY]: '1' },
        model: 'sonnet',
      });
      // The pre-install settings.json also lives, unmodified, in the backup directory, which
      // stores .claude as claude/ so it does not load as active configuration (#1943)
      const backupRoot = result.backedUpPaths[0] as string;
      const backedUp = JSON.parse(
        await readFile(join(backupRoot, 'claude', 'settings.json'), 'utf-8')
      );
      expect(existsSync(join(backupRoot, '.claude'))).toBe(false);
      expect(backedUp.env).toEqual({ FOO: 'bar' });
    });

    it('respects an explicit "0" in the restored settings.json', async () => {
      await seedSettings(JSON.stringify({ env: { [KEY]: '0' } }, null, 2));

      const result = await runInstall({ agentTeams: true, backup: true });

      expect(result.success).toBe(true);
      expect((await readSettings()).env).toEqual({ [KEY]: '0' });
    });

    // Fails if the env write runs BEFORE restoreCriticalFiles(): restore deep-merges the
    // preserved file over the freshly written one and the preserved `"env": null` replaces the
    // written env object, so the write is silently lost and no warning is produced. Running
    // AFTER the restore, the helper sees the restored `"env": null`, leaves the file alone and
    // reports it.
    it('reports a restored non-object env instead of silently losing the write', async () => {
      await seedSettings('{"env":null,"keep":true}');

      const result = await runInstall({ agentTeams: true, backup: true });

      expect(result.success).toBe(true);
      expect(await readSettings()).toEqual({ env: null, keep: true });
      expect(agentTeamsWarnings(result.warnings)).toHaveLength(1);
      expect(agentTeamsWarnings(result.warnings)[0]).toContain('"env" is not an object');
    });

    it('creates a fresh settings.json when restoring an invalid one failed', async () => {
      await seedSettings('{ not json');

      const result = await runInstall({ agentTeams: true, backup: true });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('Failed to restore settings.json'))).toBe(true);
      expect(await readSettings()).toEqual({ env: { [KEY]: '1' } });
      // The user's original (invalid) file is still in the backup directory
      const backupRoot = result.backedUpPaths[0] as string;
      expect(await readFile(join(backupRoot, 'claude', 'settings.json'), 'utf-8')).toBe(
        '{ not json'
      );
      expect(existsSync(join(backupRoot, '.claude'))).toBe(false);
      expect((await readdir(tempDir)).some((n) => n.startsWith('.claude-backup-'))).toBe(true);
    });

    it('writes nothing to the restored settings.json when agentTeams is not enabled', async () => {
      const original = JSON.stringify({ model: 'opus' }, null, 2);
      await seedSettings(original);

      const result = await runInstall({ agentTeams: false, backup: true });

      expect(result.success).toBe(true);
      expect(await readFile(settingsPath, 'utf-8')).toBe(original);
    });
  });
});

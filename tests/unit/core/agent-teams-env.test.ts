/**
 * Unit tests for ensureAgentTeamsEnv (#1934): create / merge / keep existing value /
 * leave unusable files byte-identical.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_TEAMS_ENV_KEY,
  AGENT_TEAMS_ENV_VALUE,
  ensureAgentTeamsEnv,
} from '../../../src/core/agent-teams-env.js';

describe('ensureAgentTeamsEnv', () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-agent-teams-env-'));
    settingsPath = join(tempDir, '.claude', 'settings.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function seed(text: string): Promise<void> {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, text, 'utf-8');
  }

  it('exposes the documented key and value', () => {
    expect(AGENT_TEAMS_ENV_KEY).toBe('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS');
    expect(AGENT_TEAMS_ENV_VALUE).toBe('1');
  });

  it('creates the file (and its directory) as pretty JSON with a trailing newline', async () => {
    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result).toEqual({ status: 'created' });
    expect(await readFile(settingsPath, 'utf-8')).toBe(
      '{\n  "env": {\n    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"\n  }\n}\n'
    );
  });

  it('adds env to an existing object and preserves every other key', async () => {
    await seed(
      `${JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, model: 'opus', hooks: {} }, null, 2)}\n`
    );

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('merged');
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({
      permissions: { allow: ['Bash(ls:*)'] },
      model: 'opus',
      hooks: {},
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
    });
  });

  it('adds the key to an existing env object and preserves other env entries', async () => {
    await seed(`${JSON.stringify({ env: { FOO: 'bar', BAZ: '2' }, keep: true }, null, 2)}\n`);

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('merged');
    expect(JSON.parse(await readFile(settingsPath, 'utf-8'))).toEqual({
      env: { FOO: 'bar', BAZ: '2', CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      keep: true,
    });
  });

  it('keeps the file BOM and missing trailing newline of an existing file', async () => {
    await seed(`﻿${JSON.stringify({ a: 1 }, null, 2)}`);

    await ensureAgentTeamsEnv(settingsPath);

    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.startsWith('﻿')).toBe(true);
    expect(raw.endsWith('\n')).toBe(false);
    expect(JSON.parse(raw.slice(1))).toEqual({
      a: 1,
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
    });
  });

  describe('line endings', () => {
    it('keeps CRLF with the env merged (trailing newline kept)', async () => {
      const crlf = `${JSON.stringify({ a: 1, nested: { b: [1, 2] } }, null, 2)}\n`.replace(
        /\n/g,
        '\r\n'
      );
      await seed(crlf);

      const result = await ensureAgentTeamsEnv(settingsPath);

      expect(result.status).toBe('merged');
      const raw = await readFile(settingsPath, 'utf-8');
      expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
      expect(raw.replace(/\r\n/g, '')).not.toContain('\r');
      expect(raw.endsWith('}\r\n')).toBe(true);
      expect(JSON.parse(raw)).toEqual({
        a: 1,
        nested: { b: [1, 2] },
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      });
    });

    it('keeps CRLF together with the BOM and a missing trailing newline', async () => {
      await seed(`﻿${JSON.stringify({ a: 1 }, null, 2).replace(/\n/g, '\r\n')}`);

      await ensureAgentTeamsEnv(settingsPath);

      const raw = await readFile(settingsPath, 'utf-8');
      expect(raw.startsWith('﻿')).toBe(true);
      expect(raw.endsWith('\n')).toBe(false);
      expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
      expect(JSON.parse(raw.slice(1))).toEqual({
        a: 1,
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      });
    });

    it('does not touch escaped newlines inside string values', async () => {
      await seed(`${JSON.stringify({ note: 'a\nb' }, null, 2).replace(/\n/g, '\r\n')}\r\n`);

      await ensureAgentTeamsEnv(settingsPath);

      const raw = await readFile(settingsPath, 'utf-8');
      expect(raw).toContain('"note": "a\\nb"');
      expect(JSON.parse(raw).note).toBe('a\nb');
    });

    it('keeps LF as LF (no carriage return introduced)', async () => {
      await seed(`${JSON.stringify({ a: 1 }, null, 2)}\n`);

      await ensureAgentTeamsEnv(settingsPath);

      const raw = await readFile(settingsPath, 'utf-8');
      expect(raw).not.toContain('\r');
      expect(raw.endsWith('}\n')).toBe(true);
      expect(JSON.parse(raw).env[AGENT_TEAMS_ENV_KEY]).toBe('1');
    });

    it('writes LF for a single-line file without any line ending', async () => {
      await seed('{"a":1}');

      await ensureAgentTeamsEnv(settingsPath);

      const raw = await readFile(settingsPath, 'utf-8');
      expect(raw).not.toContain('\r');
      expect(raw.endsWith('\n')).toBe(false);
    });

    it('treats a file whose first line break is a bare LF as LF', async () => {
      await seed('\n{\n  "a": 1\n}\n');

      await ensureAgentTeamsEnv(settingsPath);

      expect(await readFile(settingsPath, 'utf-8')).not.toContain('\r');
    });
  });

  it.each([
    ['"0"', '0'],
    ['"1"', '1'],
    ['"true"', 'true'],
    ['""', ''],
    ['null', null],
    ['0', 0],
  ])('keeps an existing value %s and does not rewrite the file', async (literal, expected) => {
    // Hand-formatted on purpose: any rewrite would normalise the whitespace
    const original = `{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":${literal},"FOO":"bar"}}`;
    await seed(original);

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result).toEqual({ status: 'unchanged' });
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
    expect(JSON.parse(original).env[AGENT_TEAMS_ENV_KEY]).toBe(expected);
  });

  it('leaves invalid JSON byte-identical and returns a warning', async () => {
    const original = '{ "env": { broken';
    await seed(original);

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('skipped');
    expect(result.warning).toContain(settingsPath);
    expect(result.warning).toContain('left unchanged');
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it.each([
    ['an array', '[1, 2]'],
    ['null', 'null'],
    ['a string', '"text"'],
    ['a number', '42'],
  ])('leaves non-object JSON (%s) byte-identical and returns a warning', async (_label, text) => {
    await seed(text);

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('skipped');
    expect(result.warning).toContain('the JSON root is not an object');
    expect(await readFile(settingsPath, 'utf-8')).toBe(text);
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['a number', '1'],
  ])('leaves a settings file whose env is %s byte-identical and returns a warning', async (_label, envText) => {
    const original = `{"env":${envText},"keep":true}`;
    await seed(original);

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('skipped');
    expect(result.warning).toContain('"env" is not an object');
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it('returns a warning instead of throwing when the path is not a readable file', async () => {
    // A directory at the settings path: existence check passes, reading fails (EISDIR)
    await mkdir(settingsPath, { recursive: true });

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('skipped');
    expect(result.warning).toContain(settingsPath);
  });

  it('returns a warning instead of throwing when the file cannot be created', async () => {
    // `.claude` is a regular file, so neither the directory nor settings.json can be created
    await writeFile(join(tempDir, '.claude'), 'not a directory', 'utf-8');

    const result = await ensureAgentTeamsEnv(settingsPath);

    expect(result.status).toBe('skipped');
    expect(result.warning).toContain('left unchanged');
    expect(await readFile(join(tempDir, '.claude'), 'utf-8')).toBe('not a directory');
  });
});

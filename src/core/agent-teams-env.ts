/**
 * Agent Teams env opt-in for `omcustom init` (#1934).
 *
 * Claude Code only activates Agent Teams when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is in
 * the environment. Claude Code also reads an `env` object from the project `settings.json`, so
 * init records the flag there. This is separate from `.omcustomrc.json` `teamMode`.
 */

import { dirname } from 'node:path';
import {
  ensureDirectory,
  fileExists,
  parseJsonText,
  readTextFile,
  stringifyJson,
  writeTextFile,
} from '../utils/fs.js';

/** Environment variable that enables Claude Code Agent Teams. */
export const AGENT_TEAMS_ENV_KEY = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

/** Value written for {@link AGENT_TEAMS_ENV_KEY}. */
export const AGENT_TEAMS_ENV_VALUE = '1';

export interface AgentTeamsEnvResult {
  /**
   * - `created`: the file did not exist and was written
   * - `merged`: the key was added to an existing file
   * - `unchanged`: the key already exists (any value) — the file was not touched
   * - `skipped`: the file could not be used safely — it was left as it was; see `warning`
   */
  status: 'created' | 'merged' | 'unchanged' | 'skipped';
  /** Human-readable reason, set only when `status` is `skipped`. */
  warning?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether the file's first line ending is CRLF. JSON.stringify output never holds a raw newline
 * inside a string, so converting every `\n` of the serialized text only touches line breaks.
 */
function usesCrlf(raw: string): boolean {
  const firstLf = raw.indexOf('\n');
  return firstLf > 0 && raw[firstLf - 1] === '\r';
}

function skipped(settingsPath: string, reason: string): AgentTeamsEnvResult {
  return {
    status: 'skipped',
    warning: `Agent Teams env not enabled in ${settingsPath}: ${reason}. The file was left unchanged.`,
  };
}

/**
 * Ensure `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` exists in the given settings.json.
 *
 * - Missing file: created as `{ "env": { KEY: "1" } }` (pretty JSON, trailing newline).
 * - Existing object JSON: every other key and env entry is preserved, and the file's BOM /
 *   trailing-newline / CRLF line-ending conventions are kept. An existing KEY with ANY value (e.g. "0") is
 *   respected: the file is not rewritten.
 * - Invalid JSON, non-object JSON, a non-object `env`, or any read/write failure: the file is
 *   left as it was and a warning is returned. This function never throws.
 */
export async function ensureAgentTeamsEnv(settingsPath: string): Promise<AgentTeamsEnvResult> {
  try {
    if (!(await fileExists(settingsPath))) {
      await ensureDirectory(dirname(settingsPath));
      await writeTextFile(
        settingsPath,
        stringifyJson(
          { env: { [AGENT_TEAMS_ENV_KEY]: AGENT_TEAMS_ENV_VALUE } },
          { bom: false, trailingNewline: true }
        )
      );
      return { status: 'created' };
    }

    const raw = await readTextFile(settingsPath);
    const { data, format } = parseJsonText<unknown>(raw);
    if (!isPlainObject(data)) {
      return skipped(settingsPath, 'the JSON root is not an object');
    }

    if (data.env === undefined) {
      data.env = { [AGENT_TEAMS_ENV_KEY]: AGENT_TEAMS_ENV_VALUE };
    } else if (!isPlainObject(data.env)) {
      return skipped(settingsPath, '"env" is not an object');
    } else if (Object.hasOwn(data.env, AGENT_TEAMS_ENV_KEY)) {
      return { status: 'unchanged' };
    } else {
      data.env[AGENT_TEAMS_ENV_KEY] = AGENT_TEAMS_ENV_VALUE;
    }

    const serialized = stringifyJson(data, format);
    await writeTextFile(
      settingsPath,
      usesCrlf(raw) ? serialized.replace(/\n/g, '\r\n') : serialized
    );
    return { status: 'merged' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return skipped(settingsPath, message);
  }
}

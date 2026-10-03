/**
 * Regenerates the `hooks` block of tracked settings files from their hooks.json source
 * (#1767). Claude Code only loads `settings*.json`, never hooks.json (see R021 "hook
 * wiring"), so editing hooks.json without running this leaves the change inert.
 *
 * The conversion itself is the existing {@link mergeHooksIntoSettings}; this module only
 * orchestrates it per file pair, adds a no-write `check` mode, and guards inputs. Logic
 * lives here (not in `scripts/`) because `scripts/` is outside the tsconfig `include`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileExists, readTextFile, writeTextFile } from '../utils/fs.js';
import { mergeHooksIntoSettings } from './hooks-settings.js';

export interface HookSyncTarget {
  /** Settings file to regenerate, relative to the root directory. */
  settings: string;
  /** hooks.json source, relative to the root directory. */
  hooks: string;
}

/** Tracked pairs, always processed. */
export const HOOK_SYNC_TARGETS: readonly HookSyncTarget[] = [
  { settings: '.claude/settings.json', hooks: '.claude/hooks/hooks.json' },
  { settings: 'templates/.claude/settings.json', hooks: 'templates/.claude/hooks/hooks.json' },
];

/** Gitignored local settings; only processed with `local: true` and only if it exists. */
export const LOCAL_HOOK_SYNC_TARGET: HookSyncTarget = {
  settings: '.claude/settings.local.json',
  hooks: '.claude/hooks/hooks.json',
};

export interface SyncHooksOptions {
  /** Project root all target paths are resolved against. */
  rootDir: string;
  /** Compute and report drift without writing anything. */
  check?: boolean;
  /** Also regenerate `.claude/settings.local.json` if (and only if) it exists. */
  local?: boolean;
}

export type HookSyncStatus = 'unchanged' | 'updated' | 'drifted';

export interface HookSyncFileResult {
  file: string;
  /**
   * `unchanged`: already in sync. `updated`: file was written. `drifted`: out of sync and
   * NOT written (check mode, or write blocked by converter warnings).
   */
  status: HookSyncStatus;
}

export interface HookSyncResult {
  files: HookSyncFileResult[];
  /** Files with status `drifted` (convenience for check mode). */
  drifted: string[];
  /** Converter warnings; when non-empty nothing is written. */
  warnings: string[];
}

interface PlannedSync {
  file: string;
  settingsPath: string;
  original: string;
  generated: string;
}

/**
 * Computes the regenerated content of one settings file without touching it: the real
 * `mergeHooksIntoSettings` runs against a scratch copy so check and write modes share a
 * single code path and the target is only written when its bytes actually change.
 */
async function planTarget(
  rootDir: string,
  target: HookSyncTarget,
  warnings: string[]
): Promise<PlannedSync> {
  const hooksPath = join(rootDir, target.hooks);
  const settingsPath = join(rootDir, target.settings);

  if (!(await fileExists(hooksPath))) {
    throw new Error(`hooks source not found: ${target.hooks} (resolved against ${rootDir})`);
  }
  if (!(await fileExists(settingsPath))) {
    throw new Error(
      `settings file not found: ${target.settings} (resolved against ${rootDir}); refusing to create it`
    );
  }

  const original = await readTextFile(settingsPath);
  try {
    JSON.parse(original);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid JSON in ${target.settings}: ${message}`);
  }

  const scratchDir = await mkdtemp(join(tmpdir(), 'omcustom-hooks-sync-'));
  try {
    const scratchPath = join(scratchDir, 'settings.json');
    await writeTextFile(scratchPath, original);
    const merged = await mergeHooksIntoSettings(scratchPath, hooksPath);
    for (const warning of merged.warnings) {
      warnings.push(`${target.settings}: ${warning}`);
    }
    const generated = await readTextFile(scratchPath);
    return { file: target.settings, settingsPath, original, generated };
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

/**
 * Regenerates (or, with `check`, only verifies) the `hooks` block of every target.
 *
 * All inputs are validated and all outputs computed before the first write, so a missing
 * or invalid input never leaves a half-updated tree. Throws an `Error` with an explicit
 * message on a missing hooks.json / settings file or on invalid settings JSON.
 */
export async function syncHooksSettings(options: SyncHooksOptions): Promise<HookSyncResult> {
  const { rootDir, check = false, local = false } = options;
  const targets: HookSyncTarget[] = [...HOOK_SYNC_TARGETS];
  if (local && (await fileExists(join(rootDir, LOCAL_HOOK_SYNC_TARGET.settings)))) {
    targets.push(LOCAL_HOOK_SYNC_TARGET);
  }

  const warnings: string[] = [];
  const plans: PlannedSync[] = [];
  for (const target of targets) {
    plans.push(await planTarget(rootDir, target, warnings));
  }

  const canWrite = !check && warnings.length === 0;
  const files: HookSyncFileResult[] = [];
  for (const plan of plans) {
    if (plan.generated === plan.original) {
      files.push({ file: plan.file, status: 'unchanged' });
    } else if (canWrite) {
      await writeTextFile(plan.settingsPath, plan.generated);
      files.push({ file: plan.file, status: 'updated' });
    } else {
      files.push({ file: plan.file, status: 'drifted' });
    }
  }

  return {
    files,
    drifted: files.filter((f) => f.status === 'drifted').map((f) => f.file),
    warnings,
  };
}

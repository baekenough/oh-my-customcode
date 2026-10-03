/**
 * Regenerates settings.json `hooks` blocks from hooks.json (#1767).
 * Thin wrapper — logic and tests live in src/core/hooks-settings-sync.ts.
 *
 *   bun run scripts/sync-hooks-settings.ts            write
 *   bun run scripts/sync-hooks-settings.ts --check    verify only, exit 1 on drift
 *   bun run scripts/sync-hooks-settings.ts --local    also regenerate settings.local.json (if present)
 */

import { resolve } from 'node:path';
import { syncHooksSettings } from '../src/core/hooks-settings-sync.js';

const KNOWN_FLAGS = new Set(['--check', '--local']);
const args = process.argv.slice(2);
const unknown = args.filter((arg) => !KNOWN_FLAGS.has(arg));
if (unknown.length > 0) {
  console.error(`sync-hooks-settings: unknown argument(s): ${unknown.join(' ')}`);
  process.exit(1);
}

const check = args.includes('--check');
const local = args.includes('--local');
const rootDir = resolve(import.meta.dir, '..');

let result: Awaited<ReturnType<typeof syncHooksSettings>>;
try {
  result = await syncHooksSettings({ rootDir, check, local });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`sync-hooks-settings: ${message}`);
  process.exit(1);
}

for (const warning of result.warnings) {
  console.error(`sync-hooks-settings: warning: ${warning}`);
}
for (const file of result.files) {
  console.log(`sync-hooks-settings: ${file.status.padEnd(9)} ${file.file}`);
}

if (result.warnings.length > 0) {
  console.error('sync-hooks-settings: converter warnings present; nothing was written');
  process.exit(1);
}
if (check && result.drifted.length > 0) {
  console.error(
    `sync-hooks-settings: drift detected in ${result.drifted.join(', ')}; run: bun run sync:hooks`
  );
  process.exit(1);
}

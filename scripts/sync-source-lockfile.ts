import { generateAndWriteLockfileForDir } from '../src/core/lockfile.js';

// Source repo only: the tracked lockfile must be reproducible from a fresh clone, so files
// that git ignores (e.g. the installed `.claude/contexts/`) must not be recorded (#1819).
// The installer and updater call this without the option and stay git-independent.
const result = await generateAndWriteLockfileForDir(process.cwd(), { excludeGitIgnored: true });

if (result.warning) {
  console.error(`sync-source-lockfile: ${result.warning}`);
  process.exit(1);
}

console.log(`sync-source-lockfile: wrote .omcustom.lock.json (${result.fileCount} files)`);

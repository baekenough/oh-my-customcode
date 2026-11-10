import { generateAndWriteLockfileForDir } from '../src/core/lockfile.js';

// Source repo only: the tracked lockfile must be reproducible from a fresh clone, so files
// that git ignores (e.g. the installed `.claude/contexts/`) must not be recorded (#1819).
// It describes the repository's own `.claude/` and `guides/`, not an installation, so it opts
// out of the template-owned filter that installed projects use by default (#1935).
// The installer and updater call this without these options and stay git-independent.
const result = await generateAndWriteLockfileForDir(process.cwd(), {
  excludeGitIgnored: true,
  templateOwned: false,
});

if (result.warning) {
  console.error(`sync-source-lockfile: ${result.warning}`);
  process.exit(1);
}

console.log(`sync-source-lockfile: wrote .omcustom.lock.json (${result.fileCount} files)`);

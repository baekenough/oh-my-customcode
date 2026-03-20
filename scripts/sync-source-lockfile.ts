import { generateAndWriteLockfileForDir } from '../src/core/lockfile.js';

const result = await generateAndWriteLockfileForDir(process.cwd());

if (result.warning) {
  console.error(`sync-source-lockfile: ${result.warning}`);
  process.exit(1);
}

console.log(`sync-source-lockfile: wrote .omcustom.lock.json (${result.fileCount} files)`);

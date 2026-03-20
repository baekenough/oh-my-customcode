import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

export function createDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  try {
    sqlite.run('PRAGMA journal_mode = WAL');
    sqlite.run('PRAGMA foreign_keys = ON');
    sqlite.run('PRAGMA busy_timeout = 5000');
  } catch (err) {
    sqlite.close();
    throw err;
  }
  return drizzle(sqlite, { schema });
}

export type EvalDb = ReturnType<typeof createDb>;

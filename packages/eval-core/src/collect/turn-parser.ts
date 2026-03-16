import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RawTurnRecord } from '../types/session.js';

export function parseTurnFiles(logsDir: string, since?: string): RawTurnRecord[] {
  if (!existsSync(logsDir)) return [];

  const files = readdirSync(logsDir)
    .filter((f) => f.startsWith('turns-') && f.endsWith('.jsonl'))
    .filter((f) => {
      if (!since) return true;
      const dateStr = f.replace('turns-', '').replace('.jsonl', '');
      return dateStr >= since;
    })
    .sort();

  const records: RawTurnRecord[] = [];
  for (const file of files) {
    const content = readFileSync(join(logsDir, file), 'utf-8').trim();
    if (!content) continue;
    for (const line of content.split('\n')) {
      try {
        records.push(JSON.parse(line) as RawTurnRecord);
      } catch {
        // skip malformed lines
      }
    }
  }
  return records;
}

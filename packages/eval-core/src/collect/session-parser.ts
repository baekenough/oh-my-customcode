import { existsSync, readFileSync } from 'node:fs';
import type { RawSessionRecord } from '../types/session.js';

export function parseSessionHistory(filePath: string): RawSessionRecord[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const records: RawSessionRecord[] = [];
  for (const line of content.split('\n')) {
    try {
      records.push(JSON.parse(line) as RawSessionRecord);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

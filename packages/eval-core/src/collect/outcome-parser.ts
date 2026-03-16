import { existsSync, readFileSync } from 'node:fs';
import type { RawOutcomeRecord } from '../types/session.js';

export function parseOutcomeFile(ppid: string): RawOutcomeRecord[] {
  const filePath = `/tmp/.claude-task-outcomes-${ppid}`;
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const records: RawOutcomeRecord[] = [];
  for (const line of content.split('\n')) {
    try {
      records.push(JSON.parse(line) as RawOutcomeRecord);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

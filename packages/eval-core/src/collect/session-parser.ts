import { existsSync, readFileSync } from 'node:fs';
import type { RawSessionRecord } from '../types/session.js';

export function parseSessionHistory(filePath: string): RawSessionRecord[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => JSON.parse(line) as RawSessionRecord);
}

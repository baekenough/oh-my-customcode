import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');
const GUARD = resolve(ROOT, '.claude/hooks/scripts/rule-deletion-guard.sh');

function run(payload: unknown): number {
  const r = Bun.spawnSync(['bash', GUARD], {
    cwd: ROOT,
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    timeout: 10000,
  });
  return r.exitCode ?? -1;
}

describe('rule-deletion-guard stdin field (#1773)', () => {
  it('blocks rule deletion with the real CC payload (tool_name)', () => {
    expect(
      run({ tool_name: 'Bash', tool_input: { command: 'rm .claude/rules/MUST-safety.md' } })
    ).toBe(2);
  });
  it('passes a non-deleting command with the real CC payload', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'ls .claude/rules' } })).toBe(0);
  });
  it('passes a non-Bash tool with the real CC payload', () => {
    expect(
      run({ tool_name: 'Read', tool_input: { command: 'rm .claude/rules/MUST-safety.md' } })
    ).toBe(0);
  });
  it('still blocks with the legacy tool field', () => {
    expect(run({ tool: 'Bash', tool_input: { command: 'rm .claude/rules/MUST-safety.md' } })).toBe(
      2
    );
  });
});

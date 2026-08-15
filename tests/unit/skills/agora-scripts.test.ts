import { describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../.claude/skills/agora/scripts');
const FIXTURES_DIR = resolve(import.meta.dir, '../../fixtures/agora');

const AGORA_SCRIPT = join(SCRIPTS_DIR, 'agora.sh');

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a skill script by spawning bash with the script path and arguments.
 * Same spawn/stdin/collect body as runHookScript in tests/unit/core/hooks-scripts.test.ts;
 * the only addition is the `args` array, because agora scripts dispatch on subcommands.
 */
function runScript(
  scriptPath: string,
  args: string[],
  stdinInput: string,
  env?: Record<string, string>,
  cwd?: string
): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    const child = spawn('bash', [scriptPath, ...args], {
      env: childEnv,
      cwd: cwd ?? tmpdir(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code: number | null) => {
      resolve_({ stdout, stderr, exitCode: code ?? -1 });
    });

    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

/** Run bash syntax check on a script file. */
function bashSyntaxCheck(scriptPath: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((res) => {
    const child = spawn('bash', ['-n', scriptPath]);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('close', (code: number | null) => res({ exitCode: code ?? -1, stderr }));
  });
}

/** Read a state fixture as a raw JSON string for stdin injection. */
async function stateFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, `${name}.json`), 'utf-8');
}

// -------------------------------------------------------------------
// agora.sh --decide-stop  (spec §9)
// -------------------------------------------------------------------

describe('agora.sh --decide-stop', () => {
  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(AGORA_SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  it('returns CONSENSUS when consensus is UNANIMOUS and verdict is BUILD_WITH_CHANGES', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-consensus')
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('CONSENSUS');
  });

  it('returns STALLED when two consecutive rounds add no findings at an unchanged max_severity', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-stalled')
    );
    expect(result.stdout.trim()).toBe('STALLED');
  });

  it('returns MAX_ROUNDS when round equals max_rounds', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-max-rounds')
    );
    expect(result.stdout.trim()).toBe('MAX_ROUNDS');
  });

  it('returns USER when stop is already set to USER by the gate', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-user')
    );
    expect(result.stdout.trim()).toBe('USER');
  });

  it('returns CONTINUE for an ordinary in-progress session', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-continue')
    );
    expect(result.stdout.trim()).toBe('CONTINUE');
  });

  // spec §9: unanimity on REDESIGN is "the draft was discarded", not "we reached a conclusion".
  // The judge's rewritten draft must get another round of scrutiny.
  it('returns CONTINUE for UNANIMOUS + REDESIGN (NOT a consensus stop)', async () => {
    const result = await runScript(
      AGORA_SCRIPT,
      ['--decide-stop'],
      await stateFixture('state-unanimous-redesign')
    );
    expect(result.stdout.trim()).toBe('CONTINUE');
    expect(result.stdout.trim()).not.toBe('CONSENSUS');
  });

  it('returns CONTINUE for UNANIMOUS + ABANDON (NOT a consensus stop)', async () => {
    const state = JSON.parse(await stateFixture('state-unanimous-redesign'));
    state.history[1].verdict = 'ABANDON';
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], JSON.stringify(state));
    expect(result.stdout.trim()).toBe('CONTINUE');
  });

  it('does not report STALLED when max_severity changed between the two quiet rounds', async () => {
    const state = JSON.parse(await stateFixture('state-stalled'));
    state.history[3].max_severity = 'MEDIUM';
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], JSON.stringify(state));
    expect(result.stdout.trim()).toBe('CONTINUE');
  });

  it('does not report STALLED with only one quiet round', async () => {
    const state = JSON.parse(await stateFixture('state-stalled'));
    state.history[2].new_findings = 2;
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], JSON.stringify(state));
    expect(result.stdout.trim()).toBe('CONTINUE');
  });

  it('prefers CONSENSUS over MAX_ROUNDS when both hold', async () => {
    const state = JSON.parse(await stateFixture('state-consensus'));
    state.max_rounds = 3;
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], JSON.stringify(state));
    expect(result.stdout.trim()).toBe('CONSENSUS');
  });

  it('exits 0 and returns CONTINUE on an empty history', async () => {
    const state = { round: 0, max_rounds: 5, mode: 'gated', history: [], stop: null };
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], JSON.stringify(state));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('CONTINUE');
  });

  it('exits non-zero on malformed JSON stdin', async () => {
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], 'not json');
    expect(result.exitCode).not.toBe(0);
  });

  // spec §9: the decision function must be pure — no filesystem, no network.
  it('never touches the filesystem in the decide_stop function body (source guard)', async () => {
    const src = await readFile(AGORA_SCRIPT, 'utf-8');
    const body = src.slice(src.indexOf('decide_stop()'), src.indexOf('# --- end decide_stop ---'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bcurl\b|\bwget\b/);
    expect(body).not.toMatch(/>\s*"\$/);
    expect(body).not.toContain('mkdir');
  });
});

const ANONYMIZE_SCRIPT = join(SCRIPTS_DIR, 'anonymize.sh');

const VENDOR_IDS = ['claude:claude-opus-4-8', 'omx:default', 'agy:gemini-3.1-pro-high'];

// -------------------------------------------------------------------
// anonymize.sh --shuffle  (spec §7, §12-(2), §12-(3))
// -------------------------------------------------------------------

describe('anonymize.sh shuffle', () => {
  it('should pass bash syntax check', async () => {
    const { exitCode } = await bashSyntaxCheck(ANONYMIZE_SCRIPT);
    expect(exitCode).toBe(0);
  });

  it('assigns every vendor exactly one label', async () => {
    const result = await runScript(
      ANONYMIZE_SCRIPT,
      ['--shuffle', 'agora-1-r1', ...VENDOR_IDS],
      ''
    );
    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout.trim());
    expect(Object.keys(map).sort()).toEqual(['A', 'B', 'C']);
    expect(Object.values(map).sort()).toEqual([...VENDOR_IDS].sort());
  });

  // spec §12-(3): the audit-ability claim in §7 only holds if the shuffle is reproducible.
  it('produces an identical map for the same seed (reproducibility)', async () => {
    const a = await runScript(
      ANONYMIZE_SCRIPT,
      ['--shuffle', 'agora-1755230400-r2', ...VENDOR_IDS],
      ''
    );
    const b = await runScript(
      ANONYMIZE_SCRIPT,
      ['--shuffle', 'agora-1755230400-r2', ...VENDOR_IDS],
      ''
    );
    expect(a.stdout.trim()).toBe(b.stdout.trim());
    expect(a.stdout.trim().length).toBeGreaterThan(0);
  });

  it('produces different maps across a range of seeds (not a constant permutation)', async () => {
    const seen = new Set<string>();
    for (let k = 1; k <= 20; k++) {
      const r = await runScript(
        ANONYMIZE_SCRIPT,
        ['--shuffle', `agora-seed-${k}-r1`, ...VENDOR_IDS],
        ''
      );
      seen.add(r.stdout.trim());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  // spec §12-(2): if a vendor skews toward a label, the judge can infer identity from position.
  // NOTE (deviation from brief, documented in task-2-report.md): hash_int shells out to
  // `shasum` per Fisher-Yates swap (2 subprocess pipelines per shuffle), so the sample size
  // was reduced from the brief's 3000 to 600 per controller ruling (2026-08-15) — 600 keeps
  // 2.6σ of detection power (expected 200/cell, ±15% tolerance = 170~230) at 1/5 the runtime.
  // Only the timeout and sample-size parameters below changed; the assertions' shape and the
  // shuffle algorithm are unchanged from the brief.
  it('distributes labels uniformly over 600 shuffles', async () => {
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle-many', '600', ...VENDOR_IDS], '');
    expect(result.exitCode).toBe(0);

    const lines = result.stdout.trim().split('\n');
    expect(lines.length).toBe(600);

    const counts: Record<string, Record<string, number>> = {};
    for (const vendor of VENDOR_IDS) counts[vendor] = { A: 0, B: 0, C: 0 };

    for (const line of lines) {
      const map = JSON.parse(line) as Record<string, string>;
      for (const [label, vendor] of Object.entries(map)) {
        counts[vendor][label] += 1;
      }
    }

    // Expected 200 per cell; ±15% tolerance keeps this deterministic-stable, not flaky.
    for (const vendor of VENDOR_IDS) {
      for (const label of ['A', 'B', 'C']) {
        expect(counts[vendor][label]).toBeGreaterThan(170);
        expect(counts[vendor][label]).toBeLessThan(230);
      }
    }
  }, 20_000);

  // spec §7: a missing vendor drops out of `map`, leaving fewer than 3 entries.
  it('emits a 2-entry map when only two vendors responded', async () => {
    const two = [VENDOR_IDS[0], VENDOR_IDS[2]];
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r3', ...two], '');
    const map = JSON.parse(result.stdout.trim());
    expect(Object.keys(map).sort()).toEqual(['A', 'B']);
    expect(Object.values(map).sort()).toEqual([...two].sort());
  });

  it('emits a 1-entry map when only one vendor responded', async () => {
    const result = await runScript(
      ANONYMIZE_SCRIPT,
      ['--shuffle', 'agora-1-r4', VENDOR_IDS[1]],
      ''
    );
    const map = JSON.parse(result.stdout.trim());
    expect(map).toEqual({ A: VENDOR_IDS[1] });
  });

  it('exits non-zero when no vendors are supplied', async () => {
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r5'], '');
    expect(result.exitCode).not.toBe(0);
  });
});

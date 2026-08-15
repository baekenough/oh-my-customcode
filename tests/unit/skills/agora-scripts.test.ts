import { describe, expect, it } from 'bun:test';
import { exec, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Return the trimmed stdout of `pgrep -f <pattern>`, or '' when pgrep finds
 * no match (pgrep exits 1 on no-match, which `exec` surfaces as a rejection —
 * that rejection IS the "no survivors" success case for F1 regression tests).
 */
async function pgrepMatches(pattern: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`pgrep -f '${pattern}'`);
    return stdout.trim();
  } catch {
    return '';
  }
}

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
  }, 40_000);

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

// F2: parse AGORA_BANNED_PATTERNS directly out of anonymize.sh instead of
// hand-maintaining a second copy of the same regex here. Two independently
// maintained definitions of "what counts as a fingerprint" WILL drift — that
// is exactly what happened before this fix (this constant still had
// opus/sonnet/flash/mapping/raw\/ long after the shell guard had moved on).
// Safe to parse because the shell value is a single-quoted, single-line
// literal with no shell interpolation/escaping inside it — group 1 IS the
// pattern, verbatim, and works unmodified as a JS RegExp source.
function loadBannedFingerprintPattern(scriptPath: string): RegExp {
  const src = readFileSync(scriptPath, 'utf-8');
  const match = src.match(/^AGORA_BANNED_PATTERNS='([^']*)'$/m);
  if (!match) {
    throw new Error(
      `could not find AGORA_BANNED_PATTERNS in ${scriptPath} — this test's sync with the shell guard broke`
    );
  }
  return new RegExp(match[1], 'i');
}

const BANNED_FINGERPRINT = loadBannedFingerprintPattern(ANONYMIZE_SCRIPT);

/**
 * Mirror anonymize.sh's own fingerprint-guard scope (F1/Ruling 10): only
 * reviewer-authored text — current-round `reviewers` and
 * `prior_rounds[].reviewers` — is vendor-derived. topic/agenda/attachments
 * (operator-authored) and prior_rounds[].draft/verdict (judge-authored, spec
 * §8: the judge is the anonymization SUBJECT, not an anonymized party) are
 * excluded, exactly like the shell's `{reviewers, prior: [...| {reviewers}]}`.
 */
function vendorDerivedText(bundle: {
  reviewers: unknown;
  prior_rounds?: Array<{ reviewers: unknown }>;
}): string {
  return JSON.stringify({
    reviewers: bundle.reviewers,
    prior: (bundle.prior_rounds ?? []).map((p) => ({ reviewers: p.reviewers })),
  });
}

/** Create an isolated session dir seeded with a raw fixture tree. */
async function makeSession(rawFixture: string): Promise<string> {
  const dir = join(tmpdir(), `agora-sess-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(dir, 'SEALED'), { recursive: true });
  await cp(join(FIXTURES_DIR, rawFixture), join(dir, 'SEALED', 'raw'), { recursive: true });
  return dir;
}

// -------------------------------------------------------------------
// anonymize.sh --build  (spec §5, §6, §12-(1))
// -------------------------------------------------------------------

describe('anonymize.sh --build', () => {
  it('writes both the sealed mapping and the anonymous bundle', async () => {
    const dir = await makeSession('raw');
    try {
      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1755230400-r1',
          '--topic',
          '세션 메모리를 SQLite로 이전할 것인가',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).toBe(0);

      const mapping = JSON.parse(await readFile(join(dir, 'SEALED/mapping/round-1.json'), 'utf-8'));
      expect(mapping.round).toBe(1);
      expect(mapping.seed).toBe('agora-1755230400-r1');
      expect(Object.keys(mapping.map).sort()).toEqual(['A', 'B', 'C']);

      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.round).toBe(1);
      expect(bundle.topic).toBe('세션 메모리를 SQLite로 이전할 것인가');
      expect(bundle.agenda).toEqual([]);
      expect(bundle.prior_rounds).toEqual([]);
      expect(bundle.reviewers.map((r: { label: string }) => r.label)).toEqual(['A', 'B', 'C']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §12-(1): THE core safety test. A leak here is a trust-boundary collapse.
  it('produces a bundle carrying no vendor fingerprint whatsoever', async () => {
    const dir = await makeSession('raw');
    try {
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(vendorDerivedText(bundle)).not.toMatch(BANNED_FINGERPRINT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11: fingerprint detection is NOT retried — it aborts.
  it('aborts with a fingerprint error instead of writing a leaky bundle', async () => {
    const dir = await makeSession('raw-leaky');
    try {
      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('AGORA_FINGERPRINT_DETECTED');

      // spec §12-(1): a leak must never touch a trust-boundary path, not even
      // transiently. Both SEALED/mapping (who-said-what metadata) and anon/ (the
      // leaky bundle itself) must be entirely absent after an abort — a
      // write-then-delete implementation would leave a window where the leak is
      // a real file on disk, and could leave an orphaned mapping with no bundle.
      expect(existsSync(join(dir, 'anon/round-1.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/mapping/round-1.json'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // I1: a bare "Claude" self-reference with no model name attached is the most
  // common form of a reviewer's first-person self-identification, and must trip
  // the guard exactly like the "Claude Opus" case above.
  it('detects a bare "Claude" self-reference with no model name attached', async () => {
    const dir = await makeSession('raw-leaky-bare-claude');
    try {
      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('AGORA_FINGERPRINT_DETECTED');
      expect(existsSync(join(dir, 'anon/round-1.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/mapping/round-1.json'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // I3 (Ruling 10): the fingerprint guard is scoped to vendor-derived content
  // only (reviewers + prior_rounds). An operator's own topic naming a
  // vendor/model is the discussion subject, not a leak, and must not abort.
  it('does not trip the fingerprint guard on an operator-authored topic naming a vendor', async () => {
    const dir = await makeSession('raw');
    try {
      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          'Should we adopt Gemini 3 Pro?',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('AGORA_FINGERPRINT_DETECTED');

      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.topic).toBe('Should we adopt Gemini 3 Pro?');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // I2: prior-round data that EXISTS but fails to parse is an integrity problem,
  // not an absent round — the build must fail loudly instead of silently
  // dropping the round from prior_rounds[], and must not leave partial output.
  it('fails the build instead of silently dropping a round when prior-round data is corrupt', async () => {
    const dir = await makeSession('raw');
    try {
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), {
        recursive: true,
      });
      // Corrupt round 1's sealed mapping AFTER it was validly written — files
      // present but unreadable, distinct from "no prior round yet" (missing).
      await writeFile(join(dir, 'SEALED/mapping/round-1.json'), 'not json');

      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '2',
          '--seed',
          'agora-1-r2',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).not.toBe(0);
      expect(existsSync(join(dir, 'anon/round-2.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/mapping/round-2.json'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // F1 (Ruling 10 gap): the judge is the anonymization SUBJECT, not an
  // anonymized party (spec §8) — its draft may legitimately quote the
  // operator's own topic. A round-1 topic naming a vendor, echoed into the
  // judge's round-1 draft, must not re-trip the guard when round 2 carries
  // that draft in prior_rounds[0].draft.
  it('does not trip the fingerprint guard when the judge draft quotes the operator topic in prior_rounds', async () => {
    const dir = await makeSession('raw');
    try {
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          'Should we adopt Gemini 3 Pro?',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), {
        recursive: true,
      });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'verdict/round-1.json'),
        JSON.stringify({
          round: 1,
          verdict: 'BUILD_WITH_CHANGES',
          draft: 'Adopting Gemini 3 Pro would require re-validating the shuffle seed strategy.',
        })
      );

      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '2',
          '--seed',
          'agora-1-r2',
          '--topic',
          'Should we adopt Gemini 3 Pro?',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('AGORA_FINGERPRINT_DETECTED');

      const b2 = JSON.parse(await readFile(join(dir, 'anon/round-2.json'), 'utf-8'));
      expect(b2.prior_rounds[0].draft).toContain('Gemini 3 Pro');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // F1 reverse: proves the narrowed scope ({reviewers, prior: [...|
  // {reviewers}]}) did NOT accidentally drop prior-round REVIEWER content
  // from the guard's view along with judge draft/verdict. A vendor
  // fingerprint carried in prior_rounds[0].reviewers[].rationale must still
  // abort round 2 — paired with the no-abort test above so the F1 narrowing
  // is neither too wide (judge text) nor too narrow (reviewer text).
  it('still detects a vendor fingerprint carried in prior_rounds[].reviewers[]', async () => {
    const dir = await makeSession('raw');
    try {
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), {
        recursive: true,
      });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'verdict/round-1.json'),
        JSON.stringify({ round: 1, verdict: 'BUILD_WITH_CHANGES', draft: '## 통합 초안 1' })
      );

      // Simulate a fingerprint entering the already-sealed round-1 bundle
      // after the fact — it must still be caught once it propagates into
      // round 2's prior_rounds[0].reviewers[] via relabel_prior.
      const b1 = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      b1.reviewers[0].rationale = 'As Claude noted earlier, this is correct.';
      await writeFile(join(dir, 'anon/round-1.json'), JSON.stringify(b1));

      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '2',
          '--seed',
          'agora-1-r2',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('AGORA_FINGERPRINT_DETECTED');
      expect(existsSync(join(dir, 'anon/round-2.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/mapping/round-2.json'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Controller Judgment A narrows AGORA_BANNED_PATTERNS to avoid tripping on ordinary
  // review prose ("mapping", "flash", "opus", "sonnet" as bare English words). This is
  // the proof that the narrowed pattern still lets a genuinely benign response through —
  // paired with the two tests above (real leak / no leak at all) so the guard is neither
  // too narrow nor too wide.
  it('does not trip the fingerprint guard on benign review prose using overlapping English words', async () => {
    const dir = await makeSession('raw-benign');
    try {
      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('AGORA_FINGERPRINT_DETECTED');

      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.reviewers.length).toBe(1);
      expect(bundle.reviewers[0].findings[0].claim).toContain('field mapping is ambiguous');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('drops fields outside the spec §5 whitelist during normalization', async () => {
    const dir = await makeSession('raw');
    try {
      const extra = JSON.parse(await readFile(join(dir, 'SEALED/raw/round-1/omx.json'), 'utf-8'));
      extra.debug_trace = 'internal reasoning dump';
      await writeFile(join(dir, 'SEALED/raw/round-1/omx.json'), JSON.stringify(extra));

      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      const text = await readFile(join(dir, 'anon/round-1.json'), 'utf-8');
      expect(text).not.toContain('debug_trace');
      expect(text).not.toContain('internal reasoning dump');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats a schema-violating response as missing and shrinks the map', async () => {
    const dir = await makeSession('raw');
    try {
      // counter is mandatory and must not be empty (spec §5).
      await writeFile(
        join(dir, 'SEALED/raw/round-1/agy.json'),
        JSON.stringify({
          findings: [
            {
              id: 'F9',
              severity: 'HIGH',
              claim: 'x',
              evidence: 'y',
              impact: 'z',
              counter: '',
              verdict: 'MODIFY',
            },
          ],
          overall: 'BUILD',
          rationale: 'no counter supplied',
        })
      );

      const result = await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      expect(result.exitCode).toBe(0);

      const mapping = JSON.parse(await readFile(join(dir, 'SEALED/mapping/round-1.json'), 'utf-8'));
      expect(Object.keys(mapping.map).length).toBe(2);

      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.reviewers.length).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §6: prior-round labels are re-issued under the CURRENT round's mapping, so the
  // judge sees "the same participant changed position", never "A became someone else".
  it('relabels prior rounds so a vendor keeps one label across the bundle', async () => {
    const dir = await makeSession('raw');
    try {
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '1',
          '--seed',
          'agora-1-r1',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), {
        recursive: true,
      });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'verdict/round-1.json'),
        JSON.stringify({ round: 1, verdict: 'BUILD_WITH_CHANGES', draft: '## 통합 초안 1' })
      );

      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '2',
          '--seed',
          'agora-1-r2',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '["F1 근거 제시"]',
        ],
        ''
      );

      const m1 = JSON.parse(await readFile(join(dir, 'SEALED/mapping/round-1.json'), 'utf-8'));
      const m2 = JSON.parse(await readFile(join(dir, 'SEALED/mapping/round-2.json'), 'utf-8'));
      const b1 = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      const b2 = JSON.parse(await readFile(join(dir, 'anon/round-2.json'), 'utf-8'));

      expect(b2.prior_rounds.length).toBe(1);
      expect(b2.prior_rounds[0].round).toBe(1);
      expect(b2.prior_rounds[0].verdict).toBe('BUILD_WITH_CHANGES');

      // Guard the guard: if the two seeds happened to land on the same
      // permutation, every assertion below would be vacuously satisfied even
      // by a relabel_prior that performs no remapping at all.
      expect(m1.map).not.toEqual(m2.map);

      const invert = (m: Record<string, string>) =>
        Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
      const r2ByVendor = invert(m2.map);

      // Track each vendor across rounds via its round-1 rationale (unique per
      // vendor in these fixtures) — a tracer independent of anything
      // relabel_prior itself computed, so it cannot be trivially satisfied.
      const round1LabelByRationale: Record<string, string> = Object.fromEntries(
        b1.reviewers.map((r: { label: string; rationale: string }) => [r.rationale, r.label])
      );

      expect(b2.prior_rounds[0].reviewers.length).toBe(3);
      for (const prior of b2.prior_rounds[0].reviewers) {
        const round1Label = round1LabelByRationale[prior.rationale];
        expect(round1Label).toBeDefined();
        const vendor = m1.map[round1Label];
        // The relabelled prior entry must carry the vendor's CURRENT
        // (round-2) label, never its stale round-1 label.
        expect(prior.label).toBe(r2ByVendor[vendor]);
      }

      // At least one vendor's label differs between round 1 and round 2
      // (guaranteed by the map-inequality assertion above) — confirm
      // relabel_prior actually performed that remap rather than passing
      // round-1 labels through unchanged.
      const changed = b2.prior_rounds[0].reviewers.some(
        (prior: { label: string; rationale: string }) =>
          prior.label !== round1LabelByRationale[prior.rationale]
      );
      expect(changed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('caps prior_rounds at the two most recent rounds', async () => {
    const dir = await makeSession('raw');
    try {
      await mkdir(join(dir, 'verdict'), { recursive: true });
      for (const n of [1, 2, 3]) {
        if (n > 1) {
          await cp(join(dir, 'SEALED/raw/round-1'), join(dir, `SEALED/raw/round-${n}`), {
            recursive: true,
          });
        }
        await writeFile(
          join(dir, `verdict/round-${n}.json`),
          JSON.stringify({ round: n, verdict: 'BUILD_WITH_CHANGES', draft: `## 통합 초안 ${n}` })
        );
        await runScript(
          ANONYMIZE_SCRIPT,
          [
            '--build',
            '--session-dir',
            dir,
            '--round',
            String(n),
            '--seed',
            `agora-1-r${n}`,
            '--topic',
            '상태 저장 방식 재검토',
            '--attachments',
            '[]',
            '--agenda',
            '[]',
          ],
          ''
        );
      }
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-4'), {
        recursive: true,
      });
      await runScript(
        ANONYMIZE_SCRIPT,
        [
          '--build',
          '--session-dir',
          dir,
          '--round',
          '4',
          '--seed',
          'agora-1-r4',
          '--topic',
          '상태 저장 방식 재검토',
          '--attachments',
          '[]',
          '--agenda',
          '[]',
        ],
        ''
      );

      const b4 = JSON.parse(await readFile(join(dir, 'anon/round-4.json'), 'utf-8'));
      expect(b4.prior_rounds.map((p: { round: number }) => p.round)).toEqual([2, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// -------------------------------------------------------------------
// reviewers.sh --run  (spec §3, §11; Ruling 12 — alias-appended flags)
// -------------------------------------------------------------------

const REVIEWERS_SCRIPT = join(SCRIPTS_DIR, 'reviewers.sh');

const VALID_RESPONSE = JSON.stringify({
  findings: [
    {
      id: 'F1',
      severity: 'MEDIUM',
      claim: '스텁 응답',
      evidence: '테스트 픽스처',
      impact: '없음',
      counter: '테스트 전용이므로 실제 영향이 없다',
      verdict: 'KEEP',
    },
  ],
  overall: 'BUILD',
  rationale: '스텁이 만든 정상 응답이다. 계약을 만족한다.',
});

/** Create a stub CLI dir. `behaviour` maps a vendor slug to a bash body. */
async function makeStubBin(behaviour: Record<string, string>): Promise<string> {
  const dir = join(tmpdir(), `agora-bin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(behaviour)) {
    const path = join(dir, name);
    await writeFile(path, `#!/usr/bin/env bash\n${body}\n`);
    await chmod(path, 0o755);
  }
  return dir;
}

const OK_STUB = `printf '%s' '${VALID_RESPONSE}'`;

describe('reviewers.sh --run', () => {
  it('should pass bash syntax check', async () => {
    const { exitCode } = await bashSyntaxCheck(REVIEWERS_SCRIPT);
    expect(exitCode).toBe(0);
  });

  it('writes one raw file per vendor when all three succeed', async () => {
    const bin = await makeStubBin({ claude: OK_STUB, omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, '주제: 상태 저장 방식 재검토');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      expect(result.exitCode).toBe(0);
      for (const slug of ['claude', 'omx', 'agy']) {
        const raw = await readFile(join(dir, `SEALED/raw/round-1/${slug}.json`), 'utf-8');
        expect(JSON.parse(raw).overall).toBe('BUILD');
      }
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11: one retry, then treat as missing.
  it('retries a failing vendor exactly once and succeeds on the second attempt', async () => {
    const flaky = `
      marker="$TMPDIR/agora-flaky-marker"
      if [ -f "$marker" ]; then printf '%s' '${VALID_RESPONSE}'; exit 0; fi
      touch "$marker"; exit 1
    `;
    const bin = await makeStubBin({ claude: flaky, omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-retry-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx'), TMPDIR: dir }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('retry');
      const raw = await readFile(join(dir, 'SEALED/raw/round-1/claude.json'), 'utf-8');
      expect(JSON.parse(raw).overall).toBe('BUILD');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records a vendor as missing (no raw file) after the retry also fails', async () => {
    const bin = await makeStubBin({ claude: 'exit 1', omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-miss-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      // one missing out of three is tolerated
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/omx.json'))).toBe(true);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/agy.json'))).toBe(true);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11: a single opinion is not a consensus process.
  it('aborts the round with exit 3 when two or more vendors are missing', async () => {
    const bin = await makeStubBin({ claude: 'exit 1', omx: 'exit 1', agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-abort-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('2 or more reviewers missing');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('times out a hanging vendor and treats it as missing', async () => {
    const bin = await makeStubBin({ claude: 'sleep 30', omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-timeout-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_TIMEOUT_SECS: '1',
        }
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);
      expect(result.stderr).toContain('timeout');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // R005: macOS has no GNU timeout; the fallback path must exist in source.
  it('checks for gtimeout before using it and has a wait-based fallback (source guard)', async () => {
    const src = await readFile(REVIEWERS_SCRIPT, 'utf-8');
    expect(src).toContain('command -v gtimeout');
    expect(src).toContain('wait "$pid"');
  });

  it('passes the agy json-schema flag with the shipped schema file', async () => {
    const src = await readFile(REVIEWERS_SCRIPT, 'utf-8');
    expect(src).toContain('--json-schema');
    expect(src).toContain('--output-format json');
    expect(existsSync(join(SCRIPTS_DIR, 'response-schema.json'))).toBe(true);
  });

  // R023 mutation guard: a stub that only checks "a file exists" cannot tell
  // apart a correct call shape from a wrong one (e.g. missing --enable-auto-mode).
  // These stubs record the ACTUAL argv each vendor CLI received and assert
  // against it, so a Ruling 12 regression (alias flag silently dropped) fails
  // this test even though "one raw file per vendor" above would still pass.
  it('invokes each vendor CLI with the correct argument shape, including Ruling 12 alias flags', async () => {
    const dir = join(tmpdir(), `agora-rv-args-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'PROMPT_TEXT');
    const argsCaptureStub = (marker: string) =>
      `printf '%s\\n' "$@" > '${join(dir, `args-${marker}.txt`)}'\nprintf '%s' '${VALID_RESPONSE}'`;
    const bin = await makeStubBin({
      claude: argsCaptureStub('claude'),
      omx: argsCaptureStub('omx'),
      agy: argsCaptureStub('agy'),
    });
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      expect(result.exitCode).toBe(0);

      const claudeArgs = (await readFile(join(dir, 'args-claude.txt'), 'utf-8')).trim().split('\n');
      expect(claudeArgs).toContain('-p');
      expect(claudeArgs).toContain('--model');
      expect(claudeArgs).toContain('claude-opus-4-8');
      // Ruling 12: the user's shell `claude` alias appends this flag; aliases
      // do not expand under non-interactive `bash script.sh` execution.
      expect(claudeArgs).toContain('--enable-auto-mode');
      expect(claudeArgs).toContain('PROMPT_TEXT');

      const omxArgs = (await readFile(join(dir, 'args-omx.txt'), 'utf-8')).trim().split('\n');
      // omx is a plain binary, not a shell alias (spec §2) — no extra flag.
      expect(omxArgs).toEqual(['exec', 'PROMPT_TEXT']);

      const agyArgs = (await readFile(join(dir, 'args-agy.txt'), 'utf-8')).trim().split('\n');
      expect(agyArgs).toContain('-p');
      expect(agyArgs).toContain('--model');
      expect(agyArgs).toContain('gemini-3.1-pro-high');
      expect(agyArgs).toContain('--output-format');
      expect(agyArgs).toContain('json');
      expect(agyArgs).toContain('--json-schema');
      // Ruling 12: the user's shell `agy` alias appends this flag; aliases do
      // not expand under non-interactive `bash script.sh` execution.
      expect(agyArgs).toContain('--dangerously-skip-permissions');
      expect(agyArgs.some((a) => a.endsWith('response-schema.json'))).toBe(true);
      expect(agyArgs).toContain('PROMPT_TEXT');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11 precision check: "one retry" must mean exactly two attempts
  // total, not "keep retrying". A stub that only inspects the stderr string
  // 'retry' (as the brief's flaky-vendor test does) cannot distinguish one
  // retry from N retries — this counts actual invocations.
  it('calls a persistently-failing vendor at most twice (one retry, not unbounded)', async () => {
    const dir = join(tmpdir(), `agora-rv-retrycount-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    const countFile = join(dir, 'claude-call-count');
    const countingFail = `
      count=$(cat '${countFile}' 2>/dev/null || echo 0)
      count=$((count + 1))
      printf '%s' "$count" > '${countFile}'
      exit 1
    `;
    const bin = await makeStubBin({ claude: countingFail, omx: OK_STUB, agy: OK_STUB });
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      expect(result.exitCode).toBe(0); // one missing out of three is tolerated
      const count = (await readFile(countFile, 'utf-8')).trim();
      expect(count).toBe('2');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11 precision check: unparsable stdout (exit 0 but not valid JSON)
  // must be treated as a failed attempt and retried, not silently accepted
  // and written to the sealed raw file.
  it('treats unparsable vendor output (exit 0, invalid JSON) as a failed attempt and retries', async () => {
    const dir = join(tmpdir(), `agora-rv-badjson-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    const badThenGood = `
      marker='${join(dir, 'agy-badjson-marker')}'
      if [ -f "$marker" ]; then printf '%s' '${VALID_RESPONSE}'; exit 0; fi
      touch "$marker"; printf 'not json'; exit 0
    `;
    const bin = await makeStubBin({ claude: OK_STUB, omx: OK_STUB, agy: badThenGood });
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('retry');
      const raw = await readFile(join(dir, 'SEALED/raw/round-1/agy.json'), 'utf-8');
      expect(JSON.parse(raw).overall).toBe('BUILD');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // R005/R023: the gtimeout branch runs implicitly whenever gtimeout is on
  // PATH (true on this dev machine — /opt/homebrew/bin/gtimeout). CI
  // (GitHub-hosted macos) may lack coreutils, so the wait-based fallback
  // must also be exercised deterministically, independent of what happens
  // to be installed locally. AGORA_FORCE_TIMEOUT_FALLBACK=1 is a test-only
  // switch (default off, never set in production) that forces the fallback
  // branch even when gtimeout is present.
  it('forced fallback path: times out a hanging vendor via wait+watchdog even when gtimeout is present', async () => {
    const bin = await makeStubBin({ claude: 'sleep 30', omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-timeout-fallback-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_TIMEOUT_SECS: '1',
          AGORA_FORCE_TIMEOUT_FALLBACK: '1',
        }
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);
      expect(result.stderr).toContain('timeout');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // Complement to the forced-fallback test above: proves the switch is truly
  // OFF by default (the normal gtimeout-present path still times out too),
  // so the two tests together demonstrate BOTH branches actually run and
  // neither is a no-op.
  it('default (non-forced) path also times out a hanging vendor when gtimeout is on PATH', async () => {
    const bin = await makeStubBin({ claude: 'sleep 30', omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-timeout-default-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, 'x');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_TIMEOUT_SECS: '1',
        }
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);
      expect(result.stderr).toContain('timeout');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // -----------------------------------------------------------------------
  // F1 (Important, review round 2): the fallback watchdog must kill the
  // WHOLE process group, not just the direct child. `kill -TERM "$pid"`
  // alone orphans grandchildren a wrapped CLI forks (common in Node-wrapped
  // vendor CLIs) — they keep running (and, in production, keep billing API
  // calls) after reviewers.sh has already recorded the vendor as missing.
  //
  // Regression-proofing note: a stub that is a SINGLE command (e.g. plain
  // `sleep 30`) can pass this class of test by accident, because bash may
  // exec-replace the backgrounded shell with that single command, making
  // $pid equal the sleep's own pid with no group to distinguish. This stub
  // deliberately FORKS a background descendant (`sleep <marker> &`) before
  // its own foreground `sleep <marker>`, so a single-pid kill provably
  // leaves the descendant alive while a process-group kill does not.
  // -----------------------------------------------------------------------
  describe('F1: fallback timeout kills the whole process group', () => {
    // A duration used as BOTH the sleep argument and the pgrep search
    // pattern. Six-plus digits keeps collisions with other concurrently
    // running `sleep N` processes (in this suite or elsewhere on the
    // machine) astronomically unlikely without needing a real process-title
    // mechanism (macOS bash has no `exec -a`/setproctitle equivalent here).
    function uniqueMarker(): string {
      return String(100000 + Math.floor(Math.random() * 900000));
    }

    function forkingHangStub(marker: string): string {
      return `sleep ${marker} &\nsleep ${marker}`;
    }

    async function runForkingTimeoutCase(forceFallback: boolean): Promise<void> {
      const marker = uniqueMarker();
      const bin = await makeStubBin({
        claude: forkingHangStub(marker),
        omx: OK_STUB,
        agy: OK_STUB,
      });
      const dir = join(
        tmpdir(),
        `agora-rv-f1-${forceFallback ? 'fallback' : 'gtimeout'}-${Date.now()}`
      );
      await mkdir(dir, { recursive: true });
      const promptFile = join(dir, 'prompt.txt');
      await writeFile(promptFile, 'x');
      try {
        const env: Record<string, string> = {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_TIMEOUT_SECS: '1',
        };
        if (forceFallback) env.AGORA_FORCE_TIMEOUT_FALLBACK = '1';

        const result = await runScript(
          REVIEWERS_SCRIPT,
          ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
          '',
          env
        );
        expect(result.exitCode).toBe(0);
        expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);

        // Grace period for the OS to finish reaping after SIGTERM before we
        // sample survivors — the kill is synchronous but process teardown
        // is not guaranteed instantaneous.
        await new Promise((r) => setTimeout(r, 500));
        const survivors = await pgrepMatches(`sleep ${marker}`);
        expect(survivors).toBe('');
      } finally {
        await execAsync(`pkill -f 'sleep ${marker}' 2>/dev/null || true`).catch(() => {});
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    }

    it('forced fallback path: no descendant survives (process-group kill)', async () => {
      await runForkingTimeoutCase(true);
    }, 30000);

    it('default gtimeout path: no descendant survives either (both paths must agree)', async () => {
      await runForkingTimeoutCase(false);
    }, 30000);
  });

  // -----------------------------------------------------------------------
  // F2 (Important, review round 2): vendor stderr must not be discarded
  // wholesale. On failure, surface the LAST FEW LINES of the vendor's own
  // stderr in reviewers.sh's diagnostic output (so auth/rate-limit/model
  // errors are debuggable); on success, clean the captured log up so
  // chatty vendors (omx's session/hook logs) don't leave noise behind.
  // -----------------------------------------------------------------------
  describe('F2: vendor stderr is captured, not discarded', () => {
    it('surfaces vendor stderr content in the failure diagnosis instead of discarding it', async () => {
      const dir = join(tmpdir(), `agora-rv-f2-surface-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      const promptFile = join(dir, 'prompt.txt');
      await writeFile(promptFile, 'x');
      const failingWithReason = "printf 'AUTH_FAILED: invalid api key\\n' >&2\nexit 1";
      const bin = await makeStubBin({ claude: OK_STUB, omx: failingWithReason, agy: OK_STUB });
      try {
        const result = await runScript(
          REVIEWERS_SCRIPT,
          ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
          '',
          { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
        );
        expect(result.exitCode).toBe(0); // one missing out of three is tolerated
        expect(result.stderr).toContain('AUTH_FAILED: invalid api key');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('captures a persistently-failing vendor stderr log inside SEALED/raw (trust boundary), never under anon/', async () => {
      const dir = join(tmpdir(), `agora-rv-f2-location-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      const promptFile = join(dir, 'prompt.txt');
      await writeFile(promptFile, 'x');
      const bin = await makeStubBin({ claude: 'exit 1', omx: OK_STUB, agy: OK_STUB });
      try {
        const result = await runScript(
          REVIEWERS_SCRIPT,
          ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
          '',
          { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
        );
        expect(result.exitCode).toBe(0);
        const files = await readdir(join(dir, 'SEALED/raw/round-1'));
        expect(
          files.some((f) => f.startsWith('claude.attempt-') && f.endsWith('.stderr.log'))
        ).toBe(true);
        // Never under the anonymization output — that's the trust boundary
        // anonymize.sh's own fingerprint guard protects (spec §12-(1)).
        expect(existsSync(join(dir, 'anon'))).toBe(false);
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('cleans up the per-attempt stderr log once a vendor succeeds (no noise on success)', async () => {
      const dir = join(tmpdir(), `agora-rv-f2-cleanup-${Date.now()}`);
      await mkdir(dir, { recursive: true });
      const promptFile = join(dir, 'prompt.txt');
      await writeFile(promptFile, 'x');
      const bin = await makeStubBin({ claude: OK_STUB, omx: OK_STUB, agy: OK_STUB });
      try {
        const result = await runScript(
          REVIEWERS_SCRIPT,
          ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
          '',
          { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx') }
        );
        expect(result.exitCode).toBe(0);
        const files = await readdir(join(dir, 'SEALED/raw/round-1'));
        expect(files.sort()).toEqual(['agy.json', 'claude.json', 'omx.json']);
        expect(files.some((f) => f.includes('stderr'))).toBe(false);
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

// -------------------------------------------------------------------
// judge.sh --model-for-round / --run  (spec §3, §8, §11; REQ-3 rotation)
// -------------------------------------------------------------------

const JUDGE_SCRIPT = join(SCRIPTS_DIR, 'judge.sh');

const VALID_VERDICT = JSON.stringify({
  round: 1,
  judge: 'rotation-slot-1',
  consensus: 'MAJORITY',
  verdict: 'BUILD_WITH_CHANGES',
  resolved: [{ id: 'F1', resolution: '세션 디렉토리 격리로 충분' }],
  unresolved: [{ id: 'F2', severity: 'HIGH', positions: 'A REJECT / C KEEP / B 미언급' }],
  agenda: ['F2 의 심각도 판정 근거를 각자 제시할 것'],
  draft: '## 통합 초안\n\n본문',
  new_findings: 2,
  notes: '리뷰어 3인 전원 응답',
});

// F1 (review round): syntactically valid JSON that is missing a required
// field (spec §8 lists 10 required fields; `unresolved` is omitted here).
const MISSING_FIELD_VERDICT = JSON.stringify({
  round: 1,
  judge: 'rotation-slot-1',
  consensus: 'MAJORITY',
  verdict: 'BUILD_WITH_CHANGES',
  resolved: [{ id: 'F1', resolution: '세션 디렉토리 격리로 충분' }],
  // unresolved intentionally omitted — this IS the defect under test.
  agenda: ['F2 의 심각도 판정 근거를 각자 제시할 것'],
  draft: '## 통합 초안\n\n본문',
  new_findings: 2,
  notes: '리뷰어 3인 전원 응답',
});

// F1 (review round): syntactically valid, all required fields present, but
// `verdict` carries a value outside verdict-schema.json's enum.
const BAD_ENUM_VERDICT = JSON.stringify({
  round: 1,
  judge: 'rotation-slot-1',
  consensus: 'MAJORITY',
  verdict: 'MERGE',
  resolved: [{ id: 'F1', resolution: '세션 디렉토리 격리로 충분' }],
  unresolved: [{ id: 'F2', severity: 'HIGH', positions: 'A REJECT / C KEEP / B 미언급' }],
  agenda: ['F2 의 심각도 판정 근거를 각자 제시할 것'],
  draft: '## 통합 초안\n\n본문',
  new_findings: 2,
  notes: '리뷰어 3인 전원 응답',
});

describe('judge.sh rotation', () => {
  it('should pass bash syntax check', async () => {
    const { exitCode } = await bashSyntaxCheck(JUDGE_SCRIPT);
    expect(exitCode).toBe(0);
  });

  // spec REQ-3: R1/R2/R3 fixed, R4 onward cycles.
  const expected: Record<number, string> = {
    1: 'claude:claude-opus-5',
    2: 'agy:claude-opus-4-6-thinking',
    3: 'agy:gpt-oss-120b-medium',
    4: 'claude:claude-opus-5',
    5: 'agy:claude-opus-4-6-thinking',
    6: 'agy:gpt-oss-120b-medium',
    7: 'claude:claude-opus-5',
  };

  for (const [round, model] of Object.entries(expected)) {
    it(`selects ${model} for round ${round}`, async () => {
      const result = await runScript(JUDGE_SCRIPT, ['--model-for-round', round], '');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(model);
    });
  }

  it('advances to the next rotation slot when an offset is supplied (judge failover)', async () => {
    const result = await runScript(JUDGE_SCRIPT, ['--model-for-round', '1', '1'], '');
    expect(result.stdout.trim()).toBe('agy:claude-opus-4-6-thinking');
  });

  // spec REQ-3: judges must not overlap the reviewer models at all.
  it('shares no model with the reviewer roster', async () => {
    const reviewerModels = ['claude-opus-4-8', 'gemini-3.1-pro-high'];
    for (const round of [1, 2, 3]) {
      const r = await runScript(JUDGE_SCRIPT, ['--model-for-round', String(round)], '');
      const model = r.stdout.trim().split(':')[1];
      // F3 (review round): guards against this assertion passing vacuously
      // when the script emits nothing at all (model would be `undefined`).
      expect(model).toBeDefined();
      expect(reviewerModels).not.toContain(model);
    }
  });

  // spec §4: the judge process must have no route to the sealed mapping.
  it('never mentions the sealed directory anywhere in its source (source guard)', async () => {
    const src = await readFile(JUDGE_SCRIPT, 'utf-8');
    expect(src).not.toContain('SEALED');
    expect(src).not.toContain('mapping/');
  });
});

describe('judge.sh --run', () => {
  it('writes the verdict produced by the rotation model', async () => {
    const bin = await makeStubBin({ claude: `printf '%s' '${VALID_VERDICT}'`, agy: 'exit 1' });
    const dir = join(tmpdir(), `agora-judge-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      expect(result.exitCode).toBe(0);
      const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
      expect(v.verdict).toBe('BUILD_WITH_CHANGES');
      expect(v.judge).toBe('claude:claude-opus-5');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // spec §11: judge failure falls through to the next rotation model.
  it('falls back to the next rotation model when the primary judge fails', async () => {
    const bin = await makeStubBin({ claude: 'exit 1', agy: `printf '%s' '${VALID_VERDICT}'` });
    const dir = join(tmpdir(), `agora-judge-fb-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      expect(result.exitCode).toBe(0);
      const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
      expect(v.judge).toBe('agy:claude-opus-4-6-thinking');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits 4 when every rotation model fails', async () => {
    const bin = await makeStubBin({ claude: 'exit 1', agy: 'exit 1' });
    const dir = join(tmpdir(), `agora-judge-dead-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      expect(result.exitCode).toBe(4);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('passes only the anon file path to the judge process (argv guard)', async () => {
    const bin = await makeStubBin({
      claude: `printf '%s' "$*" > "$AGORA_ARGV_DUMP"; printf '%s' '${VALID_VERDICT}'`,
      agy: 'exit 1',
    });
    const dir = join(tmpdir(), `agora-judge-argv-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    const dump = join(dir, 'argv.txt');
    try {
      await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_ARGV_DUMP: dump }
      );
      const argv = await readFile(dump, 'utf-8');
      expect(argv).not.toContain('SEALED');
      expect(argv).not.toContain('mapping');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Robustness parity with reviewers.sh's call_vendor (F1, review round 2):
  // a hanging judge process must be killed as a WHOLE PROCESS GROUP, not
  // just its direct PID, and the rotation must still fall through to the
  // next slot afterward. Mirrors reviewers.sh's forkingHangStub regression
  // note: a single-command stub (`sleep 30`) can pass a single-PID kill by
  // accident via bash's exec-replacement, so this stub deliberately forks a
  // background descendant before its own foreground sleep.
  it('kills a hanging judge as a whole process group on timeout and falls through to the next slot', async () => {
    const marker = String(100000 + Math.floor(Math.random() * 900000));
    const bin = await makeStubBin({
      claude: `sleep ${marker} &\nsleep ${marker}`,
      agy: `printf '%s' '${VALID_VERDICT}'`,
    });
    const dir = join(tmpdir(), `agora-judge-timeout-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}`, AGORA_TIMEOUT_SECS: '1' }
      );
      expect(result.exitCode).toBe(0);
      const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
      expect(v.judge).toBe('agy:claude-opus-4-6-thinking');

      // Grace period for the OS to finish reaping after SIGTERM before
      // sampling survivors — mirrors reviewers.sh's F1 test.
      await new Promise((r) => setTimeout(r, 500));
      const survivors = await pgrepMatches(`sleep ${marker}`);
      expect(survivors).toBe('');
    } finally {
      await execAsync(`pkill -f 'sleep ${marker}' 2>/dev/null || true`).catch(() => {});
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // Robustness parity with reviewers.sh's F2 (stderr must not be discarded
  // wholesale): a failed judge's own stderr must be surfaced in judge.sh's
  // own diagnostic output, not silenced with `2>/dev/null`.
  it('surfaces a failed judge stderr content in the diagnosis instead of discarding it', async () => {
    const bin = await makeStubBin({
      claude: "printf 'AUTH_FAILED: invalid api key\\n' >&2\nexit 1",
      agy: `printf '%s' '${VALID_VERDICT}'`,
    });
    const dir = join(tmpdir(), `agora-judge-stderr-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('AUTH_FAILED: invalid api key');
      const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
      expect(v.judge).toBe('agy:claude-opus-4-6-thinking');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // A per-attempt stderr capture file must exist alongside the verdict
  // output on failure (audit trail, spec §11) but must never leak toward
  // any path containing "SEALED"/"mapping" — the sole trust-boundary
  // invariant this script must uphold (spec §4).
  it('captures the failing attempt stderr next to the verdict output, not under any sealed path', async () => {
    const bin = await makeStubBin({
      claude: "printf 'boom\\n' >&2\nexit 1",
      agy: `printf '%s' '${VALID_VERDICT}'`,
    });
    const dir = join(tmpdir(), `agora-judge-stderr-loc-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    try {
      await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          join(dir, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      const verdictFiles = await readdir(join(dir, 'verdict'));
      expect(verdictFiles.some((f) => f.includes('stderr'))).toBe(true);
      for (const f of verdictFiles) {
        expect(f).not.toContain('SEALED');
        expect(f).not.toContain('mapping');
      }
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // F1 (Important, review round): `jq -e .` only proves a response IS json,
  // not that it HAS the right shape (spec §8 required fields / enums). This
  // describe block proves BOTH directions: a schema-violating response is
  // rejected (and falls through to the next rotation slot, and the reason
  // appears in the diagnosis), and a schema-complete response is still
  // accepted (the validator must not reject good output).
  // -----------------------------------------------------------------------
  describe('F1: verdict schema validation (required fields + enums)', () => {
    it('rejects a verdict missing a required field, records the reason, and falls through to the next slot', async () => {
      const bin = await makeStubBin({
        claude: `printf '%s' '${MISSING_FIELD_VERDICT}'`,
        agy: `printf '%s' '${VALID_VERDICT}'`,
      });
      const dir = join(tmpdir(), `agora-judge-f1-missing-${Date.now()}`);
      await mkdir(join(dir, 'anon'), { recursive: true });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'anon/round-1.json'),
        JSON.stringify({ round: 1, topic: 't', reviewers: [] })
      );
      try {
        const result = await runScript(
          JUDGE_SCRIPT,
          [
            '--run',
            '--anon-file',
            join(dir, 'anon/round-1.json'),
            '--out-file',
            join(dir, 'verdict/round-1.json'),
            '--round',
            '1',
          ],
          '',
          { PATH: `${bin}:${process.env.PATH}` }
        );
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('missing required field: unresolved');
        const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
        // Fell through to the next rotation slot (agy), not the rejected claude response.
        expect(v.judge).toBe('agy:claude-opus-4-6-thinking');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('rejects a verdict with an invalid enum value, records the reason, and falls through to the next slot', async () => {
      const bin = await makeStubBin({
        claude: `printf '%s' '${BAD_ENUM_VERDICT}'`,
        agy: `printf '%s' '${VALID_VERDICT}'`,
      });
      const dir = join(tmpdir(), `agora-judge-f1-enum-${Date.now()}`);
      await mkdir(join(dir, 'anon'), { recursive: true });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'anon/round-1.json'),
        JSON.stringify({ round: 1, topic: 't', reviewers: [] })
      );
      try {
        const result = await runScript(
          JUDGE_SCRIPT,
          [
            '--run',
            '--anon-file',
            join(dir, 'anon/round-1.json'),
            '--out-file',
            join(dir, 'verdict/round-1.json'),
            '--round',
            '1',
          ],
          '',
          { PATH: `${bin}:${process.env.PATH}` }
        );
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('invalid verdict: MERGE');
        const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
        expect(v.judge).toBe('agy:claude-opus-4-6-thinking');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });

    // Negative control: proves the two tests above are catching a REAL
    // defect, not a validator that rejects everything. A validator that is
    // too strict (rejects well-formed output) would be just as dangerous as
    // one that validates nothing — this is the "still passes" half of the
    // bidirectional check.
    it('does not reject a schema-complete verdict (negative control for the validator)', async () => {
      const bin = await makeStubBin({
        claude: `printf '%s' '${VALID_VERDICT}'`,
        agy: 'exit 1',
      });
      const dir = join(tmpdir(), `agora-judge-f1-ok-${Date.now()}`);
      await mkdir(join(dir, 'anon'), { recursive: true });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'anon/round-1.json'),
        JSON.stringify({ round: 1, topic: 't', reviewers: [] })
      );
      try {
        const result = await runScript(
          JUDGE_SCRIPT,
          [
            '--run',
            '--anon-file',
            join(dir, 'anon/round-1.json'),
            '--out-file',
            join(dir, 'verdict/round-1.json'),
            '--round',
            '1',
          ],
          '',
          { PATH: `${bin}:${process.env.PATH}` }
        );
        expect(result.exitCode).toBe(0);
        expect(result.stderr).not.toContain('schema violation');
        const v = JSON.parse(await readFile(join(dir, 'verdict/round-1.json'), 'utf-8'));
        expect(v.verdict).toBe('BUILD_WITH_CHANGES');
        // Accepted from the FIRST slot (claude) — proves the validator did
        // not force an unnecessary fallback for well-formed output.
        expect(v.judge).toBe('claude:claude-opus-5');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });

    // F1 definition-unification requirement: required/enum values must be
    // READ from verdict-schema.json, not hardcoded — so an unreadable/absent
    // schema must fail LOUDLY, not silently disable validation. Mirrors
    // Task 4's loadBannedFingerprintPattern rationale (a helper that reads
    // its own source of truth must not paper over that source going
    // missing). The real shipped schema file is moved aside and restored in
    // `finally` so no other test in this file is affected — bun runs `it()`
    // blocks within one file sequentially, so this is safe.
    it('fails explicitly (not silently) when verdict-schema.json cannot be read', async () => {
      const schemaPath = join(SCRIPTS_DIR, 'verdict-schema.json');
      const backupPath = join(SCRIPTS_DIR, 'verdict-schema.json.testbak');
      const bin = await makeStubBin({
        claude: `printf '%s' '${VALID_VERDICT}'`,
        agy: `printf '%s' '${VALID_VERDICT}'`,
      });
      const dir = join(tmpdir(), `agora-judge-f1-noschema-${Date.now()}`);
      await mkdir(join(dir, 'anon'), { recursive: true });
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'anon/round-1.json'),
        JSON.stringify({ round: 1, topic: 't', reviewers: [] })
      );
      await cp(schemaPath, backupPath);
      await rm(schemaPath);
      try {
        const result = await runScript(
          JUDGE_SCRIPT,
          [
            '--run',
            '--anon-file',
            join(dir, 'anon/round-1.json'),
            '--out-file',
            join(dir, 'verdict/round-1.json'),
            '--round',
            '1',
          ],
          '',
          { PATH: `${bin}:${process.env.PATH}` }
        );
        // Distinct from exit 4 (every rotation model failed) — this is a
        // config-load failure that must not even attempt the CLIs, let
        // alone consume a rotation slot.
        expect(result.exitCode).not.toBe(0);
        expect(result.exitCode).not.toBe(4);
        expect(result.stderr).toContain('verdict schema');
        expect(existsSync(join(dir, 'verdict/round-1.json'))).toBe(false);
      } finally {
        await cp(backupPath, schemaPath);
        await rm(backupPath, { force: true });
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

// -------------------------------------------------------------------
// agora.sh --start / --round / --gate / --report  (Task 6: entry point
// and round loop). Spec §4 (artifact layout), §10 (R1 blank-slate,
// gate rendering), §12 (agora-runner delegation unit — "라운드 1개 =
// 위임 1건").
// -------------------------------------------------------------------

describe('agora.sh round loop (E2E with stub CLIs)', () => {
  const judgeVerdict = (round: number, consensus: string, verdict: string) =>
    JSON.stringify({
      round,
      judge: 'slot',
      consensus,
      verdict,
      resolved: [{ id: 'F1', resolution: '해소됨' }],
      unresolved: [{ id: 'F2', severity: 'HIGH', positions: 'A REJECT / C KEEP / B 미언급' }],
      agenda: ['F2 의 심각도 판정 근거를 각자 제시할 것'],
      draft: `## 통합 초안 (라운드 ${round})`,
      new_findings: 2,
      notes: '리뷰어 3인 전원 응답',
    });

  it('runs two gated-off rounds and lays out artifacts exactly as spec §4 prescribes', async () => {
    // The judge stub keys off the round number embedded in the anon bundle it is handed.
    const judgeStub = `
      prompt="\${!#}"
      round=$(printf '%s' "$prompt" | grep -o '"round": *[0-9]*' | head -1 | grep -o '[0-9]*')
      if [ "$round" = "1" ]; then printf '%s' '${judgeVerdict(1, 'SPLIT', 'REDESIGN')}';
      else printf '%s' '${judgeVerdict(2, 'MAJORITY', 'BUILD_WITH_CHANGES')}'; fi
    `;
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) ${judgeStub};; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '2', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(result.exitCode).toBe(0);

      const sessionDir = result.stdout.trim().split('\n').pop() as string;
      expect(sessionDir).toContain('agora-');

      for (const rel of [
        'SEALED/raw/round-1/claude.json',
        'SEALED/raw/round-2/claude.json',
        'SEALED/mapping/round-1.json',
        'SEALED/mapping/round-2.json',
        'anon/round-1.json',
        'anon/round-2.json',
        'verdict/round-1.json',
        'verdict/round-2.json',
        'state.json',
        'report.md',
      ]) {
        expect(existsSync(join(sessionDir, rel))).toBe(true);
      }

      const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
      expect(state.round).toBe(2);
      expect(state.max_rounds).toBe(2);
      expect(state.mode).toBe('auto');
      expect(state.history.length).toBe(2);
      expect(state.stop).toBe('MAX_ROUNDS');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps every anon bundle free of vendor fingerprints across the whole session', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-fp-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      const sessionDir = result.stdout.trim().split('\n').pop() as string;
      const bundle = await readFile(join(sessionDir, 'anon/round-1.json'), 'utf-8');
      expect(bundle).not.toMatch(BANNED_FINGERPRINT);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  // spec §4: report.md is the ONE place where anonymity is lifted.
  it('reveals vendor identities only in report.md', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-rep-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      const sessionDir = result.stdout.trim().split('\n').pop() as string;
      const report = await readFile(join(sessionDir, 'report.md'), 'utf-8');
      expect(report).toContain('claude:claude-opus-4-8');
      expect(report).toContain('omx:default');
      expect(report).toContain('agy:gemini-3.1-pro-high');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  // spec §10: the gate shows labels, never vendors.
  it('renders a gate block that names labels but no vendors', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-gate-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const run = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      const sessionDir = run.stdout.trim().split('\n').pop() as string;
      const gate = await runScript(
        AGORA_SCRIPT,
        ['--gate', '--session-dir', sessionDir, '--round', '1'],
        ''
      );
      expect(gate.exitCode).toBe(0);
      expect(gate.stdout).toContain('Agora Round 1/1');
      expect(gate.stdout).toContain('Consensus: MAJORITY');
      expect(gate.stdout).toMatch(/리뷰어:\s+A /);
      expect(gate.stdout).not.toMatch(BANNED_FINGERPRINT);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  it('aborts the session when reviewers.sh reports two or more missing', async () => {
    const bin = await makeStubBin({ claude: 'exit 1', omx: 'exit 1', agy: OK_STUB });
    const root = join(tmpdir(), `agora-out-abort-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(result.exitCode).toBe(3);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // F1 regression (controller-verified, real stub-CLI run): agora.sh:244's
  // `printf '- 주제: %s\n' ...` had no `--` before its format string, which
  // BSD/bash printf parses as an option ("- : invalid option") because the
  // format string itself starts with a hyphen. The command failed but the
  // script kept going (no `set -e`, exit code stays 0), silently dropping the
  // topic line from report.md. Neither existing E2E test caught this because
  // none asserted the topic line's presence or looked at stderr at all.
  // -----------------------------------------------------------------------

  it('includes the session topic in report.md (F1: printf format-string-as-option regression)', async () => {
    const topic = '상태 저장 방식 재검토';
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-topic-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const run = await runScript(
        AGORA_SCRIPT,
        ['--start', topic, '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(run.exitCode).toBe(0);
      const sessionDir = run.stdout.trim().split('\n').pop() as string;
      const report = await readFile(join(sessionDir, 'report.md'), 'utf-8');
      // The bug dropped the ENTIRE "- 주제: ..." line, not just the value —
      // assert the full line shape, not just the bare topic substring
      // (which alone would also appear in the `## 최종 통합 초안` heading
      // area only incidentally and would not catch a missing label).
      expect(report).toMatch(/^- 주제: 상태 저장 방식 재검토$/m);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps stderr free of unexpected shell errors during a full session run (F1 regression guard)', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-stderr-hygiene-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const run = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(run.exitCode).toBe(0);
      // Narrow shell-error signatures only — normal diagnostics like
      // "[agora] round 1 reviewers: 3 responded" or "[agora] round 1 judged
      // by rotation slot 1 (...)" must NOT trip this (they are expected on
      // every successful run, not error noise).
      expect(run.stderr).not.toMatch(
        /\bprintf:\s|invalid option|command not found|unbound variable/i
      );
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  // ---------------------------------------------------------------------
  // Task 6 supplementary coverage — controller carry-over items from the
  // task brief (round-budget visibility) plus direct coverage of the two
  // entry points (--round, --report) the brief's own Step-1 tests never
  // exercise standalone (they only observe them through --start --auto).
  // ---------------------------------------------------------------------

  // Carry-over #2: judge worst case is ~15min (3 rotation slots x
  // AGORA_TIMEOUT_SECS default 300s each) on top of the reviewer fan-out.
  // The round loop must surface SOME duration signal so the user is not
  // blind to how long a round actually took — this does not implement a
  // full round-level timeout policy (out of this task's scope), only
  // visibility.
  it('surfaces round duration in the gate so the worst-case judge-rotation budget stays visible', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-budget-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const run = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      const sessionDir = run.stdout.trim().split('\n').pop() as string;
      const gate = await runScript(
        AGORA_SCRIPT,
        ['--gate', '--session-dir', sessionDir, '--round', '1'],
        ''
      );
      expect(gate.exitCode).toBe(0);
      expect(gate.stdout).toMatch(/소요.*\d+\s*초/);
      expect(gate.stdout).not.toMatch(BANNED_FINGERPRINT);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  describe('agora.sh --round <N> --session-dir <dir> (agora-runner delegation unit, spec §12)', () => {
    it('runs exactly one round via the documented CLI syntax and advances state.json', async () => {
      const bin = await makeStubBin({
        claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
        omx: OK_STUB,
        agy: OK_STUB,
      });
      const root = join(tmpdir(), `agora-out-round-entry-${Date.now()}`);
      await mkdir(root, { recursive: true });
      const env = {
        PATH: `${bin}:${process.env.PATH}`,
        AGORA_OMX_BIN: join(bin, 'omx'),
        AGORA_OUTPUT_ROOT: root,
        AGORA_SESSION_EPOCH: '1755230400',
      };
      try {
        // gated mode (no --auto): --start runs exactly round 1, then yields —
        // giving us a pristine, on-disk session dir to drive round 2 through
        // the standalone entry point ourselves, exactly as agora-runner would.
        const started = await runScript(
          AGORA_SCRIPT,
          ['--start', '상태 저장 방식 재검토', '--max-rounds', '5'],
          '',
          env
        );
        expect(started.exitCode).toBe(0);
        const sessionDir = started.stdout.trim().split('\n').pop() as string;
        const s1 = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
        expect(s1.round).toBe(1);

        const roundResult = await runScript(
          AGORA_SCRIPT,
          ['--round', '2', '--session-dir', sessionDir],
          '',
          env
        );
        expect(roundResult.exitCode).toBe(0);
        const s2 = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
        expect(s2.round).toBe(2);
        expect(s2.history.length).toBe(2);
        expect(existsSync(join(sessionDir, 'anon/round-2.json'))).toBe(true);
        expect(existsSync(join(sessionDir, 'verdict/round-2.json'))).toBe(true);
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(root, { recursive: true, force: true });
      }
    }, 30000);
  });

  describe('agora.sh --report --session-dir <dir> (standalone report regeneration)', () => {
    it('regenerates report.md from the sealed mapping', async () => {
      const bin = await makeStubBin({
        claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
        omx: OK_STUB,
        agy: OK_STUB,
      });
      const root = join(tmpdir(), `agora-out-report-entry-${Date.now()}`);
      await mkdir(root, { recursive: true });
      const env = {
        PATH: `${bin}:${process.env.PATH}`,
        AGORA_OMX_BIN: join(bin, 'omx'),
        AGORA_OUTPUT_ROOT: root,
        AGORA_SESSION_EPOCH: '1755230400',
      };
      try {
        const started = await runScript(
          AGORA_SCRIPT,
          ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
          '',
          env
        );
        const sessionDir = started.stdout.trim().split('\n').pop() as string;
        await rm(join(sessionDir, 'report.md'));
        expect(existsSync(join(sessionDir, 'report.md'))).toBe(false);

        const result = await runScript(AGORA_SCRIPT, ['--report', '--session-dir', sessionDir], '');
        expect(result.exitCode).toBe(0);
        const report = await readFile(join(sessionDir, 'report.md'), 'utf-8');
        expect(report).toContain('claude:claude-opus-4-8');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(root, { recursive: true, force: true });
      }
    }, 30000);
  });
});

// ---------------------------------------------------------------------
// Carry-over #1: judge.sh's exit 68 is a CONFIGURATION error (verdict
// schema unreadable), not a vendor/CLI failure — the round loop must
// consume it as an immediate hard stop, never as a target for a
// round-level retry (retrying would fail three times for the same
// reason and burn wall-clock for nothing).
// ---------------------------------------------------------------------

async function findSessionDir(root: string): Promise<string> {
  const days = await readdir(root);
  for (const day of days) {
    const dayDir = join(root, day);
    const entries = await readdir(dayDir);
    const match = entries.find((e) => e.startsWith('agora-'));
    if (match) return join(dayDir, match);
  }
  throw new Error(`no agora session dir found under ${root}`);
}

describe('agora.sh --round consumes judge.sh exit 68 as a hard config-error stop (no retry)', () => {
  it('propagates exit 68 immediately without retrying the round or advancing state.json', async () => {
    const schemaPath = join(SCRIPTS_DIR, 'verdict-schema.json');
    const backupPath = join(SCRIPTS_DIR, 'verdict-schema.json.testbak-round68');
    const root = join(tmpdir(), `agora-out-e68-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const claudeCountFile = join(root, 'claude-call-count');
    // Only the reviewer-shaped call (--model claude-opus-4-8) is ever expected
    // to fire; judge.sh's schema check aborts BEFORE it invokes any CLI, so a
    // second hit here would mean the round loop retried the whole round.
    const countingClaude = `
      case "$*" in
        *claude-opus-4-8*)
          count=$(cat '${claudeCountFile}' 2>/dev/null || echo 0)
          count=$((count + 1))
          printf '%s' "$count" > '${claudeCountFile}'
          printf '%s' '${VALID_RESPONSE}'
          ;;
        *) exit 1 ;;
      esac
    `;
    const bin = await makeStubBin({ claude: countingClaude, omx: OK_STUB, agy: OK_STUB });
    await cp(schemaPath, backupPath);
    await rm(schemaPath);
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(result.exitCode).toBe(68);
      expect(result.stderr).toContain('verdict schema');

      const count = (await readFile(claudeCountFile, 'utf-8')).trim();
      expect(count).toBe('1');

      const sessionDir = await findSessionDir(root);
      const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
      expect(state.round).toBe(0);
      expect(state.history.length).toBe(0);
      expect(existsSync(join(sessionDir, 'verdict/round-1.json'))).toBe(false);
    } finally {
      await cp(backupPath, schemaPath);
      await rm(backupPath, { force: true });
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// Carry-over #3: judge.sh claims "no route back to who said what" — an
// argument-passing guard already exists (see "passes only the anon file
// path to the judge process (argv guard)" above), but that guard is
// worthless if the round loop exports a sealed-path environment variable
// that a child bash process (judge.sh) silently inherits. agora.sh must
// never `export` anything — every path it needs is threaded through
// explicit CLI flags to reviewers.sh / anonymize.sh / judge.sh instead.
// ---------------------------------------------------------------------

describe('agora.sh env hygiene (carry-over: judge.sh must never see a sealed-path env var)', () => {
  it('never exports an environment variable anywhere in its source (source guard)', async () => {
    const src = await readFile(AGORA_SCRIPT, 'utf-8');
    expect(src).not.toMatch(/^\s*export\s/m);
  });
});

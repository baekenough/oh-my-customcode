import { describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

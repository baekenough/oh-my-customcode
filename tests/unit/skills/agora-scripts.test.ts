import { describe, expect, it } from 'bun:test';
import { exec, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
 * anonymize.sh's fingerprint-guard SCOPE, extracted the same way
 * loadBannedFingerprintPattern extracts the pattern: read the shell's own jq
 * program out of its source instead of restating it here.
 *
 * A hand-written mirror of this scope is what the note above F2 warned about,
 * and it drifted exactly as predicted: the previous copy still described the
 * scope as `{reviewers, prior: [...| {reviewers}]}` long after the shell had
 * (a) pulled judge-authored `prior_rounds[].draft` / `.verdict` INTO scope and
 * (b) added the Ruling-10 operator-vocabulary scrub in front of the scan. The
 * mirror therefore called a bundle clean that the shell would have aborted on.
 *
 * Extraction is safe for the same reason F2's is: the jq program is a single
 * shell-single-quoted literal with no interpolation and no `'` inside it, so
 * group 1 IS the program, verbatim, and runs unmodified under `jq`.
 */
function loadVendorDerivedFilter(scriptPath: string): string {
  const src = readFileSync(scriptPath, 'utf-8');
  const match = src.match(
    /jq -c --arg t "\$topic" --argjson ag "\$agenda" --argjson att "\$attachments" '([^']*)'/
  );
  if (!match) {
    throw new Error(
      `could not find the vendor-derived jq filter in ${scriptPath} — this test's sync with the shell guard broke`
    );
  }
  return match[1];
}

const VENDOR_DERIVED_FILTER = loadVendorDerivedFilter(ANONYMIZE_SCRIPT);

/** Run `jq` with the given argv, feeding `stdinInput` on stdin. */
function runJq(args: string[], stdinInput: string): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const child = spawn('jq', args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('close', (code: number | null) => resolve_({ stdout, stderr, exitCode: code ?? -1 }));
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

/**
 * Reduce a bundle to exactly the text anonymize.sh scans — by RUNNING the
 * shell's own filter, not by re-describing it. The operator vocabulary the
 * filter scrubs out is taken from the bundle's own topic/agenda/attachments,
 * which is precisely what build_bundle passes through --topic/--agenda/
 * --attachments when it writes that bundle.
 */
async function vendorDerivedText(bundle: {
  topic?: unknown;
  agenda?: unknown;
  attachments?: unknown;
  reviewers: unknown;
  prior_rounds?: unknown;
}): Promise<string> {
  const result = await runJq(
    [
      '-c',
      '--arg',
      't',
      String(bundle.topic ?? ''),
      '--argjson',
      'ag',
      JSON.stringify(bundle.agenda ?? []),
      '--argjson',
      'att',
      JSON.stringify(bundle.attachments ?? []),
      VENDOR_DERIVED_FILTER,
    ],
    JSON.stringify(bundle)
  );
  if (result.exitCode !== 0) {
    throw new Error(`vendor-derived filter failed (rc=${result.exitCode}): ${result.stderr}`);
  }
  return result.stdout.trim();
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
      expect(await vendorDerivedText(bundle)).not.toMatch(BANNED_FINGERPRINT);
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
      // Two reviewers because spec §11's floor rejects a one-reviewer round
      // before the fingerprint guard is ever reached; the SECOND response is
      // deliberately plain prose carrying none of the overlapping words, so
      // this test still isolates the first one's benign-but-overlapping text.
      expect(bundle.reviewers.length).toBe(2);
      // Located by content, never by position: labels are shuffled (spec §6),
      // so indexing would assert on the shuffle rather than on the guard.
      const benign = bundle.reviewers.find((r: { findings: Array<{ claim: string }> }) =>
        r.findings.some((f) => f.claim.includes('field mapping is ambiguous'))
      );
      expect(benign).toBeDefined();
      // The actual point of the narrowed pattern: every one of these ordinary
      // English collocations overlaps a model-family name and must survive
      // into the bundle instead of aborting the build.
      const benignText = JSON.stringify(benign);
      expect(benignText).toContain('flash memory');
      expect(benignText).toContain('magnum opus');
      expect(benignText).toContain('sonnet-length');
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

/**
 * Create a disposable sandbox whose session output root and test observation
 * channel are SIBLINGS, never nested one inside the other.
 *
 * Call-count files, throwaway schemas and stub call logs are how the test
 * WATCHES a run; they are not session artifacts. Writing them into the output
 * root mixes two namespaces and leaves plain files sitting among the dated
 * session directories, which any scan of the output tree then has to walk.
 *
 * Remove `base` to clean up both halves.
 */
async function makeOutputSandbox(
  prefix: string
): Promise<{ base: string; root: string; obs: string }> {
  const base = join(tmpdir(), `agora-${prefix}-${Date.now()}`);
  const root = join(base, 'out');
  const obs = join(base, 'obs');
  await mkdir(root, { recursive: true });
  await mkdir(obs, { recursive: true });
  return { base, root, obs };
}

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

    /**
     * Asserts ONLY the process-group property: after the timeout fires, no
     * descendant of the killed vendor is left running.
     *
     * It used to also assert `exitCode === 0` (and the timed-out vendor's raw
     * file being absent), and that pair was the entire source of this case's
     * intermittent failures under load. Measured, 23 runs in pure bash with no
     * test runner attached — idle, CPU-saturated, 8-concurrent, 6-concurrent —
     * survivors was '' in every single run. The property never wavered. What
     * wavered was the round outcome: at AGORA_TIMEOUT_SECS=1 a saturated CPU
     * cannot even get the one-`printf` OK stubs through process startup inside
     * the budget, so two vendors go missing and reviewers.sh correctly returns
     * 3. That is a statement about the test's CPU budget, not about the kill.
     *
     * Raising the timeout here would be treating the wrong end: the round
     * outcome is asserted in its own case below, at a budget generous enough
     * for the stubs, while this case keeps the 1-second budget precisely
     * because it wants the kill to happen fast and has nothing else to say.
     */
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

        await runScript(
          REVIEWERS_SCRIPT,
          ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
          '',
          env
        );

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

    // The round-outcome half of what the two cases above used to assert,
    // separated out and given a CPU budget the OK stubs can actually meet.
    // spec §11: one timed-out vendor is not a failed round — two are.
    it('still reports a successful round when a single vendor times out', async () => {
      const marker = uniqueMarker();
      const bin = await makeStubBin({
        claude: `sleep ${marker}`,
        omx: OK_STUB,
        agy: OK_STUB,
      });
      const dir = join(tmpdir(), `agora-rv-f1-outcome-${Date.now()}`);
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
            // Five seconds, not one: the hanging vendor still blows through
            // any budget, while the two answering stubs get room to start
            // even on a loaded machine. The value is a CPU-headroom knob
            // here, never part of what is being asserted.
            AGORA_TIMEOUT_SECS: '5',
          }
        );
        expect(result.exitCode).toBe(0);
        // The timed-out vendor leaves NO file — callers distinguish
        // "responded" from "missing" by file existence alone.
        expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(false);
        expect(existsSync(join(dir, 'SEALED/raw/round-1/omx.json'))).toBe(true);
        expect(existsSync(join(dir, 'SEALED/raw/round-1/agy.json'))).toBe(true);
      } finally {
        await execAsync(`pkill -f 'sleep ${marker}' 2>/dev/null || true`).catch(() => {});
        await rm(bin, { recursive: true, force: true });
        await rm(dir, { recursive: true, force: true });
      }
    }, 60000);
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
      claude: `printf '%s' "$*" > "$STUB_ARGV_DUMP"; printf '%s' '${VALID_VERDICT}'`,
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
        { PATH: `${bin}:${process.env.PATH}`, STUB_ARGV_DUMP: dump }
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
    // missing).
    //
    // S-1: this used to `cp` the real tracked schema aside, `rm` it, and
    // restore in `finally`. Two problems, both measured: a timeout/cancel/
    // crash between the rm and the finally leaves a TRACKED FILE DELETED in
    // the working tree, and for the duration of the test every other process
    // reading that path fails — which is exactly how a concurrent run of this
    // suite made seven unrelated judge.sh tests fail with ENOENT. Pointing
    // AGORA_VERDICT_SCHEMA at a path that never existed reproduces the same
    // condition without the shipped tree ever being touched.
    it('fails explicitly (not silently) when verdict-schema.json cannot be read', async () => {
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
      const missingSchema = join(dir, 'no-such-verdict-schema.json');
      expect(existsSync(missingSchema)).toBe(false);
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
          { PATH: `${bin}:${process.env.PATH}`, AGORA_VERDICT_SCHEMA: missingSchema }
        );
        // Distinct from exit 4 (every rotation model failed) — this is a
        // config-load failure that must not even attempt the CLIs, let
        // alone consume a rotation slot.
        expect(result.exitCode).not.toBe(0);
        expect(result.exitCode).not.toBe(4);
        expect(result.stderr).toContain('verdict schema');
        expect(existsSync(join(dir, 'verdict/round-1.json'))).toBe(false);
        // The shipped schema was never a participant in this test.
        expect(existsSync(join(SCRIPTS_DIR, 'verdict-schema.json'))).toBe(true);
      } finally {
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
    const { base, root, obs } = await makeOutputSandbox('out-artifacts');
    // Records which branch each judge invocation actually took. Without it the
    // round-1 branch can be dead and every assertion below still passes: the
    // extraction bug this guards against (see the [0-9][0-9]* note) made
    // `round` empty, so the else-branch answered BOTH rounds and
    // judgeVerdict(1, 'SPLIT', 'REDESIGN') was never produced anywhere in the
    // suite — REDESIGN/SPLIT had no execution path through the pipeline at all.
    // It lives in the sandbox's `obs` sibling, not under the output root: it is
    // how the test watches the run, not an artifact the run produced.
    const branchLog = join(obs, 'judge-branch.log');
    // The judge stub keys off the round number embedded in the anon bundle it is handed.
    // `[0-9][0-9]*` (one-or-more), NOT `[0-9]*` (zero-or-more): judge_prompt
    // inlines verdict-schema.json BEFORE the bundle, and the schema's own
    // `"round": { "type": "number" }` line matches a zero-digit pattern, so
    // `head -1` picked the SCHEMA and `round` came out empty every time.
    const judgeStub = `
      prompt="\${!#}"
      round=$(printf '%s' "$prompt" | grep -o '"round": *[0-9][0-9]*' | head -1 | grep -o '[0-9][0-9]*')
      if [ "$round" = "1" ]; then
        printf 'round-1-branch\\n' >> '${branchLog}'
        printf '%s' '${judgeVerdict(1, 'SPLIT', 'REDESIGN')}'
      else
        printf 'else-branch:%s\\n' "$round" >> '${branchLog}'
        printf '%s' '${judgeVerdict(2, 'MAJORITY', 'BUILD_WITH_CHANGES')}'
      fi
    `;
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) ${judgeStub};; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
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

      // Both stub branches ran, in order — round 1 took the round-1 branch and
      // round 2 fell through to the else with a correctly extracted "2".
      const branches = (await readFile(branchLog, 'utf-8')).trim().split('\n');
      expect(branches).toEqual(['round-1-branch', 'else-branch:2']);

      // ...and the round-1 branch's distinct verdict actually reached disk,
      // proving SPLIT/REDESIGN traverses the whole pipeline rather than just
      // being produced by the stub.
      const v1 = JSON.parse(await readFile(join(sessionDir, 'verdict/round-1.json'), 'utf-8'));
      expect(v1.consensus).toBe('SPLIT');
      expect(v1.verdict).toBe('REDESIGN');
      const v2 = JSON.parse(await readFile(join(sessionDir, 'verdict/round-2.json'), 'utf-8'));
      expect(v2.consensus).toBe('MAJORITY');
      expect(v2.verdict).toBe('BUILD_WITH_CHANGES');

      const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
      expect(state.round).toBe(2);
      expect(state.max_rounds).toBe(2);
      expect(state.mode).toBe('auto');
      expect(state.history.length).toBe(2);
      expect(state.history[0].verdict).toBe('REDESIGN');
      expect(state.history[0].consensus).toBe('SPLIT');
      expect(state.stop).toBe('MAX_ROUNDS');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
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
      // every successful run, not error noise). `jq:\s*error` is included
      // because this script's field reads are all error-handling-free `jq`
      // calls — a `jq` error IS the representative silent-failure signature
      // here, exactly as `printf: - : invalid option` was for F1 (see the
      // "F2: R1 blank-slate" describe below for the mutation that proves it).
      expect(run.stderr).not.toMatch(
        /\bprintf:\s|invalid option|command not found|unbound variable|jq:\s*error/i
      );
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // F1 (spec ❌, review round 2): the brief's Produces contract requires
  // stdout's last line to be the session dir's ABSOLUTE path. AGORA_OUTPUT_ROOT
  // defaults to a RELATIVE path (.claude/outputs/sessions); every E2E test
  // above injects an absolute AGORA_OUTPUT_ROOT (a tmpdir), so none of them
  // exercised the default-path branch. agora-runner (Task 8) may invoke
  // --round/--gate/--report from a different cwd than the one --start ran
  // in, so a relative path threaded through would resolve against the wrong
  // directory there.
  // -----------------------------------------------------------------------

  it('emits an absolute session-dir path even when AGORA_OUTPUT_ROOT is left at its default (F1 regression)', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    // A dedicated cwd (NOT AGORA_OUTPUT_ROOT) so the script's default
    // relative path (.claude/outputs/sessions) resolves somewhere isolated
    // and fully cleanable, without needing to inject the very env var this
    // test is proving the script works without.
    const cwd = join(tmpdir(), `agora-defaultroot-cwd-${Date.now()}`);
    await mkdir(cwd, { recursive: true });
    try {
      const result = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_SESSION_EPOCH: '1755230400',
        },
        cwd
      );
      expect(result.exitCode).toBe(0);
      const sessionDir = result.stdout.trim().split('\n').pop() as string;
      expect(sessionDir.startsWith('/')).toBe(true);
      expect(existsSync(join(sessionDir, 'state.json'))).toBe(true);
      expect(existsSync(join(sessionDir, 'report.md'))).toBe(true);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60000);

  // -----------------------------------------------------------------------
  // F2 (Important, review round 2): the R1 blank-slate principle (spec §10 —
  // "R1 is the only genuinely independent review") had zero tests asserting
  // it from the PROMPT side. The reviewer proved this with a mutation: if
  // the `if [ "$round" -gt 1 ]` guard in build_reviewer_prompt is removed,
  // round 1 tries to read the non-existent verdict/round-0.json and `jq`
  // errors to stderr — yet every one of the 95 pre-existing tests stayed
  // green, because none of them read round-1's prompt file, and the old
  // stderr guard's pattern didn't include `jq:\s*error`. This positive/
  // negative pair closes that gap from the prompt-content side; the
  // updated stderr guard above closes it from the error-signature side.
  // -----------------------------------------------------------------------

  it('keeps round 1 a blank slate and injects prior-round context starting round 2 (spec §10 positive/negative pair)', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-r1-blank-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const run = await runScript(
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
      expect(run.exitCode).toBe(0);
      const sessionDir = run.stdout.trim().split('\n').pop() as string;

      const round1Prompt = await readFile(
        join(sessionDir, 'SEALED/raw/round-1.prompt.txt'),
        'utf-8'
      );
      const round2Prompt = await readFile(
        join(sessionDir, 'SEALED/raw/round-2.prompt.txt'),
        'utf-8'
      );

      // Negative: round 1 carries NO prior-round frame of any kind.
      expect(round1Prompt).not.toContain('직전 라운드');

      // Positive: round 2 carries all three prior-round sections.
      expect(round2Prompt).toContain('직전 라운드 의제');
      expect(round2Prompt).toContain('직전 라운드 통합 초안');
      expect(round2Prompt).toContain('직전 라운드 익명 의견 요약');
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

  // -----------------------------------------------------------------------
  // F3 (Important, review round 2): spec §10's gate option `e` requires user
  // agenda to be APPENDED after the judge's own agenda — the judge's REQ-6
  // agenda-setting authority must never be silently overwritten. Before this
  // fix there was no injection point at all for it; --round only ever read
  // agenda from the previous verdict file. This proves append-not-overwrite
  // from BOTH observable surfaces: the reviewer prompt text (what round 2's
  // reviewers actually see) and the anon bundle's .agenda[] (what the judge
  // itself reads next) — the judge's item must appear FIRST in both.
  // -----------------------------------------------------------------------

  describe('agora.sh --round --extra-agenda <json-array> (spec §10 gate "e": append, never overwrite)', () => {
    it('appends the user agenda after the judge agenda without overwriting it', async () => {
      const bin = await makeStubBin({
        claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';; esac`,
        omx: OK_STUB,
        agy: OK_STUB,
      });
      const root = join(tmpdir(), `agora-out-extra-agenda-${Date.now()}`);
      await mkdir(root, { recursive: true });
      const env = {
        PATH: `${bin}:${process.env.PATH}`,
        AGORA_OMX_BIN: join(bin, 'omx'),
        AGORA_OUTPUT_ROOT: root,
        AGORA_SESSION_EPOCH: '1755230400',
      };
      try {
        // gated mode: --start runs round 1. judgeVerdict()'s fixed agenda is
        // ['F2 의 심각도 판정 근거를 각자 제시할 것'] — that becomes verdict/round-1.json's
        // .agenda, the judge-authored agenda round 2 must not lose.
        const started = await runScript(
          AGORA_SCRIPT,
          ['--start', '상태 저장 방식 재검토', '--max-rounds', '5'],
          '',
          env
        );
        expect(started.exitCode).toBe(0);
        const sessionDir = started.stdout.trim().split('\n').pop() as string;

        const roundResult = await runScript(
          AGORA_SCRIPT,
          ['--round', '2', '--session-dir', sessionDir, '--extra-agenda', '["사용자 추가 쟁점"]'],
          '',
          env
        );
        expect(roundResult.exitCode).toBe(0);

        // Surface 1: the reviewer prompt text round 2 actually sends out.
        const round2Prompt = await readFile(
          join(sessionDir, 'SEALED/raw/round-2.prompt.txt'),
          'utf-8'
        );
        const judgeIdxInPrompt = round2Prompt.indexOf('F2 의 심각도 판정 근거를 각자 제시할 것');
        const userIdxInPrompt = round2Prompt.indexOf('사용자 추가 쟁점');
        expect(judgeIdxInPrompt).toBeGreaterThan(-1);
        expect(userIdxInPrompt).toBeGreaterThan(-1);
        expect(judgeIdxInPrompt).toBeLessThan(userIdxInPrompt);

        // Surface 2: the anon bundle's .agenda[] — what the judge itself reads.
        const anon2 = JSON.parse(await readFile(join(sessionDir, 'anon/round-2.json'), 'utf-8'));
        expect(anon2.agenda).toEqual([
          'F2 의 심각도 판정 근거를 각자 제시할 것',
          '사용자 추가 쟁점',
        ]);
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(root, { recursive: true, force: true });
      }
    }, 30000);
  });

  // -----------------------------------------------------------------------
  // I3 (code review): the pre-fix run_round combined --extra-agenda into
  // `agenda` via `jq -c --argjson extra "$extra_agenda" '. + $extra'` with NO
  // validation. The gate's `e` option is free text the orchestrator wraps
  // into a JSON array — one stray quote breaks it. When jq failed, `agenda`
  // silently collapsed to an empty string; build_reviewer_prompt then
  // rendered a blank agenda section, ALL THREE reviewer CLIs were still
  // invoked (and billed), and only anonymize.sh's later `--agenda ''`
  // failure surfaced the problem — after the cost was already paid.
  // run_round must reject a malformed --extra-agenda with exit 64 BEFORE any
  // vendor CLI runs.
  // -----------------------------------------------------------------------

  describe('agora.sh --round --extra-agenda validation (I3: reject before any vendor is invoked)', () => {
    const judgeStubBody = (name: string, callCountFile: string) => `
      echo "${name}" >> '${callCountFile}'
      case "$*" in
        *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';;
        *) printf '%s' '${judgeVerdict(1, 'MAJORITY', 'BUILD_WITH_CHANGES')}';;
      esac
    `;
    const reviewerOnlyStubBody = (name: string, callCountFile: string) =>
      `echo "${name}" >> '${callCountFile}'\n${OK_STUB}`;

    it('accepts a valid JSON-array --extra-agenda and still advances the round (positive control)', async () => {
      const { base, root, obs } = await makeOutputSandbox('out-extra-agenda-valid');
      const callCountFile = join(obs, 'call-count');
      const bin = await makeStubBin({
        claude: judgeStubBody('claude', callCountFile),
        omx: reviewerOnlyStubBody('omx', callCountFile),
        agy: reviewerOnlyStubBody('agy', callCountFile),
      });
      const env = {
        PATH: `${bin}:${process.env.PATH}`,
        AGORA_OMX_BIN: join(bin, 'omx'),
        AGORA_OUTPUT_ROOT: root,
        AGORA_SESSION_EPOCH: '1755230400',
      };
      try {
        const started = await runScript(
          AGORA_SCRIPT,
          ['--start', '상태 저장 방식 재검토', '--max-rounds', '5'],
          '',
          env
        );
        expect(started.exitCode).toBe(0);
        const sessionDir = started.stdout.trim().split('\n').pop() as string;

        const roundResult = await runScript(
          AGORA_SCRIPT,
          ['--round', '2', '--session-dir', sessionDir, '--extra-agenda', '["추가 쟁점"]'],
          '',
          env
        );
        expect(roundResult.exitCode).toBe(0);
        const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
        expect(state.round).toBe(2);
        const anon2 = JSON.parse(await readFile(join(sessionDir, 'anon/round-2.json'), 'utf-8'));
        expect(anon2.agenda).toContain('추가 쟁점');
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(base, { recursive: true, force: true });
      }
    }, 30000);

    it('rejects a malformed --extra-agenda with exit 64 and never invokes a reviewer/judge CLI (negative)', async () => {
      const { base, root, obs } = await makeOutputSandbox('out-extra-agenda-invalid');
      const callCountFile = join(obs, 'call-count');
      const bin = await makeStubBin({
        claude: judgeStubBody('claude', callCountFile),
        omx: reviewerOnlyStubBody('omx', callCountFile),
        agy: reviewerOnlyStubBody('agy', callCountFile),
      });
      const env = {
        PATH: `${bin}:${process.env.PATH}`,
        AGORA_OMX_BIN: join(bin, 'omx'),
        AGORA_OUTPUT_ROOT: root,
        AGORA_SESSION_EPOCH: '1755230400',
      };
      try {
        const started = await runScript(
          AGORA_SCRIPT,
          ['--start', '상태 저장 방식 재검토', '--max-rounds', '5'],
          '',
          env
        );
        expect(started.exitCode).toBe(0);
        const sessionDir = started.stdout.trim().split('\n').pop() as string;

        // Round 1 legitimately invokes claude(reviewer) + claude(judge) +
        // omx(reviewer) + agy(reviewer) = 4 lines in the call-count file.
        const countAfterRound1 = (await readFile(callCountFile, 'utf-8')).trim().split('\n').length;
        expect(countAfterRound1).toBe(4);

        for (const malformed of [
          '롤백 경로 재검토',
          '{"foo":1}',
          'not json at all',
          '"a string"',
        ]) {
          const roundResult = await runScript(
            AGORA_SCRIPT,
            ['--round', '2', '--session-dir', sessionDir, '--extra-agenda', malformed],
            '',
            env
          );
          expect(roundResult.exitCode).toBe(64);
          expect(roundResult.stderr).toContain('--extra-agenda');
        }

        // No reviewer/judge CLI was ever invoked for any of the rejected
        // round-2 attempts — the call count must not have moved past round 1.
        const countAfterRejections = (await readFile(callCountFile, 'utf-8'))
          .trim()
          .split('\n').length;
        expect(countAfterRejections).toBe(countAfterRound1);

        // Round 2 artifacts were never created by the rejected attempts.
        expect(existsSync(join(sessionDir, 'SEALED/raw/round-2.prompt.txt'))).toBe(false);
        expect(existsSync(join(sessionDir, 'anon/round-2.json'))).toBe(false);
        expect(existsSync(join(sessionDir, 'verdict/round-2.json'))).toBe(false);

        // state.json is untouched by the rejected attempts.
        const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
        expect(state.round).toBe(1);
        expect(state.history.length).toBe(1);
      } finally {
        await rm(bin, { recursive: true, force: true });
        await rm(base, { recursive: true, force: true });
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
  // readdir order is filesystem-defined, NOT creation or lexical order: bun on
  // APFS returns entries in name-hash order, so whether a dated session
  // directory or a sibling plain file comes first flips with the day's name.
  // Walking an entry without checking its type therefore turns a stray file
  // under `root` into an ENOTDIR that aborts the whole scan — on some calendar
  // days only. Filter to directories so the scan cannot be derailed at all.
  // (The observation files that used to sit here now live in the sandbox's
  // `obs` sibling — see makeOutputSandbox; this check is defence in depth.)
  const days = await readdir(root, { withFileTypes: true });
  for (const day of days) {
    if (!day.isDirectory()) continue;
    const dayDir = join(root, day.name);
    const entries = await readdir(dayDir);
    const match = entries.find((e) => e.startsWith('agora-'));
    if (match) return join(dayDir, match);
  }
  throw new Error(`no agora session dir found under ${root}`);
}

describe('agora.sh --round consumes judge.sh exit 68 as a hard config-error stop (no retry)', () => {
  // S-1: same rewrite as the judge.sh "schema cannot be read" test above —
  // AGORA_VERDICT_SCHEMA instead of moving the real tracked file aside.
  // agora.sh sets no environment of its own (see the env-hygiene test), so the
  // var simply passes through to the judge.sh child by ordinary inheritance.
  it('propagates exit 68 immediately without retrying the round or advancing state.json', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-e68');
    const claudeCountFile = join(obs, 'claude-call-count');
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
    const missingSchema = join(obs, 'no-such-verdict-schema.json');
    expect(existsSync(missingSchema)).toBe(false);
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
          AGORA_VERDICT_SCHEMA: missingSchema,
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
      // The shipped schema was never a participant in this test.
      expect(existsSync(join(SCRIPTS_DIR, 'verdict-schema.json'))).toBe(true);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
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

// -------------------------------------------------------------------
// SKILL.md frontmatter contract (Task 7)
// -------------------------------------------------------------------

const SKILL_MD = resolve(import.meta.dir, '../../../.claude/skills/agora/SKILL.md');

describe('agora SKILL.md', () => {
  it('exists with the required frontmatter fields', async () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src.startsWith('---\n')).toBe(true);
    const fm = src.split('---')[1];
    expect(fm).toContain('name: agora');
    expect(fm).toMatch(/description: .+/);
    expect(fm).toContain('scope: core');
    expect(fm).toContain('version: 1.0.0');
    expect(fm).toContain('user-invocable: true');
    expect(fm).toContain('argument-hint:');
  });

  // spec §12: agora is a CLI pipeline skill, not multi-agent orchestration.
  // The fork cap is 12 with 10 in use; there is no reason to spend one.
  it('does not declare context: fork', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src).not.toContain('context: fork');
  });

  it('documents the round pipeline in call order', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    const iReviewers = src.indexOf('reviewers.sh');
    const iAnon = src.indexOf('anonymize.sh');
    const iJudge = src.indexOf('judge.sh');
    expect(iReviewers).toBeGreaterThan(-1);
    expect(iAnon).toBeGreaterThan(iReviewers);
    expect(iJudge).toBeGreaterThan(iAnon);
  });

  it('documents the gate keys and the spec §10 display block', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src).toContain('Agora Round');
    expect(src).toContain('[c] 계속');
    expect(src).toContain('[s] 중단하고 보고서');
    expect(src).toContain('[e] 의제 추가 후 계속');
  });

  it('warns about --auto skipping the cost gate', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src).toContain('--auto');
    expect(src).toMatch(/경고|주의/);
  });

  it('states that SEALED is off-limits to the orchestrator', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src).toContain('SEALED');
    expect(src).toContain('report.md');
  });

  // Controller-added: SKILL.md must document AGORA_FORCE_TIMEOUT_FALLBACK as
  // test-only, so an operator does not set it in a production run (flagged
  // in Task 4 review as "undocumented in the interface doc").
  it('documents AGORA_FORCE_TIMEOUT_FALLBACK as test-only', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    expect(src).toContain('AGORA_FORCE_TIMEOUT_FALLBACK');
    expect(src).toMatch(/테스트 전용/);
  });

  // Controller-added: exit 68 (schema config error) must be documented as
  // distinct from judge failure (exit 4) and not a retry target.
  //
  // Meaning-based, not layout-based: the exit-code table (§종료 코드) has a
  // dedicated 재시도 (retry) column, so this locates the `68` row directly
  // and reads its own retry cell — it does not depend on "재시도" and
  // "아니오/대상" sitting within N characters of each other in prose, which
  // breaks the moment the doc is reorganized into a table (as it correctly
  // was — the old proximity-based regex was coupled to a since-improved
  // sentence layout, not to the actual content).
  it('documents judge.sh exit 68 as a non-retried configuration error', async () => {
    const src = await readFile(SKILL_MD, 'utf-8');
    const row68 = src.split('\n').find((line) => /^\s*\|\s*`68`\s*\|/.test(line));
    expect(row68).toBeDefined();
    if (!row68) throw new Error('unreachable — toBeDefined asserted above');
    const cells = row68
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // 코드 | 반환 스크립트 | 의미 | 재시도 — 4 data columns.
    expect(cells.length).toBe(4);
    expect(cells[2]).toMatch(/설정 오류|설정.{0,10}결함/); // configuration-error framing
    expect(cells[3]).toBe('아니오'); // retry column: No
  });
});

const RUNNER_MD = resolve(import.meta.dir, '../../../.claude/agents/agora-runner.md');

describe('agora-runner agent', () => {
  it('exists with valid R006 frontmatter', async () => {
    expect(existsSync(RUNNER_MD)).toBe(true);
    const src = await readFile(RUNNER_MD, 'utf-8');
    const fm = src.split('---')[1];
    expect(fm).toContain('name: agora-runner');
    expect(fm).toMatch(/description: .+/);
    expect(fm).toMatch(/model: .+/);
    expect(fm).toContain('Bash');
    expect(fm).toContain('Read');
    expect(fm).toContain('Write');
    expect(fm).toContain('Glob');
  });

  // spec §12: the return payload is the last line of defence for the anon boundary.
  it('restricts its return contract to a verdict summary', async () => {
    const src = await readFile(RUNNER_MD, 'utf-8');
    expect(src).toContain('verdict');
    expect(src).toMatch(/반환.*요약|요약.*반환/);
    expect(src).toContain('SEALED');
    expect(src).toMatch(/반환하지 않|금지/);
  });

  // spec §12 / R020: one round per delegation, because a phase boundary is where
  // subagents stop mid-step.
  it('states that one delegation covers exactly one round', async () => {
    const src = await readFile(RUNNER_MD, 'utf-8');
    expect(src).toMatch(/라운드 1개|한 라운드|1 라운드/);
    expect(src).toContain('--round');
  });

  it('does not instruct the agent to interact with the user', async () => {
    const src = await readFile(RUNNER_MD, 'utf-8');
    expect(src).not.toContain('AskUserQuestion');
    expect(src).toMatch(/게이트.*오케스트레이터|오케스트레이터.*게이트/);
  });
});

// =====================================================================
// Review round 4 — behavioural coverage for invariants that the suite so
// far only asserted STRUCTURALLY (source greps, label-set shape) or not
// at all. Each block below names the wrong-but-passing implementation it
// exists to reject.
// =====================================================================

/**
 * Reverse of anonymize.sh's vendor_id(). Written out here on purpose rather
 * than derived from the script: a test that reads its expectations out of the
 * thing under test cannot disagree with it.
 */
const VENDOR_ID_TO_SLUG: Record<string, string> = {
  'claude:claude-opus-4-8': 'claude',
  'omx:default': 'omx',
  'agy:gemini-3.1-pro-high': 'agy',
};

interface ReviewerEntry {
  label: string;
  overall: string;
  rationale: string;
  findings: unknown[];
}

// ---------------------------------------------------------------------
// C4-1: label ↔ body ↔ sealed-mapping must agree three ways.
//
// Nothing in the suite tied a label's BODY to the vendor its sealed
// mapping names. The label-set assertions ("map has A/B/C", "bundle has 3
// reviewers") hold under any permutation, and the prior-round relabel test
// reads its expected vendor out of the mapping the same build produced —
// self-consistency, not correspondence.
//
// The implementation this rejects: replace build_bundle's map-driven
// assembly loop with a fixed `for slug in claude omx agy` loop that hands
// out A/B/C in raw-directory order. The sealed mapping still says
// A → whoever the shuffle picked, but the bundle's A now carries claude's
// text — the shuffle is neutralised and report.md attributes every opinion
// to the wrong vendor. Every pre-existing assertion still passes.
// ---------------------------------------------------------------------

describe('anonymize.sh --build: label ↔ body ↔ sealed mapping (three-way correspondence)', () => {
  // Chosen by measurement so the shuffle displaces ALL THREE vendors off the
  // (claude, omx, agy) order build_bundle scans the raw dir in. Under an
  // identity permutation a fixed-order assembly loop emits a byte-identical
  // bundle, which would make this whole case vacuous — the guard right after
  // the build fails loudly if that ever becomes true.
  const DISPLACING_SEED = 'seedX';
  const RAW_DIR_ORDER = ['claude', 'omx', 'agy'];

  it('gives each label the body of the vendor the sealed mapping assigns to it', async () => {
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
          DISPLACING_SEED,
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
      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(Object.keys(mapping.map).sort()).toEqual(['A', 'B', 'C']);
      expect(bundle.reviewers.length).toBe(3);

      // Vacuity guard: if the seed's permutation ever collapses to raw-dir
      // order, the correspondence check below stops being able to tell a
      // map-driven build from a map-blind one.
      const mappedOrder = ['A', 'B', 'C'].map((l) => VENDOR_ID_TO_SLUG[mapping.map[l]]);
      expect(mappedOrder).not.toEqual(RAW_DIR_ORDER);

      for (const label of ['A', 'B', 'C']) {
        const slug = VENDOR_ID_TO_SLUG[mapping.map[label]];
        expect(slug).toBeDefined();
        // Ground truth comes from the script's INPUT (the sealed raw file),
        // never from the mapping or the bundle it produced.
        const original = JSON.parse(
          await readFile(join(dir, 'SEALED/raw/round-1', `${slug}.json`), 'utf-8')
        );
        const entry = bundle.reviewers.find((r: ReviewerEntry) => r.label === label) as
          | ReviewerEntry
          | undefined;
        expect(entry).toBeDefined();
        expect((entry as ReviewerEntry).rationale).toBe(original.rationale);
        expect((entry as ReviewerEntry).overall).toBe(original.overall);
        // The raw fixtures already carry exactly the spec §5 whitelist, so
        // normalization is a no-op on them and a deep compare is valid.
        expect((entry as ReviewerEntry).findings).toEqual(original.findings);
      }

      // Without three mutually distinguishable bodies the loop above would
      // hold under an arbitrary permutation.
      expect(new Set(bundle.reviewers.map((r: ReviewerEntry) => r.rationale)).size).toBe(3);
      expect(new Set(bundle.reviewers.map((r: ReviewerEntry) => r.overall)).size).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// C4-2: the judge process must not be handed a filesystem route into
// SEALED — asserted by FOLLOWING what it was handed, not by grepping for
// the string "SEALED".
//
// The three pre-existing guards are all source/string checks, and the one
// runtime check ran against a session that had no SEALED/ at all, so the
// thing it measured was a tmpdir name. The implementation this rejects:
// pass the SESSION ROOT (or any path inside the session) to the judge CLI.
// No argv token would contain "SEALED", yet `<dir>/SEALED/mapping/...` is
// one dirname away.
// ---------------------------------------------------------------------

/**
 * Follow `p` — and up to `depth` of its ancestors — asking at each level
 * whether a sealed mapping is sitting there. Returns the sealed path actually
 * REACHED, or null. This answers "where does this handle get you", which is
 * the question a string check cannot.
 */
function reachSealedFrom(p: string, depth = 4): string | null {
  let cur = p;
  for (let i = 0; i <= depth; i++) {
    const probe = join(cur, 'SEALED', 'mapping', 'round-1.json');
    if (existsSync(probe)) return probe;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** Every absolute-path-looking substring in a blob of argv/env text. */
function absolutePathTokens(blob: string): string[] {
  return [...new Set(blob.match(/\/[A-Za-z0-9._+\-/]+/g) ?? [])];
}

describe('judge.sh sealed isolation (behavioural: follow the handles, not the strings)', () => {
  it('hands the judge CLI no argv or env value from which SEALED is reachable', async () => {
    // A session that genuinely HAS sealed material — the previous runtime
    // guard did not, so there was nothing for it to fail on.
    const dir = await makeSession('raw');
    // Dumps live outside the session tree so they cannot themselves become a
    // route into it.
    const dumpDir = join(tmpdir(), `agora-judge-dump-${Date.now()}`);
    await mkdir(dumpDir, { recursive: true });
    const argvDump = join(dumpDir, 'argv.txt');
    const envDump = join(dumpDir, 'env.txt');

    const bin = await makeStubBin({
      claude: `printf '%s\\n' "$@" > "$STUB_ARGV_DUMP"; env > "$STUB_ENV_DUMP"; printf '%s' '${VALID_VERDICT}'`,
      agy: 'exit 1',
    });

    try {
      const built = await runScript(
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
      expect(built.exitCode).toBe(0);
      // Negative control for the probe itself: the sealed material exists, and
      // the probe DOES find it when handed a path the judge legitimately holds
      // (the anon bundle). If this ever returns null the assertions below are
      // meaningless.
      expect(reachSealedFrom(join(dir, 'anon', 'round-1.json'))).toBe(
        join(dir, 'SEALED', 'mapping', 'round-1.json')
      );
      expect(existsSync(join(dir, 'SEALED/raw/round-1/claude.json'))).toBe(true);

      await mkdir(join(dir, 'verdict'), { recursive: true });
      const run = await runScript(
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
        {
          PATH: `${bin}:${process.env.PATH}`,
          STUB_ARGV_DUMP: argvDump,
          STUB_ENV_DUMP: envDump,
        }
      );
      expect(run.exitCode).toBe(0);

      const argv = await readFile(argvDump, 'utf-8');
      const envText = await readFile(envDump, 'utf-8');
      // The judge really was given the round's material (otherwise a stub that
      // received nothing at all would pass every check below).
      expect(argv).toContain('익명 번들');

      const candidates = [...absolutePathTokens(argv), ...absolutePathTokens(envText)];
      expect(candidates.length).toBeGreaterThan(0);

      const insideSession = candidates.filter((c) => c === dir || c.startsWith(`${dir}/`));
      expect(insideSession).toEqual([]);

      const reachable = candidates
        .map((c) => [c, reachSealedFrom(c)] as const)
        .filter(([, hit]) => hit !== null);
      expect(reachable).toEqual([]);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dumpDir, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// Env inheritance: the third route into the session, which neither the
// source guard ("agora.sh never exports") nor the argv guard covers.
//
// Both of those guards ask what THIS codebase hands to the child. Neither
// asks what was already in the environment when the operator ran agora.sh.
// AGORA_OUTPUT_ROOT is a documented operator knob, and everything the
// anonymity property protects lives underneath the directory it names — so
// a vendor or judge CLI that reads it out of its own environment can walk
// down to the sealed label↔vendor record without this codebase ever having
// passed it a path.
//
// The implementation these reject: launch the CLI with the inherited
// environment untouched. The stub dumps its OWN `env` and the assertions
// follow every absolute path in it, the same way the judge argv test above
// follows handles instead of grepping for the string "SEALED".
//
// The dump path itself is deliberately NOT an AGORA_*-prefixed variable —
// the strip is a prefix rule, so an AGORA_-prefixed dump path would be
// stripped too and the stub would have nowhere to write, which is exactly
// what happened when these were first run.
// ---------------------------------------------------------------------

/**
 * A session tree sitting under an output root, mirroring the production
 * layout `<root>/<day>/agora-<slug>-<hms>/SEALED/mapping/round-1.json`.
 * Returns both, so a test can hand the ROOT to a child and then ask whether
 * the sealed file underneath it was reachable from what the child received.
 */
async function makeRootedSession(tag: string): Promise<{ root: string; session: string }> {
  const root = join(
    tmpdir(),
    `agora-root-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const session = join(root, '2026-08-15', 'agora-state-topic-T-133100');
  await mkdir(join(session, 'SEALED', 'mapping'), { recursive: true });
  await writeFile(
    join(session, 'SEALED', 'mapping', 'round-1.json'),
    JSON.stringify({ A: 'claude:claude-opus-4-8', B: 'omx:default', C: 'agy:gemini-3.1-pro-high' })
  );
  return { root, session };
}

/**
 * Sealed material reachable by walking DOWN from `p`, bounded by `depth`.
 *
 * reachSealedFrom above only ascends, which is the right question for a path
 * INSIDE a session but the wrong one for AGORA_OUTPUT_ROOT: the root sits
 * ABOVE the session, so the sealed record is one glob DOWN, and an
 * ascend-only probe returns null on the very leak this file is about
 * (measured). Both directions are asked, so "reachable" means what it says.
 */
function reachSealedUnder(p: string, depth = 4): string | null {
  if (depth < 0 || !existsSync(p)) return null;
  const direct = join(p, 'SEALED', 'mapping', 'round-1.json');
  if (existsSync(direct)) return direct;
  let entries: string[];
  try {
    entries = readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  for (const name of entries) {
    const hit = reachSealedUnder(join(p, name), depth - 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Handles that name the output root or anything beneath it.
 *
 * This is the DESCENDING half of the question, asked precisely. Running
 * reachSealedUnder over every path token instead does not work and is worth
 * recording: the child legitimately carries TMPDIR, every test fixture here
 * lives under it, so a generic ancestor "reaches" the sealed file and the
 * assertion fails on paths that leak nothing (measured). Taken to its
 * conclusion that probe flags `/` as a leak. What actually matters is
 * whether an agora-specific coordinate was handed over.
 */
function tokensUnderRoot(tokens: string[], root: string): string[] {
  return tokens.filter((c) => c === root || c.startsWith(`${root}/`));
}

/** Every `NAME=` line of an `env` dump whose name carries the given prefix. */
function envNamesWithPrefix(dump: string, prefix: string): string[] {
  return dump
    .split('\n')
    .map((line) => line.slice(0, line.indexOf('=')))
    .filter((name) => name.startsWith(prefix));
}

describe('vendor/judge CLIs inherit no AGORA_* variable (env is the third route in)', () => {
  it('gives a vendor CLI no environment value from which the sealed record is reachable', async () => {
    const { root, session } = await makeRootedSession('rv');
    const dumpDir = join(tmpdir(), `agora-envdump-rv-${Date.now()}`);
    await mkdir(dumpDir, { recursive: true });
    // Each vendor dumps to its own file, so a strip that only covered one
    // dispatch branch cannot hide behind another branch's clean dump.
    const dumpFor = (slug: string) => join(dumpDir, `${slug}.env`);
    const dumping = (slug: string) => `env > '${dumpFor(slug)}'; ${OK_STUB}`;

    const bin = await makeStubBin({
      claude: dumping('claude'),
      omx: dumping('omx'),
      agy: dumping('agy'),
    });
    const work = join(tmpdir(), `agora-envwork-rv-${Date.now()}`);
    await mkdir(work, { recursive: true });
    const promptFile = join(work, 'prompt.txt');
    await writeFile(promptFile, '주제: 상태 저장 방식 재검토');

    try {
      // Probe negative control: the sealed record really is reachable from
      // the root, so a leaked AGORA_OUTPUT_ROOT would genuinely get a vendor
      // there. Without this the assertions below could pass on an empty tree.
      const sealed = join(session, 'SEALED', 'mapping', 'round-1.json');
      expect(reachSealedFrom(join(session, 'anon'), 4)).toBe(sealed);
      // And specifically from the ROOT, which is what the leaked variable
      // carries — an ascend-only probe returns null here, so without this
      // the assertions below would be measuring nothing for that shape.
      expect(reachSealedUnder(root)).toBe(sealed);

      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', work, '--round', '1', '--prompt-file', promptFile],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          // The leak, set exactly the way an operator would set it.
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755300000',
        }
      );
      expect(result.exitCode).toBe(0);

      for (const slug of ['claude', 'omx', 'agy']) {
        // The vendor really ran — otherwise an empty dump would pass
        // every assertion below for the wrong reason. AGORA_OMX_BIN reaching
        // reviewers.sh is also what proves the strip is applied to the child
        // only: the omx dispatch resolved through that injected value.
        expect(existsSync(join(work, `SEALED/raw/round-1/${slug}.json`))).toBe(true);
        const dump = await readFile(dumpFor(slug), 'utf-8');

        // The load-bearing checks, both directions of "can this handle get
        // the vendor there": nothing at or under the output root (the leak's
        // own shape), and nothing from which the sealed file is reachable by
        // walking up (a handle inside the session).
        const tokens = absolutePathTokens(dump);
        expect(tokensUnderRoot(tokens, root)).toEqual([]);
        const reachable = tokens
          .map((c) => [c, reachSealedFrom(c)] as const)
          .filter(([, hit]) => hit !== null);
        expect(reachable).toEqual([]);

        expect(envNamesWithPrefix(dump, 'AGORA_')).toEqual([]);
        // Not `env -i`: a vendor CLI still needs PATH/HOME to authenticate
        // and to be found at all. Stripping everything would "pass" this
        // test while breaking every real run.
        expect(envNamesWithPrefix(dump, 'PATH')).toEqual(['PATH']);
      }
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dumpDir, { recursive: true, force: true });
      await rm(work, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it('gives the judge CLI no environment value from which the sealed record is reachable', async () => {
    const { root, session } = await makeRootedSession('jd');
    const dumpDir = join(tmpdir(), `agora-envdump-jd-${Date.now()}`);
    await mkdir(dumpDir, { recursive: true });
    const envDump = join(dumpDir, 'judge.env');

    const bin = await makeStubBin({
      claude: `env > '${envDump}'; printf '%s' '${VALID_VERDICT}'`,
      agy: 'exit 1',
    });

    // The judge is handed only an anonymous bundle, placed inside the same
    // rooted session the leaked variable would point at.
    await mkdir(join(session, 'anon'), { recursive: true });
    await mkdir(join(session, 'verdict'), { recursive: true });
    const anonFile = join(session, 'anon', 'round-1.json');
    await writeFile(anonFile, JSON.stringify({ round: 1, reviewers: [{ label: 'A', body: {} }] }));

    try {
      const sealed = join(session, 'SEALED', 'mapping', 'round-1.json');
      expect(reachSealedFrom(anonFile)).toBe(sealed);
      expect(reachSealedUnder(root)).toBe(sealed);

      const run = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          anonFile,
          '--out-file',
          join(session, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755300000',
        }
      );
      expect(run.exitCode).toBe(0);

      const dump = await readFile(envDump, 'utf-8');
      const tokens = absolutePathTokens(dump);
      expect(tokensUnderRoot(tokens, root)).toEqual([]);
      const reachable = tokens
        .map((c) => [c, reachSealedFrom(c)] as const)
        .filter(([, hit]) => hit !== null);
      expect(reachable).toEqual([]);

      expect(envNamesWithPrefix(dump, 'AGORA_')).toEqual([]);
      expect(envNamesWithPrefix(dump, 'PATH')).toEqual(['PATH']);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dumpDir, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  // The strip must not eat the configuration the scripts themselves read —
  // read time and pass time are different moments. AGORA_VERDICT_SCHEMA is
  // the sharpest case: judge.sh reads it to locate the schema it validates
  // against, and a strip applied too early would send the judge to its
  // default schema (or to none) while the test believed it was substituted.
  it('still honours AGORA_VERDICT_SCHEMA in judge.sh while stripping it from the child', async () => {
    const { root, session } = await makeRootedSession('schema');
    const dumpDir = join(tmpdir(), `agora-envdump-schema-${Date.now()}`);
    await mkdir(dumpDir, { recursive: true });
    const envDump = join(dumpDir, 'judge.env');
    const bin = await makeStubBin({
      claude: `env > '${envDump}'; printf '%s' '${VALID_VERDICT}'`,
      agy: 'exit 1',
    });
    await mkdir(join(session, 'anon'), { recursive: true });
    const anonFile = join(session, 'anon', 'round-1.json');
    await writeFile(anonFile, JSON.stringify({ round: 1, reviewers: [] }));

    try {
      // Pointed at a path that does not exist: judge.sh exits 68 only if it
      // actually READ the variable. Exit 0 here would mean the strip ran too
      // early and the override never took effect.
      const run = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          anonFile,
          '--out-file',
          join(session, 'verdict/round-1.json'),
          '--round',
          '1',
        ],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OUTPUT_ROOT: root,
          AGORA_VERDICT_SCHEMA: join(dumpDir, 'no-such-schema.json'),
        }
      );
      expect(run.exitCode).toBe(68);
      expect(run.stderr).toContain('cannot read or parse verdict schema');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dumpDir, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// C3: the fallback watchdog must not orphan its own `sleep`.
//
// The existing F1 cases cannot see this defect: they run at
// AGORA_TIMEOUT_SECS=1, so the watchdog's sleep dies of old age inside the
// observation window, and they only exercise the TIMEOUT path — where the
// sleep has by definition already elapsed. The leak is on the SUCCESS
// path, at production-sized timeouts. The implementation this rejects is
// the pre-fix `kill -TERM "$watcher"`, which reaps the subshell and
// re-parents its sleep to init for the full timeout.
// ---------------------------------------------------------------------

describe('C3: the timeout watchdog leaves no orphaned sleep on the SUCCESS path', () => {
  /**
   * Seven digits, so it can collide neither with the six-digit markers the F1
   * process-group cases use nor with any plausible real `sleep N` on the box.
   * The value doubles as AGORA_TIMEOUT_SECS, i.e. as the watchdog's own sleep
   * argument, which is what makes it findable with pgrep.
   */
  function watchdogMarker(): string {
    return String(1000000 + Math.floor(Math.random() * 9000000));
  }

  it('reviewers.sh: no watchdog sleep survives a round every vendor completed', async () => {
    const marker = watchdogMarker();
    const bin = await makeStubBin({ claude: OK_STUB, omx: OK_STUB, agy: OK_STUB });
    const dir = join(tmpdir(), `agora-rv-c3-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt.txt');
    await writeFile(promptFile, '주제: 상태 저장 방식 재검토');
    try {
      const result = await runScript(
        REVIEWERS_SCRIPT,
        ['--run', '--session-dir', dir, '--round', '1', '--prompt-file', promptFile],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          // Production-sized budget: the stubs return instantly, so every
          // watchdog sleep is still alive when run_with_timeout returns.
          AGORA_TIMEOUT_SECS: marker,
          AGORA_FORCE_TIMEOUT_FALLBACK: '1',
        }
      );
      expect(result.exitCode).toBe(0);
      // Every vendor really did succeed — this is the success path, not a
      // round that failed its way past the watchdog.
      for (const slug of ['claude', 'omx', 'agy']) {
        expect(existsSync(join(dir, `SEALED/raw/round-1/${slug}.json`))).toBe(true);
      }

      await new Promise((r) => setTimeout(r, 500));
      expect(await pgrepMatches(`sleep ${marker}`)).toBe('');
    } finally {
      await execAsync(`pkill -f 'sleep ${marker}' 2>/dev/null || true`).catch(() => {});
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('judge.sh: no watchdog sleep survives a verdict the first slot produced', async () => {
    const marker = watchdogMarker();
    const bin = await makeStubBin({
      claude: `printf '%s' '${VALID_VERDICT}'`,
      agy: 'exit 1',
    });
    const dir = join(tmpdir(), `agora-judge-c3-${Date.now()}`);
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
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_TIMEOUT_SECS: marker,
          AGORA_FORCE_TIMEOUT_FALLBACK: '1',
        }
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'verdict/round-1.json'))).toBe(true);

      await new Promise((r) => setTimeout(r, 500));
      expect(await pgrepMatches(`sleep ${marker}`)).toBe('');
    } finally {
      await execAsync(`pkill -f 'sleep ${marker}' 2>/dev/null || true`).catch(() => {});
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// C4-4: contract surfaces introduced by this round of fixes. Each is
// asserted by RUNNING the script and reading its effect, never by reading
// --help text or grepping the source.
// ---------------------------------------------------------------------

/** A schema-complete verdict, with named fields overridable per test. */
function verdictWith(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    round: 1,
    judge: 'slot',
    consensus: 'MAJORITY',
    verdict: 'BUILD_WITH_CHANGES',
    resolved: [{ id: 'F1', resolution: '해소됨' }],
    unresolved: [{ id: 'F2', severity: 'HIGH', positions: 'A KEEP / B REJECT' }],
    agenda: ['F2 심각도 판정 근거'],
    draft: '## 통합 초안',
    new_findings: 2,
    notes: '리뷰어 3인 전원 응답',
    ...overrides,
  });
}

/**
 * Drive a complete single-round --auto session with stub CLIs and hand back
 * the session dir plus everything the caller must clean up.
 */
async function completedAutoSession(tag: string): Promise<{
  dir: string;
  root: string;
  bin: string;
  env: Record<string, string>;
}> {
  const bin = await makeStubBin({
    claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${verdictWith()}';; esac`,
    omx: OK_STUB,
    agy: OK_STUB,
  });
  const root = join(tmpdir(), `agora-out-${tag}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    AGORA_OMX_BIN: join(bin, 'omx'),
    AGORA_OUTPUT_ROOT: root,
    AGORA_SESSION_EPOCH: '1755230400',
  };
  const started = await runScript(
    AGORA_SCRIPT,
    ['--start', '상태 저장 방식 재검토', '--max-rounds', '1', '--auto'],
    '',
    env
  );
  if (started.exitCode !== 0) {
    throw new Error(`session start failed (rc=${started.exitCode}): ${started.stderr}`);
  }
  return { dir: started.stdout.trim().split('\n').pop() as string, root, bin, env };
}

describe('agora.sh --set-stop: the session ending is recorded and reaches report.md', () => {
  it('round-trips every stop code decide_stop can emit into 종료 사유', async () => {
    const s = await completedAutoSession('setstop');
    try {
      for (const code of ['CONSENSUS', 'STALLED', 'MAX_ROUNDS', 'USER']) {
        const set = await runScript(
          AGORA_SCRIPT,
          ['--set-stop', code, '--session-dir', s.dir],
          '',
          s.env
        );
        expect(set.exitCode).toBe(0);
        const state = JSON.parse(await readFile(join(s.dir, 'state.json'), 'utf-8'));
        expect(state.stop).toBe(code);

        const report = await runScript(
          AGORA_SCRIPT,
          ['--report', '--session-dir', s.dir],
          '',
          s.env
        );
        expect(report.exitCode).toBe(0);
        const md = await readFile(join(s.dir, 'report.md'), 'utf-8');
        expect(md).toContain(`- 종료 사유: ${code}`);
        expect(md).not.toContain('종료 사유: UNKNOWN');
      }
    } finally {
      await rm(s.bin, { recursive: true, force: true });
      await rm(s.root, { recursive: true, force: true });
    }
  }, 60000);

  it('rejects CONTINUE, a typo and a lower-cased code with exit 64 and leaves .stop untouched', async () => {
    const s = await completedAutoSession('setstop-reject');
    try {
      // Establish a distinctive baseline so "untouched" is observable.
      expect(
        (await runScript(AGORA_SCRIPT, ['--set-stop', 'USER', '--session-dir', s.dir], '', s.env))
          .exitCode
      ).toBe(0);

      for (const bad of ['CONTINUE', 'CONSENUS', 'consensus', 'max_rounds', 'STOPPED']) {
        const result = await runScript(
          AGORA_SCRIPT,
          ['--set-stop', bad, '--session-dir', s.dir],
          '',
          s.env
        );
        expect(result.exitCode).toBe(64);
        const state = JSON.parse(await readFile(join(s.dir, 'state.json'), 'utf-8'));
        expect(state.stop).toBe('USER');
      }
    } finally {
      await rm(s.bin, { recursive: true, force: true });
      await rm(s.root, { recursive: true, force: true });
    }
  }, 60000);
});

describe('agora.sh run_round state-write guard (exit 73, state.json left alone)', () => {
  // The guard's stated trigger is a judge whose new_findings is not a number
  // reaching jq --argjson. judge.sh's own type check normally intercepts that
  // first, so to reach the guard the judge is pointed (via the existing
  // AGORA_VERDICT_SCHEMA test hook) at a schema that declares new_findings as a
  // number|string UNION — validate_verdict skips non-plain-string types by
  // design, so the bad value flows through exactly as it would if the schema
  // ever loosened. This is a defence-in-depth layer; it is tested as one.
  it('exits 73 without advancing state.json when new_findings is not numeric', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-nf73');
    const schema = JSON.parse(await readFile(join(SCRIPTS_DIR, 'verdict-schema.json'), 'utf-8'));
    schema.properties.new_findings = { type: ['number', 'string'] };
    const looseSchema = join(obs, 'loose-verdict-schema.json');
    await writeFile(looseSchema, JSON.stringify(schema));

    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${verdictWith({ new_findings: 'three' })}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
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
          AGORA_VERDICT_SCHEMA: looseSchema,
        }
      );
      expect(result.exitCode).toBe(73);
      expect(result.stderr).toContain('three');

      const sessionDir = await findSessionDir(root);
      // The judge DID answer — this is a recording failure, not a judge failure.
      expect(existsSync(join(sessionDir, 'verdict/round-1.json'))).toBe(true);
      const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
      expect(state.round).toBe(0);
      expect(state.history.length).toBe(0);
      // No report may be produced for a round that was never recorded.
      expect(existsSync(join(sessionDir, 'report.md'))).toBe(false);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
    }
  }, 30000);
});

describe('judge.sh verdict type validation stops a wrong-typed field at the source', () => {
  // A judge answering `"agenda": "1. 단일 의제"` used to be written straight to
  // verdict/round-N.json; the NEXT round then read it back, collapsed the
  // agenda to empty, and invoked (and billed) all three vendors on a blank
  // agenda. The type check must reject it before any of that happens.
  it('rejects a string agenda on every rotation slot and never reaches the next round', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-agenda-type');
    const reviewerCalls = join(obs, 'reviewer-calls');
    const judgeCalls = join(obs, 'judge-calls');
    const badVerdict = verdictWith({ agenda: '1. 단일 의제' });

    const bin = await makeStubBin({
      claude: `case "$*" in
        *claude-opus-4-8*) echo claude >> '${reviewerCalls}'; printf '%s' '${VALID_RESPONSE}';;
        *) echo judge >> '${judgeCalls}'; printf '%s' '${badVerdict}';;
      esac`,
      omx: `echo omx >> '${reviewerCalls}'; ${OK_STUB}`,
      agy: `case "$*" in
        *gemini-3.1-pro-high*) echo agy >> '${reviewerCalls}'; printf '%s' '${VALID_RESPONSE}';;
        *) echo judge >> '${judgeCalls}'; printf '%s' '${badVerdict}';;
      esac`,
    });
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
      // Every rotation slot answered and every answer was rejected.
      expect(result.exitCode).toBe(4);
      expect(result.stderr).toContain('agenda');
      expect(result.stderr).toContain('array');
      expect((await readFile(judgeCalls, 'utf-8')).trim().split('\n').length).toBe(3);

      // The decisive assertion: round 2's vendors were never invoked (and so
      // never billed) on the back of a malformed agenda.
      expect((await readFile(reviewerCalls, 'utf-8')).trim().split('\n').length).toBe(3);

      const sessionDir = await findSessionDir(root);
      expect(existsSync(join(sessionDir, 'verdict/round-1.json'))).toBe(false);
      expect(existsSync(join(sessionDir, 'SEALED/raw/round-2'))).toBe(false);
      const state = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8'));
      expect(state.round).toBe(0);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
    }
  }, 30000);
});

describe('anonymize.sh two-valid-reviewer floor (spec §11)', () => {
  // reviewers.sh's own floor counts vendors that failed to RESPOND; it cannot
  // see a response that arrived and then failed validate_response. With only
  // one valid opinion left, a bundle would let the judge rule "consensus" on a
  // single voice.
  it('aborts with exit 3 and writes no bundle when only one response validates', async () => {
    const dir = await makeSession('raw');
    try {
      // counter is mandatory and must be non-empty (spec §5).
      const violating = JSON.stringify({
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
        rationale: 'counter 가 비어 있어 계약 위반이다',
      });
      await writeFile(join(dir, 'SEALED/raw/round-1/agy.json'), violating);
      await writeFile(join(dir, 'SEALED/raw/round-1/omx.json'), violating);

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
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('2 or more are required');
      // Nothing was written at either trust-boundary path.
      expect(existsSync(join(dir, 'anon/round-1.json'))).toBe(false);
      expect(existsSync(join(dir, 'SEALED/mapping/round-1.json'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('agora.sh --start gated: the stdout channel carries the session dir and nothing else', () => {
  // The documented idiom is `dir=$(agora.sh --start ...)`, which captures
  // stdout wholesale — one stray line on stdout and $dir stops being a path.
  it('prints exactly one stdout line (an existing dir) and puts the gate on stderr', async () => {
    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${verdictWith()}';; esac`,
      omx: OK_STUB,
      agy: OK_STUB,
    });
    const root = join(tmpdir(), `agora-out-gate-channel-${Date.now()}`);
    await mkdir(root, { recursive: true });
    try {
      const started = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '5'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(started.exitCode).toBe(0);

      const stdoutLines = started.stdout.split('\n').filter((l) => l.length > 0);
      expect(stdoutLines.length).toBe(1);
      const dir = stdoutLines[0];
      expect(dir.startsWith('/')).toBe(true);
      expect(existsSync(join(dir, 'state.json'))).toBe(true);

      // The gate block itself is on stderr, in full.
      expect(started.stderr).toContain('Agora Round 1/5');
      expect(started.stderr).toContain('[c] 계속');
      expect(started.stderr).toContain('[s] 중단하고 보고서');
      expect(started.stderr).toContain('[e] 의제 추가 후 계속');
      // ...and no fragment of it leaked onto stdout.
      expect(started.stdout).not.toContain('Agora Round');
      expect(started.stdout).not.toContain('[c] 계속');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// C4-5: max_severity is DERIVED, and nothing derived it under test.
//
// Every stub in the suite emits a single HIGH unresolved item, so an
// implementation that ignores .unresolved entirely and returns the
// constant "HIGH" passes the whole file. The value is not cosmetic: it is
// one of decide_stop's two STALLED inputs, so a wrong max_severity
// propagates into the session's termination decision.
// ---------------------------------------------------------------------

describe('agora.sh max_severity is reduced from the round unresolved list', () => {
  it('records the maximum severity per round, across every rung of the ladder', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-maxsev');
    const judgeCount = join(obs, 'judge-count');

    // Round N's unresolved list, and the max the reduction must yield.
    const ladder: Array<{ severities: string[]; expected: string }> = [
      { severities: [], expected: 'NONE' },
      { severities: ['LOW'], expected: 'LOW' },
      { severities: ['MEDIUM', 'LOW'], expected: 'MEDIUM' },
      { severities: ['LOW', 'HIGH', 'MEDIUM'], expected: 'HIGH' },
      { severities: ['MEDIUM', 'CRITICAL', 'LOW'], expected: 'CRITICAL' },
    ];

    // MAJORITY (never UNANIMOUS) and a non-zero new_findings on every round,
    // so neither the CONSENSUS nor the STALLED stop can fire and all five
    // rounds actually run.
    const verdictFor = (n: number) =>
      verdictWith({
        round: n,
        consensus: 'MAJORITY',
        verdict: 'BUILD_WITH_CHANGES',
        new_findings: 2,
        unresolved: ladder[n - 1].severities.map((severity, i) => ({
          id: `F${n}${i}`,
          severity,
          positions: 'A KEEP / B REJECT',
        })),
      });

    // One shared counter across both judge-capable stubs: the rotation lands on
    // claude for rounds 1/4 and on agy for rounds 2/3/5, and the counter is
    // what makes "which round is this" observable to either of them.
    const judgeBranch = `
      n=$(cat '${judgeCount}' 2>/dev/null || echo 0); n=$((n + 1)); printf '%s' "$n" > '${judgeCount}'
      case "$n" in
        1) printf '%s' '${verdictFor(1)}';;
        2) printf '%s' '${verdictFor(2)}';;
        3) printf '%s' '${verdictFor(3)}';;
        4) printf '%s' '${verdictFor(4)}';;
        *) printf '%s' '${verdictFor(5)}';;
      esac`;

    const bin = await makeStubBin({
      claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) ${judgeBranch};; esac`,
      omx: OK_STUB,
      agy: `case "$*" in *gemini-3.1-pro-high*) printf '%s' '${VALID_RESPONSE}';; *) ${judgeBranch};; esac`,
    });
    try {
      const started = await runScript(
        AGORA_SCRIPT,
        ['--start', '상태 저장 방식 재검토', '--max-rounds', '5', '--auto'],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(started.exitCode).toBe(0);
      const dir = started.stdout.trim().split('\n').pop() as string;
      const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf-8'));

      // All five rounds ran, so all five rungs were exercised.
      expect(state.history.length).toBe(5);
      expect(state.history.map((h: { max_severity: string }) => h.max_severity)).toEqual(
        ladder.map((l) => l.expected)
      );
      // Five distinct values — a constant-returning implementation cannot
      // satisfy this even by luck.
      expect(new Set(ladder.map((l) => l.expected)).size).toBe(5);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
    }
  }, 60000);
});

// ---------------------------------------------------------------------
// --attach is part of the skill's PUBLIC interface — SKILL.md's
// argument-hint advertises it and agora.sh's own usage block documents it —
// and nothing in this suite exercised it. Three separate things have to
// hold for the flag to mean anything, and each can break independently:
//
//   1. the paths land in state.json's `attachments` (start_session),
//   2. each attachment's CONTENT is inlined into the reviewer prompt
//      (build_reviewer_prompt) and reaches the reviewer CLI's argv,
//   3. a path that does not resolve behaves the way the implementation
//      actually behaves — see the second test, which pins measured
//      behaviour rather than desired behaviour.
//
// (2) is the one worth stating plainly: start_session already hard-fails
// (exit 73) if the attachments cannot be recorded, precisely because
// "reviewers billed for a review without the documents" is the failure it
// fears. That guard protects the RECORDING step only; nothing protected the
// step that turns the record into prompt text.
// ---------------------------------------------------------------------

/**
 * Stub set for an --attach session: claude answers as both reviewer and
 * judge, agy answers as a reviewer, and omx additionally dumps the argv it
 * was handed so the test can see the prompt the reviewer CLI actually
 * received — not merely the prompt file agora.sh wrote.
 */
async function attachStubBin(argvDump: string): Promise<string> {
  return makeStubBin({
    claude: `case "$*" in *claude-opus-4-8*) printf '%s' '${VALID_RESPONSE}';; *) printf '%s' '${verdictWith()}';; esac`,
    omx: `printf '%s' "\${!#}" > '${argvDump}'\n${OK_STUB}`,
    agy: OK_STUB,
  });
}

describe('agora.sh --start --attach', () => {
  it('records every attachment in state.json and inlines each one into the reviewer prompt', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-attach-ok');
    // The documents are test INPUT, so they belong in the observation
    // sibling, never under the session output root.
    const docA = join(obs, 'design-a.md');
    const docB = join(obs, 'design-b.md');
    const argvDump = join(obs, 'omx-argv.txt');
    // Distinct improbable markers: an implementation that inlines the PATH
    // but not the CONTENT, or that inlines only the first attachment, fails
    // on the body assertions below rather than sliding through.
    await writeFile(docA, 'ATTACH_BODY_MARKER_ALPHA\n');
    await writeFile(docB, 'ATTACH_BODY_MARKER_BETA\n');
    const bin = await attachStubBin(argvDump);
    try {
      const started = await runScript(
        AGORA_SCRIPT,
        [
          '--start',
          '상태 저장 방식 재검토',
          '--attach',
          docA,
          '--attach',
          docB,
          '--max-rounds',
          '1',
          '--auto',
        ],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      expect(started.exitCode).toBe(0);
      const dir = started.stdout.trim().split('\n').pop() as string;

      // (1) Recorded verbatim, in the order the flags were given — repeated
      // --attach accumulates rather than overwriting.
      const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf-8'));
      expect(state.attachments).toEqual([docA, docB]);

      // (2) Content — not just the path — reaches the prompt, both
      // attachments, in flag order.
      const prompt = await readFile(join(dir, 'SEALED/raw/round-1.prompt.txt'), 'utf-8');
      expect(prompt).toContain('첨부 문서:');
      expect(prompt).toContain('ATTACH_BODY_MARKER_ALPHA');
      expect(prompt).toContain('ATTACH_BODY_MARKER_BETA');
      expect(prompt.indexOf('ATTACH_BODY_MARKER_ALPHA')).toBeLessThan(
        prompt.indexOf('ATTACH_BODY_MARKER_BETA')
      );
      // Each body sits directly under its own `--- <path> ---` header, so a
      // future change that emitted headers and bodies as two separate runs
      // (all headers, then all bodies) would be caught.
      const lines = prompt.split('\n');
      expect(lines[lines.indexOf(`--- ${docA} ---`) + 1]).toBe('ATTACH_BODY_MARKER_ALPHA');
      expect(lines[lines.indexOf(`--- ${docB} ---`) + 1]).toBe('ATTACH_BODY_MARKER_BETA');

      // ...and the prompt FILE is not the contract — the reviewer CLI's argv
      // is. Asserting only on the file would miss a break between "prompt
      // written" and "prompt handed to the vendor".
      const argv = await readFile(argvDump, 'utf-8');
      expect(argv).toContain('ATTACH_BODY_MARKER_ALPHA');
      expect(argv).toContain('ATTACH_BODY_MARKER_BETA');
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
    }
  }, 30000);

  // An unreadable attachment is now MARKED as unreadable in the prompt and
  // reported on stderr, instead of emitting a bare header with nothing under
  // it. The earlier revision of this test pinned that silent behaviour as
  // measured-not-desired; the implementation has since been corrected, so
  // this asserts the correction on both channels.
  //
  // The distinction being defended is "could not be read" vs "is empty":
  // a heading with nothing beneath it reads as the latter to a reviewer, and
  // all three vendors are billed for the round either way. Both channels are
  // asserted because they reach different audiences — the marker reaches the
  // reviewers (and persists in the prompt file), stderr reaches the operator.
  //
  // Not aborting stays part of the contract and is asserted below: the
  // session still completes, the readable attachments on either side are
  // still inlined in full, and the dead path is still recorded in state.json.
  it('marks an unreadable attachment in the prompt and warns on stderr, without aborting', async () => {
    const { base, root, obs } = await makeOutputSandbox('out-attach-missing');
    const present = join(obs, 'present.md');
    const missing = join(obs, 'no-such-attachment.md');
    const trailing = join(obs, 'trailing.md');
    const argvDump = join(obs, 'omx-argv.txt');
    await writeFile(present, 'ATTACH_BODY_MARKER_PRESENT\n');
    await writeFile(trailing, 'ATTACH_BODY_MARKER_TRAILING\n');
    expect(existsSync(missing)).toBe(false);
    const bin = await attachStubBin(argvDump);
    try {
      const started = await runScript(
        AGORA_SCRIPT,
        [
          '--start',
          '상태 저장 방식 재검토',
          // Missing one in the MIDDLE: its section is then bounded by the
          // next header, so "zero body lines" is directly observable
          // instead of being confused with the end of the block.
          '--attach',
          present,
          '--attach',
          missing,
          '--attach',
          trailing,
          '--max-rounds',
          '1',
          '--auto',
        ],
        '',
        {
          PATH: `${bin}:${process.env.PATH}`,
          AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root,
          AGORA_SESSION_EPOCH: '1755230400',
        }
      );
      // The unreadable attachment does not abort the session.
      expect(started.exitCode).toBe(0);
      const dir = started.stdout.trim().split('\n').pop() as string;

      // It is recorded exactly like the readable ones — start_session does
      // not filter on existence.
      const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf-8'));
      expect(state.attachments).toEqual([present, missing, trailing]);

      const prompt = await readFile(join(dir, 'SEALED/raw/round-1.prompt.txt'), 'utf-8');
      const lines = prompt.split('\n');

      // The bare `--- <path> ---` form — the one that reads as "this
      // document is empty" — must not appear for the unreadable path at all.
      // This is the assertion the old silent behaviour failed.
      expect(lines).not.toContain(`--- ${missing} ---`);

      // What appears instead: a single header line that names the same path
      // and states, in the prompt the reviewer actually reads, both that it
      // could not be read AND that this is not the same as being empty.
      const marked = lines.filter((l) => l.includes(missing));
      expect(marked.length).toBe(1);
      expect(marked[0]).toContain('읽을 수 없');
      expect(marked[0]).toContain('비어 있다는 뜻이 아');

      const iMissing = lines.indexOf(marked[0]);
      // Still zero body lines — the document genuinely was not read, so the
      // very next line is the FOLLOWING attachment's header. The marker
      // replaces the misleading header; it does not fabricate content.
      expect(lines[iMissing + 1]).toBe(`--- ${trailing} ---`);

      // Control: the readable attachments on either side are unaffected, so
      // the marked section is specific to the unreadable path and not a
      // wholesale attachment failure that would make the assertions above
      // pass for the wrong reason.
      expect(lines[lines.indexOf(`--- ${present} ---`) + 1]).toBe('ATTACH_BODY_MARKER_PRESENT');
      expect(lines[iMissing + 2]).toBe('ATTACH_BODY_MARKER_TRAILING');

      // The operator is told, by path, on stderr.
      expect(started.stderr).toContain('no-such-attachment');
      expect(started.stderr).toContain(
        `attachment could not be read; its body is NOT in the reviewer prompt: ${missing}`
      );
      // …and exactly once: the readable attachments must not also warn.
      expect(started.stderr.split('\n').filter((l) => l.includes('could not be read')).length).toBe(
        1
      );

      // The prompt FILE is not the contract — the reviewer CLI's argv is.
      // The marker has to survive the handoff, or the reviewer is still the
      // one party left uninformed.
      const argv = await readFile(argvDump, 'utf-8');
      expect(argv).toContain('ATTACH_BODY_MARKER_PRESENT');
      expect(argv).toContain('ATTACH_BODY_MARKER_TRAILING');
      expect(argv).toContain('읽을 수 없');
      expect(argv).not.toContain(`--- ${missing} ---`);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(base, { recursive: true, force: true });
    }
  }, 30000);
});

// ---------------------------------------------------------------------
// Error paths that no test reached.
//
// Each of the three below is a HARD STOP the implementation went out of its
// way to build — a distinct exit code, a distinct diagnostic, and in two
// cases an explicit promise that nothing partial is left behind. None of
// that was under test, so any of it could have rotted without a signal.
//
// Every expectation here was measured against the current implementation
// first and then pinned; none of it was guessed from the comments.
// ---------------------------------------------------------------------

/**
 * A session with round 1 fully built (sealed mapping + anon bundle +
 * verdict) and round-2 raw responses staged, i.e. exactly the state
 * anonymize.sh is in when it must relabel round 1 into round 2's bundle.
 */
async function sessionWithBuiltRound1(): Promise<string> {
  const dir = await makeSession('raw');
  await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), { recursive: true });
  const build1 = await runScript(
    ANONYMIZE_SCRIPT,
    // biome-ignore format: one flag pair per line is unreadable here
    ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
     '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
    ''
  );
  if (build1.exitCode !== 0) {
    throw new Error(`round-1 build failed (rc=${build1.exitCode}): ${build1.stderr}`);
  }
  // anonymize.sh never creates verdict/ (agora.sh does), so stage it here.
  await mkdir(join(dir, 'verdict'), { recursive: true });
  await writeFile(join(dir, 'verdict/round-1.json'), verdictWith());
  return dir;
}

function buildRound2(dir: string): Promise<ScriptResult> {
  return runScript(
    ANONYMIZE_SCRIPT,
    // biome-ignore format: one flag pair per line is unreadable here
    ['--build', '--session-dir', dir, '--round', '2', '--seed', 'agora-1-r2',
     '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
    ''
  );
}

describe('anonymize.sh aborts round N when round N-1 exists but cannot be parsed', () => {
  // Positive control, and the whole reason the negatives below are not
  // vacuous: with round 1 intact the SAME round-2 build succeeds and writes
  // both trust-boundary artifacts. An implementation that simply never
  // produced a round-2 bundle would pass every negative and fail here.
  it('builds round 2 normally while the round-1 material is intact (positive control)', async () => {
    const dir = await sessionWithBuiltRound1();
    try {
      const result = await buildRound2(dir);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, 'anon/round-2.json'))).toBe(true);
      expect(existsSync(join(dir, 'SEALED/mapping/round-2.json'))).toBe(true);
      // The prior round really was relabelled in — otherwise "no bundle
      // written" below would be measuring a code path that never ran.
      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-2.json'), 'utf-8'));
      expect(bundle.prior_rounds.length).toBe(1);
      expect(bundle.prior_rounds[0].round).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // relabel_prior distinguishes "no prior round yet" (skip, normal) from
  // "prior round is there and unreadable" (abort). All three sealed inputs
  // it reads must trip the second branch, not the first — a corrupt mapping
  // that got treated as an absent round would silently hand the judge a
  // round-2 bundle with no round-1 signal in it at all.
  for (const [label, corrupt] of [
    ['the prior anon bundle', 'anon/round-1.json'],
    ['the prior sealed mapping', 'SEALED/mapping/round-1.json'],
    ['the prior verdict', 'verdict/round-1.json'],
  ] as const) {
    it(`exits 65 and writes no round-2 artifacts when ${label} is corrupt`, async () => {
      const dir = await sessionWithBuiltRound1();
      try {
        // Present but unparseable — the file must EXIST, or relabel_prior
        // takes its "no prior-round data" path (return 1) instead.
        expect(existsSync(join(dir, corrupt))).toBe(true);
        await writeFile(join(dir, corrupt), 'NOT JSON AT ALL');

        const result = await buildRound2(dir);
        // 65 (EX_DATAERR), NOT 1 — 1 is reserved for the fingerprint abort,
        // and the two demand different operator responses.
        expect(result.exitCode).toBe(65);
        expect(result.stderr).toContain('INTEGRITY');
        expect(result.stderr).toContain('round-1');

        // Nothing partial reaches a trust-boundary path. An orphaned sealed
        // mapping with no matching bundle is exactly the state the staging
        // scheme exists to prevent.
        expect(existsSync(join(dir, 'anon/round-2.json'))).toBe(false);
        expect(existsSync(join(dir, 'SEALED/mapping/round-2.json'))).toBe(false);
        // Round 1's own surviving artifacts are untouched by the abort.
        expect(existsSync(join(dir, 'SEALED/raw/round-2'))).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }, 30000);
  }
});

describe('judge.sh leaves no partial verdict when every rotation slot fails', () => {
  // Deliberately NOT `exit 1` stubs (the existing "exits 4 when every
  // rotation model fails" test already covers a dead CLI). Here every slot
  // RETURNS something and is rejected downstream — unparsable, then two
  // different schema violations — because that is the only shape in which a
  // premature write to out_file is observable at all. With `exit 1` stubs
  // there is nothing to write prematurely, so the no-partial-artifact
  // assertion would hold for an implementation that had lost the guarantee.
  //
  // Verified by mutation: adding `[ "$rc" -eq 0 ] && cp "$tmp" "$out_file"`
  // right after invoke_judge (i.e. writing before the checks settle) leaves
  // exit 4 intact — so the exit-code assertion alone passes the mutant — and
  // is caught only by the existsSync assertion below, which then finds a
  // schema-violating verdict sitting on the final path.
  it('exits 4 without creating out_file when all three slots return rejected output', async () => {
    const bin = await makeStubBin({
      // slot 1 (claude:claude-opus-5) — syntactically not JSON.
      claude: `printf '%s' 'not json at all'`,
      // slots 2 and 3 are both agy, told apart by model.
      agy: `case "$*" in
              *claude-opus-4-6-thinking*) printf '%s' '${BAD_ENUM_VERDICT}';;
              *) printf '%s' '${MISSING_FIELD_VERDICT}';;
            esac`,
    });
    const dir = join(tmpdir(), `agora-judge-nopartial-${Date.now()}`);
    await mkdir(join(dir, 'anon'), { recursive: true });
    await mkdir(join(dir, 'verdict'), { recursive: true });
    await writeFile(
      join(dir, 'anon/round-1.json'),
      JSON.stringify({ round: 1, topic: 't', reviewers: [] })
    );
    const outFile = join(dir, 'verdict/round-1.json');
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        [
          '--run',
          '--anon-file',
          join(dir, 'anon/round-1.json'),
          '--out-file',
          outFile,
          '--round',
          '1',
        ],
        '',
        { PATH: `${bin}:${process.env.PATH}` }
      );
      expect(result.exitCode).toBe(4);
      // THE assertion. Nothing rejected is ever allowed onto the final path.
      expect(existsSync(outFile)).toBe(false);

      // All three slots were genuinely tried and each was rejected for its
      // own reason — without this the test would also pass if the rotation
      // gave up after slot 1, which is a different bug with the same exit
      // code and the same absent out_file.
      expect(result.stderr).toContain('judge claude:claude-opus-5 returned unparsable output');
      expect(result.stderr).toContain(
        'judge agy:claude-opus-4-6-thinking returned a schema-violating verdict'
      );
      expect(result.stderr).toContain(
        'judge agy:gpt-oss-120b-medium returned a schema-violating verdict'
      );
      expect(result.stderr).toContain('every rotation model failed for round 1');

      // The verdict directory holds only the per-attempt audit logs the
      // script documents keeping — no verdict-shaped file of any name.
      const left = await readdir(join(dir, 'verdict'));
      expect(left.every((f) => f.startsWith('.judge-round-1-attempt-'))).toBe(true);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

// spec §5. validate_response is the gate that decides whether a vendor
// answered at all, and a response it wrongly ACCEPTS flows into the bundle
// and is judged as if it were a real opinion. Only the `counter: ''` case
// was covered; every other clause of the contract was unguarded.
describe('anonymize.sh validate_response rejects each spec §5 contract violation', () => {
  const CONTRACT_OK = {
    findings: [
      {
        id: 'F9',
        severity: 'HIGH',
        claim: '라벨 셔플이 라운드마다 재계산된다',
        evidence: '설계 §6',
        impact: '판정자가 동일 참여자를 추적하지 못한다',
        counter: '라운드별 재계산이 오히려 익명성을 강화한다',
        verdict: 'MODIFY',
      },
    ],
    overall: 'BUILD',
    rationale: '전반적으로 수용 가능하나 한 가지 수정이 필요하다.',
  };

  async function buildWith(agyResponse: unknown): Promise<{ dir: string; result: ScriptResult }> {
    const dir = await makeSession('raw');
    await writeFile(join(dir, 'SEALED/raw/round-1/agy.json'), JSON.stringify(agyResponse));
    const result = await runScript(
      ANONYMIZE_SCRIPT,
      // biome-ignore format: one flag pair per line is unreadable here
      ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
       '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
      ''
    );
    return { dir, result };
  }

  // Without this control every negative below could be satisfied by a
  // validate_response that rejects EVERYTHING — the reviewer count would sit
  // at 2 for the right and the wrong reason alike.
  it('accepts the unmodified contract and keeps all three reviewers (positive control)', async () => {
    const { dir, result } = await buildWith(CONTRACT_OK);
    try {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('failed the schema contract');
      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.reviewers.length).toBe(3);
      const mapping = JSON.parse(await readFile(join(dir, 'SEALED/mapping/round-1.json'), 'utf-8'));
      expect(Object.keys(mapping.map).length).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  // One clause of the contract broken per case, everything else left valid,
  // so a failure names the clause that regressed.
  const violations: Array<[string, unknown]> = [
    // `.overall | IN("BUILD","BUILD_WITH_CHANGES","REDESIGN","ABANDON")`
    ['overall carries a value outside the enum', { ...CONTRACT_OK, overall: 'SHIP_IT' }],
    // `.findings | type == "array"` — an object is truthy but not a list.
    ['findings is an object rather than an array', { ...CONTRACT_OK, findings: { F9: 'x' } }],
    // `.rationale | filled`
    ['rationale is the empty string', { ...CONTRACT_OK, rationale: '' }],
    // The byte-count form of that clause (`length > 0`) rejected '' but
    // ACCEPTED these: a response that says nothing still counted toward the
    // two-reviewer floor and still reached the judge. A space is not content.
    ['rationale is ASCII spaces only', { ...CONTRACT_OK, rationale: '   ' }],
    ['rationale is tabs and newlines only', { ...CONTRACT_OK, rationale: '\t\n ' }],
    // U+3000 IDEOGRAPHIC SPACE — the blank a Korean-writing reviewer (R000)
    // is most likely to emit, and the one an ASCII-only guard would miss.
    ['rationale is a single ideographic space', { ...CONTRACT_OK, rationale: '　' }],
    // Same clause, applied to the findings — checked separately because the
    // fix had to reach every text field, not just the top-level rationale.
    // `counter` in particular is the field the reviewer prompt singles out
    // as one that cannot be empty.
    [
      'a finding carries a whitespace-only counter',
      { ...CONTRACT_OK, findings: [{ ...CONTRACT_OK.findings[0], counter: '  ' }] },
    ],
    [
      'a finding carries a whitespace-only claim',
      { ...CONTRACT_OK, findings: [{ ...CONTRACT_OK.findings[0], claim: ' ' }] },
    ],
    [
      'a finding carries a whitespace-only evidence',
      { ...CONTRACT_OK, findings: [{ ...CONTRACT_OK.findings[0], evidence: '　' }] },
    ],
    // `.severity | IN("CRITICAL","HIGH","MEDIUM","LOW")`
    [
      'a finding carries a severity outside the enum',
      { ...CONTRACT_OK, findings: [{ ...CONTRACT_OK.findings[0], severity: 'BLOCKER' }] },
    ],
  ];

  // Negative control for the whitespace cases above: the rule is "contains
  // content", not "contains no whitespace". Without this, a fix that
  // rejected every string with a space in it — or trimmed and compared
  // against the untrimmed original — would satisfy every rejection case
  // above while breaking ordinary multi-word review prose.
  it('accepts text that is padded with whitespace but carries content', async () => {
    const { dir, result } = await buildWith({
      ...CONTRACT_OK,
      rationale: '  \n 여백이 앞뒤에 있으나 내용은 있다. \t ',
      findings: [{ ...CONTRACT_OK.findings[0], counter: ' 반론 내용 ' }],
    });
    try {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('failed the schema contract');
      const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
      expect(bundle.reviewers.length).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  for (const [label, response] of violations) {
    it(`treats a response as missing when ${label}`, async () => {
      const { dir, result } = await buildWith(response);
      try {
        // Rejection is not an abort: spec §11's two-reviewer floor is still
        // met by the other two vendors, so the round proceeds.
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('agy failed the schema contract, treating as missing');

        // The offending vendor is dropped from BOTH the bundle and the
        // sealed mapping — a label left in the mapping with no reviewer
        // behind it would desynchronise the next round's relabelling.
        const bundle = JSON.parse(await readFile(join(dir, 'anon/round-1.json'), 'utf-8'));
        expect(bundle.reviewers.length).toBe(2);
        const mapping = JSON.parse(
          await readFile(join(dir, 'SEALED/mapping/round-1.json'), 'utf-8')
        );
        expect(Object.keys(mapping.map).length).toBe(2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }, 30000);
  }
});

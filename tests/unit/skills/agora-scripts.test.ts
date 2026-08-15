import { describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
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

const BANNED_FINGERPRINT =
  /codex|omx|agy|gemini|claude -p|antigravity|opus|sonnet|gemini-3|gpt-oss|claude-|flash|SEALED|mapping|raw\//i;

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
      const text = await readFile(join(dir, 'anon/round-1.json'), 'utf-8');
      expect(text).not.toMatch(BANNED_FINGERPRINT);
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
      await writeFile(join(dir, 'verdict-round-1.json'), '');
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
      const b2 = JSON.parse(await readFile(join(dir, 'anon/round-2.json'), 'utf-8'));

      expect(b2.prior_rounds.length).toBe(1);
      expect(b2.prior_rounds[0].round).toBe(1);
      expect(b2.prior_rounds[0].verdict).toBe('BUILD_WITH_CHANGES');

      const invert = (m: Record<string, string>) =>
        Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
      const r2ByVendor = invert(m2.map);

      for (const prior of b2.prior_rounds[0].reviewers) {
        // Every prior label must be the CURRENT-round label of some vendor.
        expect(Object.values(r2ByVendor)).toContain(prior.label);
      }
      // And no prior entry keeps a stale round-1 label unless that vendor happens to
      // hold the same label in round 2.
      const staleOnly = Object.entries(m1.map)
        .filter(([label, vendor]) => r2ByVendor[vendor as string] !== label)
        .map(([label]) => label);
      const priorLabels = b2.prior_rounds[0].reviewers.map((r: { label: string }) => r.label);
      const stalePresent = staleOnly.filter(
        (l) => priorLabels.filter((p: string) => p === l).length > 1
      );
      expect(stalePresent).toEqual([]);
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

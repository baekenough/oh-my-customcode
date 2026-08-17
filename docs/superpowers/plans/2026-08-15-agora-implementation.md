# Agora 익명 다중턴 합의 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3벤더 CLI를 익명 A/B/C 라벨로 다중턴 상호검증시키고 로테이션 심판이 판정하는 `agora` 스킬을, Agent Teams 의존 없이 셸 스크립트 + 파일 상태 기반으로 구현합니다.

**Architecture:** `.claude/skills/agora/scripts/` 아래 4개 셸 스크립트(`agora.sh` 진입점·상태·종료판정, `reviewers.sh` 벤더 어댑터, `anonymize.sh` 정규화·셔플·라벨, `judge.sh` 심판 로테이션)가 파이프라인을 구성합니다. 익명화 경계는 프롬프트 지시가 아니라 **디렉토리 경계**(`SEALED/` vs `anon/`)로 유지하며, `judge.sh` 는 `SEALED/` 경로를 인자로도 환경변수로도 받지 않습니다. 검증은 셸 스크립트를 `bun test` 에서 bash 서브프로세스로 스폰해 stdin/stdout/exitCode 를 대조하는 기존 `tests/unit/core/hooks-scripts.test.ts` 패턴을 그대로 재사용합니다.

**Tech Stack:** bash, jq, bun test, Claude Code skills/agents

**Spec:** docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md

## Global Constraints

- 리뷰어는 3벤더 고정입니다: `claude -p --model claude-opus-4-8`, `omx exec`, `agy -p --model gemini-3.1-pro-high` (spec REQ-1).
- 익명 라벨 A/B/C 는 라운드마다 셔플하며, 과거 라운드 의견은 현재 라운드 매핑으로 재라벨링해 제시합니다 (spec REQ-2, §6).
- 심판은 리뷰어와 별도 프로세스이며 매 라운드 모델을 로테이션합니다: R1 `claude:claude-opus-5`, R2 `agy:claude-opus-4-6-thinking`, R3 `agy:gpt-oss-120b-medium`, R4부터 순환 (spec REQ-3).
- 심판 3종은 리뷰어 3종과 모델 단위로 겹치지 않습니다 (spec REQ-3).
- 판정 체계는 `BUILD | BUILD_WITH_CHANGES | REDESIGN | ABANDON`, 심각도는 `CRITICAL | HIGH | MEDIUM | LOW`, finding 처분은 `KEEP | MODIFY | REJECT` 입니다 (spec REQ-4, §5).
- 합의도는 `UNANIMOUS | MAJORITY | SPLIT | NONE` 이며 `verdict` 와 독립 축입니다 (spec §8).
- 종료 코드는 `CONSENSUS | STALLED | MAX_ROUNDS | USER | CONTINUE` 5종이며, `UNANIMOUS` + `REDESIGN`/`ABANDON` 은 합의 종료가 **아닙니다** (spec §9).
- 종료 판정은 파일시스템·네트워크에 접근하지 않는 순수 함수로 구현합니다 — state.json 을 stdin 으로 받아 판정 코드를 stdout 으로 냅니다 (spec §3, §9).
- `judge.sh` 는 `SEALED/` 경로를 인자로도 환경변수로도 받지 않습니다 (spec §4).
- `anon/round-N.json` 에 벤더 지문이 검출되면 재시도 없이 **즉시 중단**합니다 — 신뢰 경계 붕괴는 복구 대상이 아닙니다 (spec §11).
- 리뷰어 실패/타임아웃/스키마불일치는 1회 재시도 후 결측 처리하며, **2명 이상 결측 시 라운드를 중단**합니다 (spec §11).
- 리뷰어 타임아웃은 300s 이며, macOS 에 GNU `timeout` 이 없으므로 `gtimeout` 가용성을 `command -v` 로 사전 확인하고 없으면 백그라운드 실행 + `wait` 조합으로 처리합니다 (spec §11, R005).
- `prior_rounds[]` 는 직전 2라운드만 전달합니다 (spec §11 비용 통제).
- 매 라운드 사용자 게이트가 기본이며 `--auto` 로 생략할 수 있습니다. 게이트 `e` 는 심판 의제에 **추가만** 가능하며 덮어쓰지 못합니다 (spec REQ-8, §10).
- 게이트 표시에는 라벨만 노출하며 벤더는 최종 `report.md` 에서만 공개합니다 (spec §10).
- `.claude/skills/agora/SKILL.md` 와 `.claude/agents/agora-runner.md` 는 R010 Protected Paths 이므로 **`mgr-creator` 에 위임**해 생성합니다.
- `context: fork` 는 사용하지 않습니다 (spec §12 기타 정합).
- 위임 단위는 라운드 1개 = 위임 1건입니다 (spec §12, R020).
- 문서·주석은 한국어(합쇼체), 코드·식별자·커밋 메시지는 영어로 작성합니다 (R000).
- 모든 git 작업은 `mgr-gitnerd` 에 위임합니다 (R010).

---

### Task 1: 종료 판정 순수 함수 (`decide_stop`)

**Files:**
- Create: `.claude/skills/agora/scripts/agora.sh`
- Create: `tests/fixtures/agora/state-consensus.json`
- Create: `tests/fixtures/agora/state-stalled.json`
- Create: `tests/fixtures/agora/state-max-rounds.json`
- Create: `tests/fixtures/agora/state-user.json`
- Create: `tests/fixtures/agora/state-continue.json`
- Create: `tests/fixtures/agora/state-unanimous-redesign.json`
- Test: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 Task)
- Produces:
  - CLI 진입: `bash agora.sh --decide-stop` — stdin 으로 state.json 전문을 받아 `CONSENSUS|STALLED|MAX_ROUNDS|USER|CONTINUE` 중 하나를 개행 포함해 stdout 출력, exit 0
  - 셸 함수: `decide_stop()` — stdin 소비, 판정 코드 stdout 출력. 파일시스템·네트워크 미접근
  - 테스트 헬퍼: `runScript(scriptPath: string, args: string[], stdinInput: string, env?: Record<string,string>, cwd?: string): Promise<ScriptResult>` — `tests/unit/core/hooks-scripts.test.ts` 의 `runHookScript` 와 동일한 spawn/stdin/수집 본체에 `args` 배열만 추가한 것

- [ ] **Step 1: 실패하는 테스트 작성**

먼저 픽스처 6종을 만듭니다.

`tests/fixtures/agora/state-consensus.json`:
```json
{
  "round": 3,
  "max_rounds": 5,
  "mode": "gated",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 9, "max_severity": "CRITICAL", "tokens": 94000 },
    { "round": 2, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 2, "max_severity": "HIGH", "tokens": 71000 },
    { "round": 3, "verdict": "BUILD_WITH_CHANGES", "consensus": "UNANIMOUS", "new_findings": 1, "max_severity": "LOW", "tokens": 66000 }
  ],
  "stop": null
}
```

`tests/fixtures/agora/state-stalled.json`:
```json
{
  "round": 4,
  "max_rounds": 6,
  "mode": "auto",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 7, "max_severity": "CRITICAL", "tokens": 90000 },
    { "round": 2, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 3, "max_severity": "HIGH", "tokens": 80000 },
    { "round": 3, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 0, "max_severity": "HIGH", "tokens": 70000 },
    { "round": 4, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 0, "max_severity": "HIGH", "tokens": 68000 }
  ],
  "stop": null
}
```

`tests/fixtures/agora/state-max-rounds.json`:
```json
{
  "round": 5,
  "max_rounds": 5,
  "mode": "auto",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 8, "max_severity": "CRITICAL", "tokens": 92000 },
    { "round": 2, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 5, "max_severity": "CRITICAL", "tokens": 88000 },
    { "round": 3, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 4, "max_severity": "HIGH", "tokens": 79000 },
    { "round": 4, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 2, "max_severity": "MEDIUM", "tokens": 74000 },
    { "round": 5, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 1, "max_severity": "MEDIUM", "tokens": 71000 }
  ],
  "stop": null
}
```

`tests/fixtures/agora/state-user.json`:
```json
{
  "round": 2,
  "max_rounds": 5,
  "mode": "gated",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 6, "max_severity": "CRITICAL", "tokens": 91000 },
    { "round": 2, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 3, "max_severity": "HIGH", "tokens": 77000 }
  ],
  "stop": "USER"
}
```

`tests/fixtures/agora/state-continue.json`:
```json
{
  "round": 2,
  "max_rounds": 5,
  "mode": "gated",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 9, "max_severity": "CRITICAL", "tokens": 94000 },
    { "round": 2, "verdict": "BUILD_WITH_CHANGES", "consensus": "MAJORITY", "new_findings": 2, "max_severity": "HIGH", "tokens": 71000 }
  ],
  "stop": null
}
```

`tests/fixtures/agora/state-unanimous-redesign.json`:
```json
{
  "round": 2,
  "max_rounds": 5,
  "mode": "gated",
  "history": [
    { "round": 1, "verdict": "REDESIGN", "consensus": "SPLIT", "new_findings": 9, "max_severity": "CRITICAL", "tokens": 94000 },
    { "round": 2, "verdict": "REDESIGN", "consensus": "UNANIMOUS", "new_findings": 4, "max_severity": "CRITICAL", "tokens": 82000 }
  ],
  "stop": null
}
```

`tests/unit/skills/agora-scripts.test.ts` 를 새로 만들고, 파일 상단에 헬퍼를 둡니다.

```ts
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
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], await stateFixture('state-consensus'));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('CONSENSUS');
  });

  it('returns STALLED when two consecutive rounds add no findings at an unchanged max_severity', async () => {
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], await stateFixture('state-stalled'));
    expect(result.stdout.trim()).toBe('STALLED');
  });

  it('returns MAX_ROUNDS when round equals max_rounds', async () => {
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], await stateFixture('state-max-rounds'));
    expect(result.stdout.trim()).toBe('MAX_ROUNDS');
  });

  it('returns USER when stop is already set to USER by the gate', async () => {
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], await stateFixture('state-user'));
    expect(result.stdout.trim()).toBe('USER');
  });

  it('returns CONTINUE for an ordinary in-progress session', async () => {
    const result = await runScript(AGORA_SCRIPT, ['--decide-stop'], await stateFixture('state-continue'));
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "returns CONSENSUS when consensus is UNANIMOUS"`
Expected: FAIL with `bash: .claude/skills/agora/scripts/agora.sh: No such file or directory` 로 인해 `expect(result.stdout.trim()).toBe('CONSENSUS')` 가 빈 문자열과 비교되어 실패합니다.

- [ ] **Step 3: 최소 구현**

`.claude/skills/agora/scripts/agora.sh`:
```bash
#!/usr/bin/env bash
# agora.sh — entry point, round loop, session state, stop decision.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md
set -euo pipefail

# ---------------------------------------------------------------------------
# decide_stop — PURE function (spec §9).
# Reads a state.json document on stdin, writes exactly one of
# CONSENSUS | STALLED | MAX_ROUNDS | USER | CONTINUE on stdout.
# Touches neither the filesystem nor the network so bun test can call it directly.
# ---------------------------------------------------------------------------
decide_stop() {
  jq -r '
    def last_round: (.history | length) as $n | if $n == 0 then null else .history[$n - 1] end;
    def quiet($i):
      ($i > 0)
      and (.history[$i].new_findings == 0)
      and (.history[$i].max_severity == .history[$i - 1].max_severity);

    (.history | length) as $n
    | if (.stop == "USER") then "USER"
      elif ($n > 0
            and (last_round.consensus == "UNANIMOUS")
            and (last_round.verdict == "BUILD" or last_round.verdict == "BUILD_WITH_CHANGES"))
        then "CONSENSUS"
      elif ($n >= 3 and quiet($n - 1) and quiet($n - 2)) then "STALLED"
      elif ($n > 0 and (.round >= .max_rounds)) then "MAX_ROUNDS"
      else "CONTINUE"
      end
  '
}
# --- end decide_stop ---

main() {
  case "${1:---help}" in
    --decide-stop)
      decide_stop
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  agora.sh --decide-stop            Read state.json on stdin, print the stop code.
USAGE
      ;;
    *)
      printf 'agora.sh: unknown option %s\n' "$1" >&2
      return 64
      ;;
  esac
}

main "$@"
```

`chmod +x .claude/skills/agora/scripts/agora.sh` 를 실행합니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts`
Expected: `agora.sh --decide-stop` describe 블록 전부 PASS.

- [ ] **Step 5: 커밋**

`mgr-gitnerd` 에 위임합니다. 허용 작업: 아래 명령 실행. 금지 작업: force-push, develop 직접 push.

```bash
git add .claude/skills/agora/scripts/agora.sh \
        tests/fixtures/agora/ \
        tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add pure stop-decision function with 5 termination codes

Implements spec §9: decide_stop reads state.json on stdin and prints
CONSENSUS|STALLED|MAX_ROUNDS|USER|CONTINUE. UNANIMOUS+REDESIGN and
UNANIMOUS+ABANDON deliberately resolve to CONTINUE, not CONSENSUS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 시드 기반 셔플과 라벨 매핑

**Files:**
- Create: `.claude/skills/agora/scripts/anonymize.sh`
- Modify: `tests/unit/skills/agora-scripts.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: 없음 (`agora.sh` 와 독립)
- Produces:
  - 셸 함수 `hash_int <seed> <counter>` — `<seed>:<counter>` 의 SHA-256 상위 8 hex 를 10진 정수로 stdout 출력
  - 셸 함수 `shuffle_labels <seed> <vendor_id>...` — Fisher-Yates 로 셔플한 뒤 `{"A":"<vendor_id>","B":...}` JSON 객체를 stdout 출력. 인자 수가 1~3 이며 라벨은 항상 `A`,`B`,`C` 순으로 부여
  - 셸 함수 `vendor_id <slug>` — `claude`→`claude:claude-opus-4-8`, `omx`→`omx:default`, `agy`→`agy:gemini-3.1-pro-high`
  - 셸 함수 `vendor_slug <vendor_id>` — 위의 역함수
  - CLI 진입: `bash anonymize.sh --shuffle <seed> <vendor_id>...` → 매핑 JSON 1줄
  - CLI 진입: `bash anonymize.sh --shuffle-many <count> <vendor_id>...` → seed `agora-shuffle-<k>` (k = 1..count) 로 count 줄의 매핑 JSON. 3000회 반복 테스트가 bash 프로세스를 3000번 띄우지 않도록 하는 배치 모드

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/skills/agora-scripts.test.ts` 에 추가합니다.

```ts
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
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r1', ...VENDOR_IDS], '');
    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout.trim());
    expect(Object.keys(map).sort()).toEqual(['A', 'B', 'C']);
    expect(Object.values(map).sort()).toEqual([...VENDOR_IDS].sort());
  });

  // spec §12-(3): the audit-ability claim in §7 only holds if the shuffle is reproducible.
  it('produces an identical map for the same seed (reproducibility)', async () => {
    const a = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1755230400-r2', ...VENDOR_IDS], '');
    const b = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1755230400-r2', ...VENDOR_IDS], '');
    expect(a.stdout.trim()).toBe(b.stdout.trim());
    expect(a.stdout.trim().length).toBeGreaterThan(0);
  });

  it('produces different maps across a range of seeds (not a constant permutation)', async () => {
    const seen = new Set<string>();
    for (let k = 1; k <= 20; k++) {
      const r = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', `agora-seed-${k}-r1`, ...VENDOR_IDS], '');
      seen.add(r.stdout.trim());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  // spec §12-(2): if a vendor skews toward a label, the judge can infer identity from position.
  it('distributes labels uniformly over 3000 shuffles', async () => {
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle-many', '3000', ...VENDOR_IDS], '');
    expect(result.exitCode).toBe(0);

    const lines = result.stdout.trim().split('\n');
    expect(lines.length).toBe(3000);

    const counts: Record<string, Record<string, number>> = {};
    for (const vendor of VENDOR_IDS) counts[vendor] = { A: 0, B: 0, C: 0 };

    for (const line of lines) {
      const map = JSON.parse(line) as Record<string, string>;
      for (const [label, vendor] of Object.entries(map)) {
        counts[vendor][label] += 1;
      }
    }

    // Expected 1000 per cell; ±15% tolerance keeps this deterministic-stable, not flaky.
    for (const vendor of VENDOR_IDS) {
      for (const label of ['A', 'B', 'C']) {
        expect(counts[vendor][label]).toBeGreaterThan(850);
        expect(counts[vendor][label]).toBeLessThan(1150);
      }
    }
  });

  // spec §7: a missing vendor drops out of `map`, leaving fewer than 3 entries.
  it('emits a 2-entry map when only two vendors responded', async () => {
    const two = [VENDOR_IDS[0], VENDOR_IDS[2]];
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r3', ...two], '');
    const map = JSON.parse(result.stdout.trim());
    expect(Object.keys(map).sort()).toEqual(['A', 'B']);
    expect(Object.values(map).sort()).toEqual([...two].sort());
  });

  it('emits a 1-entry map when only one vendor responded', async () => {
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r4', VENDOR_IDS[1]], '');
    const map = JSON.parse(result.stdout.trim());
    expect(map).toEqual({ A: VENDOR_IDS[1] });
  });

  it('exits non-zero when no vendors are supplied', async () => {
    const result = await runScript(ANONYMIZE_SCRIPT, ['--shuffle', 'agora-1-r5'], '');
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "assigns every vendor exactly one label"`
Expected: FAIL with `No such file or directory` — `anonymize.sh` 가 아직 없어 `JSON.parse('')` 가 `Unexpected end of JSON input` 으로 던집니다.

- [ ] **Step 3: 최소 구현**

`.claude/skills/agora/scripts/anonymize.sh`:
```bash
#!/usr/bin/env bash
# anonymize.sh — normalize reviewer responses, shuffle labels, seal the mapping.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §5 §6 §7
set -euo pipefail

# ---------------------------------------------------------------------------
# Vendor identity helpers (spec §7 `map` values are "{cli}:{model}" strings).
# ---------------------------------------------------------------------------
vendor_id() {
  case "$1" in
    claude) printf 'claude:claude-opus-4-8' ;;
    omx)    printf 'omx:default' ;;
    agy)    printf 'agy:gemini-3.1-pro-high' ;;
    *)      printf 'anonymize.sh: unknown vendor slug %s\n' "$1" >&2; return 65 ;;
  esac
}

vendor_slug() {
  case "$1" in
    claude:claude-opus-4-8)     printf 'claude' ;;
    omx:default)                printf 'omx' ;;
    agy:gemini-3.1-pro-high)    printf 'agy' ;;
    *)                          printf 'anonymize.sh: unknown vendor id %s\n' "$1" >&2; return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# hash_int <seed> <counter> — deterministic non-negative integer.
# ---------------------------------------------------------------------------
hash_int() {
  local hex
  hex=$(printf '%s:%s' "$1" "$2" | shasum -a 256 | cut -c1-8)
  printf '%d' "$((16#$hex))"
}

# ---------------------------------------------------------------------------
# shuffle_labels <seed> <vendor_id>... — seeded Fisher-Yates, then A/B/C in order.
# ---------------------------------------------------------------------------
shuffle_labels() {
  local seed="$1"; shift
  if [ "$#" -eq 0 ]; then
    printf 'anonymize.sh: shuffle_labels needs at least one vendor\n' >&2
    return 64
  fi

  local vendors=("$@")
  local n=${#vendors[@]}
  local i j r tmp
  for (( i = n - 1; i > 0; i-- )); do
    r=$(hash_int "$seed" "$i")
    j=$(( r % (i + 1) ))
    tmp="${vendors[$i]}"
    vendors[$i]="${vendors[$j]}"
    vendors[$j]="$tmp"
  done

  local labels=(A B C)
  local out='{'
  for (( i = 0; i < n; i++ )); do
    [ "$i" -gt 0 ] && out+=','
    out+="\"${labels[$i]}\":\"${vendors[$i]}\""
  done
  out+='}'
  printf '%s\n' "$out"
}

main() {
  local mode="${1:---help}"
  case "$mode" in
    --shuffle)
      shift
      local seed="$1"; shift
      shuffle_labels "$seed" "$@"
      ;;
    --shuffle-many)
      shift
      local count="$1"; shift
      local k
      for (( k = 1; k <= count; k++ )); do
        shuffle_labels "agora-shuffle-$k" "$@"
      done
      ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  anonymize.sh --shuffle <seed> <vendor_id>...
  anonymize.sh --shuffle-many <count> <vendor_id>...
USAGE
      ;;
    *)
      printf 'anonymize.sh: unknown option %s\n' "$mode" >&2
      return 64
      ;;
  esac
}

main "$@"
```

`chmod +x .claude/skills/agora/scripts/anonymize.sh` 를 실행합니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "anonymize.sh shuffle"`
Expected: 8개 케이스 전부 PASS. 3000회 배치는 단일 bash 프로세스이므로 수 초 내에 끝납니다.

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/scripts/anonymize.sh tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add seeded Fisher-Yates label shuffle

Implements spec §7: shuffle_labels derives its permutation from a SHA-256
seed hash so the mapping is reproducible for post-hoc audit. Missing vendors
simply shrink the map below three entries.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 정규화와 익명 번들 생성

**Files:**
- Modify: `.claude/skills/agora/scripts/anonymize.sh`
- Create: `tests/fixtures/agora/raw/round-1/claude.json`
- Create: `tests/fixtures/agora/raw/round-1/omx.json`
- Create: `tests/fixtures/agora/raw/round-1/agy.json`
- Create: `tests/fixtures/agora/raw-leaky/round-1/claude.json`
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `shuffle_labels <seed> <vendor_id>...`, `vendor_id <slug>`, `vendor_slug <vendor_id>`
- Produces:
  - 셸 함수 `validate_response <file>` — spec §5 필수 필드/enum 을 만족하면 exit 0
  - 셸 함수 `normalize_response <file>` — 화이트리스트 필드만 남긴 compact JSON 을 stdout 출력
  - 셸 함수 `assert_no_fingerprint <file>` — 금칙 패턴 검출 시 stderr 에 `AGORA_FINGERPRINT_DETECTED: <file>` 출력 후 exit 1
  - 셸 함수 `relabel_prior <session_dir> <current_round> <prior_round>` — 재라벨링된 `prior_rounds[]` 원소 1개를 stdout 출력
  - CLI 진입: `bash anonymize.sh --build --session-dir <dir> --round <N> --seed <seed> --topic <문자열> --attachments <JSON배열> --agenda <JSON배열>` → `<dir>/SEALED/mapping/round-N.json` 과 `<dir>/anon/round-N.json` 기록. 지문 검출 시 exit 1

- [ ] **Step 1: 실패하는 테스트 작성**

픽스처 4종을 만듭니다.

`tests/fixtures/agora/raw/round-1/claude.json`:
```json
{
  "findings": [
    {
      "id": "F1",
      "severity": "CRITICAL",
      "claim": "제안된 상태 파일이 동시 라운드 실행에서 경합한다",
      "evidence": "state.json 이 단일 경로이며 파일 잠금 기술이 없음 (설계 §9)",
      "impact": "두 세션이 같은 날짜 디렉토리를 쓰면 라운드 카운터가 덮어써짐",
      "counter": "세션 디렉토리에 HHmmss 가 포함되므로 실제 충돌 확률은 낮음",
      "verdict": "MODIFY"
    }
  ],
  "overall": "BUILD_WITH_CHANGES",
  "rationale": "핵심 구조는 타당하나 상태 경합과 실패 경로에 보강이 필요함. 나머지는 수용 가능하다."
}
```

`tests/fixtures/agora/raw/round-1/omx.json`:
```json
{
  "findings": [],
  "overall": "BUILD",
  "rationale": "설계가 요구사항을 모두 덮고 있으며 추가 지적 사항이 없다. 즉시 착수 가능하다."
}
```

`tests/fixtures/agora/raw/round-1/agy.json`:
```json
{
  "findings": [
    {
      "id": "F2",
      "severity": "HIGH",
      "claim": "롤백 경로가 정의되지 않았다",
      "evidence": "설계 §11 실패 처리 표에 롤백 항목이 없음",
      "impact": "중간 실패 시 부분 산출물이 남아 다음 실행을 오염시킨다",
      "counter": "세션 디렉토리가 매번 새로 생성되므로 오염 범위는 세션 내로 제한된다",
      "verdict": "MODIFY"
    }
  ],
  "overall": "REDESIGN",
  "rationale": "실패 경로 설계가 부족하여 현 초안으로는 운영 투입이 어렵다. 재작성을 권한다."
}
```

`tests/fixtures/agora/raw-leaky/round-1/claude.json` — 지문이 본문에 섞인 응답입니다.
```json
{
  "findings": [
    {
      "id": "F1",
      "severity": "HIGH",
      "claim": "설계가 모델 능력에 과도하게 의존한다",
      "evidence": "As Claude Opus noted earlier, the draft assumes deep reasoning",
      "impact": "저사양 모델로 대체하면 품질이 급락한다",
      "counter": "심판 로테이션이 능력 편차를 부분적으로 상쇄한다",
      "verdict": "MODIFY"
    }
  ],
  "overall": "BUILD_WITH_CHANGES",
  "rationale": "구조는 수용 가능하나 모델 의존성을 낮출 필요가 있다. 보강 후 진행하면 된다."
}
```

테스트를 추가합니다.

```ts
import { mkdir, cp, rm, writeFile } from 'node:fs/promises';

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
          '--session-dir', dir,
          '--round', '1',
          '--seed', 'agora-1755230400-r1',
          '--topic', '세션 메모리를 SQLite로 이전할 것인가',
          '--attachments', '[]',
          '--agenda', '[]',
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
        ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
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
        ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
        ''
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('AGORA_FINGERPRINT_DETECTED');
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
        ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
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
          findings: [{ id: 'F9', severity: 'HIGH', claim: 'x', evidence: 'y', impact: 'z', counter: '', verdict: 'MODIFY' }],
          overall: 'BUILD',
          rationale: 'no counter supplied',
        })
      );

      const result = await runScript(
        ANONYMIZE_SCRIPT,
        ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
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
        ['--build', '--session-dir', dir, '--round', '1', '--seed', 'agora-1-r1',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
        ''
      );
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-2'), { recursive: true });
      await writeFile(join(dir, 'verdict-round-1.json'), '');
      await mkdir(join(dir, 'verdict'), { recursive: true });
      await writeFile(
        join(dir, 'verdict/round-1.json'),
        JSON.stringify({ round: 1, verdict: 'BUILD_WITH_CHANGES', draft: '## 통합 초안 1' })
      );

      await runScript(
        ANONYMIZE_SCRIPT,
        ['--build', '--session-dir', dir, '--round', '2', '--seed', 'agora-1-r2',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '["F1 근거 제시"]'],
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
      const stalePresent = staleOnly.filter((l) => priorLabels.filter((p: string) => p === l).length > 1);
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
          await cp(join(dir, 'SEALED/raw/round-1'), join(dir, `SEALED/raw/round-${n}`), { recursive: true });
        }
        await writeFile(
          join(dir, `verdict/round-${n}.json`),
          JSON.stringify({ round: n, verdict: 'BUILD_WITH_CHANGES', draft: `## 통합 초안 ${n}` })
        );
        await runScript(
          ANONYMIZE_SCRIPT,
          ['--build', '--session-dir', dir, '--round', String(n), '--seed', `agora-1-r${n}`,
           '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
          ''
        );
      }
      await cp(join(dir, 'SEALED/raw/round-1'), join(dir, 'SEALED/raw/round-4'), { recursive: true });
      await runScript(
        ANONYMIZE_SCRIPT,
        ['--build', '--session-dir', dir, '--round', '4', '--seed', 'agora-1-r4',
         '--topic', '상태 저장 방식 재검토', '--attachments', '[]', '--agenda', '[]'],
        ''
      );

      const b4 = JSON.parse(await readFile(join(dir, 'anon/round-4.json'), 'utf-8'));
      expect(b4.prior_rounds.map((p: { round: number }) => p.round)).toEqual([2, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "writes both the sealed mapping"`
Expected: FAIL with `anonymize.sh: unknown option --build` (exit 64) — `expect(result.exitCode).toBe(0)` 가 64 와 비교되어 실패합니다.

- [ ] **Step 3: 최소 구현**

`anonymize.sh` 의 `main()` 위에 아래를 추가하고, `main()` 의 `case` 에 `--build` 분기를 넣습니다.

```bash
# ---------------------------------------------------------------------------
# Fingerprint guard (spec §12-(1)). Case-insensitive; a hit aborts the session.
# ---------------------------------------------------------------------------
AGORA_BANNED_PATTERNS='codex|omx|agy|gemini|claude -p|antigravity|opus|sonnet|gemini-3|gpt-oss|claude-|flash|SEALED|mapping|raw/'

assert_no_fingerprint() {
  local file="$1"
  if LC_ALL=C command grep -Eiq "$AGORA_BANNED_PATTERNS" "$file"; then
    printf 'AGORA_FINGERPRINT_DETECTED: %s\n' "$file" >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# validate_response <file> — spec §5 contract. Exit 0 when the contract holds.
# ---------------------------------------------------------------------------
validate_response() {
  jq -e '
    (type == "object")
    and (.overall | IN("BUILD","BUILD_WITH_CHANGES","REDESIGN","ABANDON"))
    and (.rationale | type == "string" and (length > 0))
    and (.findings | type == "array")
    and (.findings | all(
              (.id       | type == "string" and (length > 0))
          and (.severity | IN("CRITICAL","HIGH","MEDIUM","LOW"))
          and (.claim    | type == "string" and (length > 0))
          and (.evidence | type == "string" and (length > 0))
          and (.impact   | type == "string" and (length > 0))
          and (.counter  | type == "string" and (length > 0))
          and (.verdict  | IN("KEEP","MODIFY","REJECT"))
        ))
  ' "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# normalize_response <file> — keep only the spec §5 whitelist (REQ-7).
# ---------------------------------------------------------------------------
normalize_response() {
  jq -c '{
    findings: [ .findings[] | {id, severity, claim, evidence, impact, counter, verdict} ],
    overall: .overall,
    rationale: .rationale
  }' "$1"
}

# ---------------------------------------------------------------------------
# relabel_prior <session_dir> <current_round> <prior_round> — spec §6.
# vendor = map[M]⁻¹(label_M); label_N = map[N]⁻¹(vendor)
# ---------------------------------------------------------------------------
relabel_prior() {
  local dir="$1" cur="$2" prior="$3"
  local map_prior="$dir/SEALED/mapping/round-$prior.json"
  local map_cur="$dir/SEALED/mapping/round-$cur.json"
  local bundle_prior="$dir/anon/round-$prior.json"
  local verdict_prior="$dir/verdict/round-$prior.json"

  [ -f "$map_prior" ] && [ -f "$map_cur" ] && [ -f "$bundle_prior" ] || return 1

  local verdict_json='{"verdict":"","draft":""}'
  if [ -f "$verdict_prior" ]; then
    verdict_json=$(jq -c '{verdict: (.verdict // ""), draft: (.draft // "")}' "$verdict_prior")
  fi

  jq -c -n \
    --argjson mp "$(jq -c '.map' "$map_prior")" \
    --argjson mc "$(jq -c '.map' "$map_cur")" \
    --argjson bp "$(jq -c '.' "$bundle_prior")" \
    --argjson vd "$verdict_json" \
    --argjson rn "$prior" '
      ($mc | to_entries | map({key: .value, value: .key}) | from_entries) as $curByVendor
      | {
          round: $rn,
          reviewers: [
            $bp.reviewers[]
            | ($mp[.label]) as $vendor
            | select($vendor != null and $curByVendor[$vendor] != null)
            | { label: $curByVendor[$vendor], overall: .overall, rationale: .rationale }
          ] | sort_by(.label),
          verdict: $vd.verdict,
          draft: $vd.draft
        }
    '
}

# ---------------------------------------------------------------------------
# build_bundle — normalize → shuffle → label → seal mapping → emit anon bundle.
# ---------------------------------------------------------------------------
build_bundle() {
  local dir='' round='' seed='' topic='' attachments='[]' agenda='[]'
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir)  dir="$2";         shift 2 ;;
      --round)        round="$2";       shift 2 ;;
      --seed)         seed="$2";        shift 2 ;;
      --topic)        topic="$2";       shift 2 ;;
      --attachments)  attachments="$2"; shift 2 ;;
      --agenda)       agenda="$2";      shift 2 ;;
      *) printf 'anonymize.sh: unknown build option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] && [ -n "$seed" ] || {
    printf 'anonymize.sh: --session-dir, --round and --seed are required\n' >&2
    return 64
  }

  local raw_dir="$dir/SEALED/raw/round-$round"
  local work; work=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" RETURN

  local present=()
  local slug id
  for slug in claude omx agy; do
    local raw="$raw_dir/$slug.json"
    [ -f "$raw" ] || continue
    validate_response "$raw" || {
      printf 'anonymize.sh: %s failed the schema contract, treating as missing\n' "$slug" >&2
      continue
    }
    id=$(vendor_id "$slug")
    normalize_response "$raw" > "$work/$slug.json"
    present+=("$id")
  done

  [ "${#present[@]}" -gt 0 ] || {
    printf 'anonymize.sh: no valid reviewer response for round %s\n' "$round" >&2
    return 66
  }

  local map_json
  map_json=$(shuffle_labels "$seed" "${present[@]}")

  mkdir -p "$dir/SEALED/mapping" "$dir/anon"
  jq -n --argjson r "$round" --arg s "$seed" --argjson m "$map_json" \
    '{round: $r, seed: $s, map: $m}' > "$dir/SEALED/mapping/round-$round.json"

  # reviewers[] — always sorted by label (spec §6).
  local reviewers='[]'
  local label
  for label in A B C; do
    id=$(printf '%s' "$map_json" | jq -r --arg l "$label" '.[$l] // empty')
    [ -n "$id" ] || continue
    slug=$(vendor_slug "$id")
    reviewers=$(jq -c --arg l "$label" --slurpfile body "$work/$slug.json" --argjson acc "$reviewers" \
      -n '$acc + [{label: $l, findings: $body[0].findings, overall: $body[0].overall, rationale: $body[0].rationale}]')
  done

  # prior_rounds[] — the two most recent rounds only (spec §11).
  local priors='[]' p
  for p in $(seq $(( round - 2 > 1 ? round - 2 : 1 )) $(( round - 1 ))); do
    [ "$p" -ge 1 ] || continue
    local entry
    if entry=$(relabel_prior "$dir" "$round" "$p" 2>/dev/null); then
      priors=$(jq -c --argjson acc "$priors" --argjson e "$entry" -n '$acc + [$e]')
    fi
  done

  local out="$dir/anon/round-$round.json"
  jq -n \
    --argjson r "$round" \
    --arg t "$topic" \
    --argjson att "$attachments" \
    --argjson ag "$agenda" \
    --argjson rv "$reviewers" \
    --argjson pr "$priors" \
    '{round: $r, topic: $t, attachments: $att, agenda: $ag, reviewers: $rv, prior_rounds: $pr}' \
    > "$out"

  if ! assert_no_fingerprint "$out"; then
    rm -f "$out"
    return 1
  fi
  return 0
}
```

`main()` 의 `case` 에 분기를 추가합니다.
```bash
    --build)
      shift
      build_bundle "$@"
      ;;
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "anonymize.sh --build"`
Expected: 7개 케이스 전부 PASS. 특히 "produces a bundle carrying no vendor fingerprint whatsoever" 와 "aborts with a fingerprint error" 가 함께 통과해야 합니다 — 전자만 통과하면 검사기가 아무것도 안 하고 있을 수 있습니다.

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/scripts/anonymize.sh \
        tests/fixtures/agora/raw tests/fixtures/agora/raw-leaky \
        tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): normalize reviewer responses into anonymous bundles

Implements spec §5/§6/§12-(1): whitelist normalization, seeded labelling,
prior-round relabelling under the current mapping, and a deterministic
fingerprint guard that aborts instead of retrying on a leak.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 리뷰어 어댑터

**Files:**
- Create: `.claude/skills/agora/scripts/reviewers.sh`
- Create: `.claude/skills/agora/scripts/response-schema.json`
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: 없음 (원문 기록만 담당하며 `anonymize.sh` 가 뒤이어 소비)
- Produces:
  - 셸 함수 `run_with_timeout <seconds> <cmd>...` — `gtimeout` 이 있으면 그것을, 없으면 백그라운드 + `wait` + watchdog `kill` 조합을 사용. 타임아웃 시 exit 124
  - 셸 함수 `call_vendor <slug> <prompt_file> <out_file>` — 1회 재시도 포함, 성공 시 exit 0 및 `<out_file>` 기록, 결측 시 exit 1 및 파일 미생성
  - CLI 진입: `bash reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <file>` — 3벤더 병렬 호출 후 `<dir>/SEALED/raw/round-N/{claude,omx,agy}.json` 기록. 2명 이상 결측이면 exit 3
  - 환경 오버라이드: `AGORA_CLAUDE_BIN`(기본 `claude`), `AGORA_OMX_BIN`(기본 `/opt/homebrew/bin/omx`), `AGORA_AGY_BIN`(기본 `agy`), `AGORA_TIMEOUT_SECS`(기본 `300`)

`omx` 만 절대 경로를 기본값으로 두는 것은 spec §2 실측(`omx` 는 셸 alias 가 아니라 `/opt/homebrew/bin/omx` 바이너리) 때문입니다. 세 벤더 모두 환경 오버라이드를 두어 테스트가 스텁을 주입할 수 있게 합니다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { chmod } from 'node:fs/promises';

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
});
```

`import { existsSync } from 'node:fs';` 를 테스트 파일 상단에 추가합니다.

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "writes one raw file per vendor"`
Expected: FAIL with `ENOENT: no such file or directory, open '.../SEALED/raw/round-1/claude.json'` — `reviewers.sh` 가 없어 아무 파일도 생성되지 않습니다.

- [ ] **Step 3: 최소 구현**

`.claude/skills/agora/scripts/response-schema.json` (spec §5 계약을 `agy --json-schema` 로 강제):
```json
{
  "type": "object",
  "required": ["findings", "overall", "rationale"],
  "additionalProperties": false,
  "properties": {
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "severity", "claim", "evidence", "impact", "counter", "verdict"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          "claim": { "type": "string", "minLength": 1 },
          "evidence": { "type": "string", "minLength": 1 },
          "impact": { "type": "string", "minLength": 1 },
          "counter": { "type": "string", "minLength": 1 },
          "verdict": { "type": "string", "enum": ["KEEP", "MODIFY", "REJECT"] }
        }
      }
    },
    "overall": { "type": "string", "enum": ["BUILD", "BUILD_WITH_CHANGES", "REDESIGN", "ABANDON"] },
    "rationale": { "type": "string", "minLength": 1 }
  }
}
```

`.claude/skills/agora/scripts/reviewers.sh`:
```bash
#!/usr/bin/env bash
# reviewers.sh — parallel 3-vendor adapter.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §3 §11
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="$SCRIPT_DIR/response-schema.json"

# spec §2 measured: omx is the binary /opt/homebrew/bin/omx, not a shell alias.
AGORA_CLAUDE_BIN="${AGORA_CLAUDE_BIN:-claude}"
AGORA_OMX_BIN="${AGORA_OMX_BIN:-/opt/homebrew/bin/omx}"
AGORA_AGY_BIN="${AGORA_AGY_BIN:-agy}"
AGORA_TIMEOUT_SECS="${AGORA_TIMEOUT_SECS:-300}"

# ---------------------------------------------------------------------------
# run_with_timeout <seconds> <cmd>... — R005: macOS ships no GNU timeout.
# Returns 124 on timeout, otherwise the command's own exit code.
# ---------------------------------------------------------------------------
run_with_timeout() {
  local secs="$1"; shift
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null ) &
  local watcher=$!

  local rc=0
  wait "$pid" || rc=$?
  kill -TERM "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true

  # 143 = SIGTERM from the watchdog; normalize to the GNU timeout convention.
  [ "$rc" -eq 143 ] && rc=124
  return "$rc"
}

invoke_vendor() {
  local slug="$1" prompt_file="$2"
  local prompt; prompt=$(cat "$prompt_file")
  case "$slug" in
    claude) run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_CLAUDE_BIN" -p --model claude-opus-4-8 "$prompt" ;;
    omx)    run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_OMX_BIN" exec "$prompt" ;;
    agy)    run_with_timeout "$AGORA_TIMEOUT_SECS" "$AGORA_AGY_BIN" -p --model gemini-3.1-pro-high \
              --output-format json --json-schema "$SCHEMA_PATH" "$prompt" ;;
    *) return 65 ;;
  esac
}

# ---------------------------------------------------------------------------
# call_vendor <slug> <prompt_file> <out_file> — one retry, then missing (spec §11).
# ---------------------------------------------------------------------------
call_vendor() {
  local slug="$1" prompt_file="$2" out_file="$3"
  local attempt rc tmp
  tmp=$(mktemp)

  for attempt in 1 2; do
    rc=0
    invoke_vendor "$slug" "$prompt_file" > "$tmp" 2>/dev/null || rc=$?

    if [ "$rc" -eq 124 ]; then
      printf '[agora] %s timeout on attempt %s\n' "$slug" "$attempt" >&2
    elif [ "$rc" -ne 0 ]; then
      printf '[agora] %s exited %s on attempt %s\n' "$slug" "$rc" "$attempt" >&2
    elif ! jq -e . "$tmp" >/dev/null 2>&1; then
      printf '[agora] %s returned unparsable output on attempt %s\n' "$slug" "$attempt" >&2
      rc=65
    else
      mv "$tmp" "$out_file"
      return 0
    fi

    [ "$attempt" -eq 1 ] && printf '[agora] %s retry\n' "$slug" >&2
  done

  rm -f "$tmp"
  printf '[agora] %s missing after retry\n' "$slug" >&2
  return 1
}

run_reviewers() {
  local dir='' round='' prompt_file=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir) dir="$2";         shift 2 ;;
      --round)       round="$2";       shift 2 ;;
      --prompt-file) prompt_file="$2"; shift 2 ;;
      *) printf 'reviewers.sh: unknown option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] && [ -n "$prompt_file" ] || {
    printf 'reviewers.sh: --session-dir, --round and --prompt-file are required\n' >&2
    return 64
  }

  local out_dir="$dir/SEALED/raw/round-$round"
  mkdir -p "$out_dir"

  local pids=() slugs=(claude omx agy) slug
  for slug in "${slugs[@]}"; do
    call_vendor "$slug" "$prompt_file" "$out_dir/$slug.json" &
    pids+=("$!")
  done

  local i missing=0
  for i in "${!pids[@]}"; do
    wait "${pids[$i]}" || missing=$(( missing + 1 ))
  done

  if [ "$missing" -ge 2 ]; then
    printf '[agora] 2 or more reviewers missing (%s) — aborting round %s\n' "$missing" "$round" >&2
    return 3
  fi
  printf '[agora] round %s reviewers: %s responded\n' "$round" "$(( 3 - missing ))" >&2
  return 0
}

main() {
  case "${1:---help}" in
    --run) shift; run_reviewers "$@" ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <file>
USAGE
      ;;
    *) printf 'reviewers.sh: unknown option %s\n' "$1" >&2; return 64 ;;
  esac
}

main "$@"
```

`chmod +x .claude/skills/agora/scripts/reviewers.sh` 를 실행합니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "reviewers.sh --run"`
Expected: 7개 케이스 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/scripts/reviewers.sh \
        .claude/skills/agora/scripts/response-schema.json \
        tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add parallel three-vendor reviewer adapter

Implements spec §11: 300s timeout with a gtimeout-or-wait fallback for macOS,
one retry per vendor, missing-tolerant rounds, and a hard abort once two or
more reviewers drop out.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 심판 호출과 모델 로테이션

**Files:**
- Create: `.claude/skills/agora/scripts/judge.sh`
- Create: `.claude/skills/agora/scripts/verdict-schema.json`
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: Task 3 가 만든 `<dir>/anon/round-N.json` (경로를 인자로 받음)
- Produces:
  - 셸 함수 `judge_model_for_round <round> [offset]` — `{cli}:{model}` 을 stdout 출력. 회전 인덱스는 `(round - 1 + offset) % 3`
  - CLI 진입: `bash judge.sh --model-for-round <N> [<offset>]` → 모델 문자열 1줄
  - CLI 진입: `bash judge.sh --run --anon-file <path> --out-file <path> --round <N>` → spec §8 스키마 JSON 기록. 실패 시 다음 로테이션 모델로 대체하고, 3종 모두 실패하면 exit 4
  - 환경 오버라이드: `AGORA_CLAUDE_BIN`, `AGORA_AGY_BIN`, `AGORA_TIMEOUT_SECS`
  - 불변식: 스크립트 본문에 문자열 `SEALED` 가 등장하지 않음

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
    await writeFile(join(dir, 'anon/round-1.json'), JSON.stringify({ round: 1, topic: 't', reviewers: [] }));
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        ['--run', '--anon-file', join(dir, 'anon/round-1.json'),
         '--out-file', join(dir, 'verdict/round-1.json'), '--round', '1'],
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
    await writeFile(join(dir, 'anon/round-1.json'), JSON.stringify({ round: 1, topic: 't', reviewers: [] }));
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        ['--run', '--anon-file', join(dir, 'anon/round-1.json'),
         '--out-file', join(dir, 'verdict/round-1.json'), '--round', '1'],
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
    await writeFile(join(dir, 'anon/round-1.json'), JSON.stringify({ round: 1, topic: 't', reviewers: [] }));
    try {
      const result = await runScript(
        JUDGE_SCRIPT,
        ['--run', '--anon-file', join(dir, 'anon/round-1.json'),
         '--out-file', join(dir, 'verdict/round-1.json'), '--round', '1'],
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
    await writeFile(join(dir, 'anon/round-1.json'), JSON.stringify({ round: 1, topic: 't', reviewers: [] }));
    const dump = join(dir, 'argv.txt');
    try {
      await runScript(
        JUDGE_SCRIPT,
        ['--run', '--anon-file', join(dir, 'anon/round-1.json'),
         '--out-file', join(dir, 'verdict/round-1.json'), '--round', '1'],
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
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "selects claude:claude-opus-5 for round 1"`
Expected: FAIL with `expect(result.stdout.trim()).toBe('claude:claude-opus-5')` — 스크립트 부재로 stdout 이 빈 문자열입니다.

- [ ] **Step 3: 최소 구현**

`.claude/skills/agora/scripts/verdict-schema.json` (spec §8):
```json
{
  "type": "object",
  "required": ["round", "judge", "consensus", "verdict", "resolved", "unresolved", "agenda", "draft", "new_findings", "notes"],
  "properties": {
    "round": { "type": "number" },
    "judge": { "type": "string" },
    "consensus": { "type": "string", "enum": ["UNANIMOUS", "MAJORITY", "SPLIT", "NONE"] },
    "verdict": { "type": "string", "enum": ["BUILD", "BUILD_WITH_CHANGES", "REDESIGN", "ABANDON"] },
    "resolved": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "resolution"],
        "properties": { "id": { "type": "string" }, "resolution": { "type": "string" } }
      }
    },
    "unresolved": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "severity", "positions"],
        "properties": {
          "id": { "type": "string" },
          "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          "positions": { "type": "string" }
        }
      }
    },
    "agenda": { "type": "array", "items": { "type": "string" } },
    "draft": { "type": "string" },
    "new_findings": { "type": "number" },
    "notes": { "type": "string" }
  }
}
```

`.claude/skills/agora/scripts/judge.sh`:
```bash
#!/usr/bin/env bash
# judge.sh — separate-process judge with per-round model rotation.
# Spec: docs/superpowers/plans/2026-08-15-agora-anonymous-consensus-design.md §3 §8 §11
#
# This script receives ONLY the anonymous bundle path. It accepts no path to the
# session's sealed material, neither as an argument nor through the environment.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERDICT_SCHEMA="$SCRIPT_DIR/verdict-schema.json"

AGORA_CLAUDE_BIN="${AGORA_CLAUDE_BIN:-claude}"
AGORA_AGY_BIN="${AGORA_AGY_BIN:-agy}"
AGORA_TIMEOUT_SECS="${AGORA_TIMEOUT_SECS:-300}"

# spec REQ-3 rotation roster. Disjoint from the reviewer roster by model.
JUDGE_ROTATION=(
  'claude:claude-opus-5'
  'agy:claude-opus-4-6-thinking'
  'agy:gpt-oss-120b-medium'
)

judge_model_for_round() {
  local round="$1" offset="${2:-0}"
  local n=${#JUDGE_ROTATION[@]}
  local idx=$(( (round - 1 + offset) % n ))
  printf '%s\n' "${JUDGE_ROTATION[$idx]}"
}

judge_prompt() {
  local anon_file="$1" model_id="$2"
  cat <<PROMPT
당신은 익명 리뷰 합의 절차의 심판입니다.

입력은 아래 익명 번들 JSON 뿐입니다. 리뷰어는 A/B/C 라벨로만 식별되며,
라벨이 어떤 도구·모델에 대응하는지는 알 수 없고 추측해서도 안 됩니다.
참여 인원은 reviewers 배열의 길이와 같습니다 — 배열에 없는 라벨의 침묵을
유의미한 신호로 해석하지 마십시오.

수행할 일은 세 가지입니다.
1. 리뷰어 의견을 평가하여 consensus 와 verdict 를 판정합니다.
2. 다음 라운드 의제(agenda)를 설정합니다.
3. 재작성된 통합 초안(draft)을 제시합니다.

출력은 아래 JSON 스키마를 정확히 따르는 JSON 객체 하나여야 하며,
"judge" 필드에는 "$model_id" 를 그대로 넣습니다. 다른 텍스트를 덧붙이지 마십시오.

$(cat "$VERDICT_SCHEMA")

--- 익명 번들 ---
$(cat "$anon_file")
PROMPT
}

invoke_judge() {
  local model_id="$1" prompt="$2"
  local cli="${model_id%%:*}" model="${model_id#*:}"
  case "$cli" in
    claude) "$AGORA_CLAUDE_BIN" -p --model "$model" "$prompt" ;;
    agy)    "$AGORA_AGY_BIN" -p --model "$model" --output-format json \
              --json-schema "$VERDICT_SCHEMA" "$prompt" ;;
    *) return 65 ;;
  esac
}

run_judge() {
  local anon_file='' out_file='' round=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --anon-file) anon_file="$2"; shift 2 ;;
      --out-file)  out_file="$2";  shift 2 ;;
      --round)     round="$2";     shift 2 ;;
      *) printf 'judge.sh: unknown option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$anon_file" ] && [ -n "$out_file" ] && [ -n "$round" ] || {
    printf 'judge.sh: --anon-file, --out-file and --round are required\n' >&2
    return 64
  }
  [ -f "$anon_file" ] || { printf 'judge.sh: %s not found\n' "$anon_file" >&2; return 66; }

  local tmp; tmp=$(mktemp)
  local offset model_id prompt rc
  for offset in 0 1 2; do
    model_id=$(judge_model_for_round "$round" "$offset")
    prompt=$(judge_prompt "$anon_file" "$model_id")

    rc=0
    invoke_judge "$model_id" "$prompt" > "$tmp" 2>/dev/null || rc=$?

    if [ "$rc" -eq 0 ] && jq -e . "$tmp" >/dev/null 2>&1; then
      jq -c --arg j "$model_id" --argjson r "$round" '.judge = $j | .round = $r' "$tmp" > "$out_file"
      printf '[agora] round %s judged by rotation slot %s\n' "$round" "$(( offset + 1 ))" >&2
      rm -f "$tmp"
      return 0
    fi
    printf '[agora] judge %s failed (rc=%s), advancing rotation\n' "$model_id" "$rc" >&2
  done

  rm -f "$tmp"
  printf '[agora] every rotation model failed for round %s\n' "$round" >&2
  return 4
}

main() {
  case "${1:---help}" in
    --model-for-round) shift; judge_model_for_round "$@" ;;
    --run)             shift; run_judge "$@" ;;
    --help | -h)
      cat <<'USAGE'
Usage:
  judge.sh --model-for-round <round> [offset]
  judge.sh --run --anon-file <path> --out-file <path> --round <N>
USAGE
      ;;
    *) printf 'judge.sh: unknown option %s\n' "$1" >&2; return 64 ;;
  esac
}

main "$@"
```

`chmod +x .claude/skills/agora/scripts/judge.sh` 를 실행합니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "judge.sh"`
Expected: rotation 12개 + run 4개 케이스 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/scripts/judge.sh \
        .claude/skills/agora/scripts/verdict-schema.json \
        tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add rotating separate-process judge

Implements spec REQ-3/§8/§11: three-slot model rotation disjoint from the
reviewer roster, failover to the next slot on judge failure, and an argv
surface that carries only the anonymous bundle path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 진입점과 라운드 루프

**Files:**
- Modify: `.claude/skills/agora/scripts/agora.sh`
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 의 `decide_stop()`
  - Task 3 의 `bash anonymize.sh --build --session-dir <dir> --round <N> --seed <seed> --topic <s> --attachments <json> --agenda <json>`
  - Task 4 의 `bash reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <file>`
  - Task 5 의 `bash judge.sh --run --anon-file <path> --out-file <path> --round <N>`
- Produces:
  - CLI 진입: `bash agora.sh --start "<topic>" [--attach <path>]... [--max-rounds <N>] [--auto]` — 세션 디렉토리 생성 후 루프 구동. 종료 시 `report.md` 생성. stdout 마지막 줄에 세션 디렉토리 절대경로 출력
  - CLI 진입: `bash agora.sh --round <N> --session-dir <dir>` — 라운드 1개만 실행하고 `state.json` 을 갱신. `agora-runner` 위임 단위 (spec §12 "라운드 1개 = 위임 1건")
  - CLI 진입: `bash agora.sh --report --session-dir <dir>` — `SEALED/mapping/` 을 사용해 익명을 해제하고 `report.md` 생성
  - 셸 함수 `gate_display <session_dir> <round>` — spec §10 게이트 블록을 stdout 출력 (라벨만, 벤더 비공개)
  - 환경 오버라이드: `AGORA_SESSION_EPOCH`(시드 결정성 확보용), `AGORA_OUTPUT_ROOT`(기본 `.claude/outputs/sessions`)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root, AGORA_SESSION_EPOCH: '1755230400' }
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
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root, AGORA_SESSION_EPOCH: '1755230400' }
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
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root, AGORA_SESSION_EPOCH: '1755230400' }
      );
      const sessionDir = run.stdout.trim().split('\n').pop() as string;
      const gate = await runScript(AGORA_SCRIPT, ['--gate', '--session-dir', sessionDir, '--round', '1'], '');
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
        { PATH: `${bin}:${process.env.PATH}`, AGORA_OMX_BIN: join(bin, 'omx'),
          AGORA_OUTPUT_ROOT: root, AGORA_SESSION_EPOCH: '1755230400' }
      );
      expect(result.exitCode).toBe(3);
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "runs two gated-off rounds"`
Expected: FAIL with `agora.sh: unknown option --start` (exit 64) — `expect(result.exitCode).toBe(0)` 가 64 와 비교되어 실패합니다.

- [ ] **Step 3: 최소 구현**

`agora.sh` 의 `decide_stop()` 정의 뒤(`# --- end decide_stop ---` 아래)에 추가하고, `main()` 의 `case` 를 확장합니다.

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEWERS_SH="$SCRIPT_DIR/reviewers.sh"
ANONYMIZE_SH="$SCRIPT_DIR/anonymize.sh"
JUDGE_SH="$SCRIPT_DIR/judge.sh"

AGORA_OUTPUT_ROOT="${AGORA_OUTPUT_ROOT:-.claude/outputs/sessions}"

topic_slug() {
  printf '%s' "$1" | tr -cs '[:alnum:]' '-' | cut -c1-32 | sed 's/-*$//'
}

init_session() {
  local topic="$1" max_rounds="$2" mode="$3"
  local epoch="${AGORA_SESSION_EPOCH:-$(date +%s)}"
  local day; day=$(date -u +%Y-%m-%d)
  local hms; hms=$(date -u +%H%M%S)
  local dir="$AGORA_OUTPUT_ROOT/$day/agora-$(topic_slug "$topic")-$hms"

  mkdir -p "$dir/SEALED/raw" "$dir/SEALED/mapping" "$dir/anon" "$dir/verdict"
  jq -n --argjson mr "$max_rounds" --arg m "$mode" --arg t "$topic" --arg e "$epoch" \
    '{round: 0, max_rounds: $mr, mode: $m, topic: $t, epoch: $e, attachments: [], history: [], stop: null}' \
    > "$dir/state.json"
  printf '%s' "$dir"
}

build_reviewer_prompt() {
  local dir="$1" round="$2" out="$3"
  local topic; topic=$(jq -r '.topic' "$dir/state.json")
  local attachments; attachments=$(jq -r '.attachments[]?' "$dir/state.json")

  {
    printf '당신은 익명 상호검증 리뷰어입니다.\n\n'
    printf '주제: %s\n\n' "$topic"
    if [ -n "$attachments" ]; then
      printf '첨부 문서:\n'
      printf '%s\n' "$attachments" | while IFS= read -r a; do
        printf -- '--- %s ---\n' "$a"
        [ -f "$a" ] && cat "$a"
      done
      printf '\n'
    fi
    # spec §10: round 1 is the only genuinely independent review — no frame injected.
    if [ "$round" -gt 1 ]; then
      local prev=$(( round - 1 ))
      printf '직전 라운드 의제:\n'
      jq -r '.agenda[]? | "  - " + .' "$dir/verdict/round-$prev.json"
      printf '\n직전 라운드 통합 초안:\n%s\n\n' "$(jq -r '.draft // ""' "$dir/verdict/round-$prev.json")"
      printf '직전 라운드 익명 의견 요약:\n%s\n\n' "$(jq -c '.reviewers | map({label, overall})' "$dir/anon/round-$prev.json")"
    fi
    printf '아래 JSON 스키마를 정확히 따르는 JSON 객체 하나만 출력하십시오.\n'
    printf '"counter" 는 자기 주장에 대한 반론이며 빈 문자열이 될 수 없습니다.\n\n'
    cat "$SCRIPT_DIR/response-schema.json"
  } > "$out"
}

run_round() {
  local dir='' round=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session-dir) dir="$2";   shift 2 ;;
      --round)       round="$2"; shift 2 ;;
      *) printf 'agora.sh: unknown round option %s\n' "$1" >&2; return 64 ;;
    esac
  done
  [ -n "$dir" ] && [ -n "$round" ] || { printf 'agora.sh: --session-dir and --round required\n' >&2; return 64; }

  local epoch; epoch=$(jq -r '.epoch' "$dir/state.json")
  local topic; topic=$(jq -r '.topic' "$dir/state.json")
  local attachments; attachments=$(jq -c '.attachments' "$dir/state.json")
  local agenda='[]'
  if [ "$round" -gt 1 ]; then
    agenda=$(jq -c '.agenda // []' "$dir/verdict/round-$(( round - 1 )).json")
  fi

  local prompt_file="$dir/SEALED/raw/round-$round.prompt.txt"
  mkdir -p "$dir/SEALED/raw/round-$round"
  build_reviewer_prompt "$dir" "$round" "$prompt_file"

  bash "$REVIEWERS_SH" --run --session-dir "$dir" --round "$round" --prompt-file "$prompt_file" || return $?

  bash "$ANONYMIZE_SH" --build \
    --session-dir "$dir" --round "$round" --seed "agora-$epoch-r$round" \
    --topic "$topic" --attachments "$attachments" --agenda "$agenda" || return $?

  bash "$JUDGE_SH" --run \
    --anon-file "$dir/anon/round-$round.json" \
    --out-file "$dir/verdict/round-$round.json" \
    --round "$round" || return $?

  local v="$dir/verdict/round-$round.json"
  local max_sev
  max_sev=$(jq -r '
    ([.unresolved[]?.severity] | map({CRITICAL:4, HIGH:3, MEDIUM:2, LOW:1}[.] // 0) | max // 0) as $m
    | if $m == 4 then "CRITICAL" elif $m == 3 then "HIGH"
      elif $m == 2 then "MEDIUM" elif $m == 1 then "LOW" else "NONE" end' "$v")

  local tmp; tmp=$(mktemp)
  jq --argjson r "$round" \
     --arg verdict "$(jq -r '.verdict' "$v")" \
     --arg consensus "$(jq -r '.consensus' "$v")" \
     --argjson nf "$(jq -r '.new_findings' "$v")" \
     --arg sev "$max_sev" \
     '.round = $r
      | .history += [{round: $r, verdict: $verdict, consensus: $consensus,
                      new_findings: $nf, max_severity: $sev, tokens: 0}]' \
     "$dir/state.json" > "$tmp" && mv "$tmp" "$dir/state.json"
  return 0
}

gate_display() {
  local dir="$1" round="$2"
  local v="$dir/verdict/round-$round.json"
  local a="$dir/anon/round-$round.json"
  local max_rounds; max_rounds=$(jq -r '.max_rounds' "$dir/state.json")

  printf -- '─── Agora Round %s/%s ───────────────────────────────\n' "$round" "$max_rounds"
  printf '심판:      (모델 로테이션 #%s)\n' "$(( (round - 1) % 3 + 1 ))"
  printf 'Consensus: %-16s Verdict: %s\n' "$(jq -r '.consensus' "$v")" "$(jq -r '.verdict' "$v")"
  printf '리뷰어:    %s\n' "$(jq -r '[.reviewers[] | .label + " " + .overall] | join(" · ")' "$a")"
  printf '신규 지적: %s건               최고 심각도: %s\n' \
    "$(jq -r '.new_findings' "$v")" \
    "$(jq -r --argjson r "$round" '.history[] | select(.round == $r) | .max_severity' "$dir/state.json")"
  printf '\n해소됨(%s)\n' "$(jq -r '.resolved | length' "$v")"
  jq -r '.resolved[]? | "  " + .id + "  " + .resolution' "$v"
  printf '\n미해소(%s)\n' "$(jq -r '.unresolved | length' "$v")"
  jq -r '.unresolved[]? | "  " + .id + "  [" + .severity + "] " + .positions' "$v"
  printf '\n다음 라운드 의제\n'
  jq -r '.agenda[]? | "  - " + .' "$v"
  printf '\n[c] 계속  [s] 중단하고 보고서  [e] 의제 추가 후 계속\n'
}

generate_report() {
  local dir="$1"
  local out="$dir/report.md"
  local stop; stop=$(jq -r '.stop // "UNKNOWN"' "$dir/state.json")
  local last; last=$(jq -r '.round' "$dir/state.json")

  {
    printf '# Agora 합의 보고서\n\n'
    printf '- 주제: %s\n' "$(jq -r '.topic' "$dir/state.json")"
    printf -- '- 종료 사유: %s\n' "$stop"
    printf -- '- 총 라운드: %s\n\n' "$last"
    if [ "$stop" = "MAX_ROUNDS" ]; then
      printf '> **합의 없음 · 분기 결정 필요** — 상한 도달로 종료되었습니다.\n\n'
    elif [ "$stop" = "STALLED" ]; then
      printf '> **정체로 조기 종료** — 잔존 쟁점을 그대로 보고하며 결론을 강제하지 않습니다.\n\n'
    fi

    printf '## 최종 통합 초안\n\n%s\n\n' "$(jq -r '.draft // ""' "$dir/verdict/round-$last.json")"

    printf '## 라운드별 참여자 (익명 해제)\n\n'
    local n
    for (( n = 1; n <= last; n++ )); do
      printf '### 라운드 %s\n\n' "$n"
      jq -r '.map | to_entries[] | "- " + .key + " → " + .value' "$dir/SEALED/mapping/round-$n.json"
      printf '\n'
    done

    printf '## 잔존 쟁점\n\n'
    jq -r '.unresolved[]? | "- " + .id + " [" + .severity + "] " + .positions' "$dir/verdict/round-$last.json"
    printf '\n'
  } > "$out"
}

start_session() {
  local topic='' max_rounds=5 mode='gated'
  local attachments=()
  topic="$1"; shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --attach)      attachments+=("$2"); shift 2 ;;
      --max-rounds)  max_rounds="$2";     shift 2 ;;
      --auto)        mode='auto';         shift ;;
      *) printf 'agora.sh: unknown start option %s\n' "$1" >&2; return 64 ;;
    esac
  done

  local dir; dir=$(init_session "$topic" "$max_rounds" "$mode")
  if [ "${#attachments[@]}" -gt 0 ]; then
    local att_json; att_json=$(printf '%s\n' "${attachments[@]}" | jq -R . | jq -sc .)
    local tmp; tmp=$(mktemp)
    jq --argjson a "$att_json" '.attachments = $a' "$dir/state.json" > "$tmp" && mv "$tmp" "$dir/state.json"
  fi

  local round=1 stop='CONTINUE' rc
  while [ "$round" -le "$max_rounds" ]; do
    rc=0
    run_round --session-dir "$dir" --round "$round" || rc=$?
    [ "$rc" -eq 0 ] || return "$rc"

    stop=$(decide_stop < "$dir/state.json")
    if [ "$stop" != "CONTINUE" ]; then
      local tmp; tmp=$(mktemp)
      jq --arg s "$stop" '.stop = $s' "$dir/state.json" > "$tmp" && mv "$tmp" "$dir/state.json"
      break
    fi

    # In gated mode the orchestrator drives the gate; the script yields after one round.
    if [ "$mode" = 'gated' ]; then
      gate_display "$dir" "$round"
      printf '%s\n' "$dir"
      return 0
    fi
    round=$(( round + 1 ))
  done

  generate_report "$dir"
  printf '%s\n' "$dir"
  return 0
}
```

`main()` 의 `case` 를 확장합니다.
```bash
    --start)   shift; start_session "$@" ;;
    --round)   shift; run_round "$@" ;;
    --gate)    shift
               local gd='' gr=''
               while [ "$#" -gt 0 ]; do
                 case "$1" in
                   --session-dir) gd="$2"; shift 2 ;;
                   --round)       gr="$2"; shift 2 ;;
                   *) return 64 ;;
                 esac
               done
               gate_display "$gd" "$gr" ;;
    --report)  shift
               local rd=''
               while [ "$#" -gt 0 ]; do
                 case "$1" in
                   --session-dir) rd="$2"; shift 2 ;;
                   *) return 64 ;;
                 esac
               done
               generate_report "$rd" ;;
```

`set -euo pipefail` 을 `set -uo pipefail` 로 완화합니다 — `run_round` 의 exit code 를 명시적으로 포착해 전파해야 하므로 `-e` 는 방해가 됩니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts`
Expected: 전체 describe 블록 PASS (Task 1~6 누적).

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/scripts/agora.sh tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): wire the round loop, gate rendering and report generation

Implements spec §4/§10: session artifact layout, round-1 blank-slate reviewer
prompt, per-round state updates, a label-only gate block, and report.md as the
single place where the sealed mapping is consumed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: SKILL.md 작성

**Files:**
- Create: `.claude/skills/agora/SKILL.md` (**`mgr-creator` 위임 필수** — R010 Protected Paths)
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: Task 6 의 CLI 진입점 4종 (`--start`, `--round`, `--gate`, `--report`)
- Produces: 스킬 프론트매터 계약 — `name: agora`, `scope: core`, `version: 1.0.0`, `user-invocable: true`, `argument-hint: "<topic> [--attach <path>] [--max-rounds <N>] [--auto]"`. `context: fork` 필드는 **부재**

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "agora SKILL.md"`
Expected: FAIL with `expect(existsSync(SKILL_MD)).toBe(true)` — received `false`.

- [ ] **Step 3: 최소 구현 (mgr-creator 위임)**

R010 Protected Paths 이므로 `.claude/skills/agora/SKILL.md` 를 직접 쓰지 않고 `mgr-creator` 에 위임합니다. 위임 프롬프트에는 허용 작업·금지 작업·완료 조건만 열거합니다.

허용 작업:
- `.claude/skills/agora/SKILL.md` 신규 생성

금지 작업:
- `.claude/skills/agora/scripts/**` 수정 (Task 1~6 산출물)
- `.claude/agents/**` 생성/수정 (Task 8 범위)
- git 작업

완료 조건:
- 프론트매터가 정확히 아래와 같을 것

```yaml
---
name: agora
description: Use when a design or decision needs adversarial multi-round scrutiny from several independent model vendors. Runs anonymized A/B/C reviewer rounds with a rotating judge and produces a consensus report.
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<topic> [--attach <path>] [--max-rounds <N>] [--auto]"
---
```

- 본문에 아래 5개 섹션이 이 순서로 있을 것

1. **개요** — 3벤더 익명 리뷰 + 로테이션 심판 + 다중턴 수렴이라는 목적을 3문장 이내로.
2. **라운드 파이프라인** — 호출 순서를 `reviewers.sh` → `anonymize.sh` → `judge.sh` 순으로 기술하고, 각 단계의 산출 경로를 표로 제시.

| 단계 | 명령 | 산출 |
|------|------|------|
| 리뷰어 | `bash scripts/reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <f>` | `SEALED/raw/round-N/{claude,omx,agy}.json` |
| 익명화 | `bash scripts/anonymize.sh --build --session-dir <dir> --round <N> --seed agora-<epoch>-r<N> --topic <t> --attachments <json> --agenda <json>` | `SEALED/mapping/round-N.json` + `anon/round-N.json` |
| 심판 | `bash scripts/judge.sh --run --anon-file <dir>/anon/round-N.json --out-file <dir>/verdict/round-N.json --round <N>` | `verdict/round-N.json` |
| 종료 판정 | `bash scripts/agora.sh --decide-stop < <dir>/state.json` | `CONSENSUS\|STALLED\|MAX_ROUNDS\|USER\|CONTINUE` |

3. **사용자 게이트** — spec §10 표시 블록 원문을 그대로 코드 블록으로 싣고, `[c] 계속` / `[s] 중단하고 보고서` / `[e] 의제 추가 후 계속` 3키의 동작을 표로. `e` 는 심판 의제에 **추가만** 가능하고 덮어쓸 수 없음을 명시.
4. **`--auto` 경고** — 게이트를 생략하므로 비용 상한이 명확할 때만 사용하라는 경고. 기본 상한 5라운드 기준 최악 약 600k 토큰이라는 spec §11 수치를 함께 기재.
5. **신뢰 경계** — 오케스트레이터와 심판은 `SEALED/` 를 읽지 않으며, 익명 해제는 `report.md` 생성 단계에서만 이루어진다는 규약. 이 격리는 관례이지 하드 블록이 아니라는 spec §4 한계를 정직하게 병기.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "agora SKILL.md"`
Expected: 6개 케이스 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agora/SKILL.md tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add SKILL.md entry point

Documents the reviewers -> anonymize -> judge pipeline, the spec §10 gate
block, the --auto cost warning, and the SEALED/anon trust boundary including
its honest limits. Created via mgr-creator per R010 Protected Paths.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: agora-runner 에이전트

**Files:**
- Create: `.claude/agents/agora-runner.md` (**`mgr-creator` 위임 필수** — R010 Protected Paths)
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: Task 6 의 `bash agora.sh --round <N> --session-dir <dir>` (위임 단위 = 라운드 1개)
- Produces: 에이전트 반환 계약 — verdict 요약만 반환. 반환 페이로드에 리뷰어 원문, 벤더 출처, `SEALED/` 경로가 포함되지 않음

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "agora-runner agent"`
Expected: FAIL with `expect(existsSync(RUNNER_MD)).toBe(true)` — received `false`.

- [ ] **Step 3: 최소 구현 (mgr-creator 위임)**

R010 Protected Paths 이므로 `mgr-creator` 에 위임합니다.

허용 작업:
- `.claude/agents/agora-runner.md` 신규 생성

금지 작업:
- `.claude/skills/agora/**` 수정 (Task 1~7 산출물)
- git 작업

완료 조건:
- 프론트매터가 정확히 아래와 같을 것

```yaml
---
name: agora-runner
description: Executes exactly one agora consensus round via the skill scripts and returns only a verdict summary. Never returns reviewer text, vendor attribution or sealed paths.
model: claude-sonnet-5
tools: [Bash, Read, Write, Glob]
skills: [agora]
---
```

- 본문에 아래 4개 섹션이 있을 것

1. **역할** — `agora` 스킬의 라운드 실행 전담. 위임 1건 = 라운드 1개이며, 여러 라운드를 한 번에 처리하지 않음 (R020 「위임 경계를 Phase 개수로 설계」).
2. **실행 절차** — `bash .claude/skills/agora/scripts/agora.sh --round <N> --session-dir <dir>` 를 실행하고 exit code 를 확인. exit 3 이면 "리뷰어 2명 이상 결측으로 라운드 중단", exit 4 면 "심판 로테이션 전부 실패로 세션 중단" 을 보고하고 종료.
3. **반환 계약** — 아래 필드만 반환:

| 필드 | 출처 |
|------|------|
| `round` | `verdict/round-N.json` `.round` |
| `consensus` | `.consensus` |
| `verdict` | `.verdict` |
| `resolved` | `.resolved` (id + resolution) |
| `unresolved` | `.unresolved` (id + severity + positions) |
| `agenda` | `.agenda` |
| `new_findings` | `.new_findings` |
| `stop_code` | `bash agora.sh --decide-stop < state.json` 결과 |

4. **금지 사항** — `SEALED/` 하위 파일을 읽지 않으며, 리뷰어 원문·벤더 식별자·`SEALED/` 경로 문자열을 반환에 포함하지 않음. 사용자와 직접 상호작용하지 않으며 게이트 표시는 오케스트레이터 전담.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "agora-runner agent"`
Expected: 4개 케이스 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add .claude/agents/agora-runner.md tests/unit/skills/agora-scripts.test.ts
git commit -m "$(cat <<'EOF'
feat(agora): add agora-runner delegation agent

One delegation covers exactly one round (R020). The return contract is a
verdict summary only, keeping reviewer text and vendor attribution out of the
orchestrator context. Created via mgr-creator per R010 Protected Paths.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 저장소 동기화

**Files:**
- Create: `templates/.claude/skills/agora/SKILL.md`
- Create: `templates/.claude/skills/agora/scripts/agora.sh`
- Create: `templates/.claude/skills/agora/scripts/reviewers.sh`
- Create: `templates/.claude/skills/agora/scripts/anonymize.sh`
- Create: `templates/.claude/skills/agora/scripts/judge.sh`
- Create: `templates/.claude/skills/agora/scripts/response-schema.json`
- Create: `templates/.claude/skills/agora/scripts/verdict-schema.json`
- Create: `templates/.claude/agents/agora-runner.md`
- Create: `wiki/skills/agora.md`
- Create: `wiki/agents/agora-runner.md`
- Modify: `CHANGELOG.md` (최상단 Unreleased 섹션)
- Modify: 스킬 카운트 `114` → `115` 가 카운트 의미로 등장하는 **모든** 파일 (전수 grep 으로 확정)
- Modify: `wiki/.source-hashes.json` (재시딩 산출물)
- Modify: `tests/unit/skills/agora-scripts.test.ts`

**Interfaces:**
- Consumes: Task 1~8 의 모든 산출 파일
- Produces: 캐노니컬 `.claude/**` 와 `templates/.claude/**` 의 md5 일치, 카운트 정합, 위키 drift 0

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { createHash } from 'node:crypto';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

async function md5(path: string): Promise<string> {
  return createHash('md5').update(await readFile(path)).digest('hex');
}

describe('agora repository sync', () => {
  const mirrored = [
    'skills/agora/SKILL.md',
    'skills/agora/scripts/agora.sh',
    'skills/agora/scripts/reviewers.sh',
    'skills/agora/scripts/anonymize.sh',
    'skills/agora/scripts/judge.sh',
    'skills/agora/scripts/response-schema.json',
    'skills/agora/scripts/verdict-schema.json',
    'agents/agora-runner.md',
  ];

  for (const rel of mirrored) {
    it(`mirrors ${rel} into templates/.claude byte-for-byte`, async () => {
      const canonical = join(REPO_ROOT, '.claude', rel);
      const mirror = join(REPO_ROOT, 'templates/.claude', rel);
      expect(existsSync(mirror)).toBe(true);
      expect(await md5(mirror)).toBe(await md5(canonical));
    });
  }

  it('has wiki pages for the new skill and agent (R022)', async () => {
    expect(existsSync(join(REPO_ROOT, 'wiki/skills/agora.md'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'wiki/agents/agora-runner.md'))).toBe(true);
  });

  it('records the skill in CHANGELOG.md', async () => {
    const changelog = await readFile(join(REPO_ROOT, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain('agora');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts -t "agora repository sync"`
Expected: FAIL — `expect(existsSync(mirror)).toBe(true)` 가 `false` 를 받습니다 (미러 미생성).

- [ ] **Step 3: 최소 구현**

**(a) 미러 복사**
```bash
mkdir -p templates/.claude/skills/agora/scripts
cp -R .claude/skills/agora/SKILL.md templates/.claude/skills/agora/SKILL.md
cp -R .claude/skills/agora/scripts/. templates/.claude/skills/agora/scripts/
cp .claude/agents/agora-runner.md templates/.claude/agents/agora-runner.md

# 사본 일관성 실측 (R010 Multi-copy content consistency)
for f in SKILL.md scripts/agora.sh scripts/reviewers.sh scripts/anonymize.sh \
         scripts/judge.sh scripts/response-schema.json scripts/verdict-schema.json; do
  diff -q ".claude/skills/agora/$f" "templates/.claude/skills/agora/$f" || echo "DRIFT: $f"
done
diff -q .claude/agents/agora-runner.md templates/.claude/agents/agora-runner.md || echo "DRIFT: agora-runner.md"
```

**(b) 카운트 동기화 — 파일 열거가 아니라 전수 grep + 의미 판별 (R017 Count Sync)**

```bash
# (a) 실측 — 이 값이 유일한 기준이다. 추측으로 숫자를 바꾸지 않는다.
ls -1d .claude/skills/*/ | wc -l          # 115 여야 한다

# (b) 이전 값 114 를 저장소 전역에서 전수 검색.
#     git grep 이 권위 소스다 (셸 함수 grep 은 히트를 누락한다).
#     --include='*.md' 필터는 CLAUDE.md.en / CLAUDE.md.ko 같은 이중 확장자를
#     매칭하지 못하므로 확장자 필터 없이 훑는다.
git grep -n '114'

# (c) 각 히트가 "스킬 개수"를 의미하는지 판별한다.
#     대상 아님: 버전번호(v0.114.x, CC v2.1.114), 이슈번호(#114), 과거 이력
#     서술("skill-count correction 114 -> 118"), 스크립트 예시 주석.
#     대상: "스킬 114", "skills: 114", "114 skills", "114 디렉토리", counts.skills: 114

# (d) 카운트 의미인 히트만 115 로 정정한다. 판별 근거를 함께 보고한다.
```

정정 후 재검증:
```bash
git grep -n '114' | grep -Ev 'v[0-9]+\.114|#114|2\.1\.114|CHANGELOG'
# 카운트 의미의 잔존 히트가 0줄이어야 한다
```

**(c) CHANGELOG 항목 추가** — `CHANGELOG.md` 최상단 Unreleased 섹션에 추가합니다.
```markdown
### Added

- `agora` 스킬 재도입 — 3벤더 익명 다중턴 합의 파이프라인 (`claude -p` / `omx exec` / `agy -p`).
  라운드마다 A/B/C 라벨을 셔플하고 과거 라운드를 현재 매핑으로 재라벨링하며, 심판은 매 라운드
  모델을 로테이션합니다. 종료 조건 4종(CONSENSUS / STALLED / MAX_ROUNDS / USER)을 구현했습니다.
- `agora-runner` 에이전트 — 라운드 1건 실행 전담. 반환은 verdict 요약으로 한정됩니다.
- 스킬 카운트 114 → 115.
```

**(d) 위키 페이지 생성 및 재시딩 (R022 — 두 단계 모두 필수)**

위키 쓰기는 `wiki-curator` 에 위임합니다. `wiki/skills/agora.md` 와 `wiki/agents/agora-runner.md` 를 생성하고, `wiki/index.yaml` 의 페이지 수와 `counts.skills` 를 갱신합니다. 그 다음 매니페스트를 재시딩합니다.

```bash
bash .github/scripts/lib/source-hash.sh generate wiki/.source-hashes.json
```

페이지만 갱신하면 drift 가 잔존하고, 매니페스트만 재생성하면 false-green 이 됩니다 — 두 단계 모두 수행합니다. 재시딩 대상은 항상 `wiki/.source-hashes.json` 이며 `templates/manifest.json` 이 아닙니다.

**(e) 검증**
```bash
bun run lint
bun test
```

`bun test` 는 0 fail 이 정상 기준선입니다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `bun test tests/unit/skills/agora-scripts.test.ts`
Expected: 전체 PASS.

Run: `bun run lint`
Expected: exit 0.

Run: `bun test`
Expected: 전체 스위트 0 fail.

이어서 `mgr-sauron` 에 R017 게이트를 위임합니다. 위임 프롬프트에는 아래를 명시합니다.
- 스코프: `agora` 스킬 신규 추가 (스킬 115, 에이전트 50)
- **실측값 기준으로 동기화하라, 추측으로 숫자를 바꾸지 말라**
- **최종 PASS/FAIL 판정 없이 turn 을 종료하지 말라**
- 위임 단위는 단일 목표 1개이므로, Phase 가 여럿이면 분할 발주할 것

- [ ] **Step 5: 커밋**

```bash
git add templates/.claude/skills/agora templates/.claude/agents/agora-runner.md \
        wiki/skills/agora.md wiki/agents/agora-runner.md wiki/index.yaml \
        wiki/.source-hashes.json CHANGELOG.md \
        tests/unit/skills/agora-scripts.test.ts
# (b) 단계에서 확정한 카운트 파일들을 개별 add
git diff --cached --name-only   # dist/ 등 빌드 산출물 혼입 여부 실측
git status --short              # tracked 변경 잔존 0 확인
git commit -m "$(cat <<'EOF'
chore(agora): mirror templates, sync skill count 114->115, add wiki pages

Mirrors the agora skill and agora-runner agent into templates/.claude,
updates every count occurrence found by an exhaustive git grep, adds the
CHANGELOG entry, and reseeds wiki/.source-hashes.json after the page updates.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage Matrix (self-review)

spec 요구사항이 어느 Task 에 대응하는지 대조한 결과입니다. 누락 항목은 없습니다.

| Spec 항목 | 대응 Task |
|-----------|-----------|
| REQ-1 리뷰어 3벤더 고정 | Task 4 (`invoke_vendor`) |
| REQ-2 라운드별 셔플 + 과거 재라벨링 | Task 2 (`shuffle_labels`), Task 3 (`relabel_prior`) |
| REQ-3 별도 프로세스 심판 + 모델 로테이션 + 리뷰어와 비중첩 | Task 5 (`judge_model_for_round`, 비중첩 테스트) |
| REQ-4 자유 주제 + 첨부 + 판정/심각도 체계 | Task 6 (`--start`, `--attach`), Task 3 (enum 검증) |
| REQ-5 종료 조건 4종 | Task 1 (`decide_stop`) |
| REQ-6 심판 권한 3종 (평가·의제·초안) | Task 5 (`judge_prompt`, verdict 스키마) |
| REQ-7 서식 정규화 익명화 | Task 3 (`normalize_response`, 화이트리스트) |
| REQ-8 게이트 기본 + `--auto` | Task 6 (`gate_display`, mode 분기), Task 7 (경고 문서화) |
| §4 아티팩트 레이아웃 | Task 6 (`init_session`, E2E 레이아웃 테스트) |
| §4 신뢰 경계 (SEALED/anon) | Task 5 (argv guard), Task 6 (`generate_report`), Task 8 (반환 계약) |
| §5 정규화 템플릿 스키마 | Task 3 (`validate_response`), Task 4 (`response-schema.json`) |
| §6 익명 번들 스키마 | Task 3 (`build_bundle`) |
| §7 매핑 스키마 + seed 기록 | Task 2 (seed 결정성), Task 3 (mapping 기록) |
| §8 심판 산출 스키마 | Task 5 (`verdict-schema.json`) |
| §9 state.json + 종료 판정 | Task 1, Task 6 (state 갱신) |
| §10 라운드 입력 구성 (R1 백지) | Task 6 (`build_reviewer_prompt` round>1 분기) |
| §10 게이트 표시 형식 + 3키 | Task 6 (`gate_display`), Task 7 (문서화) |
| §11 실패 처리 표 | Task 4 (재시도·결측·2인이상 중단), Task 5 (심판 대체) |
| §11 gtimeout 부재 대응 | Task 4 (`run_with_timeout`) |
| §11 prior_rounds 2라운드 제한 | Task 3 (`build_bundle` priors 루프) |
| §12 위임 구조 (agora-runner) | Task 8 |
| §12-(1) 벤더 지문 부재 검사 | Task 3 (`assert_no_fingerprint` + 양/음성 케이스) |
| §12-(2) 라벨 분포 균등성 | Task 2 (`--shuffle-many 3000`) |
| §12-(3) 셔플 재현성 | Task 2 (동일 seed 대조) |
| §12-(4) 종료 판정 순수 함수 | Task 1 (5종 + UNANIMOUS+REDESIGN) |
| §12 기타: 카운트 114→115, 위키, `context: fork` 미사용 | Task 9, Task 7 |

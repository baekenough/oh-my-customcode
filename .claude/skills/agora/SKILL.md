---
name: agora
description: Use when a design or decision needs adversarial multi-round scrutiny from several independent model vendors. Runs anonymized A/B/C reviewer rounds with a rotating judge and produces a consensus report.
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<topic> [--attach <path>] [--max-rounds <N>] [--auto]"
---

# Agora

## 개요

`agora`는 하나의 설계·결정 주제를 3개 독립 벤더 CLI에게 익명 A/B/C 라벨로 검토시키고, 라운드마다 모델이 바뀌는 심판이 판정하는 다중턴 합의 스킬입니다. 벤더 신원은 라운드 내내 라벨 뒤에 숨겨지며, 벤더 공개는 최종 보고서 생성 단계에서만 이루어집니다. 리뷰어 3벤더(`claude -p`, `omx exec`, `agy -p`)와 심판 로테이션(모델 3종)은 서로 겹치지 않아 리뷰-판정 간 교차 오염이 없습니다.

## 라운드 파이프라인

각 라운드는 세 스크립트를 순서대로 호출합니다.

| 단계 | 명령 | 산출 |
|------|------|------|
| 리뷰어 | `bash scripts/reviewers.sh --run --session-dir <dir> --round <N> --prompt-file <f>` | `SEALED/raw/round-N/{claude,omx,agy}.json` |
| 익명화 | `bash scripts/anonymize.sh --build --session-dir <dir> --round <N> --seed agora-<epoch>-r<N> --topic <t> --attachments <json> --agenda <json>` | `SEALED/mapping/round-N.json` + `anon/round-N.json` |
| 심판 | `bash scripts/judge.sh --run --anon-file <dir>/anon/round-N.json --out-file <dir>/verdict/round-N.json --round <N>` | `verdict/round-N.json` |
| 종료 판정 | `bash scripts/agora.sh --decide-stop < <dir>/state.json` | `CONSENSUS\|STALLED\|MAX_ROUNDS\|USER\|CONTINUE` |

라운드 1은 백지 상태로 진행됩니다 — `agenda`, `prior_rounds`, 심판 초안 없이 `topic`과 `attachments`만 리뷰어에게 전달됩니다. 세션 전체에서 진짜 독립 의견을 얻는 유일한 라운드이기 때문입니다. 라운드 2부터는 직전 심판의 `agenda` + 직전 2라운드의 `prior_rounds` + 직전 초안이 함께 전달되어 수렴을 유도합니다.

### CLI 진입점

```
bash agora.sh --start "<topic>" [--attach <path>]... [--max-rounds <N>] [--auto]
bash agora.sh --round <N> --session-dir <dir>
bash agora.sh --gate --session-dir <dir> --round <N>
bash agora.sh --report --session-dir <dir>
```

환경 오버라이드:

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `AGORA_SESSION_EPOCH` | 없음 (자동 생성) | 세션 시드 고정 (재현용) |
| `AGORA_OUTPUT_ROOT` | `.claude/outputs/sessions` | 아티팩트 루트 |
| `AGORA_TIMEOUT_SECS` | `300` | 리뷰어/심판 CLI 타임아웃 |
| `AGORA_CLAUDE_BIN` / `AGORA_OMX_BIN` / `AGORA_AGY_BIN` | PATH 탐색 | 벤더 CLI 바이너리 경로 오버라이드 |
| `AGORA_FORCE_TIMEOUT_FALLBACK` | `0` | **테스트 전용** — `gtimeout` 존재 여부와 무관하게 wait 기반 타임아웃 폴백 경로를 강제합니다. 운영 실행에서는 설정하지 마십시오 |

## 종료 코드

`judge.sh`가 반환하는 두 종류의 비영(non-zero) 종료 코드는 성격이 다르므로 구분해야 합니다.

| 코드 | 의미 | 재시도 대상 |
|------|------|:---:|
| `4` | 심판 CLI 실패 — 로테이션 대체 모델까지 시도한 뒤에도 실패 | 아니오 (로테이션 대체까지가 이미 시도의 전부) |
| `68` | **설정 오류** — `verdict-schema.json`을 읽거나 파싱할 수 없음 | 아니오 |

`68`은 심판의 실패가 아니라 배포 설정의 결함이므로, 재시도해도 같은 원인으로 즉시 재실패합니다. 두 코드 모두 라운드를 즉시 중단시키지만 원인 계층이 다르다는 점을 오케스트레이터가 사용자에게 보고할 때 구분해야 합니다.

## 사용자 게이트

`mode: gated`(기본값)에서 매 라운드 종료 후 오케스트레이터가 아래 형식을 표시합니다. 벤더는 노출하지 않고 라벨만 노출합니다 — 벤더 공개는 `report.md` 생성 단계에서만 이루어집니다.

```
─── Agora Round 2/5 ───────────────────────────────
심판:      (모델 로테이션 #2)
Consensus: MAJORITY          Verdict: BUILD_WITH_CHANGES
리뷰어:    A BUILD_WITH_CHANGES · B BUILD · C REDESIGN
신규 지적: 2건               최고 심각도: HIGH
누적 토큰: 165k (R1 94k + R2 71k)

해소됨(1)
  F1  상태 파일 경합 — 세션 디렉토리 격리로 충분

미해소(1)
  F4  [HIGH] 롤백 경로 부재 — A REJECT / C KEEP / B 미언급

다음 라운드 의제
  1. F4 의 심각도 판정 근거를 각자 제시할 것
  2. 롤백 경로의 구체적 명령 시퀀스

[c] 계속  [s] 중단하고 보고서  [e] 의제 추가 후 계속
```

| 키 | 동작 |
|----|------|
| `c` | 다음 라운드 진행. 심판 의제를 그대로 사용 |
| `s` | 루프 종료(`stop: "USER"`), 현재까지의 결과로 `report.md` 생성 |
| `e` | 사용자 의제를 입력받아 심판 `agenda[]`에 **추가**한 뒤 다음 라운드 진행 |

`e`는 추가만 가능하며 심판 의제를 덮어쓰지 못합니다. 사용자가 심판 의제를 삭제할 수 있으면 심판의 의제 설정 권한이 형해화되고, 사용자가 불편해하는 쟁점이 조용히 사라지는 경로가 생기기 때문입니다.

## `--auto` 경고

**`--auto`는 매 라운드 게이트를 생략합니다.** 비용 상한이 명확할 때만 사용하십시오.

| 항목 | 값 |
|------|-----|
| 라운드당 토큰 추정 | 60~120k (리뷰어 3 + 심판 1) |
| 기본 라운드 상한 | 5 (`--max-rounds`로 조정) |
| **최악의 경우 총 토큰** | **약 600k** |

**소요 시간 주의**: 리뷰어 타임아웃은 300초 × 3벤더 × 1회 재시도, 심판 타임아웃은 300초 × 로테이션 최대 3슬롯(모델 대체)까지 이어질 수 있습니다. 재시도·대체가 겹치면 한 라운드가 상당히 길어질 수 있으며, `--auto`로 여러 라운드를 연속 실행하면 게이트 없이 이 지연이 그대로 누적됩니다.

## 신뢰 경계

익명성은 프롬프트 지시가 아니라 **디렉토리 경계**로 유지됩니다.

| 주체 | `SEALED/` 접근 | `anon/` 접근 |
|------|:---:|:---:|
| 오케스트레이터 (메인 대화) | 금지 | 허용 |
| `agora-runner` 에이전트 | 금지 | 허용 |
| 리뷰어 CLI 3종 | 금지 | 금지 (라운드 내에서 서로를 보지 않음) |
| 심판 CLI | 금지 | 허용 (익명 번들만이 유일한 입력) |
| `report.md` 생성 단계 | **허용** | 허용 (익명 해제가 이 단계의 목적) |

**한계를 정직하게 명시합니다**: 이 격리는 **관례이지 하드 블록이 아닙니다**. 오케스트레이터도 심판 CLI도 `SEALED/`를 읽는 파일 읽기 능력 자체는 갖고 있습니다 — 읽지 못하는 것이 아니라 읽지 않도록 설계된 것입니다. PreToolUse 훅으로 `SEALED/` 경로 Read를 하드 블록하는 방안은 검토했으나, 훅은 프로젝트 전역에 영향을 주므로 초기 도입에서는 제외했습니다(위반율 관측 시 R021 Hard Enforcement Candidates 승격 검토 대상). 실질 방어선은 `anon/round-N.json`에 벤더 지문(CLI 이름·모델명·`SEALED`/`mapping`/`raw/` 경로)이 없는지 결정론적으로 검사하는 익명 번들 검증입니다 — 이는 "누출이 발생했는가"를 사후 탐지할 뿐, "누출을 시도할 수 없게" 만들지는 않습니다.

## R010 위임 구조

오케스트레이터는 파일을 직접 쓸 수 없습니다(R010). `agora`는 라운드마다 다수의 아티팩트 파일을 기록하므로, 라운드 실행은 `agora-runner` 에이전트에 위임합니다.

- **위임 단위는 라운드 1개 = 위임 1건**입니다. 다중 라운드를 한 위임에 묶지 않습니다 — Phase 경계가 곧 mid-step 종료 지점이 되는 것을 방지하기 위함입니다(R020).
- `agora-runner`는 스크립트 실행과 아티팩트 기록을 담당하고, **verdict 요약만** 오케스트레이터에 반환합니다. 리뷰어 원문, 벤더 출처, `SEALED/` 경로는 반환하지 않습니다.
- **사용자 게이트 표시와 게이트 응답 처리는 오케스트레이터 전담**입니다 — 서브에이전트는 사용자와 상호작용하지 않습니다.
- `agora-runner` 에이전트 정의 자체는 이 스킬의 범위 밖입니다. `.claude/agents/agora-runner.md`를 참조하십시오.

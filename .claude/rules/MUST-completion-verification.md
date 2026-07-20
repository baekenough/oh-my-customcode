# [MUST] Completion Verification Rules

> **Priority**: MUST | **ID**: R020

## Core Rule

Before declaring any task `[Done]`, verify completion against task-type-specific criteria. False completion declarations erode trust and cause downstream failures.

## Task-Type Completion Matrix

| Task Type | REQUIRED Verification Before [Done] |
|-----------|-------------------------------------|
| Release | All issues closed, version bumped, PR merged, GitHub Release created; **External automation verified**: `.github/workflows/` listed AND `gh run list --limit 10` checked for auto-publish workflows |
| Implementation | Code compiles/passes lint, tests pass (if exist), no TODO markers left |
| Documentation | Links valid, counts accurate, cross-references updated |
| Git Operations | Operation succeeded (check exit code), working tree clean |
| Code Review | All findings addressed or explicitly deferred with justification |
| Agent/Skill Creation | Frontmatter valid, referenced skills exist, routing updated |
| UI/Frontend | Browser render verified (dev server running + page loaded), no console errors, visual output matches intent; **CSS/style changes**: capture before/after visual diff or screenshot; type-check passing alone is NOT sufficient |

## Optional: Quantitative Evidence (advisory, added v0.114.0, #1034)

For complex agent invocations or multi-step workflows, attach 4-metric evidence to [Done] declarations as supplementary evidence (NOT a binary gate):

| Metric | Source | Format |
|--------|--------|--------|
| correctness | task-type matrix above | pass/fail |
| step_ratio | observed/ideal step count | ratio (lower better) |
| tool_call_ratio | observed/ideal tool calls | ratio (lower better) |
| latency_ratio | observed/ideal latency | ratio (lower better) |

### When to Apply
- Dynamic agent variants comparison (e.g., mgr-creator output validation)
- Long-running workflows where efficiency regression matters
- A/B testing of agent prompts or configurations

### Workflow
1. Run task → collect trajectory (steps, tool_calls, latency)
2. Compare to ideal trajectory annotation (see `agent-eval-framework` skill)
3. Attach metric values to [Done] contract as evidence

### Cross-references
- Skill: `agent-eval-framework` (4-metric framework + ideal trajectory schema)
- Guide: `guides/agent-eval/README.md` (measurement methodology)
- Issue: #1034

## Self-Check (Before Declaring Done)

Before [Done]: (1) Verify ACTUAL outcome not just attempt — "ran command" ≠ "succeeded". (2) Check task-type criteria above. (3) No unchecked items. (4) Would bet $100 it's complete.

<!-- DETAIL: Self-Check box
1. Did I verify ACTUAL outcome? "I ran the command" ≠ "the command succeeded" → YES: Continue / NO: Verify first
2. Does task type have specific criteria? YES: Check each / NO: Apply general verification
3. Any unchecked items? YES: Complete or defer with reason / NO: Proceed to [Done]
4. Would I bet $100 this is truly complete? YES: Declare [Done] / NO: Identify uncertain and verify
-->

## Subagent Self-Report Verification — Verify "pre-existing" claims against base branch before acceptance. See details via Read tool.

<!-- DETAIL: Subagent Self-Report Verification

Subagents often report failures as "pre-existing", "baseline", or "unchanged". These claims MUST be verified against the base branch before acceptance.

| Subagent Claim | Required Verification |
|----------------|----------------------|
| "X test already failing on base" | `git stash && git checkout {base} && run test X && compare` |
| "This warning is pre-existing" | `git log -S "warning-text" {base}` or run on clean checkout |
| "File was unchanged" | `git diff {base}..HEAD -- {file}` |
| "Dependency issue not from this PR" | `git show {base}:package.json` compare |

Never accept "pre-existing" without direct base-branch evidence. A false "pre-existing" claim can mask a regression introduced by the current change.
-->

### Verification-Delegation Non-Termination (검증 위임 판정 종료 보장)

구조 검증(mgr-sauron R017)·판정·품질 게이트를 서브에이전트에 위임할 때, 위임 프롬프트에 **"최종 PASS/FAIL 판정 없이 turn을 종료하지 말라"**를 명시한다 — 단 이 clause는 **보조 수단**일 뿐 1차 방어선이 아니다. clause를 명시해도 mid-step 종료가 **누적 11회** 재발했다(v1.1.13/14/17/18/19 … v1.1.30, 아래 Origin 참조). **1차 방어선은 오케스트레이터의 직접 ground-truth 실측**이다.

mid-step 종료는 예상 가능한 정상 실패 모드로 취급한다 — 발생 시 즉시 ground-truth를 실측해 실제 진행 상태를 확인한다. **증상만으로 결과를 넘겨짚지 않는다**: 같은 "...중" 한 줄 종료라도 실측 결과는 다를 수 있다(예: "merging now" 후 종료 → 실측 시 PR 이미 MERGED, resume 불필요 / "CI 실행 중" 후 종료 → 실측 시 PR OPEN 미머지, resume 필요). 미완이면 SendMessage로 resume하되, 오케스트레이터가 실측한 값(예: "CI 전부 통과, mergeStateStatus=CLEAN")을 resume 메시지에 동봉해 에이전트가 재폴링 후 재종료하는 루프를 끊는다.

| Anti-pattern | Required |
|--------------|----------|
| 위임 프롬프트 clause 명시만으로 판정을 신뢰 | clause는 보조 수단; 오케스트레이터가 항상 직접 ground-truth 실측 |
| mid-step 종료 증상(예: "merging now")으로 결과를 넘겨짚음 | 매번 `gh pr view`/`gh run list` 등으로 실측 후 완료/미완료 판정 |
| resume 시 빈 재촉만 전달 | 실측값을 resume 메시지에 동봉해 재폴링 루프 차단 |

Origin: #1443 (Session 126 회고 찐빠 #1) — v1.1.3 R017 검증에서 mgr-sauron이 source-hash 대조 중 판정 없이 종료 → resume 후 PASS. v1.1.4에서 "판정 반드시 출력" 명시로 1회 완료(대조 실증). **5회 재발 확인(#1492, Session 132)**: v1.1.13/14/17(clause 명시에도 재발) → v1.1.18(완료조건 6항목+종료금지 명시에도 "merging now" 한 줄 남기고 종료, 실측 결과 이미 완료) → v1.1.19(위임 프롬프트에 "4회 무시됨"까지 명시했으나 "CI 실행 중" 한 줄 남기고 종료, 실측 결과 미완료). Session 132에서 2회 모두 오케스트레이터 직접 실측으로 복구 — clause 강화가 아니라 실측 습관화가 유일하게 실증된 방어선. **누적 11회 확인(#1518 찐빠 #2, Session 136)**: v1.1.30 릴리즈 세션에서도 "완료 조건 5항목 실측 + 판정 없이 종료 금지" 명시에도 mgr-gitnerd가 "폴링 완료 통지를 기다리겠습니다" 한 줄만 남기고 종료 → 오케스트레이터 직접 실측으로 복구(lockfile push 완료 / CI pending / PR OPEN); 이번엔 "대기 중" 증상이 실제 미완료였고 Session 132의 "머지 중" 증상은 실제 완료였다는 대비로 증상→결과 추론 금지가 재확인됨.

Cross-reference: R018 (Member Completion Verification), `feedback_release_delegation_phasing`, `feedback_orchestrator_direct_verify` (release delegation phasing을 verification 위임에도 확장).

<!--
> **v2.1.199+**: subagent가 API 오류(usage limit reached 등)를 성공 결과로 오보하던 문제가 수정되어 이제 오류가 parent agent에 정확히 보고됩니다. 플랫폼 수정으로 false-success 자가보고 빈도는 줄지만, "actual outcome ≠ attempt" ground-truth 검증 원칙(R020 Core Rule)은 여전히 유지된다 — subagent 보고를 그대로 신뢰하지 말고 `git status`/`grep`/validation script로 재확인한다.

> **v2.1.200+**: rate limit으로 어떤 텍스트 출력도 내기 전에 잘린 subagent가 이전에는 빈 결과(empty result)를 반환하던 것을 clean failure로 반환하도록 수정되었습니다 — v2.1.199 partial-work 반환에 이어, 출력 이전 rate-limit 차단 시 조용한 빈 결과 대신 명시적 실패를 parent에 보고합니다. 플랫폼이 false-success/silent-empty 자가보고를 추가로 줄였으나, "actual outcome ≠ attempt" ground-truth 검증 원칙(R020 Core Rule)은 여전히 유지됩니다 — subagent 보고를 그대로 신뢰하지 말고 git status/grep/validation script로 재확인합니다.
-->

> **v2.1.211+**: CC의 background agent 결과 보고가 개선되어, Claude가 아직 실행 중인 agent의 상태를 그대로 보고하고 **결과를 지어내지 않고 실제 완료를 기다립니다**(previously fabricated results). v2.1.199/200(false-success·silent-empty 자가보고 감소)에 이은 플랫폼 개선으로 오케스트레이터의 fabricated-completion 리스크를 추가로 낮추지만, "actual outcome ≠ attempt" ground-truth 검증 원칙(Core Rule)은 여전히 유지됩니다 — subagent/background agent 보고를 그대로 신뢰하지 말고 `git status`/`grep`/validation script로 재확인합니다.

## Common False Completion Patterns — 8 anti-patterns including "Command executed" without exit code check, "Waiting for manual publish" when CI auto-publishes, "UI changes done" without browser render. See full table via Read tool.

### Test-Skip Is Not Completion (#1217 item #5)

테스트 실패를 `describe.skip`/`xfail`/`it.skip` + coverage threshold 하향으로 회피하는 것은 완료가 아니다. 근본 원인 분석 없이 그린 빌드를 만드는 회피는 기술 부채를 다음 마이너로 이월시킨다.

| 금지 | 필수 |
|------|------|
| 실패 테스트 skip + threshold 하향으로 그린 빌드 | 근본 원인 분석 후 수정, 불가 시 명시적 deferral + 이슈 등록 |
| "다음 버전 TODO" 주석만 남기고 머지 | skip 사유·복구 조건·추적 이슈를 함께 기록 |

<!-- DETAIL: Common False Completion Patterns

| Pattern | Reality | Fix |
|---------|---------|-----|
| "Command executed" | Exit code not checked | Check `$?` or tool output |
| "File created" | Content not verified | Read file back, verify content |
| "PR created" | CI not checked | Wait for CI, verify green |
| "Issue closed" | Related issues not updated | Check parent epic, cross-refs |
| "Tests pass" | Only ran subset | Run full test suite |
| "Waiting for manual publish" | External CI/CD auto-publishes on merge | Check `.github/workflows/` BEFORE assuming manual step |
| "Subagent said pre-existing" | Claim not verified against base branch | Run test on base branch, compare directly |
| "UI changes done" / "CSS updated" | type-check passes but browser render not verified; visual output unknown | Start dev server, open browser, confirm visual output; capture screenshot or describe what was seen |
-->

### Tool-Call Payload Completeness

도구 호출의 required 파라미터는 invoke 전에 확인한다(완료 선언 후가 아니라 호출 시점의 전제조건). announce(prefix)만 출력하고 payload 의 required 필드를 누락하는 패턴은 R008 "Required-Parameter Completeness Check"가 canonical owner다. Reference: #1324.

## Completion Contract Format — [Contract] + [Done] with criterion/evidence pairs. See template via Read tool.

<!-- DETAIL: Completion Contract Format

For complex tasks, declare completion contract upfront:

```
[Contract] Task: {name}
├── Criterion 1: {specific, verifiable condition}
├── Criterion 2: {specific, verifiable condition}
└── Criterion N: {specific, verifiable condition}
```

Then at completion:

```
[Done] Task: {name}
├── ✓ Criterion 1: {evidence}
├── ✓ Criterion 2: {evidence}
└── ✓ Criterion N: {evidence}
```
-->

## Autonomous Mode Entry Checklist — 5-step inventory (workflows, runs, publish targets, manual points, cross-reference). See full checklist via Read tool.

<!-- DETAIL: Autonomous Mode Entry Checklist

When entering autonomous mode (user grants extended execution without per-step confirmation), perform this inventory BEFORE first action:

1. **Workflow inventory**: `ls .github/workflows/` — identify auto-publish, auto-tag, release, docs-sync, CI workflows
2. **Recent runs**: `gh run list --limit 10` — check success/failure patterns of automated workflows
3. **External publish targets**: Check if npm/PyPI/Docker Hub/GitHub Releases are auto-triggered on merge
4. **Manual intervention points**: Identify which steps require human approval vs. fully automated
5. **Cross-reference with task**: Which workflows will the planned work trigger?

Record findings in session context. Failure to inventory automation is a R020 violation (unknown external state = unverifiable completion).

### Cross-reference

Original incident: v0.87.2~v0.88.0 session (issue #869). The originating memory files were later consolidated/removed; no live equivalents remain as of this writing.
-->

## Interrupt Priority Re-Ordering

사용자 인터럽트 / 새 요청 / 룰 위반 지적 동시 수신 시, 사과 한 줄 후 즉시 작업 통합 plan 재정렬. "사과만 짧게 + 기존 흐름 유지" 패턴 금지.

| 시나리오 | Required 행동 |
|---------|--------------|
| 새 작업 + 룰 위반 지적 동시 | (1) 룰 위반 즉시 수정 (2) 새 작업 통합 plan 제시 (3) 사용자 확인 후 진행 |
| 인터럽트 후 기존 작업 진행 | 인터럽트 내용 통합 또는 명시적 deferral 후 진행 |
| "사과만 짧게" | 부족 — plan 재정렬 후속 필수 |

Reference issues: #1188 item #8.

### Interrupt ≠ Prior-Request Cancellation (#1341 ①)

> Origin: #1341 찐빠 #1 — 사용자가 멀티라인 요청("스킬 FSD를 만들자 … 내용은 아래와 같다")을 두 줄에 나눠 보내려다 중간에 인터럽트했는데, 모델이 이를 "직전 요청 취소" 신호로 단정하고 즉시 다른 작업(/goal 자율 루프)으로 전환했다. 사용자가 "취소가 아니야, 두 줄이 한 번에 안 가서 인터럽트했던 것"으로 정정.

**적용 범위 (비파괴 한정)**: 이 규칙은 **비파괴적** 직전/진행 중 요청에만 적용된다 (스킬/문서 생성, 분석, 비파괴 편집 등). 인터럽트된 작업이 **파괴적·비가역 작업**(R001 — `git reset --hard`, `git clean -fd`, `rm`, 터널/DNS/k8s/인프라 삭제 등)이면 이 규칙은 적용되지 않으며, 아래 Safety Carve-Out을 따른다.

비파괴 작업에 한해: 사용자 인터럽트 직후 첫 메시지가 모호하면, 직전 요청을 "취소"로 단정하지 않는다. 인터럽트는 입력 교정·추가 입력·멀티라인 연속 입력 중단 등 다양한 의도일 수 있으며, 취소는 그중 하나일 뿐이다. 직전 요청 맥락이 살아있는 상태에서 인터럽트 의도를 단정해 다른 작업으로 전환하지 말고, 모호하면 한 번 확인한 뒤 (비파괴적 후속 처리를) 진행한다.

**Safety Carve-Out — 파괴적 작업 (fail-closed, stop-first ask-after)**: 진행 중이던 작업이 파괴적·비가역 작업이면, 인터럽트 수신 시 의도가 모호하더라도 그 작업을 **먼저 즉시 중단(halt/abort)**한 뒤 의도를 확인한다. 재개는 명시적 재승인을 요구한다. 인터럽트의 핵심 가치는 emergency-stop이므로 파괴적 작업에서는 의도 명료화보다 정지가 우선한다(R001 우선). 여기서 "진행"은 파괴적 작업의 계속을 의미하지 않는다.

**모호성 판정 신호** (둘 중 하나면 confirm; 둘 다 아니고 명확한 새 지시면 R003 Clear 경로로 즉시 처리해 과잉 확인 방지):
- (a) 직전 요청이 미완(코드/내용 본문 미수신) 상태에서 인터럽트됨
- (b) 인터럽트 후 첫 메시지가 직전 요청과 무관해 보이나 새 명령으로도 단정 불가

| Anti-pattern | Required |
|--------------|----------|
| 인터럽트 직후 직전 요청을 "취소"로 단정하고 새 작업 실행 (비파괴 맥락) | 인터럽트 의도가 모호하면 직전 요청 맥락 유지 + 의도 1회 확인 후 비파괴적 후속 진행 |
| 멀티라인/연속 입력 중간의 인터럽트를 "전체 취소"로 해석 | 추가 입력·교정 가능성 고려; 사용자 다음 메시지를 기다리거나 의도 확인 |
| 파괴적 작업 진행 중 인터럽트를 "맥락 유지 후 계속"으로 처리 | 즉시 halt(fail-closed) 후 의도 확인; 재개는 명시적 재승인 (stop-first ask-after, R001 우선) |

This is the interrupt-intent extension of Read-Before-Characterize ("actual intent ≠ assumed intent"), scoped to non-destructive context. **Applicability vs "Interrupt Priority Re-Ordering" (above)**: Priority Re-Ordering는 인터럽트가 **명확한 새 작업/룰 위반을 동반**할 때; 인터럽트 첫 메시지가 **모호**하면 본 섹션이 우선(확인 먼저). Cross-reference: R003 (Request Handling — Interrupt row; precedence Risky > Interrupt), R001 (파괴적 작업 halt 우선).

## Diagnostic Hypothesis Verification

진단 단계에서 채택한 가설로 워크플로우/인프라/설정을 **영구 변경하기 전**, 가설을 실제 증거로 검증해야 한다. "그럴듯한 가설"을 검증 없이 영구 변경에 적용하면 잘못된 추정이 영구 부채로 남는다.

| 상황 | 금지 | 필수 |
|------|------|------|
| 에러 원인 추정 | 첫 가설로 워크플로우/설정 영구 수정 | 가설을 좁은 범위에서 검증 후 변경 |
| CI/publish 실패 | 추정 기반 우회 커밋 머지 | 에러 메시지/로그로 실제 원인 확정 |
| 권한/토큰 오류 | 플래그/옵션 변경으로 우회 시도 | 권한 범위·토큰 종류 직접 확인 |

### Common Violation (#1217 item #4)
npm publish E403을 `--provenance` attestation 충돌로 오진단 → release workflow에서 `--provenance` 제거 커밋 머지 → 2차 시도 동일 실패 → 실제 원인은 NPM_TOKEN 권한(Automation token 필요). 잘못된 추정으로 릴리즈 워크플로우를 영구 변경.

### Self-Check (영구 변경 전)
1. 가설을 뒷받침하는 직접 증거(로그/에러 코드/문서)가 있는가?
2. 비파괴적 방법으로 가설을 검증할 수 있는가?
3. 변경이 되돌리기 쉬운가? (영구 워크플로우 변경 vs 일회성 시도)
하나라도 NO면 검증을 먼저 수행한다. 근본 원인 진단은 `superpowers:systematic-debugging` 참조.

### Variant: Parallel Read + Permanent-Change Dispatch (#1250)

진단 자료 수집(로그 조사, 파일 Read)과 그 진단에 의존하는 영구 변경(이슈 등록, 수정 에이전트 위임)을 **같은 메시지에서 병렬 실행**하면, Read 결과를 받기 전에 가설이 확정된다. 병렬 배치는 결과를 동시에 받으므로 "Read 후 판단"이 불가능하다.

| 금지 | 필수 |
|------|------|
| 파일 Read + 그 내용 기반 이슈/수정 지시를 한 병렬 배치에 묶기 | 진단 Read는 먼저, 결과 수령 후 *다음 턴*에 변경 지시 |
| 로그 조사와 동시에 "원인은 X" 이슈 생성 | 로그 결과 확인 후 원인 확정 |

#### Common Violation (#1250)
triage-dispatch.yml 실패 원인을 파일 Read 전에 "triaged 라벨 부재 + omcustom CLI 부재"로 추정 → 같은 메시지에서 이슈 등록 + mgr-gitnerd 수정 지시를 병렬 실행. 직후 도착한 Read 결과가 실제 원인(외부 Airflow issue_triage DAG의 HTTP 530)을 드러냄. 코드 수정 방향은 우연히 맞았으나 이슈/PR/커밋 서술이 틀려 정정 부채 발생. 머지 전 발각되어 이슈/PR 본문 정정으로 회복.

> 진단에 의존하는 쓰기/위임은 진단 결과를 본 다음 턴에 수행한다. R009 병렬 실행은 독립 작업에만 적용 — 진단→변경은 순차 의존이다.

### Read-Before-Characterize

진단 대상(로그, 출력, 데이터)을 **충분히 읽기 전에** 에러 클래스나 원인을 단정하지 않는다. 24MB INFO 로그를 읽기 전 "error loop"로 단정하는 것은 위반이다.

| 금지 | 필수 |
|------|------|
| 로그/출력을 읽기 전 "error loop"·"무한 루프"로 특성화 | 대표 샘플을 먼저 읽고 INFO/WARN/ERROR 분포 확인 후 특성화 |
| 첫 namespace/scope만 보고 전체 단정 | 관련 scope 확인 후 결론 |
| 정렬 기준 미검증 시계열 단정 (`ls\|tail`로 "최신") | 시계열 판단은 mtime/timestamp 정렬(`ls -t`/`find -newermt`) 명시 후 결론 — 파일명순 ≠ 시간순 (#1417) |

Origin: #1266 ④.

### Proxy Signal vs Canonical Ground-Truth (#1336 ①②)

> Origin: #1336 ①② — transcription was alarmed as "stopped" because `.txt` files looked stale, but the canonical DB had transcripts current to 06-09 21:30 (.txt is not the whisper collector's output — it emits only to the DB). Separately, SMS was over-diagnosed as "fully blocked" from one empty OneDrive XML path + a single 401, while the DB held 17 SMS rows ingested via the app path.

When diagnosing pipeline/data state, verify the CANONICAL store (the authoritative datastore — DB, the system of record) BEFORE characterizing state from a secondary proxy (a `.txt`/file artifact) or a single ingestion path. Two failure modes share this meta-pattern:

| Anti-pattern | Required |
|--------------|----------|
| Characterize pipeline health from a filesystem proxy (`.txt` presence/mtime) | Query the canonical store (DB transcript count/recency) first |
| Generalize one ingestion path's failure (one empty XML / one 401) to "whole pipeline blocked" | Check the final landing store's count across ALL paths before concluding blockage |

A single path's failure does NOT prove the whole multi-path pipeline is down. Confirm the system-of-record before alarming or dispatching reprocessing.

### Directory-Context Before Multi-Copy Unification/Deletion

다중 사본(동일 파일이 N곳에 존재)을 통일하거나 삭제하기 전, 각 사본이 위치한 **디렉토리 전체 맥락**을 확인한다(`ls`로 형제 파일 파악). 사본 파일 하나만 보고 "orphan"·"stub"으로 특성화하면, 같은 디렉토리의 형제 파일(다른 역할을 가진)이 함께 덮이거나 맥락이 누락된다. Read-Before-Characterize를 파일 단위에서 디렉토리 단위로 확장한 규칙이다.

| 금지 | 필수 |
|------|------|
| 사본 파일만 보고 "orphan/stub"으로 단정 후 통일/삭제 | 사본이 속한 디렉토리 전체(`ls`)를 확인 — 형제 파일 역할·연계 파악 후 처리 |

#### Common Violation (#1290 찐빠 #2, cross-session)
Session 108에서 `auto-dev.yaml` 4곳을 canonical 통일할 때, repo-root `./workflows/`에 `eraser.yaml`이 공존하는 디렉토리 맥락을 미확인하고 덮었다. Session 109에서 디렉토리 단위 Read-Before-Characterize로 보정(`eraser.yaml` 발견 → #1289 등록, destructive 삭제 회피). 결과는 무해했으나 맥락이 불완전했다.

Origin: #1290 (session 109 retrospective).

### Config-Schema-Before-Edit

> Origin: #1327 찐빠 #2 — a provider switch (to DeepSeek) planned a 3-command edit (auth + provider + default) but omitted `base_url`, which stayed pointed at the previous provider (openrouter.ai) — traffic would have mis-routed. The config's base_url override-precedence was never read before planning the edits.

Before planning edits to a configuration (provider switch, endpoint/base_url override, credential injection, multi-key precedence), READ the full config schema and its override-precedence chain first. Do NOT plan partial edits before understanding which fields override which.

This applies when a change touches a field that participates in an override/precedence/inheritance chain (e.g. provider + base_url, multi-key fallback, layered defaults). A single independent field edit (flip a flag, bump a timeout) does NOT require a full-schema read.

| Anti-pattern | Required |
|--------------|----------|
| Plan a provider/endpoint switch as N commands without reading the config's override chain | Read the full config schema (which field wins, defaults, inheritance) → enumerate EVERY field the switch touches (incl. base_url) → then plan |

Sibling discipline to Read-Before-Characterize (that rule governs diagnosis — don't label before reading; this one governs edit-planning completeness — enumerate every interdependent field before editing). Cross-ref: R023 (verification ladder — config completeness is a Tier-1 deterministic pre-check).

### Degraded-Output Re-Verification Gate (529 / buffering)

When tool outputs show degradation signs — 529 errors, duplicated or truncated output, or a Read returning empty on a file that is known non-empty — you MUST re-verify any fact via a deterministic second source BEFORE any destructive or permanent action (recovery-agent dispatch, issue edit, commit, file restore). Do NOT characterize state ("corruption", "오염", "loop") from a single degraded read.

| Anti-pattern | Required |
|--------------|----------|
| Dispatch a recovery agent off a single 529-buffered read | Re-run a minimal deterministic check (`wc -c`, single-field `gh ... view`, `head`) and confirm before acting |
| Declare a file "corrupted/오염" from one empty Read | Confirm byte count / content via an independent command first |

#### Common Violation (#1269 ①)
Session 106: during 529 buffering, a CHANGELOG was misdiagnosed as "61x 중복 오염" from buffered output and a recovery agent was dispatched — a self-violation of the same-session Read-Before-Characterize rule (#1266 ④). Deterministic count re-verification showed the file was clean. The 529 gate makes the re-verification mandatory, not advisory.

Origin: #1269 ① (R020 self-violation, session 106).

### CI Publish-Step Error vs Published-Artifact Ground Truth

> Origin: #1332 — `npm publish --provenance` emitted a Sigstore `TLOG_CREATE_ENTRY_ERROR` 409, but the publish step's `|| npm view <pkg>@<ver>` fallback recovered (the package WAS published) and release.yml succeeded on all jobs. A subagent read the tlog error in the logs and prematurely declared the run "failed", recommending a re-run; deterministic ground-truth (`npm view`, `gh release view`) showed the release had fully succeeded.

A CI publish/deploy step that LOGS an error has NOT necessarily failed — the step may recover via a fallback (`|| npm view ...`), or the error may be in a non-fatal sub-step (provenance attestation, eventual-consistency probe). Before declaring a publish/release run failed — and ESPECIALLY before re-running, rolling back, or permanently changing the workflow — verify the PUBLISHED ARTIFACT directly:

| Publish target | Ground-truth check |
|----------------|--------------------|
| npm | `npm view <pkg> version` == expected |
| GitHub Release | `gh release view <tag>` exists, not draft |
| Docker registry | image tag/manifest exists |
| Run outcome | `gh run view <id> --json jobs` job conclusions — NOT a single step's log line |

This is the publish-domain extension of Read-Before-Characterize ("actual outcome ≠ attempt"). Re-running a publish that actually succeeded risks duplicate-publish errors; permanently changing a workflow on a misdiagnosis is worse (cf. #1217 — npm E403 misdiagnosed as a `--provenance` conflict → wrong workflow change → repeated failure; real cause was token scope).

### CI Job Conclusion vs Actual Execution (docs-only path-filter)

> Origin: #1503 찐빠 #2 (FSD 3릴리즈 세션 회고) — v1.1.23 릴리즈에서 서브에이전트가 PR CI의 "Test/Rust Tests: SUCCESS"를 "두 잡 실행됨"으로 특성화했으나, 실측(job duration 5초 + "Docs-only skip notice" step 로그) 결과 v1.1.22 docs-only path-filter가 code=false로 판정해 두 잡이 skip-notice만 돌고 success를 보고한 것이었다.

v1.1.22+ 이후 `.github/workflows/ci.yml`의 조건부 잡(Test / Rust Tests / Lint / Lockfile Sync)은 conclusion=success가 **full-run과 fast-skip(docs-only 변경 시 비싼 스텝 건너뜀) 양쪽**에서 나온다. CI 잡이 실제로 **실행**됐는지는 conclusion만으로 판정 불가하다 — job duration(수 분 vs ~5초) 또는 step 로그("Docs-only skip notice" 실행 여부)로 확인한다. R020 Core Rule("actual outcome ≠ attempt")을 CI 잡 결과 해석에 적용한 것이다.

| Anti-pattern | Required |
|--------------|----------|
| CI 잡 conclusion=success를 "잡이 실행됨"으로 특성화 | duration/step-log로 full-run vs fast-skip 구분 후 특성화 |

Cross-reference: 위 CI Publish-Step Error vs Published-Artifact Ground Truth, R023 (path-filter 있는 verification ladder).

### State-Change Claim → Live System Verification (#1335 ①)

> Origin: #1335 ① — issue #101 (secretary teardown) was closed as "대체 완료·teardown 보류", but the secretary LaunchAgents (onedrive-bridge / calendar-worker / minikube-mount) were STILL running on the host. The user caught it ("secretary 리소스 다 내려가있는거 맞지?") — they were not.

Before closing or marking-done an issue/task that CLAIMS an infrastructure or resource STATE change (a service stopped, a resource torn down, a deployment removed, a process killed), verify the ACTUAL live system state — not just that the change command was issued. "Issued the teardown" ≠ "the resource is down".

| Claimed state change | Live ground-truth check |
|----------------------|-------------------------|
| LaunchAgent/service stopped | `launchctl list` / `systemctl status` shows it absent/inactive |
| k8s resource torn down | `kubectl get <resource>` returns NotFound |
| Container removed | `docker ps -a` does not list it |
| Process killed | process check (`pgrep`/`ps`) returns empty |

This is the infra/state extension of "actual outcome ≠ attempt". Closing on the command-issued assumption leaves orphaned running resources.

### Binary/Rendered-Artifact Completeness (text-grep ≠ complete)

> Origin: #1384 (second-brain 공개 저장소 redaction 세션 회고 찐빠 #1) — 텍스트 + git 히스토리 force-push 후 "원격 완전 정리됨"이라 선언했으나, 직후 렌더된 다이어그램 PNG 3종에 redaction 대상 식별자가 시각적으로 잔존 + 텍스트 잔여 호스트 토큰 1건 발견 → 추가 force-push 2회 필요. redaction 범위를 grep 가능한 텍스트로만 잡고, 렌더된 이미지/바이너리를 완결 선언 전에 점검하지 않음.

완료/완결성을 주장하는 작업(redaction, 식별자 제거, 콘텐츠 정리, 시크릿 스크럽, 데이터 마이그레이션)에서 텍스트 grep 통과는 완결을 보장하지 않는다. 렌더된 이미지/바이너리 산출물(PNG/PDF/렌더 다이어그램/임베디드 메타데이터/EXIF)에 동일 대상이 시각적·바이너리적으로 잔존할 수 있다. "완전 제거됨/완료" 선언 전, 텍스트뿐 아니라 바이너리/이미지/렌더 산출물 완결성까지 검증해야 한다.

| Anti-pattern | Required |
|--------------|----------|
| 텍스트 grep 통과 후 "완전 제거됨/정리됨" 선언 | 렌더 이미지/바이너리/임베디드 메타데이터 시각·내용 스캔까지 통과한 뒤 선언 |
| redaction 범위를 grep 가능 텍스트로만 한정 → 잔여를 순차 발견하며 force-push 반복 | 사전 전수 점검(대소문자 무시 텍스트 + 부분문자열 변형 + 바이너리/이미지 + 참조/고아 분석) 후 단일 패스 rewrite (R005 효율) |

This is the redaction/binary extension of the UI/Frontend "browser render verified" row in the Task-Type Completion Matrix — text-layer verification alone is insufficient when rendered/binary artifacts carry the same content. Cross-reference: R001 (보안 완결성 — 시크릿/식별자 잔존 차단), R005 (단일 패스 효율 — 사전 전수 점검이 반복 force-push를 방지).

## Integration

| Rule | Interaction |
|------|-------------|
| R003 | [Done] status format now requires verification evidence |
| R010 | Orchestrator verifies subagent completion claims |
| R017 | Structural changes require sauron verification before [Done] |

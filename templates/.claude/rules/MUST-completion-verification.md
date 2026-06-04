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

Related memory records:
- `feedback_github_workflows_inventory.md` — original incident (v0.87.2~v0.88.0 session)
- `feedback_subagent_pre_existing_claims.md` — subagent false-positive pattern
-->

## Interrupt Priority Re-Ordering

사용자 인터럽트 / 새 요청 / 룰 위반 지적 동시 수신 시, 사과 한 줄 후 즉시 작업 통합 plan 재정렬. "사과만 짧게 + 기존 흐름 유지" 패턴 금지.

| 시나리오 | Required 행동 |
|---------|--------------|
| 새 작업 + 룰 위반 지적 동시 | (1) 룰 위반 즉시 수정 (2) 새 작업 통합 plan 제시 (3) 사용자 확인 후 진행 |
| 인터럽트 후 기존 작업 진행 | 인터럽트 내용 통합 또는 명시적 deferral 후 진행 |
| "사과만 짧게" | 부족 — plan 재정렬 후속 필수 |

Reference issues: #1188 item #8.

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

Origin: #1266 ④.

### Directory-Context Before Multi-Copy Unification/Deletion

다중 사본(동일 파일이 N곳에 존재)을 통일하거나 삭제하기 전, 각 사본이 위치한 **디렉토리 전체 맥락**을 확인한다(`ls`로 형제 파일 파악). 사본 파일 하나만 보고 "orphan"·"stub"으로 특성화하면, 같은 디렉토리의 형제 파일(다른 역할을 가진)이 함께 덮이거나 맥락이 누락된다. Read-Before-Characterize를 파일 단위에서 디렉토리 단위로 확장한 규칙이다.

| 금지 | 필수 |
|------|------|
| 사본 파일만 보고 "orphan/stub"으로 단정 후 통일/삭제 | 사본이 속한 디렉토리 전체(`ls`)를 확인 — 형제 파일 역할·연계 파악 후 처리 |

#### Common Violation (#1290 찐빠 #2, cross-session)
Session 108에서 `auto-dev.yaml` 4곳을 canonical 통일할 때, repo-root `./workflows/`에 `eraser.yaml`이 공존하는 디렉토리 맥락을 미확인하고 덮었다. Session 109에서 디렉토리 단위 Read-Before-Characterize로 보정(`eraser.yaml` 발견 → #1289 등록, destructive 삭제 회피). 결과는 무해했으나 맥락이 불완전했다.

Origin: #1290 (session 109 retrospective).

### Degraded-Output Re-Verification Gate (529 / buffering)

When tool outputs show degradation signs — 529 errors, duplicated or truncated output, or a Read returning empty on a file that is known non-empty — you MUST re-verify any fact via a deterministic second source BEFORE any destructive or permanent action (recovery-agent dispatch, issue edit, commit, file restore). Do NOT characterize state ("corruption", "오염", "loop") from a single degraded read.

| Anti-pattern | Required |
|--------------|----------|
| Dispatch a recovery agent off a single 529-buffered read | Re-run a minimal deterministic check (`wc -c`, single-field `gh ... view`, `head`) and confirm before acting |
| Declare a file "corrupted/오염" from one empty Read | Confirm byte count / content via an independent command first |

#### Common Violation (#1269 ①)
Session 106: during 529 buffering, a CHANGELOG was misdiagnosed as "61x 중복 오염" from buffered output and a recovery agent was dispatched — a self-violation of the same-session Read-Before-Characterize rule (#1266 ④). Deterministic count re-verification showed the file was clean. The 529 gate makes the re-verification mandatory, not advisory.

Origin: #1269 ① (R020 self-violation, session 106).

## Integration

| Rule | Interaction |
|------|-------------|
| R003 | [Done] status format now requires verification evidence |
| R010 | Orchestrator verifies subagent completion claims |
| R017 | Structural changes require sauron verification before [Done] |

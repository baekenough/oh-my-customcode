# [MUST] Completion Verification Rules

> **Priority**: MUST | **ID**: R020

## Core Rule

`[Done]` 선언 전 작업 유형별 기준으로 완료를 검증합니다 — actual outcome ≠ attempt. 성공·실패·중단 보고는 어느 것도 그 자체로 ground-truth가 아닙니다. 위임서 세부는 `.claude/contexts/delegation.md`, 커밋·릴리즈 판정 세부는 `.claude/contexts/commit-release.md`가 담습니다.

<!-- DETAIL: Core Rule original wording
Before declaring any task `[Done]`, verify completion against task-type-specific criteria. False completion declarations erode trust and cause downstream failures.
-->

## Task-Type Completion Matrix

| Task Type | Required before [Done] |
|-----------|------------------------|
| Release | `release.yml` completed **AND** GitHub Release `isDraft=false`, 외부 자동화 확인(commit-release) |
| Implementation | compile/lint pass, tests pass (if exist), no TODO markers |
| Documentation | links valid, counts accurate, cross-refs updated |
| Git Operations | exit code checked, working tree clean |
| Code Review | findings addressed or deferred with justification |
| Agent/Skill Creation | frontmatter valid, referenced skills exist, routing updated |
| UI/Frontend | browser render verified, no console errors, visual matches intent; CSS: before/after screenshot — type-check alone is NOT sufficient |

<!-- DETAIL: async-wait Origin #1584
> **비동기 연쇄의 대기 조건 = 가장 늦게 완료되는 산출물 (Origin: #1584 #2)**: 릴리즈 체인처럼 산출물이 순차 생성되는 비동기 연쇄에서, 중간 산출물 도달을 완료로 읽으면 뒤따르는 산출물이 미완인 채 남는다. npm publish는 `release.yml` **안에서** GitHub Release 생성보다 먼저 끝나므로, npm 도달 시점에 검증을 끝내면 Release가 `draft=true`로 남을 수 있다. `gh run view <id> --json status`(completed) **AND** `gh release view <tag> --json isDraft`(false)를 둘 다 확인한다.
>
> v1.1.44는 타이밍이 맞아 드러나지 않고 v1.1.45에서 노출된 **간헐적 결함**이다 — 한 번 통과한 검증 순서가 경합을 배제하지 않는다.
-->

## Self-Check (Before Declaring Done)

(1) 시도가 아니라 실제 결과를 확인했는가 (2) 유형별 기준을 확인했는가 (3) 미확인 항목이 없는가 (4) $100을 걸 수 있는가. 선택 도구는 4-metric 정량 증거뿐이며 Read 도구로 DETAIL을 열람합니다. [Done] 선언 시 [Contract]/[Done] 기준-증거 쌍과 흔한 거짓 완료 패턴 표(DETAIL)를 참조합니다. 자율 모드 진입 시 첫 동작 전 워크플로우·최근 run·publish 대상·수동 지점·작업이 트리거할 워크플로우 인벤토리는 필수입니다(commit-release). required 파라미터 확인은 R008 소관입니다.

<!-- DETAIL: Self-Check box
1. Did I verify ACTUAL outcome? "I ran the command" ≠ "the command succeeded" → YES: Continue / NO: Verify first
2. Does task type have specific criteria? YES: Check each / NO: Apply general verification
3. Any unchecked items? YES: Complete or defer with reason / NO: Proceed to [Done]
4. Would I bet $100 this is truly complete? YES: Declare [Done] / NO: Identify uncertain and verify
-->

<!-- DETAIL: Optional Quantitative Evidence detail
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
-->

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

<!-- DETAIL: Tool-Call Payload Completeness pointer detail
도구 호출의 required 파라미터는 invoke 전에 확인한다(완료 선언 후가 아니라 호출 시점의 전제조건). announce(prefix)만 출력하고 payload 의 required 필드를 누락하는 패턴은 R008 "Required-Parameter Completeness Check"가 canonical owner다. Reference: #1324.
-->

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

## Subagent Reports

### Subagent Self-Report Verification

"pre-existing"·"unchanged" 주장은 base 브랜치 실측으로 확인한 뒤에만 수용합니다.

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

### 보유 실측값과 어긋나는 서브에이전트 서술은 즉시 정정

리뷰로 이월하지 않고 즉시 정정 위임하거나 판정을 가르는 읽기 전용 명령 1개를 직접 실행합니다(상태 변경은 계속 위임, R010).

<!-- DETAIL: cause narrative #1704
Origin: #1704 #2. 원인은 「절단된 에이전트의 산출물을 "실측상 완결"로 받아들이며 내용 검증을 리뷰 단계에 위탁 — R020 Read-Before-Characterize의 역방향(읽고도 특성화 보류)」입니다.
-->

<!-- DETAIL: Origin #1704
Origin: #1704 #2 (v1.1.73 세션 — sauron FAIL + 적대적 리뷰 F3 동시 적발, 인용 오류 계열 4회째. 오케스트레이터는 위임서에 "제가 실측한 커밋 메시지(#1688)와 어긋날 수 있어 리뷰 항목으로 넘깁니다"라고 적어 판정 가능한 사실을 판정하지 않았습니다). Cross-ref: R020 Read-Before-Characterize, R010 「출처 인용과 인접 문구 점검도 같은 규율」.
-->

### 원인 분석도 완료 보고와 같은 등급의 검증 대상

서브에이전트의 원인 진단은 가설로 접수하고, 결정론적 명령으로 정정한 뒤 전제로 씁니다.

<!-- DETAIL: cause-diagnosis narrative #1595 #3
Origin: #1595 #3. 「Subagent Self-Report Verification」의 주장 표는 서브에이전트의 **상태 주장**("pre-existing", "unchanged")을 다루지만, 서브에이전트의 **원인 진단**도 동일 등급의 검증 대상이다. 오류 메시지 하나가 **여러 시나리오에서 동일하게 출력**될 때, 오케스트레이터와 서브에이전트가 같은 메시지를 읽고 각자 그럴듯하지만 **양립 불가능한** 원인을 구성한다.
-->

<!-- DETAIL: Origin #1595 #3
Origin: #1595 #3 (v1.1.48 세션 — checkout 거부 메시지에 대해 mgr-gitnerd는 "develop에 tracked로 존재", 오케스트레이터는 "develop에 없음"으로 정반대 진단. `git cat-file -e` + `git show --name-status`로 정정 — 서브에이전트 분석이 틀렸고 오케스트레이터의 사실은 맞았으나 결론이 틀렸다). Cross-ref: R020 Read-Before-Characterize, R010 「참인 전제 ≠ 참인 함의」.
-->

### Verification-Delegation Non-Termination

판정 위임의 결과는 clause가 아니라 오케스트레이터의 직접 ground-truth 실측으로 판정합니다(증상만으로 결과를 넘겨짚지 않는다는 원칙).

<!-- DETAIL: Verification-Delegation clause explanation
구조 검증(mgr-sauron R017)·판정·품질 게이트를 서브에이전트에 위임할 때, 위임 프롬프트에 **"최종 PASS/FAIL 판정 없이 turn을 종료하지 말라"**를 명시한다 — 단 이 clause는 **보조 수단**일 뿐 1차 방어선이 아니다. clause를 명시해도 mid-step 종료가 **누적 14회** 재발했다(v1.1.13/14/17/18/19 … v1.1.44, 아래 Origin 참조). **예방의 1차 방어선은 위임 경계 분할**(아래 「위임 경계를 Phase 개수로 설계」)이고, **사후 1차 방어선은 오케스트레이터의 직접 ground-truth 실측**이다.
-->

<!-- DETAIL: mid-step termination symptom examples
mid-step 종료는 예상 가능한 정상 실패 모드로 취급한다 — 발생 시 즉시 ground-truth를 실측해 실제 진행 상태를 확인한다. **증상만으로 결과를 넘겨짚지 않는다**: 같은 "...중" 한 줄 종료라도 실측 결과는 **세 방향 모두** 관측됐다 — (a) 보고=완료("merging now" → 실측 시 PR 이미 MERGED, resume 불필요), (b) 보고=미완료("CI 실행 중" → 실측 시 PR OPEN 미머지, resume 필요), (c) **실제가 보고보다 앞섬**("커밋 1 완료, 커밋 2 스테이징으로 이어갑니다" → 실측 시 3개 커밋 전부 완료). 세 방향이 모두 나온 이상 증상 기반 진행도 추론은 **원리적으로 불가능**하며, 실측만이 유일한 판정 수단이다. 미완이면 SendMessage로 resume하되, 오케스트레이터가 실측한 값(예: "CI 전부 통과, mergeStateStatus=CLEAN")을 resume 메시지에 동봉해 에이전트가 재폴링 후 재종료하는 루프를 끊는다.
-->

#### 위임 경계를 Phase 개수로 설계

다중 Phase 작업은 단일 목표 위임으로 분할해 순차 발주합니다.

<!-- DETAIL: Phase 위임 설명 (표와 중복)
다중 Phase 작업을 한 에이전트에 위임하면 **Phase 경계가 곧 종료 유혹 지점**이 된다 — 완료 조건 번호 명시와 종료 금지 clause를 넣어도 동일하다. 위임 단위는 **단일 목표 1개**로 자르고, Phase가 2개 이상이면 분할해 순차 발주한다.
-->

<!-- DETAIL: 대조 실증 #1574
대조 실증(#1574, v1.1.44 세션): 단일 목표 위임(PR 생성 / 머지 / 브랜치 정리 / 버전 범프) **4건 전원 완주**, 다중 Phase 위임(mgr-sauron 3-Phase, mgr-gitnerd 3-커밋) **2건 모두 mid-step 종료**. 같은 세션에서 릴리즈 단계를 push+범프 / PR 생성 / 머지로 3분할한 것이 이 설계의 적용례다.
-->

<!-- DETAIL: 배선 R016 설명
**배선 (R016 Rule Wiring Check)**: 이 조항의 발동 실행 경로는 `auto-dev.yaml`의 `deep-plan` / `deep-verify` 스텝이다. 파이프라인 정의가 `skill: deep-plan`처럼 **스킬 이름만** 적고 있으면, 그 정의를 따르는 것이 이 조항을 우회하는 경로가 된다 — `skill:` 값은 **분할의 근거가 되는 스킬 정의**를 가리키는 것이지 "1회 호출하라"는 지시가 아니다. 다중 Phase 스킬을 파이프라인 스텝으로 두는 정의에는 분할 지시를 **스텝 설명에 함께 기재**한다(auto-dev.yaml은 4개 사본이 CI로 동일성 강제됨).
-->

<!-- DETAIL: Origin 보강 #1595 #4
Origin 보강: #1595 #4 (v1.1.48 세션 — `deep-plan`(3-Phase)이 식별 헤더만 출력하고 tool_uses=0으로 6.9초에 종료, 산출물 0 실측. `mgr-sauron`(3-Phase)은 판정 없이 종료. 두 건 모두 이 조항을 **알고 있었음에도** `auto-dev.yaml`의 스킬 지정을 따라 그대로 호출한 결과 — 텍스트는 있고 배선이 없던 사례).
-->

<!-- DETAIL: Origin #1443 누적 이력
Origin: #1443 (Session 126 회고 찐빠 #1) — v1.1.3 R017 검증에서 mgr-sauron이 source-hash 대조 중 판정 없이 종료 → resume 후 PASS. v1.1.4에서 "판정 반드시 출력" 명시로 1회 완료(대조 실증). **5회 재발 확인(#1492, Session 132)**: v1.1.13/14/17(clause 명시에도 재발) → v1.1.18(완료조건 6항목+종료금지 명시에도 "merging now" 한 줄 남기고 종료, 실측 결과 이미 완료) → v1.1.19(위임 프롬프트에 "4회 무시됨"까지 명시했으나 "CI 실행 중" 한 줄 남기고 종료, 실측 결과 미완료). Session 132에서 2회 모두 오케스트레이터 직접 실측으로 복구 — clause 강화가 아니라 실측 습관화가 유일하게 실증된 방어선. **누적 11회 확인(#1518 찐빠 #2, Session 136)**: v1.1.30 릴리즈 세션에서도 "완료 조건 5항목 실측 + 판정 없이 종료 금지" 명시에도 mgr-gitnerd가 "폴링 완료 통지를 기다리겠습니다" 한 줄만 남기고 종료 → 오케스트레이터 직접 실측으로 복구(lockfile push 완료 / CI pending / PR OPEN); 이번엔 "대기 중" 증상이 실제 미완료였고 Session 132의 "머지 중" 증상은 실제 완료였다는 대비로 증상→결과 추론 금지가 재확인됨. **누적 14회 + 3방향째 확인(#1574, v1.1.44 세션)**: mgr-sauron 3-Phase / mgr-gitnerd 3-커밋 위임 2건이 Phase 경계에서 종료했고(위 「위임 경계를 Phase 개수로 설계」의 대조 실증), 그중 mgr-gitnerd는 "커밋 2로 이어가겠다"고 보고했으나 실측 시 3개 커밋이 이미 전부 완료 — 실제가 보고보다 앞서는 세 번째 방향.
-->

<!-- DETAIL: cross-reference pointer
Cross-reference: R018 (Member Completion Verification), `feedback_release_delegation_phasing`, `feedback_orchestrator_direct_verify` (release delegation phasing을 verification 위임에도 확장).
-->

#### maxTurns 절단 실증

oh-my-customcode 기본 에이전트는 `maxTurns`를 두지 않으므로(v2.0.26) 턴 산술로 위임 크기를 제한하지 않습니다. 절단(`maxTurns`가 있는 에이전트의 partial 표시, 출력 토큰·컨텍스트·네트워크 절단)과 "대기 중" 보고·중간 종료는 ground-truth로 판정합니다(delegation).

<!-- DETAIL: maxTurns 절단 실증 상세
(superseded v2.0.26 — maxTurns removed; turn arithmetic no longer applies)
**실측 (v1.1.50 세션)**: 오케스트레이터가 4개 그룹을 병렬 위임했고 **그중 3개가 20턴 `maxTurns` 한도로 절단**됐다. 세 건 모두 통지에 `stopped at its 20-turn limit (partial result)`이 명시됐고 출력이 작업 중간에서 끊겼다 — 한 건은 문장 중간에서 절단(진행도 불명, 실측 필요), 한 건은 "Templates 미러를 동기화합니다"라고 예고한 직후 절단(오케스트레이터는 미실행으로 추정했으나 **실측 결과 미러 동기화까지 이미 완료**돼 있었다 — 위 「Verification-Delegation Non-Termination」의 "증상만으로 결과를 넘겨짚지 않는다" 원칙 중 "(c) 실제가 보고보다 앞섬" 재현), 한 건은 "Now R020 — three items"라고 다음 작업을 예고한 직후 절단(실측 결과 **편집은 완료, 검증만 미수행** 상태였다). 세 건 모두 **절단 위치 문장과 실제 진행도가 어긋났다** — 이것이 이 실증의 핵심이다.

1. **확정**: `maxTurns` 절단은 이 조항이 누적 14회로 기록한 "판정 없이 종료" 증상의 **실재하는 원인 중 하나**다. CC v2.1.246부터 partial로 표시되므로 이제 **관측 가능**하다(그 이전에는 완료로 보였다 — R018 v2.1.246 노트 교차참조).
2. **미확정**: 과거 14회 **각각**이 이 원인이었는지는 미검증이다. 사례별 귀속에는 turn 수·소요 시간 대조가 필요하다.
3. **설명력**: 이것은 **왜 clause 강화가 14회 내내 실패했는지**를 설명한다 — 에이전트에게 "종료하지 말라"고 지시해도 **절단 주체가 에이전트가 아니면 지시가 닿지 않는다**. 역으로 「위임 경계를 Phase 개수로 설계」가 효과적이었던 이유도 설명된다: 작업이 작으면 턴 한도 안에 끝나기 때문이지 에이전트가 더 순종적이어서가 아니다.
4. **정량 기준 신설**: 위임 크기 판정을 "Phase가 몇 개인가"에서 **"필요 tool call이 20턴 안에 들어가는가"**로 바꾼다. 파일 1개당 Read + Edit + 미러 Edit + diff 확인 = 약 4턴이므로, **파일 편집형 위임은 담당 파일 4~5개가 실질 상한**이다. v1.1.50 세션의 절단 3건은 담당 파일이 각각 4개·3개·7개였고 파일당 신규 노트 추가·은퇴 판정·미러 동기화를 함께 요구했다 — 산술적으로 20턴에 들어갈 수 없는 위임이었다. **이는 에이전트의 실패가 아니라 오케스트레이터의 위임 설계 결함이다.**
5. **완화책**: 미러 동기화처럼 **후행 필수 작업은 마지막에 몰지 말고 파일 단위로 즉시 수행**한다 — 절단은 항상 마지막 작업을 자르므로, 마지막에 몰린 작업은 절단 시 전량 유실된다.
6. **정량 기준 정밀화 — 산술 단위는 파일이 아니라 편집 항목 (Origin: #1621 #2a, v1.1.51 세션)**: 위 4항의 "파일 4~5개 상한"은 신설 당일 재절단을 막지 못했다 — R017 그룹은 담당 6파일로 상한 인접이었으나, 실제 초과 원인은 파일 수가 아니라 **조항 2개 신설**이었다. 파일당 편집 항목이 1개라는 암묵 가정이 깨지면 파일 수 기준 산술이 무의미해진다. 위임 크기 산술의 단위는 **편집 항목 수**(신설 조항 1개, 버전 노트 1개, 사본 배선 1개 등)로 바꾼다: **항목당 약 2턴(Edit + 위치 탐색) + 파일당 고정비(Read 1 + 미러 Edit 1 + diff 1 = 3턴)**로 계산한다. 같은 세션에서 4파일·항목 소수 위임들은 완주해 대조를 이룬다.
7. **리서치형 위임의 산출물 우선 기록 (Origin: #1621 #2b, v1.1.51 세션)**: 파일 편집형뿐 아니라 리서치형(수집 중심) 위임도 절단에 취약하다 — v1.1.51 세션에서 훅 이벤트 감사 위임이 22회 도구 호출(WebFetch/Read)을 전부 수집에 쓰고 **아티팩트를 1회도 Write하지 않은 채 절단**되어, 수집한 산출물 전량이 에이전트 컨텍스트에만 존재하고 파일에는 남지 않았다(재개 지시 "산출물 우선 기록"으로 복구). 리서치형 위임의 표준 문안에는 **"첫 2턴 안에 아티팩트 골격을 Write하고 수집 즉시 증분 Edit하라 — 수집 완료 후 일괄 기록 금지"**를 포함한다. 절단은 항상 마지막 작업을 자르므로, 기록을 마지막에 몰면 절단 시 산출물이 전량 유실된다 — 위 5항(파일 편집형의 "미러 즉시 동기화")의 리서치형 대응이다.
8. **훅 피드백 잠식 (Origin: #1625 #5)**: settings 훅은 서브에이전트 세션에도 발화하므로, 세션 종료성 훅(Stop 계열)의 반복 피드백이 서브에이전트의 마지막 턴들을 소모·오염시켜 최종 보고가 "대기 중" 류로 끝날 수 있다 — mid-step 종료·"실제가 보고보다 앞섬"의 신규 원인 축. v1.1.53 세션에서 커밋 에이전트 2건의 "대기 중" 보고가 실측 결과 모두 완전 완료였다. 절단·대기 보고를 받으면 훅 피드백 잠식 가능성도 원인 후보에 포함하고 ground-truth로 판정한다.
9. **문서 미러·parity 위임 상한 — 3파일 이하, 산술 통과가 절단 부재를 보장하지 않음 (Origin: #1709 찐빠 #1, v1.1.75 세션)**: 6항의 편집 항목 산술(항목 × 2턴 + 파일 고정비 3턴)을 **적용하지 않고** 문서 미러·parity 위임(카운트·용어·목록 동기화를 여러 문서에 반복 반영) 7파일을 단일 발주하면 절단됩니다 — 6항 공식대로면 7파일은 고정비만 `7×3=21`턴으로 이미 20턴을 초과하므로, 산술을 적용했다면 애초에 단일 발주하지 않았을 상황이었습니다. 실측 결과 6파일 편집은 완결(카운트·Agora 행·훅 수·CONTRIBUTING 절차 재작성)됐고 남은 1파일(AGENTS.md)은 변경 불필요였습니다. 같은 반복의 6개 편집 항목·1파일 위임(ARCHITECTURE_ko 미러)도 정확히 20턴에서 절단됐으나 보고는 전달됐습니다 — 이 건은 신설 공식(파일 수 × 3 + 편집 항목 수 × 2 ≤ 16, `1×3+6×2=15`)을 **통과**하고도 절단됐으므로, 이 산술은 절단 부재를 보장하는 게이트가 아니라 **상한 가이드**입니다. 문서 미러·parity는 편집 항목 수가 파일마다 반복돼 산술을 누락하면 초과 폭이 커지므로, 4항의 일반 파일 편집형 "파일 4~5개 상한"보다 좁은 **3파일 이하 상한**을 따로 두고, 위임서에 위 턴 산술(≤16 — 20턴 한도 아래 여유를 둔 제안값이며 근거 수치는 미확정)을 함께 기재합니다. 3파일 상한은 6항 산술을 대체하지 않는 **보조 상한**입니다. 배선: auto-dev.yaml implement 스텝 표준 제약 블록 (4사본).
-->

<!-- DETAIL: maxTurns cross-reference
Cross-reference: R018 (v2.1.246 maxTurns partial-marking 노트), R009 (Member Prompt Size Cap — 프롬프트 토큰 상한과 별개로 턴 수 상한도 위임 크기 설계 변수임을 추가).
-->

### Test-Skip Is Not Completion

실패 테스트를 skip·threshold 하향으로 회피하지 않습니다 — 근본 원인을 고치고, 불가하면 사유·복구 조건·추적 이슈를 기록해 명시적으로 연기합니다.

<!-- DETAIL: Test-Skip narrative #1217 item #5
테스트 실패를 `describe.skip`/`xfail`/`it.skip` + coverage threshold 하향으로 회피하는 것은 완료가 아니다. 근본 원인 분석 없이 그린 빌드를 만드는 회피는 기술 부채를 다음 마이너로 이월시킨다. (#1217 item #5)
-->

## Interrupts

### Interrupt Priority Re-Ordering

인터럽트·새 요청·룰 위반 지적을 함께 받으면 사과 한 줄 뒤 (1) 룰 위반 수정 (2) 통합 plan 제시 (3) 사용자 확인 후 진행합니다. 사과만 하고 기존 흐름을 유지하지 않으며, 인터럽트 내용은 통합하거나 명시적으로 연기합니다.

<!-- DETAIL: Reference #1188
Reference issues: #1188 item #8.
-->

### Interrupt ≠ Prior-Request Cancellation

비파괴 작업에서 인터럽트 직후 메시지가 모호하면 직전 요청을 취소로 단정하지 않고 맥락을 유지한 채 의도를 1회 확인합니다. 모호 신호: (a) 직전 요청 본문 미수신 상태의 인터럽트 (b) 무관해 보이나 새 명령으로도 단정 불가. 둘 다 아닌 명확한 새 지시는 R003 Clear로 즉시 처리합니다. 멀티라인 입력 중 인터럽트를 전체 취소로 해석하지 않습니다.

**Safety Carve-Out (fail-closed, stop-first ask-after)**: 진행 중 작업이 파괴적·비가역 작업(R001)이면 의도가 모호해도 먼저 즉시 중단한 뒤 확인하며, 재개는 명시적 재승인을 요구합니다. 여기서 "진행"은 파괴적 작업의 계속을 뜻하지 않습니다.

<!-- DETAIL: Origin #1341
> Origin: #1341 찐빠 #1 — 사용자가 멀티라인 요청("스킬 FSD를 만들자 … 내용은 아래와 같다")을 두 줄에 나눠 보내려다 중간에 인터럽트했는데, 모델이 이를 "직전 요청 취소" 신호로 단정하고 즉시 다른 작업(/goal 자율 루프)으로 전환했다. 사용자가 "취소가 아니야, 두 줄이 한 번에 안 가서 인터럽트했던 것"으로 정정.
-->

<!-- DETAIL: 비파괴 작업 설명 (표와 중복)
비파괴 작업에 한해: 사용자 인터럽트 직후 첫 메시지가 모호하면, 직전 요청을 "취소"로 단정하지 않는다. 인터럽트는 입력 교정·추가 입력·멀티라인 연속 입력 중단 등 다양한 의도일 수 있으며, 취소는 그중 하나일 뿐이다. 직전 요청 맥락이 살아있는 상태에서 인터럽트 의도를 단정해 다른 작업으로 전환하지 말고, 모호하면 한 번 확인한 뒤 (비파괴적 후속 처리를) 진행한다.
-->

<!-- DETAIL: interrupt scope examples
적용 범위 예시 — 비파괴: 스킬/문서 생성, 분석, 비파괴 편집. 파괴적·비가역(R001): `git reset --hard`, `git clean -fd`, `rm`, 터널/DNS/k8s/인프라 삭제. 인터럽트의 핵심 가치는 emergency-stop이므로 파괴적 작업에서는 의도 명료화보다 정지가 우선한다(R001 우선).
-->

<!-- DETAIL: interrupt-intent extension 설명
This is the interrupt-intent extension of Read-Before-Characterize ("actual intent ≠ assumed intent"), scoped to non-destructive context. **Applicability vs "Interrupt Priority Re-Ordering" (above)**: Priority Re-Ordering는 인터럽트가 **명확한 새 작업/룰 위반을 동반**할 때; 인터럽트 첫 메시지가 **모호**하면 본 섹션이 우선(확인 먼저). Cross-reference: R003 (Request Handling — Interrupt row; precedence Risky > Interrupt), R001 (파괴적 작업 halt 우선).
-->

## Diagnosis

### Diagnostic Hypothesis Verification

가설로 워크플로우·인프라·설정을 영구 변경하기 전에 직접 증거로 검증합니다. 첫 가설로 설정 수정, 추정 기반 우회 커밋 머지, 권한·토큰 오류의 플래그 우회는 금지합니다. 영구 변경 전 확인: 직접 증거, 비파괴 검증 가능성, 되돌리기 쉬움, 결함이 난 실행 경로(YAML·스킬·스크립트·CI)를 직접 읽었는가 — 하나라도 NO면 검증부터 합니다.

<!-- DETAIL: Diagnostic Hypothesis narrative
"그럴듯한 가설"을 검증 없이 영구 변경에 적용하면 잘못된 추정이 영구 부채로 남는다. 수동 재현 성공으로 자동화 경로의 동작을 추정하지 않는다. 근본 원인 진단은 `superpowers:systematic-debugging` 참조.
-->

<!-- DETAIL: Common Violation #1217
### Common Violation (#1217 item #4)
npm publish E403을 `--provenance` attestation 충돌로 오진단 → release workflow에서 `--provenance` 제거 커밋 머지 → 2차 시도 동일 실패 → 실제 원인은 NPM_TOKEN 권한(Automation token 필요). 잘못된 추정으로 릴리즈 워크플로우를 영구 변경.
-->

<!-- DETAIL: Origin #1533
Origin: #1533 (lockfile 4릴리즈 누락을 "스테이징 누락"으로 오진 — 실제 원인은 version-bump 절차에 build 단계 부재; 수동 재현 결과로 자동화 경로를 추정).
-->

#### 통계적 상관 ≠ 코드 인과

통계만으로 코드 인과를 확정해 기록하지 않습니다 — 코드 경로를 읽고 판정 로직을 1:1 재현한 뒤 기록하며, 그 전에는 R011 `[hypothesis]` 태그로만 저장합니다.

<!-- DETAIL: Common Violation #1652
### Common Violation (#1652 #1) — 통계적 상관 ≠ 코드 인과
v1.1.59 세션에서 #1643(advisor "R007 헤더=0" 오탐) 원인을 트랜스크립트 통계만으로 "advisor가 thinking 전용 첫 레코드를 병합하지 못함"이라 이슈 코멘트·feedback 메모리에 확정 기록 → triage가 현행 코드(이미 병합·thinking 제외)와의 불일치를 지적 → 진단 에이전트가 jq로 판정 로직을 1:1 재현해 반박 — 실제 원인은 레이블 문구 모호성(값은 위반 건수인데 "헤더=0"으로 읽힘). 같은 세션 2회째: `gh pr merge --delete-branch` 로컬 부수효과를 reflog 3건으로 "확정" 저장했으나 4번째 머지(PR #1651)에서 재현되지 않아 "원인 미확정"으로 정정. 두 건 모두 상관을 인과로 승격한 Read-Before-Characterize 자기 위반이며, R011 즉시 저장과 결합해 틀린 전제가 영속화될 뻔했다. Cross-ref: R011 「Mid-Session Immediate Save」 `[hypothesis]` 행, R010 「저장소 상태 기재도 같은 규율」, 아래 「Self-Violation Counting Is Also Diagnosis」.
-->

### Variant: Parallel Read + Permanent-Change Dispatch

진단 Read와 그 결과에 의존하는 이슈·수정 지시를 한 병렬 배치에 묶지 않고, 결과를 받은 다음 턴에 지시합니다.

<!-- DETAIL: parallel read 설명 (표와 중복)
진단 자료 수집(로그 조사, 파일 Read)과 그 진단에 의존하는 영구 변경(이슈 등록, 수정 에이전트 위임)을 **같은 메시지에서 병렬 실행**하면, Read 결과를 받기 전에 가설이 확정된다. 병렬 배치는 결과를 동시에 받으므로 "Read 후 판단"이 불가능하다. (#1250)
-->

<!-- DETAIL: Common Violation #1250
#### Common Violation (#1250)
triage-dispatch.yml 실패 원인을 파일 Read 전에 "triaged 라벨 부재 + omcustom CLI 부재"로 추정 → 같은 메시지에서 이슈 등록 + mgr-gitnerd 수정 지시를 병렬 실행. 직후 도착한 Read 결과가 실제 원인(외부 Airflow issue_triage DAG의 HTTP 530)을 드러냄. 코드 수정 방향은 우연히 맞았으나 이슈/PR/커밋 서술이 틀려 정정 부채 발생. 머지 전 발각되어 이슈/PR 본문 정정으로 회복.
-->

<!-- DETAIL: diagnosis dependency 요약
> 진단에 의존하는 쓰기/위임은 진단 결과를 본 다음 턴에 수행한다. R009 병렬 실행은 독립 작업에만 적용 — 진단→변경은 순차 의존이다.
-->

### Read-Before-Characterize

충분히 읽기 전에 에러 클래스·원인을 단정하지 않습니다. 대표 샘플로 INFO/WARN/ERROR 분포를 보고, 첫 scope만으로 전체를 단정하지 않으며, 시계열은 mtime 정렬(`ls -t`/`find -newermt`)로 판단합니다.

<!-- DETAIL: Origin #1266
Origin: #1266 ④. 예: 24MB INFO 로그를 읽기 전 "error loop"로 단정하는 것은 위반이다. 파일명순(`ls|tail`) ≠ 시간순 (#1417).
-->

### Self-Violation Counting Is Also Diagnosis

위반 횟수와 심각도는 기억이 아니라 transcript 파싱 실측으로 보고하며, 계수를 생략했다면 그 사실을 밝힙니다.

<!-- DETAIL: 자기위반 계수 intro (표와 중복)
**자기 위반 횟수를 세는 것도 진단이다.** 회고·자가 보고에서 "몇 번 위반했는가"를 기억(recall)으로 세면 체계적으로 **과소 계상**된다 — 위반 순간은 정의상 자각 없이 지나간 순간이므로, 기억에는 나중에 스스로 알아챈 소수만 남는다. 위반 횟수는 추정하지 말고 **transcript를 실제로 파싱해** 센다(예: 응답 시작 라인에 R007 헤더 패턴이 없는 assistant turn 수를 grep/스크립트로 집계).
-->

<!-- DETAIL: 실증 2026-07-30
실증: 2026-07-30 세션에서 자가 보고는 "직전 두 응답에서 누락"(2회)이었으나 transcript 실측은 **7회**였다 — 3.5배 과소 계상. Origin: #1553 찐빠 #2.
-->

<!-- DETAIL: 계수 미수행 명시 elaboration
**계수를 수행하지 않았다면 그 사실을 명시할 것 (Origin: #1601, v1.1.49 세션)**: 시간·비용 제약으로 transcript 파싱 계수를 생략하는 경우, 회고 자체에 "전수 계수 미수행"임을 밝혀야 한다. 계수하지 않은 회고의 항목 목록은 위반 전수가 아니라 **"진행 중 자각했거나 서브에이전트가 지적한 항목"에 한정**되며, 이를 밝히지 않으면 독자가 목록을 전수로 오해해 후속 조치 우선순위가 왜곡된다. v1.1.49 세션 회고는 계수를 수행하지 않았고 그 사실을 스스로 명시했다(좋은 사례) — 대조적으로 그 이전 세션(위 실증)은 계수 미수행 여부를 밝히지 않은 기억 기반 자가 보고였고 실측 대비 3.5배 과소 계상이었다.
-->

<!-- DETAIL: 자기 적용 각도 설명
이는 Read-Before-Characterize의 **자기 적용** 각도다 — 진단 대상이 외부 로그가 아니라 자기 자신의 transcript일 때에도 "읽기 전 특성화 금지"가 동일하게 적용된다.
-->

#### 자율 루프 세션의 턴 경계 정의

`.message.role` 필터를 먼저 적용하고, 경계 = `tool_result` 블록이 없는 user 메시지로 확정한 뒤 셉니다. 확정 전에는 횟수를 단정하지 않고, 재구성 실패는 "위반 없음"이 아니라 경계 무관 지표(헤더 총량, tool_use 대 announce 비율)로 보고합니다.

<!-- DETAIL: 자율루프 턴 경계 정의 상세
위 파싱 레시피는 **"사용자 프롬프트 = 턴 경계"**를 암묵 전제한다. `/fsd` 같은 자율 루프는 사용자 프롬프트가 거의 없어(실측: 사용자 프롬프트 4개 대 assistant 응답 30여 회) 이 전제로는 경계 재구성이 실패하고, 계수 자체가 성립하지 않는다. 자율 루프 transcript를 셀 때는 **두 단계를 순서대로** 수행하고, 완료 전에는 **위반 횟수를 단정하지 않는다**.

1. **전처리 — `.message.role`이 존재하는 라인만 필터링**한다. 트랜스크립트에는 role 없는 라인(메타·이벤트·요약)이 assistant/user 사이에 대량으로 끼어 있어, 필터 없이는 **인접성 판정 자체가 깨진다**. 2단계의 어떤 경계 정의도 이 필터 없이는 성립하지 않는다.
2. **경계 정의(규범)** — 응답 시작 경계는 **`content`에 `tool_result` 블록을 포함하지 않는 user 메시지**로 정의한다. 도구 결과도 `role: user`로 기록되므로, "user→assistant 전이 = 응답 시작"이라는 단순 정의는 도구 결과 뒤에 이어지는 assistant 메시지를 전부 새 응답으로 오인해 **위반 건수를 대폭 과대 계상**한다. 실증: 이 정의를 쓰지 않고 파싱했을 때 R007 위반이 177건으로 나왔으나, 위 규범대로 경계를 고치자 1건이 됐다(177배 과대). R008도 44 → 33으로 정정됐다.
-->

#### 자가 계수는 advisor 판정식을 재현한다

자체 패턴 대신 `r007-r008-drift-advisor.sh` 판정식을 그대로 재현합니다.

<!-- DETAIL: 자가계수 intro (표와 중복)
자체 해석 패턴으로 위반을 세지 말고, `.claude/hooks/scripts/r007-r008-drift-advisor.sh`의 판정식을 **1:1 재현**한다. 실증: 자체 announce 패턴을 advisor보다 좁게 잡아(번호 매긴 병렬 스폰 라인 `[N] agent:model → desc` 형식을 announce로 미포함) R008 위반을 과대 계상했다 — advisor 스크립트 자체를 참조하지 않고 "그럴듯한 정의"로 재구현하면 같은 종류의 오차가 반복된다.
-->

<!-- DETAIL: Origin #1574 자율루프
Origin: #1574 (v1.1.44 세션 — 자율 루프에서 R007 헤더 누락 계수를 시도했으나 사용자 프롬프트 4개로 턴 경계 재구성 불가); 1단계 필터는 #1584 #3 (v1.1.45 세션 — 위 조항을 신설했음에도 계수가 재실패. 실제 장애물은 경계 정의가 아니라 **`role=null` 라인 661개 / 전체 1215줄의 54%**였고, 필터 추가 즉시 성립(응답 시작 50, R007 위반 0) — 조항이 원인을 절반만 짚어 재발한 사례). 경계 규범 승격 및 advisor 판정식 재현은 #1593 #6 (경계 오정의로 R007 177배 과대 계상, `tool_result` 배제 정의로 정정; R008은 좁은 announce 패턴 자가 재구현으로 44→33 정정). Cross-ref: R005(계수/매칭 방법 확인 — 도구 기본 동작 미확인 시 결과 오해석).
-->

### Proxy Signal vs Canonical Ground-Truth

파일 프록시보다 canonical store를 먼저 조회하고, 한 경로의 실패를 전체 차단으로 일반화하기 전에 모든 경로의 최종 적재 수를 확인합니다.

<!-- DETAIL: Origin #1336
> Origin: #1336 ①② — transcription was alarmed as "stopped" because `.txt` files looked stale, but the canonical DB had transcripts current to 06-09 21:30 (.txt is not the whisper collector's output — it emits only to the DB). Separately, SMS was over-diagnosed as "fully blocked" from one empty OneDrive XML path + a single 401, while the DB held 17 SMS rows ingested via the app path.
-->

<!-- DETAIL: Proxy Signal intro (표와 중복)
When diagnosing pipeline/data state, verify the CANONICAL store (the authoritative datastore — DB, the system of record) BEFORE characterizing state from a secondary proxy (a `.txt`/file artifact) or a single ingestion path. Two failure modes share this meta-pattern:
-->

<!-- DETAIL: single path 재확인 restatement
A single path's failure does NOT prove the whole multi-path pipeline is down. Confirm the system-of-record before alarming or dispatching reprocessing.
-->

### Directory-Context Before Multi-Copy Unification/Deletion

사본을 통일·삭제하기 전에 각 사본 디렉토리 전체를 확인해 형제 파일 역할을 파악합니다.

<!-- DETAIL: Directory-Context intro (표와 중복)
다중 사본(동일 파일이 N곳에 존재)을 통일하거나 삭제하기 전, 각 사본이 위치한 **디렉토리 전체 맥락**을 확인한다(`ls`로 형제 파일 파악). 사본 파일 하나만 보고 "orphan"·"stub"으로 특성화하면, 같은 디렉토리의 형제 파일(다른 역할을 가진)이 함께 덮이거나 맥락이 누락된다. Read-Before-Characterize를 파일 단위에서 디렉토리 단위로 확장한 규칙이다.
-->

<!-- DETAIL: Common Violation #1290
#### Common Violation (#1290 찐빠 #2, cross-session)
Session 108에서 `auto-dev.yaml` 4곳을 canonical 통일할 때, repo-root `./workflows/`에 `eraser.yaml`이 공존하는 디렉토리 맥락을 미확인하고 덮었다. Session 109에서 디렉토리 단위 Read-Before-Characterize로 보정(`eraser.yaml` 발견 → #1289 등록, destructive 삭제 회피). 결과는 무해했으나 맥락이 불완전했다.
-->

<!-- DETAIL: Origin #1290
Origin: #1290 (session 109 retrospective).
-->

### Config-Schema-Before-Edit

override 체인에 걸린 설정은 전체 스키마와 우선순위를 읽고 변경이 닿는 모든 필드(base_url 포함)를 열거한 뒤 계획합니다.

<!-- DETAIL: Origin #1327
> Origin: #1327 찐빠 #2 — a provider switch (to DeepSeek) planned a 3-command edit (auth + provider + default) but omitted `base_url`, which stayed pointed at the previous provider (openrouter.ai) — traffic would have mis-routed. The config's base_url override-precedence was never read before planning the edits.
-->

<!-- DETAIL: Config-Schema scope 예외 설명
This applies when a change touches a field that participates in an override/precedence/inheritance chain (e.g. provider + base_url, multi-key fallback, layered defaults). A single independent field edit (flip a flag, bump a timeout) does NOT require a full-schema read.
-->

<!-- DETAIL: 훅 스크립트 각도 설명
**훅 스크립트 각도 — stdin 필드 형상은 실측 후 편집 (Origin: #1658 #1, v1.1.62)**: 훅 스크립트가 읽는 stdin 필드(`tool_input`/`tool_response`/`agent_id` 등)를 편집·가드·억제하기 전에 **실제 페이로드 형상을 실측**한다 — 트랜스크립트의 `attachment.type=="hook_success"` 레코드에서 `attachment.stdout`이 pass-through 훅이 되돌린 stdin 원문이며, CC 바이너리 내장 훅 문서로 교차검증한다. 처방("가드 추가·`?` 억제")만 위임하면 선택자 결함 위에 가드를 얹어 마지막 실패 신호까지 지운다. 실증: v1.1.62에서 `secret-filter.sh`가 PostToolUse에 존재하지 않는 `tool_output`(0/1764)을 읽어 실제 페이로드를 한 번도 스캔하지 않던 선재 결함 위에 `?` 억제가 추가됐고(rc=5 신호 소멸), 적대적 리뷰가 실측 형상 재현으로 FAIL 판정해 `tool_response`(1764/1764)로 교체했다. 훅 편집 위임서 표준 문안: "스크립트가 읽는 stdin 필드는 `hook_success` 레코드로 형상 실측 후 편집".
-->

<!-- DETAIL: 값 표현 변경 각도 설명
**값 표현 변경 각도 — 소비자 경로 전수 열거 (Origin: #1691 #2, v1.1.71)**: 저장되는 값의 **표현**(정규화 규칙·인코딩·키 형식)을 바꾸는 위임서는 그 값을 **읽는 모든 소비자 경로**를 `grep`으로 열거하고 **동일 인코딩으로 대조**하도록 완료 조건에 넣습니다. v1.1.68에서 stuck-detector `edit_hash`의 정규화만 바꾸고 소비자(JSON 직렬화 저장값 ↔ grep 원문 패턴)를 열거하지 않아 따옴표·백슬래시 회귀가 1차 구현에 남았고, 위임서의 "consumers logic unchanged" 지시 때문에 에이전트가 발견한 결함을 고치지 않고 넘겼습니다. 이 맥락의 "소비자 로직 변경 금지" 지시는 "결함 발견 시 보고 후 지시 대기"로 씁니다 — 프로덕션·권한 경계의 금지 목록(R010 「Pre-Delegation Privileged-Scope Boundary」)은 이 완화 대상이 아닙니다.
-->

<!-- DETAIL: sibling discipline 설명
Sibling discipline to Read-Before-Characterize (that rule governs diagnosis — don't label before reading; this one governs edit-planning completeness — enumerate every interdependent field before editing). Cross-ref: R023 (verification ladder — config completeness is a Tier-1 deterministic pre-check).
-->

### Degraded-Output Re-Verification Gate

529·중복·절단 출력이나 비어 있지 않은 파일의 빈 Read가 보이면 파괴적·영구 조치 전에 결정론적 2차 소스(`wc -c`, 단일 필드 `gh … view`, `head`)로 재확인하며, 저하 출력 하나로 "오염"·"loop"를 단정하지 않습니다.

<!-- DETAIL: Common Violation #1269
#### Common Violation (#1269 ①)
Session 106: during 529 buffering, a CHANGELOG was misdiagnosed as "61x 중복 오염" from buffered output and a recovery agent was dispatched — a self-violation of the same-session Read-Before-Characterize rule (#1266 ④). Deterministic count re-verification showed the file was clean. The 529 gate makes the re-verification mandatory, not advisory.
-->

<!-- DETAIL: Origin #1269
Origin: #1269 ① (R020 self-violation, session 106).
-->

### Failure/Interrupt Report ≠ Actual Failure

실패·중단·정지 보고도 재시도·롤백 전에 파일 내용·크기, 출력 완결성, 프로세스·run 상태로 확인합니다.

<!-- DETAIL: 교훈 restatement
**교훈**: 위 Core Rule("actual outcome ≠ attempt")은 방향이 없다 — 도구가 성공을 보고하든 실패를 보고하든, 보고 자체는 ground-truth가 아니다. 실패 보고를 받았다고 곧바로 재시도·롤백에 들어가지 말고, 먼저 실제 산출물 상태를 확인한다. CC 버전별 사례 표와 버전 노트는 `guides/claude-code/15-version-compatibility.md`로 이관 대상이다.
-->

### State-Change Claim → Live System Verification

상태 변경을 주장하는 작업은 명령 실행이 아니라 live 상태(`launchctl list`, `kubectl get`, `docker ps -a`, `pgrep`)를 확인한 뒤 닫습니다.

<!-- DETAIL: Origin #1335
> Origin: #1335 ① — issue #101 (secretary teardown) was closed as "대체 완료·teardown 보류", but the secretary LaunchAgents (onedrive-bridge / calendar-worker / minikube-mount) were STILL running on the host. The user caught it ("secretary 리소스 다 내려가있는거 맞지?") — they were not.
-->

<!-- DETAIL: infra/state extension 설명
This is the infra/state extension of "actual outcome ≠ attempt". "Issued the teardown" ≠ "the resource is down". Closing on the command-issued assumption leaves orphaned running resources.
-->

### Binary/Rendered-Artifact Completeness

redaction 등 완결성 주장은 텍스트 grep 외에 렌더 이미지·바이너리·메타데이터까지 사전 전수 점검하고 단일 패스로 처리한 뒤 선언합니다.

<!-- DETAIL: Origin #1384
> Origin: #1384 (second-brain 공개 저장소 redaction 세션 회고 찐빠 #1) — 텍스트 + git 히스토리 force-push 후 "원격 완전 정리됨"이라 선언했으나, 직후 렌더된 다이어그램 PNG 3종에 redaction 대상 식별자가 시각적으로 잔존 + 텍스트 잔여 호스트 토큰 1건 발견 → 추가 force-push 2회 필요. redaction 범위를 grep 가능한 텍스트로만 잡고, 렌더된 이미지/바이너리를 완결 선언 전에 점검하지 않음.
-->

<!-- DETAIL: redaction/binary extension 설명
대상 작업: redaction, 식별자 제거, 콘텐츠 정리, 시크릿 스크럽, 데이터 마이그레이션. 대상 산출물: PNG/PDF/렌더 다이어그램/임베디드 메타데이터/EXIF. 사전 전수 점검 = 대소문자 무시 텍스트 + 부분문자열 변형 + 바이너리/이미지 + 참조/고아 분석. This is the redaction/binary extension of the UI/Frontend "browser render verified" row in the Task-Type Completion Matrix — text-layer verification alone is insufficient when rendered/binary artifacts carry the same content. Cross-reference: R001 (보안 완결성 — 시크릿/식별자 잔존 차단), R005 (단일 패스 효율 — 사전 전수 점검이 반복 force-push를 방지).
-->

### CI Publish-Step Error vs Published-Artifact Ground Truth

publish 로그 오류만으로 실패를 선언하지 않고 게시 산출물을 확인합니다(commit-release).

<!-- DETAIL: Origin #1332
> Origin: #1332 — `npm publish --provenance` emitted a Sigstore `TLOG_CREATE_ENTRY_ERROR` 409, but the publish step's `|| npm view <pkg>@<ver>` fallback recovered (the package WAS published) and release.yml succeeded on all jobs. A subagent read the tlog error in the logs and prematurely declared the run "failed", recommending a re-run; deterministic ground-truth (`npm view`, `gh release view`) showed the release had fully succeeded.
-->

<!-- DETAIL: publish-domain extension 설명
This is the publish-domain extension of Read-Before-Characterize ("actual outcome ≠ attempt"). Re-running a publish that actually succeeded risks duplicate-publish errors; permanently changing a workflow on a misdiagnosis is worse (cf. #1217 — npm E403 misdiagnosed as a `--provenance` conflict → wrong workflow change → repeated failure; real cause was token scope).
-->

### CI Job Conclusion vs Actual Execution

conclusion=success만으로 잡이 실행됐다고 보지 않습니다(commit-release).

<!-- DETAIL: Origin #1503
> Origin: #1503 찐빠 #2 (FSD 3릴리즈 세션 회고) — v1.1.23 릴리즈에서 서브에이전트가 PR CI의 "Test/Rust Tests: SUCCESS"를 "두 잡 실행됨"으로 특성화했으나, 실측(job duration 5초 + "Docs-only skip notice" step 로그) 결과 v1.1.22 docs-only path-filter가 code=false로 판정해 두 잡이 skip-notice만 돌고 success를 보고한 것이었다.
-->

<!-- DETAIL: CI Job Conclusion intro (표와 중복)
`.github/workflows/ci.yml`의 잡(Lockfile Sync / Lint / Test 등)은 PR-merge 커밋 push 시 비싼 스텝을 건너뛰고 skip-notice 스텝(대부분 "PR-merge skip notice", retired-paths 잡("Retired Template Paths Freshness")은 PR이 아닌 모든 이벤트에서 "Skip notice")만 실행해도 conclusion=success가 **full-run과 skip-notice 양쪽**에서 나온다(docs-only path-filter는 v2.0.25에서 제거됨). CI 잡이 실제로 **실행**됐는지는 conclusion만으로 판정 불가하다 — job duration(수 분 vs ~5초) 또는 step 로그(skip-notice 스텝 실행 여부)로 확인한다. R020 Core Rule("actual outcome ≠ attempt")을 CI 잡 결과 해석에 적용한 것이다.
-->

<!-- DETAIL: cross-reference 설명
Cross-reference: 위 CI Publish-Step Error vs Published-Artifact Ground Truth, R023 (skip이 있는 verification ladder).
-->

## Integration

R003 [Done] 형식에 검증 증거 포함, R010 서브에이전트 완료 주장 검증, R017 구조 변경 시 sauron 검증.

# [MUST] Completion Verification Rules

> **Priority**: MUST | **ID**: R020

## Core Rule

Before declaring any task `[Done]`, verify completion against task-type-specific criteria. False completion declarations erode trust and cause downstream failures.

## Task-Type Completion Matrix

| Task Type | REQUIRED Verification Before [Done] |
|-----------|-------------------------------------|
| Release | All issues closed, version bumped, PR merged; **대기 조건은 AND** — `release.yml` completed **AND** GitHub Release `isDraft=false` (npm 도달은 충분조건이 아님, 아래 참조); **External automation verified**: `.github/workflows/` listed AND `gh run list --limit 10` checked for auto-publish workflows |
| Implementation | Code compiles/passes lint, tests pass (if exist), no TODO markers left |
| Documentation | Links valid, counts accurate, cross-references updated |
| Git Operations | Operation succeeded (check exit code), working tree clean |
| Code Review | All findings addressed or explicitly deferred with justification |
| Agent/Skill Creation | Frontmatter valid, referenced skills exist, routing updated |
| UI/Frontend | Browser render verified (dev server running + page loaded), no console errors, visual output matches intent; **CSS/style changes**: capture before/after visual diff or screenshot; type-check passing alone is NOT sufficient |

> **비동기 연쇄의 대기 조건 = 가장 늦게 완료되는 산출물 (Origin: #1584 #2)**: 릴리즈 체인처럼 산출물이 순차 생성되는 비동기 연쇄에서, 중간 산출물 도달을 완료로 읽으면 뒤따르는 산출물이 미완인 채 남는다. npm publish는 `release.yml` **안에서** GitHub Release 생성보다 먼저 끝나므로, npm 도달 시점에 검증을 끝내면 Release가 `draft=true`로 남을 수 있다. `gh run view <id> --json status`(completed) **AND** `gh release view <tag> --json isDraft`(false)를 둘 다 확인한다.
>
> v1.1.44는 타이밍이 맞아 드러나지 않고 v1.1.45에서 노출된 **간헐적 결함**이다 — 한 번 통과한 검증 순서가 경합을 배제하지 않는다.

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

### 원인 분석도 완료 보고와 같은 등급의 검증 대상 (Origin: #1595 #3)

위 표는 서브에이전트의 **상태 주장**("pre-existing", "unchanged")을 다루지만, 서브에이전트의 **원인 진단**도 동일 등급의 검증 대상이다. 오류 메시지 하나가 **여러 시나리오에서 동일하게 출력**될 때, 오케스트레이터와 서브에이전트가 같은 메시지를 읽고 각자 그럴듯하지만 **양립 불가능한** 원인을 구성한다. 서브에이전트의 원인 분석은 **결론이 아니라 가설**로 접수하고, 결정론적 명령으로 정정한다.

| 서브에이전트의 원인 진단 | 필요한 실측 |
|---|---|
| "대상 브랜치에 이미 tracked로 존재하며 내용이 다르다" | `git cat-file -e <branch>:<path>` (존재 여부), `git show --name-status <sha>` (추가/수정 구분) |
| "이 실패는 X 때문이다" (오류 메시지 해석에 근거) | 같은 메시지를 내는 **다른 시나리오**를 열거하고, 시나리오를 가르는 명령을 1개 이상 실행 |
| "형제/부하/환경 때문이다" | 개입 실험으로 귀속 — R010 「"플래키"는 원인이 아니다」 |

| Anti-pattern | Required |
|--------------|----------|
| 서브에이전트의 원인 분석을 결론으로 접수하고 후속 계획의 전제로 사용 | 가설로 접수 → 결정론적 명령으로 정정 후 전제화 |
| 오케스트레이터와 서브에이전트의 진단이 양립 불가한데 어느 쪽이 맞는지 실측 없이 한쪽 채택 | 양립 불가를 **모순 신호**로 취급 — 두 진단을 가르는 명령을 즉시 실행 |

Origin: #1595 #3 (v1.1.48 세션 — checkout 거부 메시지에 대해 mgr-gitnerd는 "develop에 tracked로 존재", 오케스트레이터는 "develop에 없음"으로 정반대 진단. `git cat-file -e` + `git show --name-status`로 정정 — 서브에이전트 분석이 틀렸고 오케스트레이터의 사실은 맞았으나 결론이 틀렸다). Cross-ref: R020 Read-Before-Characterize, R010 「참인 전제 ≠ 참인 함의」.

### Verification-Delegation Non-Termination (검증 위임 판정 종료 보장)

구조 검증(mgr-sauron R017)·판정·품질 게이트를 서브에이전트에 위임할 때, 위임 프롬프트에 **"최종 PASS/FAIL 판정 없이 turn을 종료하지 말라"**를 명시한다 — 단 이 clause는 **보조 수단**일 뿐 1차 방어선이 아니다. clause를 명시해도 mid-step 종료가 **누적 14회** 재발했다(v1.1.13/14/17/18/19 … v1.1.44, 아래 Origin 참조). **예방의 1차 방어선은 위임 경계 분할**(아래 「위임 경계를 Phase 개수로 설계」)이고, **사후 1차 방어선은 오케스트레이터의 직접 ground-truth 실측**이다.

mid-step 종료는 예상 가능한 정상 실패 모드로 취급한다 — 발생 시 즉시 ground-truth를 실측해 실제 진행 상태를 확인한다. **증상만으로 결과를 넘겨짚지 않는다**: 같은 "...중" 한 줄 종료라도 실측 결과는 **세 방향 모두** 관측됐다 — (a) 보고=완료("merging now" → 실측 시 PR 이미 MERGED, resume 불필요), (b) 보고=미완료("CI 실행 중" → 실측 시 PR OPEN 미머지, resume 필요), (c) **실제가 보고보다 앞섬**("커밋 1 완료, 커밋 2 스테이징으로 이어갑니다" → 실측 시 3개 커밋 전부 완료). 세 방향이 모두 나온 이상 증상 기반 진행도 추론은 **원리적으로 불가능**하며, 실측만이 유일한 판정 수단이다. 미완이면 SendMessage로 resume하되, 오케스트레이터가 실측한 값(예: "CI 전부 통과, mergeStateStatus=CLEAN")을 resume 메시지에 동봉해 에이전트가 재폴링 후 재종료하는 루프를 끊는다.

| Anti-pattern | Required |
|--------------|----------|
| 위임 프롬프트 clause 명시만으로 판정을 신뢰 | clause는 보조 수단; 오케스트레이터가 항상 직접 ground-truth 실측 |
| mid-step 종료 증상(예: "merging now")으로 결과를 넘겨짚음 | 매번 `gh pr view`/`gh run list` 등으로 실측 후 완료/미완료 판정 |
| resume 시 빈 재촉만 전달 | 실측값을 resume 메시지에 동봉해 재폴링 루프 차단 |

#### 위임 경계를 Phase 개수로 설계 (예방 1차 방어선)

다중 Phase 작업을 한 에이전트에 위임하면 **Phase 경계가 곧 종료 유혹 지점**이 된다 — 완료 조건 번호 명시와 종료 금지 clause를 넣어도 동일하다. 위임 단위는 **단일 목표 1개**로 자르고, Phase가 2개 이상이면 분할해 순차 발주한다.

| Anti-pattern | Required |
|--------------|----------|
| 다중 Phase 작업(3-Phase 검증, 3-커밋 시퀀스)을 한 에이전트에 위임하고 clause로 종료를 막으려 함 | 위임 단위를 단일 목표 1개로 분할해 순차 발주 — 경계 분할이 clause 강화보다 실효적 |

대조 실증(#1574, v1.1.44 세션): 단일 목표 위임(PR 생성 / 머지 / 브랜치 정리 / 버전 범프) **4건 전원 완주**, 다중 Phase 위임(mgr-sauron 3-Phase, mgr-gitnerd 3-커밋) **2건 모두 mid-step 종료**. 같은 세션에서 릴리즈 단계를 push+범프 / PR 생성 / 머지로 3분할한 것이 이 설계의 적용례다.

**배선 (R016 Rule Wiring Check)**: 이 조항의 발동 실행 경로는 `auto-dev.yaml`의 `deep-plan` / `deep-verify` 스텝이다. 파이프라인 정의가 `skill: deep-plan`처럼 **스킬 이름만** 적고 있으면, 그 정의를 따르는 것이 이 조항을 우회하는 경로가 된다 — `skill:` 값은 **분할의 근거가 되는 스킬 정의**를 가리키는 것이지 "1회 호출하라"는 지시가 아니다. 다중 Phase 스킬을 파이프라인 스텝으로 두는 정의에는 분할 지시를 **스텝 설명에 함께 기재**한다(auto-dev.yaml은 4개 사본이 CI로 동일성 강제됨).

| Anti-pattern | Required |
|--------------|----------|
| 파이프라인 정의가 `skill: <다중 Phase 스킬>`이므로 그대로 호출 | 스킬 정의의 Phase를 먼저 읽고 단일 목표 위임으로 분할해 순차 발주; 파이프라인 정의에도 분할 지시를 배선 |

Origin 보강: #1595 #4 (v1.1.48 세션 — `deep-plan`(3-Phase)이 식별 헤더만 출력하고 tool_uses=0으로 6.9초에 종료, 산출물 0 실측. `mgr-sauron`(3-Phase)은 판정 없이 종료. 두 건 모두 이 조항을 **알고 있었음에도** `auto-dev.yaml`의 스킬 지정을 따라 그대로 호출한 결과 — 텍스트는 있고 배선이 없던 사례).

Origin: #1443 (Session 126 회고 찐빠 #1) — v1.1.3 R017 검증에서 mgr-sauron이 source-hash 대조 중 판정 없이 종료 → resume 후 PASS. v1.1.4에서 "판정 반드시 출력" 명시로 1회 완료(대조 실증). **5회 재발 확인(#1492, Session 132)**: v1.1.13/14/17(clause 명시에도 재발) → v1.1.18(완료조건 6항목+종료금지 명시에도 "merging now" 한 줄 남기고 종료, 실측 결과 이미 완료) → v1.1.19(위임 프롬프트에 "4회 무시됨"까지 명시했으나 "CI 실행 중" 한 줄 남기고 종료, 실측 결과 미완료). Session 132에서 2회 모두 오케스트레이터 직접 실측으로 복구 — clause 강화가 아니라 실측 습관화가 유일하게 실증된 방어선. **누적 11회 확인(#1518 찐빠 #2, Session 136)**: v1.1.30 릴리즈 세션에서도 "완료 조건 5항목 실측 + 판정 없이 종료 금지" 명시에도 mgr-gitnerd가 "폴링 완료 통지를 기다리겠습니다" 한 줄만 남기고 종료 → 오케스트레이터 직접 실측으로 복구(lockfile push 완료 / CI pending / PR OPEN); 이번엔 "대기 중" 증상이 실제 미완료였고 Session 132의 "머지 중" 증상은 실제 완료였다는 대비로 증상→결과 추론 금지가 재확인됨. **누적 14회 + 3방향째 확인(#1574, v1.1.44 세션)**: mgr-sauron 3-Phase / mgr-gitnerd 3-커밋 위임 2건이 Phase 경계에서 종료했고(위 「위임 경계를 Phase 개수로 설계」의 대조 실증), 그중 mgr-gitnerd는 "커밋 2로 이어가겠다"고 보고했으나 실측 시 3개 커밋이 이미 전부 완료 — 실제가 보고보다 앞서는 세 번째 방향.

Cross-reference: R018 (Member Completion Verification), `feedback_release_delegation_phasing`, `feedback_orchestrator_direct_verify` (release delegation phasing을 verification 위임에도 확장).

#### maxTurns 절단 실증 (Origin: v1.1.50 세션)

**실측 (v1.1.50 세션)**: 오케스트레이터가 4개 그룹을 병렬 위임했고 **그중 3개가 20턴 `maxTurns` 한도로 절단**됐다. 세 건 모두 통지에 `stopped at its 20-turn limit (partial result)`이 명시됐고 출력이 작업 중간에서 끊겼다 — 한 건은 문장 중간에서 절단(진행도 불명, 실측 필요), 한 건은 "Templates 미러를 동기화합니다"라고 예고한 직후 절단(오케스트레이터는 미실행으로 추정했으나 **실측 결과 미러 동기화까지 이미 완료**돼 있었다 — 위 「증상만으로 결과를 넘겨짚지 않는다」의 "(c) 실제가 보고보다 앞섬" 재현), 한 건은 "Now R020 — three items"라고 다음 작업을 예고한 직후 절단(실측 결과 **편집은 완료, 검증만 미수행** 상태였다). 세 건 모두 **절단 위치 문장과 실제 진행도가 어긋났다** — 이것이 이 실증의 핵심이다.

1. **확정**: `maxTurns` 절단은 이 조항이 누적 14회로 기록한 "판정 없이 종료" 증상의 **실재하는 원인 중 하나**다. CC v2.1.246부터 partial로 표시되므로 이제 **관측 가능**하다(그 이전에는 완료로 보였다 — R018 v2.1.246 노트 교차참조).
2. **미확정**: 과거 14회 **각각**이 이 원인이었는지는 미검증이다. 사례별 귀속에는 turn 수·소요 시간 대조가 필요하다.
3. **설명력**: 이것은 **왜 clause 강화가 14회 내내 실패했는지**를 설명한다 — 에이전트에게 "종료하지 말라"고 지시해도 **절단 주체가 에이전트가 아니면 지시가 닿지 않는다**. 역으로 「위임 경계를 Phase 개수로 설계」가 효과적이었던 이유도 설명된다: 작업이 작으면 턴 한도 안에 끝나기 때문이지 에이전트가 더 순종적이어서가 아니다.
4. **정량 기준 신설**: 위임 크기 판정을 "Phase가 몇 개인가"에서 **"필요 tool call이 20턴 안에 들어가는가"**로 바꾼다. 파일 1개당 Read + Edit + 미러 Edit + diff 확인 = 약 4턴이므로, **파일 편집형 위임은 담당 파일 4~5개가 실질 상한**이다. v1.1.50 세션의 절단 3건은 담당 파일이 각각 4개·3개·7개였고 파일당 신규 노트 추가·은퇴 판정·미러 동기화를 함께 요구했다 — 산술적으로 20턴에 들어갈 수 없는 위임이었다. **이는 에이전트의 실패가 아니라 오케스트레이터의 위임 설계 결함이다.**
5. **완화책**: 미러 동기화처럼 **후행 필수 작업은 마지막에 몰지 말고 파일 단위로 즉시 수행**한다 — 절단은 항상 마지막 작업을 자르므로, 마지막에 몰린 작업은 절단 시 전량 유실된다.
6. **정량 기준 정밀화 — 산술 단위는 파일이 아니라 편집 항목 (Origin: #1621 #2a, v1.1.51 세션)**: 위 4항의 "파일 4~5개 상한"은 신설 당일 재절단을 막지 못했다 — R017 그룹은 담당 6파일로 상한 인접이었으나, 실제 초과 원인은 파일 수가 아니라 **조항 2개 신설**이었다. 파일당 편집 항목이 1개라는 암묵 가정이 깨지면 파일 수 기준 산술이 무의미해진다. 위임 크기 산술의 단위는 **편집 항목 수**(신설 조항 1개, 버전 노트 1개, 사본 배선 1개 등)로 바꾼다: **항목당 약 2턴(Edit + 위치 탐색) + 파일당 고정비(Read 1 + 미러 Edit 1 + diff 1 = 3턴)**로 계산한다. 같은 세션에서 4파일·항목 소수 위임들은 완주해 대조를 이룬다.
7. **리서치형 위임의 산출물 우선 기록 (Origin: #1621 #2b, v1.1.51 세션)**: 파일 편집형뿐 아니라 리서치형(수집 중심) 위임도 절단에 취약하다 — v1.1.51 세션에서 훅 이벤트 감사 위임이 22회 도구 호출(WebFetch/Read)을 전부 수집에 쓰고 **아티팩트를 1회도 Write하지 않은 채 절단**되어, 수집한 산출물 전량이 에이전트 컨텍스트에만 존재하고 파일에는 남지 않았다(재개 지시 "산출물 우선 기록"으로 복구). 리서치형 위임의 표준 문안에는 **"첫 2턴 안에 아티팩트 골격을 Write하고 수집 즉시 증분 Edit하라 — 수집 완료 후 일괄 기록 금지"**를 포함한다. 절단은 항상 마지막 작업을 자르므로, 기록을 마지막에 몰면 절단 시 산출물이 전량 유실된다 — 위 5항(파일 편집형의 "미러 즉시 동기화")의 리서치형 대응이다.
8. **훅 피드백 잠식 (Origin: #1625 #5)**: settings 훅은 서브에이전트 세션에도 발화하므로, 세션 종료성 훅(Stop 계열)의 반복 피드백이 서브에이전트의 마지막 턴들을 소모·오염시켜 최종 보고가 "대기 중" 류로 끝날 수 있다 — mid-step 종료·"실제가 보고보다 앞섬"의 신규 원인 축. v1.1.53 세션에서 커밋 에이전트 2건의 "대기 중" 보고가 실측 결과 모두 완전 완료였다. 절단·대기 보고를 받으면 훅 피드백 잠식 가능성도 원인 후보에 포함하고 ground-truth로 판정한다.

| Anti-pattern | Required |
|--------------|----------|
| 파일 수만 세어 위임 크기 판정 → 조항 다수 파일에서 절단 | 편집 항목 수 × 2턴 + 파일 고정비(3턴)로 산술 |
| 리서치 위임이 수집을 끝낸 뒤 일괄 기록 | 첫 2턴 내 골격 Write + 증분 Edit |
| "대기 중" 보고를 미완료로 단정 | 훅 피드백 잠식 가능성 포함해 ground-truth로 완료 여부 판정 |

> **v2.1.257+**: 서브에이전트가 컴퓨터 절전·연결 끊김·서버 오류로 응답이 mid-stream 절단될 때 불완전 응답으로 그대로 종료하던 동작이 **자동 이어감**으로 수정되었습니다. 즉 "판정 없이 종료" 증상의 원인 축 중 **네트워크/서버 절단 축은 v2.1.257부터 소멸**하며, 남는 실재 원인은 `maxTurns` 한도(위 실증)·위임 경계 미분할·에이전트 자체 판단 종료·훅 피드백 잠식(8항)입니다. 따라서 v2.1.257+ 환경에서 mid-step 종료를 관측하면 네트워크 절단을 원인 후보에서 먼저 제외하고 `maxTurns` partial 표시 유무를 확인합니다 — 단 원인 축 하나가 사라졌다고 ground-truth 실측 원칙을 낮추지 않습니다. 같은 릴리즈에서 턴을 백그라운드로 보낼 때(`←`/Ctrl+B) 실행 중이던 도구가 거부된 것으로 처리되던 결함도 수정되어, 구버전 background 세션의 "도구 거부됨" 기록은 실제 거부의 증거가 아닐 수 있습니다.

Cross-reference: R018 (v2.1.246 maxTurns partial-marking 노트), R009 (Member Prompt Size Cap — 프롬프트 토큰 상한과 별개로 턴 수 상한도 위임 크기 설계 변수임을 추가).

<!--
> **v2.1.199+**: subagent가 API 오류(usage limit reached 등)를 성공 결과로 오보하던 문제가 수정되어 이제 오류가 parent agent에 정확히 보고됩니다. 플랫폼 수정으로 false-success 자가보고 빈도는 줄지만, "actual outcome ≠ attempt" ground-truth 검증 원칙(R020 Core Rule)은 여전히 유지된다 — subagent 보고를 그대로 신뢰하지 말고 `git status`/`grep`/validation script로 재확인한다.

> **v2.1.200+**: rate limit으로 어떤 텍스트 출력도 내기 전에 잘린 subagent가 이전에는 빈 결과(empty result)를 반환하던 것을 clean failure로 반환하도록 수정되었습니다 — v2.1.199 partial-work 반환에 이어, 출력 이전 rate-limit 차단 시 조용한 빈 결과 대신 명시적 실패를 parent에 보고합니다. 플랫폼이 false-success/silent-empty 자가보고를 추가로 줄였으나, "actual outcome ≠ attempt" ground-truth 검증 원칙(R020 Core Rule)은 여전히 유지됩니다 — subagent 보고를 그대로 신뢰하지 말고 git status/grep/validation script로 재확인합니다.
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.211+**: CC의 background agent 결과 보고가 개선되어, Claude가 아직 실행 중인 agent의 상태를 그대로 보고하고 **결과를 지어내지 않고 실제 완료를 기다립니다**(previously fabricated results). v2.1.199/200(false-success·silent-empty 자가보고 감소)에 이은 플랫폼 개선으로 오케스트레이터의 fabricated-completion 리스크를 추가로 낮추지만, "actual outcome ≠ attempt" ground-truth 검증 원칙(Core Rule)은 여전히 유지됩니다 — subagent/background agent 보고를 그대로 신뢰하지 말고 `git status`/`grep`/validation script로 재확인합니다. -->

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
| 트랜스크립트·로그 통계로 원인 추정 | 통계적 상관(예: "첫 레코드 thinking 13/21")만으로 코드 경로의 인과를 "확정"해 이슈 코멘트·메모리에 기록 | 해당 코드 경로를 읽고 판정 로직을 1:1 재현(jq/스크립트)해 인과를 확인한 뒤 기록; 그 전에는 R011 `[hypothesis]` 태그로만 저장 |

### Common Violation (#1217 item #4)
npm publish E403을 `--provenance` attestation 충돌로 오진단 → release workflow에서 `--provenance` 제거 커밋 머지 → 2차 시도 동일 실패 → 실제 원인은 NPM_TOKEN 권한(Automation token 필요). 잘못된 추정으로 릴리즈 워크플로우를 영구 변경.

### Common Violation (#1652 #1) — 통계적 상관 ≠ 코드 인과
v1.1.59 세션에서 #1643(advisor "R007 헤더=0" 오탐) 원인을 트랜스크립트 통계만으로 "advisor가 thinking 전용 첫 레코드를 병합하지 못함"이라 이슈 코멘트·feedback 메모리에 확정 기록 → triage가 현행 코드(이미 병합·thinking 제외)와의 불일치를 지적 → 진단 에이전트가 jq로 판정 로직을 1:1 재현해 반박 — 실제 원인은 레이블 문구 모호성(값은 위반 건수인데 "헤더=0"으로 읽힘). 같은 세션 2회째: `gh pr merge --delete-branch` 로컬 부수효과를 reflog 3건으로 "확정" 저장했으나 4번째 머지(PR #1651)에서 재현되지 않아 "원인 미확정"으로 정정. 두 건 모두 상관을 인과로 승격한 Read-Before-Characterize 자기 위반이며, R011 즉시 저장과 결합해 틀린 전제가 영속화될 뻔했다. Cross-ref: R011 「Mid-Session Immediate Save」 `[hypothesis]` 행, R010 「저장소 상태 기재도 같은 규율」, 아래 「Self-Violation Counting Is Also Diagnosis」.

### Self-Check (영구 변경 전)
1. 가설을 뒷받침하는 직접 증거(로그/에러 코드/문서)가 있는가?
2. 비파괴적 방법으로 가설을 검증할 수 있는가?
3. 변경이 되돌리기 쉬운가? (영구 워크플로우 변경 vs 일회성 시도)
4. 결함이 발생한 실행 경로(워크플로우 YAML/스킬 정의/스크립트/CI 설정)를 직접 읽었는가? 수동 재현 성공으로 자동화 경로의 동작을 추정하지 않았는가?
하나라도 NO면 검증을 먼저 수행한다. 근본 원인 진단은 `superpowers:systematic-debugging` 참조.

Origin: #1533 (lockfile 4릴리즈 누락을 "스테이징 누락"으로 오진 — 실제 원인은 version-bump 절차에 build 단계 부재; 수동 재현 결과로 자동화 경로를 추정).

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

### Self-Violation Counting Is Also Diagnosis (#1553 ②)

**자기 위반 횟수를 세는 것도 진단이다.** 회고·자가 보고에서 "몇 번 위반했는가"를 기억(recall)으로 세면 체계적으로 **과소 계상**된다 — 위반 순간은 정의상 자각 없이 지나간 순간이므로, 기억에는 나중에 스스로 알아챈 소수만 남는다. 위반 횟수는 추정하지 말고 **transcript를 실제로 파싱해** 센다(예: 응답 시작 라인에 R007 헤더 패턴이 없는 assistant turn 수를 grep/스크립트로 집계).

| Anti-pattern | Required |
|--------------|----------|
| 회고에서 "직전 두 응답에서 누락했습니다"처럼 기억 기반으로 위반 횟수 보고 | transcript를 파싱해 실측 집계 후 보고 (예: 헤더 패턴 미매칭 turn 수 grep) |
| 실측 없이 "몇 회 정도" 추정치로 위반 심각도를 특성화 | 실측값으로 심각도 판정 — 과소 계상은 후속 조치 우선순위를 왜곡한다 |

실증: 2026-07-30 세션에서 자가 보고는 "직전 두 응답에서 누락"(2회)이었으나 transcript 실측은 **7회**였다 — 3.5배 과소 계상. Origin: #1553 찐빠 #2.

**계수를 수행하지 않았다면 그 사실을 명시할 것 (Origin: #1601, v1.1.49 세션)**: 시간·비용 제약으로 transcript 파싱 계수를 생략하는 경우, 회고 자체에 "전수 계수 미수행"임을 밝혀야 한다. 계수하지 않은 회고의 항목 목록은 위반 전수가 아니라 **"진행 중 자각했거나 서브에이전트가 지적한 항목"에 한정**되며, 이를 밝히지 않으면 독자가 목록을 전수로 오해해 후속 조치 우선순위가 왜곡된다. v1.1.49 세션 회고는 계수를 수행하지 않았고 그 사실을 스스로 명시했다(좋은 사례) — 대조적으로 그 이전 세션(위 실증)은 계수 미수행 여부를 밝히지 않은 기억 기반 자가 보고였고 실측 대비 3.5배 과소 계상이었다.

이는 Read-Before-Characterize의 **자기 적용** 각도다 — 진단 대상이 외부 로그가 아니라 자기 자신의 transcript일 때에도 "읽기 전 특성화 금지"가 동일하게 적용된다.

#### 자율 루프 세션의 턴 경계 정의 (계수 전 확정 필수)

위 파싱 레시피는 **"사용자 프롬프트 = 턴 경계"**를 암묵 전제한다. `/fsd` 같은 자율 루프는 사용자 프롬프트가 거의 없어(실측: 사용자 프롬프트 4개 대 assistant 응답 30여 회) 이 전제로는 경계 재구성이 실패하고, 계수 자체가 성립하지 않는다. 자율 루프 transcript를 셀 때는 **두 단계를 순서대로** 수행하고, 완료 전에는 **위반 횟수를 단정하지 않는다**.

1. **전처리 — `.message.role`이 존재하는 라인만 필터링**한다. 트랜스크립트에는 role 없는 라인(메타·이벤트·요약)이 assistant/user 사이에 대량으로 끼어 있어, 필터 없이는 **인접성 판정 자체가 깨진다**. 2단계의 어떤 경계 정의도 이 필터 없이는 성립하지 않는다.
2. **경계 정의(규범)** — 응답 시작 경계는 **`content`에 `tool_result` 블록을 포함하지 않는 user 메시지**로 정의한다. 도구 결과도 `role: user`로 기록되므로, "user→assistant 전이 = 응답 시작"이라는 단순 정의는 도구 결과 뒤에 이어지는 assistant 메시지를 전부 새 응답으로 오인해 **위반 건수를 대폭 과대 계상**한다. 실증: 이 정의를 쓰지 않고 파싱했을 때 R007 위반이 177건으로 나왔으나, 위 규범대로 경계를 고치자 1건이 됐다(177배 과대). R008도 44 → 33으로 정정됐다.

### 자가 계수는 advisor 판정식을 재현한다

자체 해석 패턴으로 위반을 세지 말고, `.claude/hooks/scripts/r007-r008-drift-advisor.sh`의 판정식을 **1:1 재현**한다. 실증: 자체 announce 패턴을 advisor보다 좁게 잡아(번호 매긴 병렬 스폰 라인 `[N] agent:model → desc` 형식을 announce로 미포함) R008 위반을 과대 계상했다 — advisor 스크립트 자체를 참조하지 않고 "그럴듯한 정의"로 재구현하면 같은 종류의 오차가 반복된다.

| Anti-pattern | Required |
|--------------|----------|
| 자율 루프 transcript를 사용자 프롬프트 경계로 파싱해 위반 N회로 단정 | 1단계 필터 + 2단계 경계 정의를 먼저 확정; 확정 전에는 횟수 단정 금지 |
| 필터 없이 원본 라인 순서로 인접성을 판정 → 계수 실패를 경계 정의 탓으로 오진 | `.message.role` 필터를 먼저 적용한 뒤 경계 정의를 평가 |
| 경계 재구성 실패를 "위반 없음"으로 해석 | 경계 무관 지표로 대체 보고 — `┌─ Agent:` 헤더 총량, tool_use 대 announce 라인 비율 |
| "user→assistant 전이"를 응답 시작 경계로 단순 정의 → `tool_result`(role=user) 뒤 assistant 응답을 전부 새 응답으로 오산입 | 경계 = `tool_result` 블록을 포함하지 않는 user 메시지 (규범) |
| 자체 해석 패턴(예: 좁게 잡은 announce 정규식)으로 위반을 재계산 | `r007-r008-drift-advisor.sh`의 판정식을 그대로 재현 |

Origin: #1574 (v1.1.44 세션 — 자율 루프에서 R007 헤더 누락 계수를 시도했으나 사용자 프롬프트 4개로 턴 경계 재구성 불가); 1단계 필터는 #1584 #3 (v1.1.45 세션 — 위 조항을 신설했음에도 계수가 재실패. 실제 장애물은 경계 정의가 아니라 **`role=null` 라인 661개 / 전체 1215줄의 54%**였고, 필터 추가 즉시 성립(응답 시작 50, R007 위반 0) — 조항이 원인을 절반만 짚어 재발한 사례). 경계 규범 승격 및 advisor 판정식 재현은 #1593 #6 (경계 오정의로 R007 177배 과대 계상, `tool_result` 배제 정의로 정정; R008은 좁은 announce 패턴 자가 재구현으로 44→33 정정). Cross-ref: R005(계수/매칭 방법 확인 — 도구 기본 동작 미확인 시 결과 오해석).

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

**훅 스크립트 각도 — stdin 필드 형상은 실측 후 편집 (Origin: #1658 #1, v1.1.62)**: 훅 스크립트가 읽는 stdin 필드(`tool_input`/`tool_response`/`agent_id` 등)를 편집·가드·억제하기 전에 **실제 페이로드 형상을 실측**한다 — 트랜스크립트의 `attachment.type=="hook_success"` 레코드에서 `attachment.stdout`이 pass-through 훅이 되돌린 stdin 원문이며, CC 바이너리 내장 훅 문서로 교차검증한다. 처방("가드 추가·`?` 억제")만 위임하면 선택자 결함 위에 가드를 얹어 마지막 실패 신호까지 지운다. 실증: v1.1.62에서 `secret-filter.sh`가 PostToolUse에 존재하지 않는 `tool_output`(0/1764)을 읽어 실제 페이로드를 한 번도 스캔하지 않던 선재 결함 위에 `?` 억제가 추가됐고(rc=5 신호 소멸), 적대적 리뷰가 실측 형상 재현으로 FAIL 판정해 `tool_response`(1764/1764)로 교체했다. 훅 편집 위임서 표준 문안: "스크립트가 읽는 stdin 필드는 `hook_success` 레코드로 형상 실측 후 편집".

| Anti-pattern | Required |
|--------------|----------|
| 훅 위임서에 "가드 추가·`?` 억제" 처방만 전달 | 읽는 필드의 실제 형상(`hook_success` stdin 원문 + 바이너리 훅 문서) 실측을 위임서 완료 조건에 포함 |

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

### Failure/Interrupt Report ≠ Actual Failure (reverse direction)

위 항목들은 대체로 "성공 보고 ≠ 실제 성공"을 다루지만, **역방향**도 동일하게 검증 대상이다 — "실패/중단 보고"를 받았을 때도 ground-truth를 확인하기 전에는 실제로 실패했다고 단정하지 않는다.

| 증상 | 실제 상태 | 확인 수단 |
|------|-----------|-----------|
| **v2.1.246+**: 매우 큰 기존 파일을 덮어쓴 뒤 Write 도구가 "Out of memory"를 보고하거나 오래 멈춤 | **파일 자체는 정상적으로 쓰여 있었다** | 도구의 실패 보고 대신 파일 내용/크기를 직접 재확인 |
| **v2.1.246+**: 헤드리스/원격 세션에서 수신 메시지로 인터럽트된 MCP 도구 호출이 "출력 없이 완료됨"으로 보고됨(v2.1.246 이전) | 실제로는 **인터럽트**됐다 — 정상 완료가 아니었다 | v2.1.246+는 명시적 interrupted 에러로 보고하도록 수정됨; 구버전 세션의 "빈 출력 완료"는 무음 인터럽트였을 수 있음 |
| **v2.1.246+**: 실행 중 인터럽트된 셸 명령이 "Ran 1 shell command"로만 표시(잘렸다는 표시 없음, v2.1.246 이전) | 명령이 **완주하지 못했다** | 출력 완결성을 별도로 확인(예상 출력 패턴 대조) 없이 "실행됨"만으로 성공 단정 금지 |

> **v2.1.252/257/258+**: 실패/중단 관련 보고 무결성 결함 3건이 추가로 수정되었습니다. (252) 매우 큰 실패 출력(디스크 풀 상태의 git 오류 등)을 실은 background task 알림이 대화를 API 요청 크기 한도 밖으로 밀어내던 결함 — R021 v2.1.247 훅 출력 폭주 계열의 background task 각도이며, 구버전에서 "Prompt is too long"으로 세션이 멈춘 것은 작업 자체의 실패가 아니라 실패 **알림의 크기** 때문일 수 있었습니다. (257) `claude -p`가 모델이 armed한 Monitor가 아직 도는 중인데도 최종 결과 약 5초 뒤 종료하던 결함이 수정되어, 이제 감시가 발화하거나 타임아웃될 때까지 대기합니다 — 무인 `-p` 실행에서 Monitor 결과 부재는 이제 "감시 미발화"로 해석하며 "조기 종료"로 오판하지 않습니다. (258) 원격·예약 세션이 재전송된 permission approval을 적용하지 못한 뒤 "user messages must have non-empty content"로 실패하던 결함이 수정되었습니다 — R010 v2.1.234 "background subagent 승인·거부가 드롭될 수 있던 결함" 계열의 원격 세션 각도이며, 구버전 `/schedule`·remote 세션의 이 오류 문구는 프롬프트 자체의 결함이 아니라 승인 채널의 결함이었습니다.

> **v2.1.234+**: print/SDK 모드에서 SIGTERM 수신 시 더 이상 interrupted turn이나 synthetic tool denial을 기록하지 않는다(명령은 여전히 종료되고 프로세스는 exit code 143). 무인 실행(`-p` 모드) 강제 종료 후 트랜스크립트를 완료 판정 근거로 쓸 때, v2.1.234+에서는 SIGTERM에 의한 중단이 트랜스크립트 상에 "interrupted"로 남지 않는다는 점을 전제해야 한다 — 트랜스크립트가 깨끗해 보여도 실제로는 SIGTERM으로 잘렸을 수 있다.

**교훈**: 위 Core Rule("actual outcome ≠ attempt")은 방향이 없다 — 도구가 성공을 보고하든 실패를 보고하든, 보고 자체는 ground-truth가 아니다. 실패 보고를 받았다고 곧바로 재시도·롤백에 들어가지 말고, 먼저 실제 산출물 상태를 확인한다.

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

# [SHOULD] Verification Ladder Rules

> **Priority**: SHOULD | **ID**: R023

## Core Rule

검증은 비용/속도 ladder로 구성한다: **결정론적 검사 → cheap LLM → expensive LLM → human**. 가장 저렴한 tier가 먼저 통과해야 다음 tier로 진행한다. 더 낮은 tier에서 잡을 수 있는 문제를 더 비싼 tier에 보내지 않는다.

## Ladder Tiers

| Tier | 도구 | 비용 | 속도 | 적용 시점 |
|------|------|------|------|-----------|
| **1: Deterministic** | hooks, linters, type-check, JSON schema | $0 | <1s | Pre-write, write-time |
| **2: Cheap LLM** | haiku-based skills (`dev-review`, `action-validator`) | $ | <30s | Per-file review |
| **3: Expensive LLM** | sonnet/opus skills (`deep-verify`, `adversarial-review`, `multi-model-verification`, `evaluator-optimizer`) | $$$ | 1-5분 | Pre-commit, PR review |
| **4: Human** | maintainer review | time | hours-days | Final gate, contested decisions |

> **v2.1.232+**: `/code-review`가 high·xhigh·max effort에서도 **background agent로 실행**됩니다(다른 레벨과 동일). 즉 Tier 3 검증 호출의 반환은 착수 신호이지 검증 결과가 아니므로, 다음 tier 진행이나 통과 판정 전에 background agent의 실제 완료와 결과를 실측합니다 — 구버전에서는 고effort 레벨만 전경 실행이라 "반환 = 결과"가 성립했고, 그 전제로 ladder를 진행하면 미완료 검증을 통과로 오판합니다(R020 "attempt ≠ outcome", cross-ref R010 non-teammate background 기본 실행).

## Shift-left 원칙

결정론적 단계가 잡을 수 있는 문제는 LLM에 보내지 않는다. LLM 검증은 ambiguous/semantic 문제에 집중한다.

- **좋은 예**: JSON schema 오류 → Tier 1 hook이 차단 → LLM에 미전달
- **나쁜 예**: 탭/스페이스 혼용 오류 → sonnet으로 전달 → 불필요한 비용 발생

R013 (SHOULD-ecomode)의 출력 토큰 절약 원칙(Compact Output — 중간 단계·장황한 설명 생략)과 정합: ecomode는 출력 토큰을, R023은 검증 비용을 절약한다.

## 기존 자산 매핑

| Tier | 자산 | 역할 |
|------|------|------|
| **Tier 1** | `.claude/hooks/` (PreToolUse hooks) | 도구 호출 전 결정론적 차단 |
| **Tier 1** | `mgr-sauron` (R017 구조 검증) | 에이전트/스킬/가이드 frontmatter 검증 |
| **Tier 1** | pre-commit configs, linters | 코드 품질 정적 검사 |
| **Tier 2** | `dev-review` | 파일 단위 haiku 코드 리뷰 |
| **Tier 2** | `action-validator` | CI/CD 액션 구문 검증 |
| **Tier 2** | `pre-generation-arch-check` | 생성 전 아키텍처 lite 점검 |
| **Tier 3** | `deep-verify` | 다단계 품질 검증 (sonnet) |
| **Tier 3** | `adversarial-review` | 공격자 시각 보안 리뷰 (opus) |
| **Tier 3** | `multi-model-verification` | 복수 모델 교차 검증 |
| **Tier 3** | `evaluator-optimizer` | 평가-개선 반복 루프 |
| **Tier 3** | `worker-reviewer-pipeline` | 구현-리뷰 파이프라인 |
| **Tier 4** | maintainer manual review | PR approval, final gate |

## R021과의 관계

R021 (MUST-enforcement-policy)과 R023은 **직교**한다. 두 규칙은 서로 다른 차원을 다룬다:

| 규칙 | 질문 | 차원 |
|------|------|------|
| **R021** | "어떻게 강제할 것인가?" | Hard block / Soft block / Advisory |
| **R023** | "어떤 비용으로 검증할 것인가?" | Deterministic / Cheap LLM / Expensive LLM |

같은 도구가 두 규칙에 동시에 속할 수 있다:

- `mgr-sauron`: R021 관점에서 Advisory (PostToolUse hook), R023 관점에서 Tier 1 (구조 검증)
- `deep-verify`: R021 관점에서 Prompt-based (blocking 없음), R023 관점에서 Tier 3 (expensive LLM)
- `.claude/hooks/` stage-blocker: R021 관점에서 Hard Block, R023 관점에서 Tier 1

R021은 위반 시 어떻게 멈출지를, R023은 어떤 순서로 검증할지를 정의한다.

## Fable 5 Over-Prescription Advisory (Origin: #1435)

Fable 5 실행 에이전트/스킬은 지시(instruction) 장문화가 오히려 품질을 저하시킬 수 있다(too prescriptive). 신규 규칙/스킬 추가 시 간결성을 우선하고, Fable 5 실행 대상 문서의 과잉처방을 경계한다. 상세는 `guides/claude-code/16-fable5-prompting.md` 참조.

## Self-Check

새 검증 도구 추가 시:

- [ ] 어느 tier에 속하는지 명확한가?
- [ ] 같은 tier 내 중복 도구는 없는가?
- [ ] Tier 1에서 잡을 수 있는 문제를 다루는가? (상위 tier 대신 시프트 권고)
- [ ] Ladder 순서를 문서화했는가? (어떤 검사를 먼저 실행하는지)

## Safety-Signal Rule Authoring — Carve-Out Pre-Check (shift-left)

> Origin: #1353 (인터럽트 룰 #1341의 후속 회고에서 발견된 R001 carve-out 누락) — 인터럽트 룰(R003/R020)을 작성할 때 R001 파괴적-작업 carve-out을 1차 작성에서 빠뜨렸고, Tier 3 적대적 검증이 release-blocking으로 포착해 보정했다. Tier 3가 잡았으나, 같은 결함을 Tier 1(작성 시점 결정론적 점검)로 시프트하면 비용이 낮다.

런타임 안전-신호 동작을 정의하는 룰(인터럽트·취소·halt·중단·emergency-stop 등)을 추가/수정할 때, 작성 단계(Tier 1)에서 다음을 사전 점검한다 — Tier 3 적대적 검증에 의존하기 전에 (이 checklist 같은 메타-룰은 대상 아님):

- [ ] 이 룰이 R001 파괴적·비가역 작업(`git reset --hard`, `clean -fd`, `rm`, 터널/DNS/k8s/인프라 삭제) 컨텍스트에서도 안전한가? (fail-closed carve-out 필요 여부)
- [ ] "진행/계속(proceed)" 류 지시의 대상이 파괴적 작업의 계속으로 오독될 여지가 없는가?
- [ ] 안전-신호의 fail-safe 의미(emergency-halt)를 약화시키지 않는가? (stop-first ask-after 우선)
- [ ] 기존 안전 규칙(R001/R002)과의 우선순위가 명시되어 있는가?

하나라도 불확실하면 **먼저 carve-out을 명시(Tier 1 우선 해결)**하고, 그래도 불확실하면 Tier 3 적대적 검증(`adversarial-review`, `multi-model-verification`)을 통과시킨 뒤 release한다 (ladder 순서 유지). 이는 R023 shift-left 원칙(저렴한 tier 우선)을 룰 작성 자체에 적용한 것이며, R016 룰 작성 워크플로우의 Tier-1 품질 게이트로 동작한다 (R016은 위반 후 룰 업데이트 소유, R023 carve-out은 안전-신호 룰 작성 시 사전 점검 — 직교). Closes #1353.

## Deprecated-Platform-Feature Staleness Check (Origin: #1433 #3)

staleness/audit 검증은 model ID·placeholder·TBD뿐 아니라 **폐기된 플랫폼 기능·설정·절차 참조**도 스캔해야 한다. 실례: CC v2.1.121에서 폐기된 `/tmp/*.sh` script bypass 절차가 9개 에이전트 본문에 잔존했으나(v1.1.0에서 제거) 감사 staleness dimension이 model-ID/placeholder에만 한정해 이를 놓쳤다. 감사·staleness 체크리스트에 "CC 특정 버전에서 폐기된 기능/설정/절차를 현행처럼 참조하는가"를 항목으로 추가한다. 이는 R023 shift-left(저렴한 결정론적 grep으로 폐기 참조 조기 탐지)와 정합한다.

| Anti-pattern | Required |
|--------------|----------|
| staleness 스캔을 model ID/placeholder/TBD로만 한정 | 폐기된 플랫폼 기능/절차 참조(deprecated CC feature/procedure)도 grep 스캔 |

## Sample-Value Assembly Local Verification (Origin: #1455 #1)

워크플로우/스크립트 내 문자열 조립·템플릿 로직(heredoc, f-string, 다중라인 변수 삽입, 이슈 본문 조립 등)의 수정을 위임할 때, 위임 프롬프트는 **API/네트워크가 불필요한 순수 조립부를 Tier-1 로컬 결정론 검증으로 분리**하도록 명시해야 한다. 문법 검증(py_compile/YAML lint/`node --check`)은 통과해도 조립된 출력의 선행 들여쓰기·형식 결함은 드러나지 않는다 — 샘플 값(멀티라인 변수 포함)으로 출력을 실제 조립한 뒤 선행 들여쓰기·형식을 grep으로 검증해야 잡힌다.

| Anti-pattern | Required |
|--------------|----------|
| "스모크 테스트 = API 호출"로 협소 인식 → 키 불필요한 순수 문자열 조립 검증을 실서버 dispatch Tier로 미룸 | 위임 첫 프롬프트부터 "샘플 멀티라인 값으로 출력 실제 조립 후 선행 들여쓰기·형식 grep 검증"을 필수 항목으로 명시 |
| `textwrap.dedent(f"""...{multiline_var}...""")` 를 신뢰 | 삽입 변수가 0-indent 멀티라인이면 dedent 공통 최소 들여쓰기가 0으로 계산되어 무력화 → 리터럴 들여쓰기 잔존. dedent 제거 후 명시적 문자열 concatenation 사용 |

**키·해시 설계 위임서 — 저장소 대표 편집 픽스처 선확인 (Origin: #1691 #1, v1.1.71)**: 편집·상태를 식별하는 키나 해시의 설계를 위임할 때, 완료 조건에 **이 저장소의 대표 편집 3종**(룰 노트 삽입, 카운트 범프 `115→116`, 버전 범프 `1.1.68→1.1.69`)을 픽스처로 넣어 충돌 여부를 먼저 확인하도록 명시합니다. v1.1.68에서 `<len>#<head80>#<tail40>` 키를 확정형으로 지시했다가, 120자 초과 Write에서 중간 구간만 바뀌는 동일 길이 편집(바로 그 카운트·버전 범프)이 충돌한다는 사실을 적대적 리뷰가 실증해 코드포인트 합을 추가했습니다 — 작성 단계(Tier 1)에서 대표 입력으로 검증하면 Tier 3 비용이 들지 않습니다.

| Anti-pattern | Required |
|--------------|----------|
| 키·해시 형식을 확정형으로 지시하고 충돌 사례를 열거하지 않음 | 저장소 대표 편집 3종 픽스처로 충돌 선확인을 완료 조건에 포함 |

Origin: #1455 #1 (Session 127 회고 찐빠 #1) — cc-release-monitor PR #1449 머지 후 workflow_dispatch 실검증에서 issue_body의 `<details>`·릴리즈 요약에 12칸 리터럴 들여쓰기 발견 → PR #1451 재작업. 첫 위임이 문법 검증만 지시하고 샘플 값 출력 조립 검증을 누락. `textwrap.dedent` + 멀티라인 변수 함정이 문법 검증만으로는 미노출. R020(문법 통과 ≠ 출력 정상)과 정합.

## Delegated Verification Floor — CI 잡 목록에서 도출 (Origin: #1574)

위임 프롬프트의 검증 항목은 "변경 파일의 영향 범위"만으로 정하면 부족하다. **하한선은 CI가 실제로 돌리는 잡 전체**다 — 워크플로 YAML의 잡 목록을 읽어 대응하는 로컬 명령(`lint` / `test` / `validate-docs` / sync 검사)을 열거하고, 그중 로컬 실행 가능한 것을 위임 완료 조건에 포함한다. 로컬에서 통과시키지 않은 CI 잡은 병합 시점에 halt로 돌아와 수정 에이전트 추가 발주를 강제한다.

| Anti-pattern | Required |
|--------------|----------|
| "변경분 영향 범위"만 보고 검증 항목을 정해 위임 → CI 전용 잡(lint 등) 누락 | 워크플로 잡 목록을 하한선으로 삼아 로컬 대응 명령을 완료 조건에 열거 |

**상한선 — 오케스트레이터 사전 실측 항목은 재실행 금지 (Origin: #1655 제안 2)**: 하한선이 CI 잡 목록이라면 상한선은 "오케스트레이터가 이미 실측한 항목"이다. 검증 위임서에는 사전 실측 결과(테스트 pass/fail, lint·typecheck exit, 스크립트 exit, 미러 md5)를 **재실행 금지 목록**으로 열거하고 재실측 대상만 지정한다 — 서브에이전트가 전체 테스트를 재실행하면 턴 예산이 소진돼 판정 없이 절단된다. 실증: v1.1.61 세션 mgr-sauron 1차 위임(금지 목록 없음)은 `bun test` 재실행으로 25턴 절단, 2차 위임(금지 목록 + 15턴 내 판정 명시)은 16 tool_uses로 PASS 완주(R020 maxTurns 절단 누적 7건째). auto-dev.yaml deep-verify 스텝 description에 같은 문안이 배선돼 있다.

Origin: #1574 (v1.1.44 세션 — 병렬 위임 3건 모두 `bun run lint`를 누락해 verify-build halt, 수정 에이전트 1회 추가 발주). 기존 `feedback_delegation_verify_scope_by_impact`("영향 범위 기준")의 하한선을 명문화한 것이다. Cross-reference: R020(완료 검증 — 선언 전 실제 게이트 통과 확인), R017(커밋 전 검증 게이트).

## Conditional-Output Verification — Positive/Negative Pair Mandate (Origin: #1563 #2)

조건부로만 출력하는 대상(advisory 훅, 가드, 경고 emitter)의 동작을 검증하도록 위임할 때, 완료 기준은 **"출력이 나와야 하는 입력"과 "나오면 안 되는 입력"을 짝으로** 지정해야 한다. "stdout ≠ 0바이트" 같은 단일 프록시는 검증이 아니다 — 침묵이 정답인 입력에서도 통과를 요구하게 되어 기준 자체가 틀리고, 반대로 오탐(준수 턴에서 발화)을 통과시킨다.

| Anti-pattern | Required |
|--------------|----------|
| "지정 입력에서 stdout ≠ 0바이트"를 단일 완료 기준으로 위임 | 양성 케이스(발화해야 함)와 음성 케이스(침묵해야 함)를 짝으로 명시 |

Origin: #1563 찐빠 #2 — R007/R008 advisor 발화 검증에 단일 "0바이트 아님" 프록시를 제시했으나, advisor는 준수 턴에서 침묵하는 것이 정상 동작이라 기준이 성립하지 않았다. Cross-reference: R020(Proxy Signal vs Canonical Ground-Truth — 프록시로 상태를 특성화하지 말 것), 아래 Detection Guard Delegation Standard(positive-match vs negative-context 구분의 가드 설계 각도).

**래퍼·재사용 스크립트 위임의 음성 픽스처 — 원본 전처리 필터 계열별 (Origin: #1688 — Iteration 4 #3)**: 기존 스크립트(훅·판정기)를 래핑하거나 그 판정을 재사용하는 스크립트를 위임할 때, 위임서는 **원본이 입력에서 제외하는 계열**(예: advisor의 `isSidechain` 레코드, `thinking` 블록, `agent_id` 세션 게이트)을 전부 열거하고 **계열별로 적용 또는 의도적 미적용을 판정해 사유를 기재**하도록 요구하며, **제외 계열마다 음성 픽스처**를 요구합니다. 양성/음성 짝이 있어도 제외 계열이 픽스처에 없으면 "1:1 재현" 주장은 검증되지 않은 것입니다 — v1.1.67에서 `scripts/count-r007-r008.sh`가 advisor의 사이드체인 필터를 누락해 사이드체인이 섞인 트랜스크립트에서 같은 턴을 이중 계상할 수 있었고, 픽스처가 전부 `isSidechain: false`라 적대적 리뷰 전까지 미탐지였습니다. 아래 Detection Guard Delegation Standard(positive/negative 문맥 구분)와 같은 계열입니다.

| Anti-pattern | Required |
|--------------|----------|
| 래퍼 스크립트 위임서에 경계 규칙만 지정하고 원본의 전처리 필터 미열거 | 원본 제외 계열 전수 열거 + 계열별 적용/미적용 판정과 사유 + 계열별 음성 픽스처 요구 |

## Detection Guard Delegation Standard (Origin: #1438 #3)

Tier-1 shift-left 검출 가드(예: deprecated-pattern grep 가드)의 설계·수정을 서브에이전트에 위임할 때, 위임 프롬프트는 **positive-match(genuine defect mandate — `MUST`/`MANDATORY` 인접 문맥)와 negative-context(deprecation note — "no longer"/"deprecated"/"불필요"/"폐기됨" 설명 문구)를 구분**하도록 명시해야 한다. 이를 누락하면 올바르게 수정된 파일의 폐기-설명 문구까지 과잉매칭하여 자기모순 BLOCK을 유발한다.

| Anti-pattern | Required |
|--------------|----------|
| bare 패턴(`/tmp/*.sh` 등)만 grep하도록 위임 → 올바르게 수정된 파일의 "폐기됨/불필요" 설명 문구까지 오탐 | 위임 프롬프트에 positive-match(MUST/MANDATORY 인접) vs negative-context(deprecated/no longer/불필요 설명) 구분 기준을 명시 |

Origin: #1438 (Session 125 회고 찐빠 #3) — deep-verify 가드 반전 위임 시 bare `/tmp/*.sh` 패턴이 올바르게 수정된 9개 파일의 "폐기됨/불필요" 설명 문구까지 오탐; mgr-sauron이 sha256 재계산으로 적발, 3-패턴(mandate/false-claim) 협소화로 정정.

## Integration

| 규칙 | 상호작용 |
|------|---------|
| R009 (Parallel Execution) | Tier 1-2 검사는 독립 파일에 대해 병렬 실행 가능 |
| R013 (Ecomode) | 컨텍스트 압박 시 Tier 3를 Tier 2로 다운그레이드 고려 |
| R017 (Sync Verification) | Phase 1-3 검증 단계는 R023 Tier 1-3에 대응 |
| R021 (Enforcement Policy) | 직교: R021은 blocking 방식, R023은 검증 비용 순서 |

## Workflow Prompt & Verifier Ground-Truth

> Origin: #1266 ③ (High) — a Workflow built the agent prompt as `await agent(prompt) + FACTS`, concatenating the guardrail fact-sheet onto the RETURN VALUE instead of the prompt. The writer never received the facts, hallucinated an in-cluster hostname (`secretary-mcp`), and the adversarial verifier couldn't catch it (the fact was in no source it had).

### Prompt Completion Before Call

Workflow/agent prompts MUST be fully assembled into the prompt string **before** the `agent()` / Agent tool call. Post-call concatenation onto the return value is a footgun — the agent never sees the appended content.

| Anti-pattern | Required |
|--------------|----------|
| `const r = await agent(prompt) + FACTS` | `const r = await agent(prompt + FACTS)` — assemble first |

### Workflow Script Sanity Check

Before invoking a Workflow script, deterministically verify:

| Check | Why |
|-------|-----|
| No unresolved placeholders (`{phase1_summary}`, `TODO`, `<...>`, `{{ }}`) remain in any agent prompt string | An unfilled placeholder reaches the agent verbatim → garbled task |
| Template-literal / string concatenation produces the intended prompt (assemble-before-call, see above) | Post-call concatenation (`agent(prompt) + FACTS`) silently drops content |
| Script parses — balanced braces/quotes, valid JS | A syntax error aborts the entire run after partial work |
| 프롬프트 문자열 내 셸 변수 `${...}`(`$?`, `${PIPESTATUS[0]}`, `$(...)` 등)가 `\${...}`로 이스케이프되어 있는지 사전 grep 확인 | JS 템플릿 리터럴 안의 이스케이프 안 된 셸 `${...}`를 JS가 JS 표현식으로 평가 → 런타임 `ReferenceError`(예: `PIPESTATUS is not defined`). `node --check`는 문법만 검사하여 이 런타임 오류를 못 잡으므로 별도 결정론 grep 검사가 필요함 |
| Workflow `args`를 사용하는 스크립트가 `typeof args === 'string' ? JSON.parse(args) : args` 방어를 거친 뒤 필드에 접근하는지 확인 | 하니스가 객체 args를 문자열로 인코딩해 전달하면 `args.<field>`가 undefined가 되어 스크립트가 즉시 런타임 실패(0 agents 실행). `node --check`는 문법만 검사하므로 위 셸 `${...}` 이스케이프 항목과 동일한 런타임 계열을 잡지 못함 |

> **v2.1.223+**: workflow script가 동적 `import()`로 workflow 샌드박스 **밖의 코드를 실행**할 수 있던 결함이 수정되었습니다. 위 표의 체크는 프롬프트 조립·문법·런타임 계열을 다루지만 **샌드박스 탈출은 다루지 않았고**, 구버전에서는 `node --check` 통과 + 프롬프트 정상 조립 상태에서도 스크립트가 경계 밖 코드를 끌어올 수 있었습니다. 외부에서 받은 workflow script를 실행하기 전 동적 `import()` 사용 여부를 grep으로 확인합니다(Tier-1 결정론 검사).

> **v2.1.259/260+**: Workflow 도구 견고성 수정 3건입니다. (259) 워크플로 실행 재개 시 직전 stop된 실행의 프로세스가 아직 종료 중이면 그 agent들이 **중복 실행**될 수 있던 결함이 수정되었습니다 — 구버전에서는 `resumeFromRunId`를 stop 직후 바로 호출하는 것이 안전하지 않았으므로, stop → 프로세스 종료 확인 → resume 순서를 지킵니다. (260) Workflow `agent({schema})`가 이제 **충족 불가능한 JSON Schema를 사전 거부**하고, 재시도 한도 초과 에러에 마지막 검증 실패 내용을 포함합니다 — 플랫폼이 스스로 수행하는 Tier-1 결정론 사전 점검이며, 위 표의 sanity-check 항목에 "충족 불가능한 schema는 어떤 agent도 실행되기 전에 거부됨"을 추가로 간주할 수 있습니다. (260) 장시간 context compaction이 진행 중인 Workflow subagent가 "stalled"로 재시작되던 결함이 수정되었습니다 — R009 Adaptive Parallel Splitting과 교차 참조: compaction 대기는 stall이 아닙니다.

> **v2.1.267+**: auto mode에서 **큰 출력 스키마**를 가진 Workflow `agent()` 호출이 safety classifier의 검토 대신 **거부**되던 결함이 수정되었습니다. 구버전에서 큰 스키마 `agent()` 호출의 거부는 classifier 판정이 아니라 플랫폼 크기 제약의 산물이었으므로, R010 Subagent Scope-Creep STOP Protocol의 trip 횟수에 계상하지 않습니다. 또한 (261) `bashOutputMaxChars`/`taskOutputMaxChars` 설정(최대 128K자)이 신설되어 명령/백그라운드 작업 출력이 파일로 저장되기 전 모델에 인라인으로 도달하는 양을 조정합니다 — Tier-1 검증 스크립트의 출력이 파일로 잘려 pass/fail 라인이 유실될 때 관련됩니다; 한도를 올리기보다 exit code를 단독으로 읽는 방식(R005 #1492)을 우선합니다.

> **v2.1.269+**: `claude plugin eval`이 플러그인의 eval suite를 Claude Code 자체로 실행해 점수화·재현 가능한 결과(JSON + HTML 리포트)를 냅니다 — 이 ladder에 스킬 품질 검증을 위한 새 Tier-1/2 도구가 추가된 것입니다(cross-ref `skill-creator`, R006). `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`(1~256)가 신설되어 Workflow 도구의 실행당 동시 agent 한도를 조정할 수 있게 되었습니다 — 플랫폼 상한은 이제 설정 가능하지만, 이 저장소의 R009 정책 상한(동시 5, soft 4)은 그대로 적용됩니다. `--output-format stream-json`의 `permission_denials`가 경로 스코프 deny 규칙에 걸린 Read/Edit/Write 호출도 이제 포함합니다 — 구버전 `-p` 검증 실행에서는 이런 거부가 denial 계측에서 누락됐을 수 있습니다. `bashEditDiffEnabled`가 Bash 명령이 변경한 파일의 diff를 Bash 도구 결과에 함께 실어, 셸을 통한 편집을 Tier-1 결정론적으로 사후 점검할 수 있게 합니다.

> **v2.1.271/274+**: (271) `claude plugin install`/`update`에 `--accept-command <sha256>`이 추가되어, `-y`(blanket yes) 대신 이전 `--json` 실행이 표시한 명령을 정확히 그 sha256으로만 승인할 수 있습니다 — 콘텐츠 주소화된 결정론적(Tier 1) 승인이 blanket yes보다 우선됩니다. dynamic workflow가 usage limit에 도달하면 이제 agent를 드롭하는 대신 **일시정지 후 한도 리셋 시 재개**합니다(cross-ref 위 「Workflow Script Sanity Check」의 resume 관련 항목). (274) Monitor 도구 통지가 스크립트의 최종 출력과 exit을 **하나의 통지**로 묶어 전달합니다(모델 턴 절약). `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`가 신설되어 첫 non-interactive 턴이 연결 중인 MCP 서버를 기다리는 시간을 제한합니다(`0`=대기 안 함) — Tier-1 검증용 `-p` 실행이 MCP 기동으로 지연되지 않아야 할 때 관련됩니다.

#### Common Violation (#1271)
Session 106 follow-up to #1266 ③: a Workflow authoring error recurred — the guardrail fact-sheet was concatenated onto the agent's RETURN VALUE instead of the prompt string, and a placeholder/assembly slip went uncaught because no pre-run sanity check existed. This check is the deterministic Tier-1 guard that catches such slips before the expensive run.

Origin: #1271 (Workflow authoring error recurrence, session 106).

#### Common Violation (#1438)
Origin: #1438 (Session 125 회고 찐빠 #2) — fix Workflow의 verify 프롬프트에 `${PIPESTATUS[0]}`를 이스케이프 없이 사용 → `PIPESTATUS is not defined` ReferenceError로 verify 단계 실패. `node --check`는 통과했으나 런타임에서 실패.

#### Common Violation (#1512)
Origin: #1512 (v1.1.27 세션 회고 찐빠 #2) — Workflow `args`를 JSON 객체로 전달했으나 하니스가 문자열로 인코딩해 `args.paths`가 undefined → 0 agents 실행으로 즉시 런타임 실패. `typeof args === 'string' ? JSON.parse(args) : args` 방어 추가 후 재실행 성공.

> **v2.1.246+**: MCP 도구 파라미터 스키마가 빈 객체(`{}`)일 때 인자가 실제 타입이 아니라 **JSON 문자열로 전달**되던 결함이 수정되었습니다. 이는 위 표의 "하니스가 객체 `args`를 문자열로 인코딩해 전달"(#1512) 버그와 **동일한 버그 클래스**가 MCP 도구 호출 경로에도 있었음을 확인시켜줍니다 — 구버전에서 스키마가 `{}`인 MCP 도구를 호출하면 인자가 문자열로 도착해 `args.<field>`가 undefined로 즉시 실패할 수 있었습니다. `typeof args === 'string' ? JSON.parse(args) : args` 방어는 Workflow 스크립트뿐 아니라 빈 스키마 MCP 도구를 감싸는 코드에도 같은 논리로 필요했다는 뜻입니다.

### Verifier Ground-Truth for Cross-Cutting Facts

Cross-cutting facts not verifiable from the primary source (external URLs, in-cluster DNS/hostnames, infra topology) MUST be supplied to the verifier as explicit ground-truth. Otherwise an adversarial verifier cannot distinguish a hallucinated value from a correct one — a verification blind spot.

Cross-reference: R009 (giant-prompt decomposition), `worker-reviewer-pipeline` skill.

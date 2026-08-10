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

Origin: #1455 #1 (Session 127 회고 찐빠 #1) — cc-release-monitor PR #1449 머지 후 workflow_dispatch 실검증에서 issue_body의 `<details>`·릴리즈 요약에 12칸 리터럴 들여쓰기 발견 → PR #1451 재작업. 첫 위임이 문법 검증만 지시하고 샘플 값 출력 조립 검증을 누락. `textwrap.dedent` + 멀티라인 변수 함정이 문법 검증만으로는 미노출. R020(문법 통과 ≠ 출력 정상)과 정합.

## Conditional-Output Verification — Positive/Negative Pair Mandate (Origin: #1563 #2)

조건부로만 출력하는 대상(advisory 훅, 가드, 경고 emitter)의 동작을 검증하도록 위임할 때, 완료 기준은 **"출력이 나와야 하는 입력"과 "나오면 안 되는 입력"을 짝으로** 지정해야 한다. "stdout ≠ 0바이트" 같은 단일 프록시는 검증이 아니다 — 침묵이 정답인 입력에서도 통과를 요구하게 되어 기준 자체가 틀리고, 반대로 오탐(준수 턴에서 발화)을 통과시킨다.

| Anti-pattern | Required |
|--------------|----------|
| "지정 입력에서 stdout ≠ 0바이트"를 단일 완료 기준으로 위임 | 양성 케이스(발화해야 함)와 음성 케이스(침묵해야 함)를 짝으로 명시 |

Origin: #1563 찐빠 #2 — R007/R008 advisor 발화 검증에 단일 "0바이트 아님" 프록시를 제시했으나, advisor는 준수 턴에서 침묵하는 것이 정상 동작이라 기준이 성립하지 않았다. Cross-reference: R020(Proxy Signal vs Canonical Ground-Truth — 프록시로 상태를 특성화하지 말 것), 위 Detection Guard Delegation Standard(positive-match vs negative-context 구분의 가드 설계 각도).

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

#### Common Violation (#1271)
Session 106 follow-up to #1266 ③: a Workflow authoring error recurred — the guardrail fact-sheet was concatenated onto the agent's RETURN VALUE instead of the prompt string, and a placeholder/assembly slip went uncaught because no pre-run sanity check existed. This check is the deterministic Tier-1 guard that catches such slips before the expensive run.

Origin: #1271 (Workflow authoring error recurrence, session 106).

#### Common Violation (#1438)
Origin: #1438 (Session 125 회고 찐빠 #2) — fix Workflow의 verify 프롬프트에 `${PIPESTATUS[0]}`를 이스케이프 없이 사용 → `PIPESTATUS is not defined` ReferenceError로 verify 단계 실패. `node --check`는 통과했으나 런타임에서 실패.

#### Common Violation (#1512)
Origin: #1512 (v1.1.27 세션 회고 찐빠 #2) — Workflow `args`를 JSON 객체로 전달했으나 하니스가 문자열로 인코딩해 `args.paths`가 undefined → 0 agents 실행으로 즉시 런타임 실패. `typeof args === 'string' ? JSON.parse(args) : args` 방어 추가 후 재실행 성공.

### Verifier Ground-Truth for Cross-Cutting Facts

Cross-cutting facts not verifiable from the primary source (external URLs, in-cluster DNS/hostnames, infra topology) MUST be supplied to the verifier as explicit ground-truth. Otherwise an adversarial verifier cannot distinguish a hallucinated value from a correct one — a verification blind spot.

Cross-reference: R009 (giant-prompt decomposition), `worker-reviewer-pipeline` skill.

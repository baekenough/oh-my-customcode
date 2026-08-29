# [MUST] Continuous Improvement Rules

> **Priority**: MUST | **ID**: R016 | **Trigger**: User points out rule violation

## Core Rule

When user points out a violation: update the relevant rule → commit → then continue original task.

Update the relevant rule rather than just acknowledging the violation.

## Workflow

1. Acknowledge violation
2. Identify root cause (which rule was weak/unclear?)
3. Update the rule (add clarity, examples, self-checks)
4. Wiring check — confirm the rule is wired into an execution path, or mark it as wiring-not-required (see Rule Wiring Check below)
5. Commit the change
6. Continue original task following updated rules

### Rule Wiring Check (배선 확인)

규칙 텍스트를 추가하는 것과, 그 규칙이 실행 경로에서 발동되게 배선하는 것은 **별개 작업**이다. 텍스트만 추가하고 배선을 누락하면 동일 결함이 재발한다.

**판단 항목** (규칙 승격 시 판단하고 기록):
1. 이 규칙이 발동되어야 하는 **실행 경로**(워크플로우 YAML / 스킬 정의 / 훅 / CI 설정)가 있는가?
2. 있다면 그 경로에 **실제로 반영**했는가?
3. 배선 대상이 없는 순수 서술 규칙(용어 정의 등)이면 **"배선 불요"임을 명시**한다.

배선이 필요한데 텍스트만 추가한 것은 **미완료**로 간주한다.

| Anti-pattern | Required |
|--------------|----------|
| 규칙 조항만 추가하고 커밋 → 자동화 경로에 발동 지점이 없어 동일 결함 재발 | 발동 실행 경로 명시 + 반영 확인; 대상 없으면 "배선 불요" 명시 |

Origin: #1533 (v1.1.35에서 R017 (b) 조항 추가했으나 auto-dev.yaml version-bump 절차에 bun run build 단계가 없어 발동 지점 부재 — mgr-sauron이 [FAIL]로 차단, 배선 후 통과).

Cross-reference: R021(Enforcement Policy — advisory 규칙의 발동 지점), R017(구조 검증).

## Integration

| Situation | Action |
|-----------|--------|
| User points out violation | Update rule → Continue |
| Self-detected violation | Fix immediately, consider rule update |
| Ambiguous situation | Ask user, then update if needed |

## Defect Response Matrix

| Defect Type | Rule Update | Memory | Issue | Skill Promotion |
|-------------|:-----------:|:------:|:-----:|:---------------:|
| Rule violation (agent behavior) | ✅ | — | — | — |
| CI/infra defect | — | ✅ | ✅ | — |
| Process gap (workflow hole) | ✅ | ✅ | ✅ | ⚠️ (패턴 3회 이상 반복 시) |
| Repeatable system bug | — | ✅ | ✅ | ⚠️ (수정이 구조적일 경우, 일회성 아닐 때) |
| Agent selection failure (wrong agent routed) | — | ✅ | — | ✅ (라우팅 스킬 업데이트 후보) |
| External repo convention miss | ✅ | ✅ | — | ⚠️ (3회 이상 반복 시) |

**Skill Promotion**: feedback memory가 동일 패턴으로 3회 이상 반복되면 "failure pattern"으로 승격. skill-extractor의 `--mode failure` 플래그로 스킬 후보 분석 가능 (Skillify 내재화, #972).

> **Quantitative threshold (clarified, #1268)**: candidacy begins at **≥2 occurrences** (propose a candidate via skill-extractor's 4-criteria gate); confirmed promotion to a tracked failure pattern requires **≥3 occurrences**. The ≥2 candidacy tier feeds skill-extractor Phase 1; the ≥3 tier gates actual skill creation. See `skill-extractor` Selection Discipline.

When CI failure, process gap, or repeatable system defect is found:
1. Record feedback memory (defend current session)
2. Register GitHub issue (trackable improvement item)
3. Both required — memory alone is NOT sufficient for system-level defects

> **Auto-register directive (session 102)**: Genuine defects and process gaps surfaced during release workflows (e.g., `post-release-followup` skill) MUST be registered as GitHub issues automatically — no user confirmation required. Only code-changing "immediate action" items require user confirmation. See `post-release-followup` skill: "Auto-Register Genuine Defects (no-ask)" section.

### Adaptive Harness Integration

When repeating agent failures or suboptimal routing is detected:
1. Record as feedback memory (immediate session defense)
2. Run `/omcustom:adaptive-harness --learn` to update project profile with failure patterns
3. Profile updates improve future agent selection and harness optimization

This connects R016's continuous improvement loop with the adaptive-harness skill's learning capability.

## Rule Clause Retirement (조항 은퇴 메커니즘)

R016의 승격 루프(위반 지적 → 규칙 조항 추가)는 코퍼스의 **단조 성장**을 낳는다. 은퇴 루프를 대칭으로 신설해 코퍼스 컨텍스트 비용(세션당 고정 주입 ~49.5k 토큰)의 무한 증가를 차단한다. 승격 루프는 실증된 편익이 있으므로 유지하고, 은퇴 루프만 신설한다 — 두 루프의 대칭이 코퍼스 크기를 정상 상태로 유지한다.

### 은퇴 대상

| 대상 | 판정 기준 |
|------|-----------|
| 수정 완료된 플랫폼 버그 서사 | CC 버전노트 등 행동 지시 가치가 소멸한 조항 (버그가 이미 수정되어 회피 지침이 무의미) |
| 장기 무발동 조항 | 마이너 2개 릴리즈 동안 위반 지적·회고 인용으로 발동되지 않은 조항 |

### 은퇴 절차

1. **발동 추적**: `/homework` 회고·위반 지적 시 인용된 규칙 ID/조항을 feedback memory에 기록한다 (가벼운 추적 — 완전 자동화는 불요).
2. **후보 선정**: 마이너 2릴리즈 무발동 + 행동 지시 가치 소멸 조항을 은퇴 후보로 선정한다.
3. **HTML-comment화**: 조항을 `<!-- RETIRED (은퇴 릴리즈 vX.Y.Z, <사유>): 원문 -->` 로 감싸 auto-injection에서 제외한다. `<사유>`는 위 「은퇴 대상」 두 범주에 대응한다 — 장기 무발동은 `N릴리즈 무발동`, 수정 완료된 플랫폼 버그 서사는 `보존 기준 v2.1.NNN 미만`. Read 도구로 열람 가능하므로 무손실이다 (R005 Context Optimization via HTML Comments).
4. **부활**: 동일 패턴이 재발하면 uncomment하여 즉시 복원한다 — 승격 루프와 대칭이다.

### 버전노트 보존정책

- 규칙 내 CC 버전노트(`> **v2.1.NNN+**:`)는 최근 2-3개 마이너 릴리즈(현행 기준 v2.1.230 이상)만 visible 유지한다.
- 그 이하 버전노트는 HTML-comment화(무손실 중간 단계) 하거나 `guides/claude-code/15-version-compatibility.md`로 이관한다.
- `claude-native` 스킬이 생성하는 버전 추적 이슈를 규칙에 반영할 때, 최신만 visible로 두고 구버전은 즉시 은닉한다.
- **기준선은 고정 상수가 아니라 최신 CC 대비 상대 폭으로 유지한다**: 기준선 v2.1.212가 설정될 당시 CC 최신은 v2.1.233이었으므로 보존 폭은 약 21 patch였다. 이번 상향(v1.1.50, `claude --version` = `npm view @anthropic-ai/claude-code version` 실측 = v2.1.251) 시점에 같은 폭을 유지하려면 기준선이 v2.1.230이어야 한다 — 기준선 갱신 시 "최신 실측값 − 약 20 patch"로 재계산할 것.

#### 은퇴 판정 기준 (기준선 미만 ≠ 자동 은퇴)

기준선 미만은 은퇴 **검토 대상**을 정의할 뿐, 은퇴 **여부**를 자동으로 결정하지 않는다. 기준선 미만 노트는 다음 3개 조건을 **모두** 충족할 때만 은퇴(HTML-comment화)한다 — 하나라도 걸리면 **유지**하고, 유지 판정과 사유를 스윕 기록에 남긴다.

| 조건 | 판정 |
|------|------|
| (a) 인용 부재 | 다른 어떤 visible 노트도 그것을 "같은 계열"(cf., 연장선, 인접 등)로 인용하지 않는가 |
| (b) 비현행 | 현행 동작을 규정하지 않는가 (예: 이미 롤백/재수정된 과거 상태 서술) |
| (c) 진단 함의 소멸 | 회고적 진단 함의(과거 관측 재해석 근거)가 더 이상 없는가 |

세 조건 모두 참 → 은퇴. 하나라도 거짓 → 유지(anchor로 인용되거나, 현행 동작을 서술하거나, 진단 함의가 살아있는 노트는 기준선 미만이어도 보존 가치가 있다). 이 기준은 v1.1.50 4개 병렬 그룹의 실제 판정에서 역추출한 것이다(아래 실적 참조) — "기준선 미만 = 즉시 은퇴"로 문자 그대로 읽으면 이 기준과 모순된다.

#### 보존 기준 변경 = 전 룰 파일 스윕 (같은 릴리즈 내 필수)

보존 기준선을 상향하면 **같은 릴리즈에서 23개 룰 파일 전수를 스윕**한다 — "스윕"은 기준 미만 노트의 **전량 HTML-comment화**가 아니라, 위 「은퇴 판정 기준」 3조건에 따른 **전수 검토**(각 노트를 은퇴/유지로 판정하고 유지 시 사유를 기록)를 의미한다. 기준만 올리고 검토 자체를 다음 릴리즈로 이월하면 코퍼스가 기준과 불일치한 상태로 남고, 그 불일치는 다음 회고에서 "잔존 N건" 부채로 재발견될 때까지 보이지 않는다 — **이월 금지는 변하지 않는다**, 변하는 것은 "전수 은퇴"가 아니라 "전수 판정"이 의무라는 점이다. 스윕 범위는 `.claude/rules/**`와 `templates/.claude/rules/**` 양쪽이며, 잔존 여부는 **HTML 주석 안/밖을 구분해** 실측한다 — 단순 `grep`은 이미 은퇴한 주석 내부 노트까지 세어 판정을 왜곡한다.

| Anti-pattern | Required |
|--------------|----------|
| 보존 기준선만 상향하고 기존 노트 검토를 다음 릴리즈로 이월 | 기준 상향과 전 룰 파일의 **전수 판정**(은퇴/유지 + 유지 사유 기록)을 같은 릴리즈에서 완료 |
| 기준선 미만 노트를 판정 없이 전량 HTML-comment화 | 「은퇴 판정 기준」 3조건(인용 부재 AND 비현행 AND 진단 함의 소멸)을 적용해 항목별 판정 |
| `grep -c` 히트 수로 잔존 판정 | 주석 안/밖을 구분해 **visible 잔존**만 계수 — 잔존 자체는 결함이 아니다(유지 판정의 결과일 수 있음) |

Origin: #1563 찐빠 #4 — R016이 보존 기준을 v2.1.212로 규정했으나 R001/R005/R012에 visible v2.1.208 노트 3건이 잔존해 v1.1.44에서 뒤늦게 은퇴. Cross-reference: R005(HTML-comment 컨텍스트 최적화), R017(Count Sync — 전수 grep + 의미 판별).

**실적 (v1.1.50)**: 기준선을 v2.1.212→v2.1.230으로 상향할 때, 룰 파일 소유권을 4개 병렬 그룹으로 분배해 각 그룹이 자기 담당 파일만 스윕했다 — 스윕을 **작업 종류**(예: "은퇴 담당" vs "신규 노트 담당")가 아니라 **파일 소유권**으로 분배해야 병렬 에이전트 간 동일 파일 동시 편집 충돌이 발생하지 않는다(R009 File-Disjoint 원칙의 룰 코퍼스 자체 적용 사례). 스윕 결과는 **은퇴 2건 / 유지 다수**(기준선 미만 visible 노트 49건이 11개 파일에 잔존 — 전수 검토 후 유지 판정) — 은퇴된 2건은 어떤 visible 노트도 인용하지 않는 순수 이력 서사(R006 v2.1.201/204: v2.1.201 Sonnet 5 harness reminder 전달방식, v2.1.204 headless SessionStart 스트리밍)였고, 유지된 노트 대부분은 다른 visible 노트가 "같은 계열"로 인용하는 anchor이거나(예: v2.1.222가 v2.1.211/212/214를 인용) 현행 동작을 서술 중이었다. 은퇴 2건이 바로 "인용 없는 서사만 은퇴됐다"는 판정 기준의 양성 사례다. **판정이 버전 번호가 아니라 인용 관계로 이루어졌다는 뜻**이며, **이 판정 기준을 같은 릴리즈에서 정식 조항으로 승격했다**(sauron FAIL 지적 → 같은 커밋 내 정합화 — 위 「은퇴 판정 기준」참조). 잔존 49건/11파일은 결함이 아니라 3조건 판정에 따른 유지 결과이므로, 다음 회고가 이를 "잔존 N건" 부채로 오인하지 않도록 여기 고정 기록한다.

### Cross-References

R005(HTML-comment 컨텍스트 최적화), R023(Deprecated-Platform-Feature Staleness Check — 폐기 참조를 결정론적으로 탐지하여 은퇴 후보를 조기 발굴), Origin #1473.

## External Repo Contribution Pre-Check

Before starting work on contributing to an external repository (skill submission, agent contribution, plugin development), MUST read these files in the target repo FIRST round:

| File | Purpose |
|------|---------|
| `CONTRIBUTING.md` | Submission rules, PR conventions |
| `AGENTS.md` | Agent contribution guide (if applicable) |
| `docs/adding-a-*.md` | Domain-specific add guide (e.g., `adding-a-skill.md`) |
| Domain-specific checklist | Frontmatter conventions, metadata enums |
| `package.json` scripts | Validation commands (e.g., `npm run ci`) |

### Self-Check

Before first implementation commit on external contribution:
- [ ] Read CONTRIBUTING / AGENTS / skill-checklist
- [ ] Identified frontmatter convention + metadata enums
- [ ] Identified validation commands
- [ ] Confirmed domain fit (does this contribution match the target repo's domain?)

### Common Violation

```
❌ WRONG: Start implementation → discover frontmatter convention mid-session → rewrite
✓ CORRECT: First round read CONTRIBUTING/AGENTS → identify conventions → then implement
```

Reference issues: #1188 item #5, #1188 item #7, #1198 item #5.

## Anti-Patterns — 5 patterns: "I'll update later", "one-time exception", "doesn't cover this", "finish task first", "calibration during action-oriented tone". See table via Read tool.

<!-- DETAIL: Anti-Patterns
| Anti-Pattern | Why It's Wrong | Correct Action |
|-------------|----------------|----------------|
| "I'll update the rule later" | Deferred fixes are forgotten | Update rule NOW, before continuing |
| "This is a one-time exception" | Exceptions become patterns | If the rule is wrong, fix it; if it's right, follow it |
| "The rule doesn't cover this case" | Missing coverage = rule gap | Add the case to the rule immediately |
| "Let me finish the task first" | Rule violations compound | Fix rule first (5 min), then continue (prevents N future violations) |
| "Calibration/humility during action-oriented tone (auto mode, ㄱㄱ, 계속해)" | Self-questioning wastes time when user signals action; action-mode preempts meta-reflection | Defer calibration to post-task feedback memory; respond with short action confirmation |
-->

## Timing — Rule updates MUST happen before continuing original task, in the same session.

<!-- DETAIL: Timing
Rule updates MUST happen:
- **Before** continuing the original task
- **In the same session** as the violation
- **Not** as a separate TODO or follow-up issue
-->

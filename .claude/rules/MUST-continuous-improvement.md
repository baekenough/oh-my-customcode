# [MUST] Continuous Improvement Rules

> **Priority**: MUST | **ID**: R016 | **Trigger**: User points out rule violation

## Core Rule

When user points out a violation: update the relevant rule → commit → then continue original task.

Update the relevant rule rather than just acknowledging the violation.

## Workflow

1. Acknowledge violation
2. Identify root cause (which rule was weak/unclear?)
3. Update the rule (add clarity, examples, self-checks)
4. Commit the change
5. Continue original task following updated rules

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
3. **HTML-comment화**: 조항을 `<!-- RETIRED (은퇴 릴리즈 vX.Y.Z, N릴리즈 무발동): 원문 -->` 로 감싸 auto-injection에서 제외한다. Read 도구로 열람 가능하므로 무손실이다 (R005 Context Optimization via HTML Comments).
4. **부활**: 동일 패턴이 재발하면 uncomment하여 즉시 복원한다 — 승격 루프와 대칭이다.

### 버전노트 보존정책

- 규칙 내 CC 버전노트(`> **v2.1.NNN+**:`)는 최근 2-3개 마이너 릴리즈(현행 기준 v2.1.208 이상)만 visible 유지한다.
- 그 이하 버전노트는 HTML-comment화(무손실 중간 단계) 하거나 `guides/claude-code/15-version-compatibility.md`로 이관한다.
- `claude-native` 스킬이 생성하는 버전 추적 이슈를 규칙에 반영할 때, 최신만 visible로 두고 구버전은 즉시 은닉한다.

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

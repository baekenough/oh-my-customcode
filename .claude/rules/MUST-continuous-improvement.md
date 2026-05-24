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

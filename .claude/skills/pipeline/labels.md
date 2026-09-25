# Pipeline Label Standards

Canonical reference for GitHub issue label semantics in the auto-dev pipeline.
Used by `scope-selection` to include/exclude issues and by `implement` for lifecycle management.

## Label Definitions

| Label | Meaning | scope-selection 처리 |
|-------|---------|----------------------|
| `verify-ready` | Triage 완료, 즉시 verify 가능 (자동화 후보) | INCLUDE (preferred) |
| `triage-complete` | Triage 완료, auto-dev 스코프에 선택되지 않음 (standalone triage 또는 deferred) — release-plan이 수집; auto-dev 내부 triage에서 manifest 선택 이슈는 `verify-ready` 부여 (#1734) | EXCLUDE |
| `in-progress` | 작업 진행 중 (다른 세션에서 claim됨) | EXCLUDE |
| `needs-review` | 사람 검토 필요 (자동 파이프라인 진입 불가) | EXCLUDE |
| `decision-needed` | 결정 필요 (보안, 정책 critical) | EXCLUDE |
| `automated` | Auto-generated issue (claude-native skill 등) | INCLUDE if other criteria met |
| `claude-code-release` | CC version compat docs trigger | INCLUDE (preferred) |
| `documentation` | Docs scope | INCLUDE (preferred for docs-only release) |
| `enhancement-yaml-only` | YAML/config-only scope change | INCLUDE (eligible for docs-only compression) |

## Selection Rule

```
EXCLUDE if:
  - blocked_by_decision == true
  - labels ∩ {decision-needed, needs-review, triage-complete, manual-action, in-progress} ≠ ∅

INCLUDE (preferred tier):
  - labels ∩ {verify-ready, claude-code-release, documentation} ≠ ∅

INCLUDE (standard tier):
  - P1/P2/P3 issues not in excluded set

Tie-break priority: P1 > P2 > P3 > unclassified
```

## Compression Eligibility (G6)

An issue is eligible for `docs-only` compression mode if its labels include at least one of:
`documentation`, `automated`, `claude-code-release`, `enhancement-yaml-only`

If ALL scoped issues are compression-eligible AND scope size ≤ 3, the pipeline MAY use
`compression_mode=docs-only` (skip professor-triage / release-plan / deep-plan / deep-verify skill spawns).

An issue is eligible for `lite` (Tier 2) compression mode if its labels include at least one of:
`documentation`, `automated`, `claude-code-release`, `feedback`, `professor`, `enhancement`, `improvement`

If ALL scoped issues carry at least one lite-eligible label AND scope size ≤ 7 AND no issue carries
`breaking-change` or `decision-needed`, the pipeline MAY use `compression_mode=lite`
(integrated analysis replaces heavy skill spawns for triage/plan/deep-plan/deep-verify; implement and verify-build execute normally).

## Lifecycle Labels (set by `implement` step)

| Transition | Action |
|-----------|--------|
| Work started | Add `in-progress`, assign @me |
| Work succeeded | Remove `in-progress`, add `verify-ready` |
| Work failed | Remove `in-progress`, add `needs-review` |
| Released | Remove `verify-ready`, close with "Fixed in v{version}" (auto-dev's `ci-check` step applies the `verify-ready` removal to the CURRENT release's scoped issues only; past closed issues' stale `verify-ready` are out of scope by user decision, #1734) |
| Deferred | Add `triage-complete`, label "Deferred from v{version}" |

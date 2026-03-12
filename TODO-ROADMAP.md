# oh-my-customcode TODO Roadmap

> Generated: 2026-03-11 | Based on: 18 open issues + research analysis
> This roadmap is designed for reference across development sessions.

## Priority Legend

| Priority | Meaning | SLA |
|----------|---------|-----|
| P0 | Critical — blocks releases or active degradation | Same day |
| P1 | High — security, CI bugs, context pollution | Next release |
| P2 | Medium — improvements, docs, refactoring | Within 2 releases |
| P3 | Low — nice-to-have, long-term enhancements | Backlog |

## Sprint 1: Quick Wins (7 issues, ~1 hour total)

Batch these into 1-2 PRs for maximum efficiency.

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #284 | Remove stray files (test-delete.txt, go-best-practices/CLAUDE.md) | Chore | 5 min | **Highest ROI** — stops per-session context pollution |
| #286 | Fix R006 context:fork count (9→8) | Docs/Bug | 5 min | 2-line edit |
| #283 | Fix deploy-test.yml branch pattern | CI/Bug | 5 min | 1-line: `release` → `release/**` |
| #292 | Add --frozen-lockfile to release-notes.yml | CI/Bug | 5 min | 1-line change |
| #271 | Add /research to templates/CLAUDE.md | Docs | 10 min | 1-2 lines in .en + .ko |
| #290 | Add explicit permissions to ci.yml + security-audit.yml | Security | 10 min | 2-3 lines per file |
| #272 | Sync EN/KO README table row order | Docs | 15 min | Row reordering |

**Suggested PR grouping**:
- PR A: #284 + #286 (cleanup + docs fix)
- PR B: #283 + #292 + #290 (CI/security fixes)
- PR C: #271 + #272 (docs sync)

## Sprint 2: Security Hardening (1 issue, ~1 hour)

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #289 | SHA-pin all 9 GitHub Actions | Security | 1 hour | Use `pin-github-action` CLI tool. Consider adding Dependabot for auto-updates. |

## Sprint 3: Code Quality (3 issues, ~3-4 hours)

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #285 | Fix lang-java21-expert dead references | Bug | 2 hours | Create java21-best-practices skill + guide |
| #288 | Refactor R010/R018/R009 rule overlap (~65 lines) | Refactor | 1 hour | Careful dedup preserving unique content |
| #270 | Remove root guides/ duplication | Chore | 1 hour | Audit refs before removal |

## Sprint 4: Validator & Docs (4 issues, ~6-8 hours)

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #293 | Merge ARCHITECTURE.md PR | Docs | 10 min | CI passing, ready to merge |
| #291 | Integrate ARCHITECTURE.md into docs-validator | Docs/Feature | 3 hours | Depends on #293 merge |
| #274 | Add validate-docs.ts unit tests | Test | 2 hours | 4 core functions |
| #273 | Add phantom slash command detection | Feature | 2 hours | Bundle with #274 |

**Dependency chain**: #293 → #291 → #282

## Sprint 5: Infrastructure Decision (2 issues)

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #294 | ontology-rag: evaluate, integrate, or remove | Investigation | 4 hours | 30-day zero usage — decide fate |
| #287 | Workspace rules duplication | Investigation | 1 hour | Verify if .claude/ deletion succeeded |
| #282 | Docs validator as release gate | CI/Feature | 2 hours | Depends on #291 |

## Sprint 6: Long-term Enhancements (1 issue)

| # | Title | Category | Effort | Notes |
|---|-------|----------|--------|-------|
| #275 | deer-flow pattern adoption (8 items) | Feature | 8+ hours | Phase: SOUL.md → Behavioral Memory → Artifact Output |

## Stale/Closeable

| # | Title | Recommendation |
|---|-------|---------------|
| #266 | docs-validator automated report (PASS) | **Close** — informational tracker, not actionable |

## Dependency Graph

```
#293 (ARCHITECTURE.md PR) ──merge──→ #291 (validator integration)
                                          │
                                          ├──→ #282 (release gate)
                                          └──→ #273 (phantom detection)
                                                    │
                                                    └──→ #274 (unit tests)

#289 (SHA pinning) ──batch──→ #290 (permissions)  [Security PR]

#283 (deploy-test) ──batch──→ #292 (frozen-lockfile)  [CI PR]

#284 (stray files) ──batch──→ #286 (fork count)  [Cleanup PR]

Independent: #285, #288, #270, #275, #287
```

## Session Quick Reference

When starting a new session, use this to pick the next task:

```
1. Check: Any P0/P1 issues still open? → Fix first
2. Check: Any quick wins remaining? → Batch and ship
3. Check: Any blocked issues now unblocked? → Proceed
4. Otherwise: Pick from current sprint
```

## Version Mapping

| Version | Sprint | Issues |
|---------|--------|--------|
| v0.31.0 | Sprint 1 + 2 | #284, #286, #283, #292, #271, #290, #272, #289 |
| v0.31.1 | Sprint 3 | #285, #288, #270 |
| v0.32.0 | Sprint 4 + 5 | #293, #291, #274, #273, #282, ontology-rag, #287 |
| v0.33.0 | Sprint 6 | #275 |

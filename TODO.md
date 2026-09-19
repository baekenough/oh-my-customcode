# oh-my-customcode TODO

> Last updated: 2026-09-19

## Open Priorities

| # | Priority | Issue | Category | Notes |
|---|----------|-------|----------|-------|
| 1 | — | #1707 - v1.1.75 세션 회고: 2026-09-19 FSD Iteration 3 (v1.1.74) 찐빠 4건 — 위임서 배선 판정 선결정 3회째, 인접 표 참조 파손, 리서치 아티팩트 산술 모순 | Rules/Harness | In progress — v1.1.75 release in flight |
| 2 | P3 | #1706 - v1.1.75 R008 접두사 마커 미직렬화 근본 원인 조사 — text 블록 부재 메시지의 API 원본 대조, CC 2.1.251+ 버전 상관 가설 검증 | Hooks/Advisor | In progress — v1.1.75 release in flight |

---

## Standing Reminders

- NPM_TOKEN 90-day expiry — reissued 2026-08-29, next expiry ≈ 2026-11-27 (R017 credential gate)
- R006 DETAIL hook-event table: per-event CC Version column not yet cross-checked (carried since v1.1.52)
- PostCompact live-firing probe unresolved (R021 footnote)

---

## Session Notes

### 2026-09-19
- FSD run v1.1.72–v1.1.75: retrospectives filed #1698 #1700 #1701 #1703 #1704 #1707; hooks #1692; R008 marker attribution (#1706)
- Docs refresh: README.md, README_ko.md, ARCHITECTURE.md/_ko.md, CONTRIBUTING.md, docs/index.md, templates/CLAUDE.md.*, TODO.md

### 2026-03-21
- sys-naggy SessionStart hook improvement (#602)
- TODO cleanup (root + .claude/TODO.md)

### 2026-03-11
- #298: docs: update guides/ references to templates/guides/ across CLAUDE.md, README.md, README_ko.md, ARCHITECTURE.md, ARCHITECTURE_ko.md

### 2026-02-10
- v0.9.0 release: README fix
- v0.9.1 release: secretary-routing template missing fix (#57)
- v0.9.2 release: release workflow conflict fix (#59)
- v0.10.0 release: Claude-only mode enabled
- Sauron Phase 2.5 document accuracy verification added
- 4 issues analyzed and commented

---

## Completed (Archived)

### #52 - `omcc update` command (P1-High) — CLOSED
### #54 - Pre-flight CLI version check (P2-Medium) — CLOSED
### #55 - GitHub Projects setup spec (P3-Low) — CLOSED
### #56 - Automate Projects setup impl (P3-Low) — CLOSED
### #602 - sys-naggy SessionStart hook improvement (P2) — CLOSED
### #587 - ARCHITECTURE.md v2.1.81 compatibility table (P2) — CLOSED
### #600 - git-delegation-guard.sh: add `git add` keyword (P2) — CLOSED
### #535 - Session feedback auto-improvement (Epic: #559→#560→#561→#562) — CLOSED

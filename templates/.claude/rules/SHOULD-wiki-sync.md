---
paths:
  - "wiki/**"
  - ".claude/agents/**"
  - ".claude/skills/**"
  - ".claude/rules/**"
  - "guides/**"
---
# [SHOULD] Wiki Sync Rules

> **Priority**: SHOULD | **ID**: R022

## Core Rule

When agents, skills, rules, or guides are created or modified, corresponding wiki pages SHOULD be updated to keep the knowledge base current.

## When to Sync

| 변경 | 위키 조치 |
|------|-----------|
| 에이전트·스킬 생성/수정 | `wiki/agents/{name}.md`·`wiki/skills/{name}.md` 생성/갱신 |
| 룰·가이드 생성/수정 | `wiki/rules/r{nnn}.md`·`wiki/guides/{name}.md` 갱신 |
| 아키텍처 변경 | `wiki/architecture/` 갱신 |
| 다수 변경 | `/omcustom:wiki`로 전체 갱신 |

## How to Sync

`/omcustom:wiki ingest <path>`(단일 변경), `/omcustom:wiki`(다수 변경·정기 갱신), `/omcustom:wiki lint`(구조 변경 후). CI(`.github/workflows/wiki-sync.yml`)가 PR마다 누락 페이지를 검사하며, 누락 시 실패하고 `/omcustom:wiki` 실행을 안내합니다.

### Resync Completeness — 페이지 갱신 + 매니페스트 재시딩

재동기화는 (a) 페이지 본문/`updated` 갱신과 (b) 매니페스트 재시딩을 **모두** 마쳐야 끝납니다. drift는 `updated`가 아니라 매니페스트의 SHA-256 대조로 판정하므로, 페이지만 갱신하면 drift가 남고 매니페스트만 재생성하면 페이지가 stale한 false-green이 됩니다.

```bash
bash .github/scripts/lib/source-hash.sh generate wiki/.source-hashes.json
```

재시딩 대상은 항상 `wiki/.source-hashes.json`이며 `templates/manifest.json`이 아닙니다.

## Delegation — All wiki writes via wiki-curator agent (R010).<!-- DETAIL: Delegation
All wiki writes MUST go through the `wiki-curator` agent (R010). The orchestrator reads wiki pages freely but never writes them directly.

```
Orchestrator
├── Detects source change
├── Delegates to wiki-curator
│   ├── Reads source file
│   ├── Creates/updates wiki page
│   ├── Updates cross-references
│   └── Updates index.md
└── Verifies via wiki lint
```
--><!-- DETAIL: Integration
| Rule | Interaction |
|------|-------------|
| R010 | Wiki writes delegated to wiki-curator agent |
| R017 | Wiki sync added to sauron verification Phase 3 |
| R020 | Wiki-dependent tasks verify wiki is current before [Done] |
| R006 | Wiki pages follow same separation of concerns as source |
| R021 | SHOULD priority — advisory enforcement, CI check |
-->

## Self-Check — wiki pages updated, index refreshed, lint passed.<!-- DETAIL: Self-Check
Before completing a session that modified agents/skills/rules/guides:
1. Were wiki pages updated for all changes?
2. Was index.md refreshed?
3. Did wiki lint pass?

If any NO → run `/omcustom:wiki ingest` for affected paths.
-->

<!-- DETAIL: HEAD visible wording of sections compressed in the L1 conversion (lossless backup; R022 itself unchanged in meaning)

Core Rule second sentence: The wiki is the project's compiled knowledge — stale wikis degrade team and LLM onboarding speed.

When to Sync table (HEAD):
| Change Type | Wiki Action |
| New agent created | Create wiki/agents/{name}.md |
| Agent modified | Update wiki/agents/{name}.md |
| New skill created | Create wiki/skills/{name}.md |
| Skill modified | Update wiki/skills/{name}.md |
| Rule created/modified | Update wiki/rules/r{nnn}.md |
| Guide created/modified | Update wiki/guides/{name}.md |
| Architecture change | Update wiki/architecture/ pages |
| Multiple changes | Run `/omcustom:wiki` for full update |

How to Sync table (HEAD):
| `/omcustom:wiki ingest <path>` | Single file/directory changed |
| `/omcustom:wiki` | Multiple files changed or periodic refresh |
| `/omcustom:wiki lint` | After major structural changes |
| Automatic (CI) | `.github/workflows/wiki-sync.yml` checks on PR |

Resync Completeness anti-pattern table (HEAD):
| 페이지만 갱신하고 매니페스트 재시딩 누락 → drift 잔존 | 페이지 갱신 + 매니페스트 재시딩 두 단계 모두 수행 |
| 매니페스트만 재생성 → false-green (drift 0이나 페이지 stale) | 페이지를 실제로 갱신한 뒤 재시딩 |

Origin: #1512 (v1.1.27 세션 — 71페이지 갱신 후 drift 71→68 잔존, 매니페스트 재시딩으로 drift 0 달성).
Cross-reference: R017 (동기화 검증 — Phase 3 wiki sync), R020 (완료 검증 — actual outcome ≠ attempt).

CI Enforcement (HEAD): `.github/workflows/wiki-sync.yml` checks for missing wiki pages on every PR. Missing pages cause CI failure with guidance to run `/omcustom:wiki`.

Headings dropped in compression (uncited elsewhere): "Integration — Interacts with R010, R017, R020, R006, R021. See table via Read tool." (table kept in the Integration DETAIL above), "CI Enforcement" (merged into How to Sync).
-->

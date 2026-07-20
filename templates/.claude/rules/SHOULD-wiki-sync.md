# [SHOULD] Wiki Sync Rules

> **Priority**: SHOULD | **ID**: R022

## Core Rule

When agents, skills, rules, or guides are created or modified, corresponding wiki pages SHOULD be updated to keep the knowledge base current. The wiki is the project's compiled knowledge — stale wikis degrade team and LLM onboarding speed.

## When to Sync

| Change Type | Wiki Action |
|-------------|-------------|
| New agent created | Create wiki/agents/{name}.md |
| Agent modified | Update wiki/agents/{name}.md |
| New skill created | Create wiki/skills/{name}.md |
| Skill modified | Update wiki/skills/{name}.md |
| Rule created/modified | Update wiki/rules/r{nnn}.md |
| Guide created/modified | Update wiki/guides/{name}.md |
| Architecture change | Update wiki/architecture/ pages |
| Multiple changes | Run `/omcustom:wiki` for full update |

## How to Sync

| Method | When |
|--------|------|
| `/omcustom:wiki ingest <path>` | Single file/directory changed |
| `/omcustom:wiki` | Multiple files changed or periodic refresh |
| `/omcustom:wiki lint` | After major structural changes |
| Automatic (CI) | `.github/workflows/wiki-sync.yml` checks on PR |

### Resync Completeness — 페이지 갱신 + 매니페스트 재시딩

wiki 재동기화는 **두 단계 모두 완료해야 끝난다**: (a) 페이지 본문/`updated` 필드 갱신, (b) 매니페스트 재시딩. drift 판정은 페이지의 `updated` 필드가 아니라 **매니페스트의 SHA-256 대조**로 이루어지므로, 페이지만 갱신하면 drift가 잔존한다. 반대로 매니페스트만 재생성하면 drift 0으로 보이나 페이지 내용은 stale한 **false-green**이 된다 — 양방향 모두 불완전하다.

```bash
bash .github/scripts/lib/source-hash.sh generate wiki/.source-hashes.json
```

재시딩 대상은 **항상 `wiki/.source-hashes.json`**이며 `templates/manifest.json`이 아니다(#1423 혼동 사례와 동일 경계).

| Anti-pattern | Required |
|--------------|----------|
| 페이지만 갱신하고 매니페스트 재시딩 누락 → drift 잔존 | 페이지 갱신 + 매니페스트 재시딩 두 단계 모두 수행 |
| 매니페스트만 재생성 → false-green (drift 0이나 페이지 stale) | 페이지를 실제로 갱신한 뒤 재시딩 |

Origin: #1512 (v1.1.27 세션 — 71페이지 갱신 후 drift 71→68 잔존, 매니페스트 재시딩으로 drift 0 달성).
Cross-reference: R017 (동기화 검증 — Phase 3 wiki sync), R020 (완료 검증 — actual outcome ≠ attempt).

## Delegation — All wiki writes via wiki-curator agent (R010). See workflow via Read tool.

<!-- DETAIL: Delegation
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
-->

## Integration — Interacts with R010, R017, R020, R006, R021. See table via Read tool.

<!-- DETAIL: Integration
| Rule | Interaction |
|------|-------------|
| R010 | Wiki writes delegated to wiki-curator agent |
| R017 | Wiki sync added to sauron verification Phase 3 |
| R020 | Wiki-dependent tasks verify wiki is current before [Done] |
| R006 | Wiki pages follow same separation of concerns as source |
| R021 | SHOULD priority — advisory enforcement, CI check |
-->

## CI Enforcement

`.github/workflows/wiki-sync.yml` checks for missing wiki pages on every PR. Missing pages cause CI failure with guidance to run `/omcustom:wiki`.

## Self-Check — 3 checks: wiki pages updated, index refreshed, lint passed. See details via Read tool.

<!-- DETAIL: Self-Check
Before completing a session that modified agents/skills/rules/guides:
1. Were wiki pages updated for all changes?
2. Was index.md refreshed?
3. Did wiki lint pass?

If any NO → run `/omcustom:wiki ingest` for affected paths.
-->

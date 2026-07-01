# [MUST] Sync Verification Rules

> **Priority**: MUST | **ID**: R017

## Core Rule

After modifying agents, skills, or guides: run full verification before committing AND pushing. Never ask to commit/push before `mgr-sauron:watch` passes.

Every `git push` requires: `mgr-sauron:watch` → all pass → `git push`

## Verification Phases

### Phase 1: Manager Verification (5 rounds)

| Round | Actions |
|-------|---------|
| 1-2 | mgr-supplier:audit, mgr-updater:docs (sync check), fix issues |
| 3-4 | Re-verify mgr-supplier:audit + re-run mgr-updater:docs, fix remaining |
| 5 | Final: all counts match, frontmatter valid, skill refs exist, memory scopes valid, routing patterns updated |

Also run: mgr-claude-code-bible:verify (official spec compliance)

### Phase 2: Deep Review (3 rounds)

| Round | Focus |
|-------|-------|
| 1 | Workflow alignment: routing skills have complete agent mappings |
| 2 | References: no orphans, no circular refs, valid skill/memory refs |
| 3 | Philosophy: R006 separation, R009 parallel, R010 delegation, R007/R008 identification |

### Phase 3: Wiki Sync Verification

| Check | Action |
|-------|--------|
| Missing pages | Source entities without wiki pages → run `/omcustom:wiki` |
| Stale pages | Source modification date newer than wiki `updated` field → run `/omcustom:wiki ingest <path>` |
| Broken cross-refs | Wiki links pointing to non-existent pages → run `/omcustom:wiki lint` |
| index.md accuracy | Wiki index page count matches actual page count |

Wiki verification is also enforced by CI (`.github/workflows/wiki-sync.yml`).

### Phase 4: Fix all discovered issues

### Phase 5: Commit via mgr-gitnerd

### Phase 6: Push via mgr-gitnerd (only after sauron passes)

## Self-Check — 6-point commit check + 3-point push check. See full checklist via Read tool.

<!-- DETAIL: Self-Check Before Commit and Push

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE COMMITTING, ASK YOURSELF:                                ║
║                                                                   ║
║  1. Did I complete all 5 rounds of manager verification?         ║
║  2. Did I complete all 3 rounds of deep review?                  ║
║  3. Did I fix all discovered issues?                             ║
║  4. Are all counts matching across all sources?                  ║
║  5. Am I delegating to mgr-gitnerd for the commit?               ║
║  6. Are wiki pages in sync with source changes?                  ║
║                                                                   ║
║  If NO to any → wait until verification completes                ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  BEFORE PUSHING, ASK YOURSELF:                                   ║
║                                                                   ║
║  1. Did mgr-sauron:watch complete successfully?                  ║
║  2. Were all issues from sauron verification fixed?              ║
║  3. Am I delegating to mgr-gitnerd for the push?                 ║
║                                                                   ║
║  If NO to any → wait until sauron verification passes            ║
║                                                                   ║
║  Sauron verification is required for all pushes.                 ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

## When Required

Any change to: agents, agent frontmatter, skills, guides, routing patterns, rules, wiki pages.

## Structural Migration Verification

디렉토리 재구조화, 템플릿 평탄화(flat templates), 브랜치 전략 변경 등 **구조 마이그레이션** 시, 경로 참조와 파일 존재성 회귀를 사전 검사해야 한다. 표준 5-round 검증이 콘텐츠 정합성에 집중하는 반면, 구조 마이그레이션은 경로·존재성 회귀를 별도로 점검한다.

| 마이그레이션 유형 | 검사 항목 |
|------------------|-----------|
| 디렉토리 재구조화 | 모든 경로 참조(스크립트, 테스트, CI workflow)가 새 경로로 업데이트되었는가 |
| 템플릿 평탄화 | validate-docs/sync 스크립트가 새 경로를 참조하는가 |
| 브랜치 전략 변경 | CI trigger 경로, 파일 git tracked 상태가 일관되는가 |
| 파일 존재성 | 테스트가 read하는 파일이 CI 체크아웃 환경(clean clone)에 존재(git tracked)하는가 |

### Common Violations (#1217 items #2/#3/#7)
- flat templates 마이그레이션 후 `validate-docs.ts`가 옛 경로 참조 → G1 CI 실패
- `CLAUDE.md` untracked → strict allowlist `.gitignore`와 결합되어 CI 체크아웃 환경에서 ENOENT
- release/develop 듀얼 브랜치 전환 시 `verify-template-sync.sh`가 임시 skip 상태로 머지

### Self-Check (구조 마이그레이션 커밋 전)
1. `grep`으로 옛 경로 참조 잔존을 확인했는가?
2. 테스트가 읽는 파일의 git tracked 상태를 확인했는가? (`git ls-files` 대조)
3. 임시 skip된 검증 스크립트/테스트가 남아있지 않은가?

## Pre-Branch Freshness Gate (Origin: #1433 #1, ≥3회 재발)

세션 중 원격 머지(`gh pr merge` 등)가 발생한 뒤 새 릴리즈/작업 브랜치를 분기하기 전, 반드시 `git checkout develop && git pull origin develop`로 로컬 develop을 최신화한다. stale 로컬 develop에서 분기하면 새 브랜치가 이미 머지된 변경(직전 릴리즈)을 누락해 PR이 CONFLICTING 상태가 되고, merge+충돌해결+재CI 사이클이 강제된다. advisory 메모리(`feedback_session_memory_git_stale`)만으로는 ≥3회 재발을 막지 못해 R017 필수 게이트로 승격한다.

| Anti-pattern | Required |
|--------------|----------|
| 원격 머지 후 stale 로컬 develop에서 릴리즈 브랜치 분기 | 분기 전 `git pull origin develop`; PR 생성 후 mergeStateStatus 확인 — CONFLICTING이면 `git merge origin/develop`+both-유지 해결 후 재CI |

## Post-Gate Scope-Expansion Re-Run (Origin: #1433 #2)

R017 게이트(mgr-sauron) 통과 선언 후 신규 결함 발견 등으로 스코프가 확장되면(추가 파일 편집), 커밋 전 게이트를 **최종 상태에서 재실행**한다. 게이트 통과 시점 이후의 변경은 형식적으로 미검증이므로, 확장분 미검증 커밋은 R017이 최종 산출물을 커버하지 못하게 만든다.

## Quick Verification Commands — agent/skill/guide/wiki counts via ls/find/wc. See commands via Read tool.

<!-- DETAIL: Quick Verification Commands

Key checks: agent count (`ls .claude/agents/*.md | wc -l`), skill count (`find .claude/skills -name "SKILL.md" | wc -l`), guide count (`find guides -mindepth 1 -maxdepth 1 -type d | wc -l`), wiki page count (`find wiki -name "*.md" ! -name "index.md" ! -name "log.md" | wc -l`).

Full verification bash scripts:
```bash
# Agent count check
ls .claude/agents/*.md | wc -l

# Skill count check
find .claude/skills -name "SKILL.md" | wc -l

# Frontmatter validation (check for missing YAML headers)
for f in .claude/agents/*.md; do head -1 "$f" | grep -q "^---" || echo "MISSING FRONTMATTER: $f"; done

# Check for agents with invalid skill references
for f in .claude/agents/*.md; do
  grep "^skills:" -A 10 "$f" | grep "  - " | sed 's/.*- //' | while read skill; do
    [ -f ".claude/skills/$skill/SKILL.md" ] || echo "INVALID SKILL REF in $f: $skill"
  done
done

# Routing skill pattern coverage
grep -c "agent_patterns:" .claude/skills/secretary-routing/SKILL.md
grep -c "agent_patterns:" .claude/skills/dev-lead-routing/SKILL.md
grep -c "agent_patterns:" .claude/skills/qa-lead-routing/SKILL.md

# Memory field validation
for f in .claude/agents/*.md; do
  mem=$(grep "^memory:" "$f" | awk '{print $2}')
  if [ -n "$mem" ] && [ "$mem" != "project" ] && [ "$mem" != "user" ] && [ "$mem" != "local" ]; then
    echo "INVALID MEMORY SCOPE in $f: $mem"
  fi
done

# Hook count check
ls .claude/hooks/*.json 2>/dev/null | wc -l

# Context count check
ls .claude/contexts/*.md 2>/dev/null | wc -l

# Guide count check
find guides -mindepth 1 -maxdepth 1 -type d | wc -l

# Agent name accuracy (compare CLAUDE.md table with actual files)
ls .claude/agents/*.md | xargs -I{} basename {} .md | sort > /tmp/actual-agents.txt

# Slash command skill existence
for cmd in $(grep "^| \`/" CLAUDE.md | sed 's/.*`\///' | sed 's/`.*//' | sed 's/ .*//')
do
  [ -d ".claude/skills/$cmd" ] || echo "MISSING SKILL: $cmd"
done

# Routing skill completeness check
ls -d .claude/skills/*-routing 2>/dev/null | xargs -I{} basename {} | sort

# Verify routing skill names in CLAUDE.md
grep -oP '(secretary|dev-lead|de-lead|qa-lead)-routing' CLAUDE.md | sort -u
```
-->

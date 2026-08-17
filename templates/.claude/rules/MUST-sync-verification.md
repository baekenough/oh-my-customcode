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

### Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)

릴리즈 커밋(및 `bun run build`를 수행한 모든 커밋) 직전, 스테이징 검증은 **양방향**이다 — (a) gitignored 빌드 산출물(`dist/` 등)이 **혼입**되지 않았는가, (b) 빌드가 갱신한 **tracked** 산출물(`.omcustom.lock.json` 등)이 **누락**되지 않았는가. 두 방향은 서로 다른 경로(gitignored vs tracked)를 대상으로 하므로, 한쪽만 확인하면 반대 방향 결함이 통과한다 — .gitignore 존재/부재 확인만으로는 부족하다.

**(a) 혼입 방지**: `git diff --cached --name-only`로 **스테이징 목록을 실측**하여 `dist/` 등 빌드 산출물이 포함되지 않았는지 확인한다. gitignored 경로라도 `git add -f` 또는 광범위 `git add` 조합으로 스테이징될 수 있다. 발견 시 `git reset dist/`로 제외한 뒤 커밋한다. 이는 v1.1.12의 `dist/` untrack 조치에 대한 **회귀 방지 게이트**다.

**(b) 누락 방지**: `bun run build` 실행 후 `git status --short`에 **tracked 변경(`^ M`)이 남아 있으면 스테이징 누락**이다. 커밋 직전 tracked 변경이 0인지 확인한다.

| Anti-pattern | Required |
|--------------|----------|
| 빌드 후 광범위 `git add`로 커밋 → gitignored `dist/` force-add 위험 | 커밋 직전 `git diff --cached --name-only` 실측으로 빌드 산출물 부재 확인 |
| .gitignore에 있으니 안전하다고 가정 | force-add 경로는 .gitignore를 우회하므로 실측 필요 |
| `dist/` 미포함만 확인하고 커밋 → 빌드가 갱신한 tracked 산출물 누락 | `git status --short`로 tracked 변경 잔존 0 확인 |

Origin: #1512 (v1.1.28 커밋 staging에 dist/ 2파일 포함, 커밋 전 실측으로 정정; v1.1.12 dist/ untrack 회귀 방지); #1531 (`.omcustom.lock.json`이 v1.1.29 이후 4개 릴리즈 연속 누락 — 혼입 방지 단방향 조항의 반대편 공백). Cross-ref: R020 (완료 검증 — "실행됨 ≠ 성공").

### Count Sync — Exhaustive Grep, Not File Enumeration

카운트(스킬/에이전트/룰/가이드 수) 동기화는 **파일 목록 열거가 아니라 저장소 전수 grep + 의미 판별**로 수행한다. 같은 카운트가 15곳 이상에 흩어져 있어 열거식 위임은 목록에서 빠진 곳을 구조적으로 놓친다.

절차: (a) 실제 개수 실측(`ls -1d .claude/skills/*/ | wc -l` 등) → (b) 이전 값을 저장소 전역 `git grep -n`으로 조사 → (c) 각 히트가 **카운트를 의미하는지 판별** → (d) 카운트 의미인 것만 정정.

무관한 숫자는 건드리지 않는다 — 버전번호(`v0.118.x`, CC `v2.1.118`), 이슈 번호, 과거 이력 서술("skill-count correction 114→118"), 스크립트 예시 주석은 정정 대상이 아니며 판단 근거와 함께 보고한다. grep 필터 주의: `--include='*.md'`는 `CLAUDE.md.en`/`CLAUDE.md.ko` 같은 **이중 확장자 파일을 매칭하지 못하므로**, 확장자 필터 없이 훑거나 별도 패턴을 병행한다.

| Anti-pattern | Required |
|--------------|----------|
| 카운트 동기화를 "갱신할 파일 목록" 열거로 위임 | 전수 grep으로 이전 값 히트를 모두 수집한 뒤 카운트 의미만 정정 |
| `--include='*.md'` 필터로 전수 grep 수행 | 확장자 필터 없이 훑거나 이중 확장자 패턴 병행 |
| 셸의 `grep -rn`으로 전수 조사 | `git grep -n` 사용 — tracked 기준이라 릴리즈 대상과 일치하고 셸 함수/alias 셰이딩에 면역 (#1590) |

위임 프롬프트에는 항상 **"실측값 기준으로 동기화하라, 추측으로 숫자를 바꾸지 말라"**를 명시해, 오케스트레이터의 잘못된 전제를 서브에이전트가 정정할 여지를 남긴다(#1443).

`git grep`은 **untracked 파일을 보지 못한다** — 조사 전 `git status --porcelain`으로 untracked 0을 확인하거나, untracked 가능성이 있으면 `command grep`을 병행한다.

Origin: #1521 (찐빠 #2 — v1.1.32 skills 118→114 동기화에서 파일 열거식 위임이 6곳만 갱신, CI 3곳 지적 + 전수 grep 9곳 추가 발견, 최종 15곳); #1590 (셸 `grep`이 shell function으로 shadow되어 tracked 파일을 재귀 탐색에서 누락 — `git grep` 표준화). Cross-ref: #1443 (실측값 기준 명시), #1287 (multi-copy 일관성).

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

### Restore-From-Deletion Regression Check (Origin: #1492)

삭제된 파일/워크플로우/자산을 복원(restore)할 때, 삭제 이전에 그 파일에 적용된 **머지된 수정이 유실되지 않는지** 확인한다. 복원은 "되살리기"가 아니라 **최신 상태로의 재구성**이어야 한다.

| 확인 항목 | 명령 |
|-----------|------|
| 삭제 이전 수정 이력 | `git log --oneline -- <path>` (삭제 커밋 이전 커밋들 확인) |
| 복원 소스 시점 | 복원 대상이 **삭제 직전 커밋**인지 확인 — 더 오래된 버전/외부 사본이면 회귀 |
| 관련 PR 반영 여부 | 과거 수정 PR의 핵심 변경을 `grep`으로 재확인 |

Origin: #1492 (Session 132) — cc-release-monitor 워크플로우 삭제(#1454, 세션127) 후 복원(세션129)이 삭제 직전 이전 버전을 되살려 머지된 수정(#1451, `textwrap.dedent` 제거)이 소실. 약 8일간 결함 상태로 이슈 자동생성(#1489/#1490에 8칸 선행 들여쓰기+절단). Cross-ref: R020 (Read-Before-Characterize), R023 (Sample-Value Assembly — 문법 검증으로는 미노출, 샘플 조립 검증으로만 드러남).

## Pre-Branch Freshness Gate (Origin: #1433 #1, ≥3회 재발)

세션 중 원격 머지(`gh pr merge` 등)가 발생한 뒤 새 릴리즈/작업 브랜치를 분기하기 전, 반드시 `git checkout develop && git pull origin develop`로 로컬 develop을 최신화한다. stale 로컬 develop에서 분기하면 새 브랜치가 이미 머지된 변경(직전 릴리즈)을 누락해 PR이 CONFLICTING 상태가 되고, merge+충돌해결+재CI 사이클이 강제된다. advisory 메모리(`feedback_session_memory_git_stale`)만으로는 ≥3회 재발을 막지 못해 R017 필수 게이트로 승격한다.

| Anti-pattern | Required |
|--------------|----------|
| 원격 머지 후 stale 로컬 develop에서 릴리즈 브랜치 분기 | 분기 전 `git pull origin develop`; PR 생성 후 mergeStateStatus 확인 — CONFLICTING이면 `git merge origin/develop`+both-유지 해결 후 재CI |

### 게이트는 분기 시점 1회가 아니라 상태변경 위임마다 (Origin: #1595 #1)

위 게이트는 "브랜치 **분기 전** pull"을 규정하지만, 공유 워크트리에서는 **세션 도중 다른 행위자가 브랜치 자체를 바꾼다**. 따라서 git 상태를 바꾸는 위임(브랜치 생성·전환, 커밋, 머지, push) **직전마다** 브랜치 이름과 HEAD SHA를 재실측하고 세션 초반 값과 대조한다 — `git rev-parse --abbrev-ref HEAD` 와 `git rev-parse --short HEAD` 두 줄이면 충분하다.

값이 달라졌으면 위임을 중단하고 **원인을 먼저 실측**한다(`git reflog`로 전환·커밋 주체와 시각 확인). #1584 #5가 "SHA의 수명은 턴 단위"를 규정했는데, 공유 워크트리에서는 **브랜치 이름조차 턴 단위 수명**이다.

| Anti-pattern | Required |
|--------------|----------|
| 세션 초반에 실측한 브랜치·HEAD를 세션 내내 유효한 사실로 사용 | 상태변경 위임 직전마다 브랜치 이름 + HEAD SHA 재실측·대조 |
| 파일 목록·`git ls-files` 결과를 "확인된 사실"로 저장하고 재확인 트리거 없이 재사용 | 실측값에 **측정 시각**을 함께 기록하고, 위임 전제로 쓰기 전 재실측 |
| 대조 불일치를 발견하고도 원인 규명 없이 위임 강행 | `git reflog`로 전환·커밋 주체와 시각을 실측한 뒤 재계획 |

Origin: #1595 #1 (v1.1.48 세션 — 세션 시작 시 `develop @ 1b4973d5` 실측 후 진행했으나 다른 세션이 14:56·15:10에 `feat/agora-anonymous-consensus`를 만들고 커밋 2개를 쌓았고, wiki 재동기화 Phase 2까지 미탐지. 같은 세션에서 `git ls-files tests/fixtures/agora/`가 초반 0건 → 후반 6건으로 바뀌었다). Cross-ref: R010 「저장소 상태 기재도 같은 규율」(위임서 기재 각도), R011(Temporal Decay).

## Pre-Release Target Version Ground-Truth Gate (Origin: #1457)

새 릴리즈의 target 버전을 선정하거나 구현/구현-위임 프롬프트에 target 버전을 전달하기 전, 반드시 원격 실측으로 다음 버전을 확정한다: `git tag --sort=-v:refname | head -1`(최신 태그) + `npm view <pkg> version`(배포된 최신)의 **max에 patch를 더한 값**을 target으로 삼는다. 세션 메모리의 버전 스냅샷(예: "npm latest 1.1.6")은 **참고용이며 ground-truth가 아니다** — 직전 세션에서 릴리즈가 진행돼 stale일 수 있다. stale 버전으로 위임하면 이미 배포된 버전을 target으로 잡아 milestone-closed STOP에 걸리고 재타겟팅 왕복이 강제된다.

| Anti-pattern | Required |
|--------------|----------|
| 세션 메모리 버전 스냅샷으로 target 버전을 추정해 구현/릴리즈 위임 | 위임 전 `git tag`+`npm view` 실측 → max+patch를 target으로 확정 |
| milestone-closed STOP에 걸린 뒤에야 stale을 인지 | 사전 실측으로 STOP+재위임 왕복을 원천 차단 (가드레일은 fail-safe이지 1차 방어선이 아님) |

Origin: #1457 (Session 128 회고 찐빠 #1) — 오케스트레이터가 stale 메모리(npm 1.1.6→target v1.1.7 추정)로 implement를 위임 → v1.1.7이 이미 배포된 closed milestone임을 에이전트가 STOP으로 감지 → v1.1.8 재위임 왕복 1회. 기존 `feedback_session_memory_git_stale`(브랜치 분기 전 pull)의 릴리즈-버전-선정 각도 확장. Cross-ref: R020 (Diagnostic Hypothesis Verification — 영구 변경/위임 전 전제 실측 확정).

### 일반화 — 메모리 TODO 를 위임 전제로 쓸 때 (Origin: #1574)

위 게이트는 **버전**에 대한 규정이지만 원리는 세션 메모리 항목 전반에 적용된다. `MEMORY.md`의 "선재 항목 / Next Session TODO"는 **직전 세션 종료 시점의 스냅샷**이므로 이후 해소·변경됐을 수 있다. 이를 위임 브리핑(예: mgr-sauron 검증 스코프)의 전제로 넘기기 전, 각 항목을 실측으로 재확인하거나 **측정 시점을 함께 표기**해 전달한다.

| Anti-pattern | Required |
|--------------|----------|
| 메모리 TODO를 현재 상태로 간주해 위임 브리핑에 전제로 기재 | 위임 전 항목별 실측 재확인, 또는 "vX.Y.Z 시점 스냅샷 — 직접 확인하라"를 명시 |

Origin: #1574 (v1.1.44 세션 — mgr-sauron 브리핑의 "선재 항목" 4건 중 3건이 부정확: 이미 해소된 항목, 의도적 차이를 결함으로 오인, 규모 과대). **완화 요인**: 프롬프트에 "그대로 믿지 말고 직접 확인하라"를 명시해 3건 전부 에이전트가 정정 — #1443의 "실측값 기준으로 동기화하라" 방어선과 동일 효과. Cross-ref: R011(메모리 신뢰도·Temporal Decay), R020(Diagnostic Hypothesis Verification).

## CC 버전 노트 반영 전 — 스코프 상한 이후 릴리즈 확인 (Origin: #1584 #1)

CC 버전 노트를 룰에 반영하기 **전**, `npm view @anthropic-ai/claude-code version` + `claude --version`을 실측해 **스코프 상한 버전 이후의 릴리즈 존재 여부**를 확인한다. 있으면 그 CHANGELOG를 먼저 읽어 **롤백·후속 변경**을 파악한 뒤 반영한다. 이슈 생성과 작업 사이의 간극 동안 플랫폼이 스스로 뒤집을 수 있으므로 — **이슈 번호는 최신 릴리즈를 의미하지 않는다**.

| Anti-pattern | Required |
|--------------|----------|
| 이슈에 적힌 버전(스코프 상한)까지만 조사해 버전 노트를 반영 | 반영 전 `npm view`+`claude --version` 실측 → 상한 이후 릴리즈 CHANGELOG에서 롤백·후속 변경 확인 |
| 롤백된 개선을 현행 보호막으로 기재 | 롤백 여부를 확인하고, 롤백된 항목은 "현재 미적용"으로 명시 |

Origin: #1584 #1 (v1.1.46 세션) — 이슈 생성(8/11~14)과 작업(8/15) 사이 5일 간극 동안 v2.1.233이 v2.1.232 Bash 권한 변경 2건을 롤백했으나 이를 모른 채 배치해 mgr-sauron이 **FAIL로 차단**(당시 저장소 전역 `2.1.233` 언급 0건). Cross-ref: 위 Pre-Release Target Version Ground-Truth Gate(동일 "스냅샷 ≠ ground-truth" 원리의 버전 각도), R020(Diagnostic Hypothesis Verification), R016(버전노트 보존정책 — *어느* 노트를 남길지는 R016, *반영 전 실측*은 이 게이트).

## Post-Gate Scope-Expansion Re-Run (Origin: #1433 #2)

R017 게이트(mgr-sauron) 통과 선언 후 신규 결함 발견 등으로 스코프가 확장되면(추가 파일 편집), 커밋 전 게이트를 **최종 상태에서 재실행**한다. 게이트 통과 시점 이후의 변경은 형식적으로 미검증이므로, 확장분 미검증 커밋은 R017이 최종 산출물을 커버하지 못하게 만든다.

### Advisory 제시 시점 — "같은 커밋 포함 권고"는 판정과 함께 (Origin: #1584 #4)

위 재실행 비용을 줄이는 방법은 권고를 **판정 시점에** 받는 것이다. mgr-sauron 위임 프롬프트에 "같은 커밋에 포함 권고" 성격의 advisory는 **PASS/FAIL 판정과 같은 응답에 제시**하도록 명시한다(또는 게이트 실행 전 예비 조회로 미리 수집). 판정 후 도착한 권고를 반영하면 그 자체가 스코프 확장이 되어 게이트 전량 재실행 + 위키 재동기화가 강제된다.

| Anti-pattern | Required |
|--------------|----------|
| 게이트 PASS 후 도착한 포함 권고를 반영해 스코프 확장 | 위임 프롬프트에 "포함 권고 advisory는 판정과 함께 제시" 명시; 판정 후 도착분은 다음 릴리즈 이월을 우선 검토 |

Origin: #1584 #4 (v1.1.45 세션) — R021 자기 서술 staleness 반영을 R017 통과 **후** 수행해 위키 재동기화 1회 + 게이트 전량 재실행 발생. 포함 판단 자체는 옳았고 **시점**이 결함이었다.

> **v2.1.233+**: `claude plugin validate`가 **bare `.claude/skills` 디렉토리**(플러그인 매니페스트 없는 스킬 트리)도 검사해, frontmatter 파싱에 실패하는 `SKILL.md`를 보고합니다. 이 저장소의 `.claude/skills/**/SKILL.md`는 아래 Quick Verification Commands가 **개수만** 세고 frontmatter 유효성은 세지 않으므로, 스킬 추가·수정 후 `claude plugin validate`를 개수 대조와 **함께** 실행해 파싱 실패를 결정론적으로 잡습니다(구버전에서는 이 경로가 검사 대상이 아니어서 깨진 frontmatter가 런타임 미로드로만 드러났습니다). Cross-ref: R023(Tier 1 결정론적 검증).

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

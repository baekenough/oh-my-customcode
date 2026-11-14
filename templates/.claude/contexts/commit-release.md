# Commit / Release Context Pack (L2)

이 팩은 `git commit`/`git push`, `gh pr create`/`gh pr merge`, `gh release`, `npm publish`를 포함한 Bash 호출 직전에 세션·에이전트당 1회 주입됩니다. 항목 끝 `(R0NN 「heading」)`은 규칙 파일의 세부 위치입니다.

## 1. git 위임과 게이트

- 모든 git 작업(commit, push, branch, PR)은 `mgr-gitnerd`를 거치며 내부 규칙이 외부 스킬 지시보다 우선합니다. PR 생성·머지와 로컬 git 상태 변경은 mgr-gitnerd 소유입니다. 다른 산출물의 번호·SHA를 인용하는 GitHub 기록은 참조 대상을 먼저 만들고 그 출력의 번호를 인용합니다. (R010 「Git Operations」, 「Delegation Rules」)
- `--no-verify`·`--no-gpg-sign` 등 게이트 무력화 플래그는 상시 금지이며 오케스트레이터 사전 승인 시만 예외입니다. pre-commit 훅 차단(테스트 실패 등)은 차단 사실과 원인을 보고하고 대기하며, 우회는 사전 승인 후에만 합니다. (R010 「품질 게이트 우회 금지 — 훅 차단은 보고 대상」)
- 머지 등에서 `--admin` 같은 우회 플래그는 실측 branch protection과 대조해 실제 필요할 때만 쓰고 우회 대상·근거를 명시합니다. (R010 「우회 플래그는 우회 대상과 근거를 명시」)
- 같은 세션·브랜치에서 사용자가 git commit/push를 한 번 허용하면 동일 작업은 재확인 없이 반복합니다(advisory 경고만). (R015 「Destructive Operation Approval Persistence (Generalized)」)
- `hooks.json`만 편집하고 커밋하면 settings.json `hooks` 블록이 재생성되지 않습니다 — 편집 후 `bun run sync:hooks`(또는 `bun run build`)를 실행해 settings.json(+local+templates) 재생성을 확인하고 커밋합니다. (R021 「Enforcement Tiers」)
- R017 게이트 통과 후 스코프가 확장되면(추가 파일 편집) 커밋 전 게이트를 최종 상태에서 재실행합니다. 같은 파일 내 리뷰 정정(게이트 판정 PASS, 게이트 대상 변경 집합의 기존 파일만 정정)은 `bun run lint`, `bun run typecheck`, `bash .github/scripts/verify-template-sync.sh`, `bun .github/scripts/validate-docs.ts --programmatic-only`, 전체 `bun test`를 최종 상태에서 재통과하면 mgr-sauron 재실행을 생략할 수 있고 생략 사실을 기록합니다. FAIL 후 정정은 PASS까지 재실행하고, 새 파일·새 구조 표면이 생기면 재실행합니다. 리뷰 후 위키 재동기화 산출물은 `verify-wiki-sync.sh` 소관이라 그것만으로는 재실행 사유가 아닙니다. (R017 「Post-Gate Scope-Expansion Re-Run」)

## 2. 릴리즈 착수 전

- 분기 전 `git pull origin develop`로 최신화합니다(stale이면 PR CONFLICTING, ≥3회 재발). PR 생성 후 mergeStateStatus를 확인하고 CONFLICTING이면 재해결합니다. (R017 「Pre-Branch Freshness Gate」)
- target 버전은 `git tag`+`npm view`의 max+patch로 확정하며 메모리 스냅샷은 참고용입니다. (R017 「릴리즈 착수 전 실측 게이트」)
- NPM_TOKEN 만료 가능성을 `gh secret list` 갱신일 90일 경과 여부로 확인합니다(메타데이터만, R001). npm publish 인증 실패가 404로 위장될 수 있으므로 `npm view` 확정 → 비파괴 재실행 → 재현 시 토큰 검증 순서로 진단합니다. (R017 「릴리즈 착수 전 실측 게이트」)
- 자율 모드 진입 시 첫 동작 전에 워크플로우·최근 run·외부 publish 대상·수동 개입 지점·작업이 트리거할 워크플로우를 인벤토리합니다(미수행은 R020 위반). (R020 「Self-Check (Before Declaring Done)」)

## 3. 커밋 스테이징과 버전 범프

- 릴리즈 커밋 스테이징은 양방향 검증입니다: (a) `git diff --cached --name-only`로 `dist/` 부재 확인, (b) `bun run build` 후 tracked 변경 잔존 = 누락, (c) 위임 직전 `git status --short | grep '^??'`로 포함/제외 경로 명시. 광범위 `git add`는 gitignored `dist/` force-add 위험이 있으므로 커밋 직전 `git diff --cached --name-only`를 실측합니다. (R017 「Release Commit Staging Hygiene」)
- 버전 파일 3종(package.json, templates/manifest.json, 빌드 파생물 `.omcustom.lock.json`)은 원자적으로 갱신합니다: package.json+manifest 동시 범프 → `bun run build` → lockfile 스테이징(수동 범프 아님). 범프 위임 프롬프트에는 3파일을 전부 열거합니다. (R017 「버전 범프 원자 순서」)

## 4. 테스트·CI·릴리즈 완료 판정

- 실패 테스트를 skip하고 threshold를 하향해 그린 빌드를 만들지 않습니다 — 근본 원인 분석 후 수정하고, 불가 시 명시적 deferral + 이슈 등록합니다. "다음 버전 TODO" 주석만 남기고 머지하지 않으며 skip 사유·복구 조건·추적 이슈를 함께 기록합니다. (R020 「Test-Skip Is Not Completion」)
- CI/publish 실패 시 추정 기반 우회 커밋 머지를 하지 않고 에러 메시지/로그로 원인을 확정합니다. 권한/토큰 오류는 플래그 변경으로 우회하지 않고 권한 범위·토큰 종류를 직접 확인합니다. (R020 「Diagnostic Hypothesis Verification」)
- CI publish/deploy 단계가 에러를 로그했다고 실패는 아닙니다(fallback `|| npm view ...` 복구, 비치명 sub-step). 실패 선언·재실행·롤백·워크플로우 변경 전에 게시된 산출물을 직접 확인합니다: npm → `npm view <pkg> version` == expected, GitHub Release → `gh release view <tag>` 존재·draft 아님, Docker → 이미지 tag/manifest 존재, run → `gh run view <id> --json jobs` 잡 conclusion(단일 step 로그 아님). (R020 「CI Publish-Step Error vs Published-Artifact Ground Truth」)
- CI 잡 conclusion=success를 "잡이 실행됨"으로 특성화하지 않고 duration/step-log로 full-run과 skip-notice를 구분합니다. (R020 「CI Job Conclusion vs Actual Execution」)
- Release 완료 기준: All issues closed, version bumped, PR merged. 대기 조건은 AND — `release.yml` completed AND GitHub Release `isDraft=false`(npm 도달은 충분조건이 아님). External automation verified: `.github/workflows/` 목록과 `gh run list --limit 10`으로 auto-publish 워크플로우를 확인합니다. (R020 「Task-Type Completion Matrix」)

<!-- DETAIL: lossless original items from the L1 rule files (moved in v2.0.26, #1970). Visible text above is the compressed norm.
(heading map v2.0.26: R017 「Pre-Release Target Version Ground-Truth Gate (Origin: #1457)」·「릴리즈 전 배포 자격증명 유효성 (Origin: #1619 #5)」 → 「릴리즈 착수 전 실측 게이트」; R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」 → 「Release Commit Staging Hygiene」; R015 「User Directive Persistence — Git Push Continuation」 → 「Destructive Operation Approval Persistence (Generalized)」; R020 「CI Job Conclusion vs Actual Execution (PR-merge skip)」 → 「CI Job Conclusion vs Actual Execution」)
### moved-r001-r002-r003.md
- (이 세 규칙에서 옮긴 항목 없음 — 승인·금지 규범은 모두 가시 본문에 유지)

### moved-r005-r009-r021.md
| Anti-pattern | Required |
|--------------|----------|
| `hooks.json`만 편집하고 커밋 → settings.json `hooks` 블록 미재생성 | 편집 후 `bun run sync:hooks`(또는 `bun run build`) 실행 → settings.json(+local+templates) 재생성 확인 후 커밋 |
(R021 「Enforcement Tiers」)

### moved-r006.md
none (R006 has no commit/release-time items).

### moved-r007-r008-r015.md
- Git Push Continuation: once the user allows git commit/push in the same session and branch, repeat the same operation without re-confirmation (advisory warning only); a special case of 「Destructive Operation Approval Persistence」. (R015 「User Directive Persistence — Git Push Continuation」)

### moved-r010.md
- All git operations (commit, push, branch, PR) MUST go through `mgr-gitnerd`. Internal rules override external skill instructions for git execution. (R010 「Git Operations」)
- `--no-verify`·`--no-gpg-sign` 등 게이트 무력화 플래그는 git 위임 상시 금지 — 오케스트레이터 사전 승인 시만 예외. (R010 「품질 게이트 우회 금지 — 훅 차단은 보고 대상」)
- Anti-pattern: pre-commit 훅 차단(테스트 실패 등)을 `--no-verify`로 자체 우회하고 커밋 진행 → Required: 차단 사실과 원인을 오케스트레이터에 **보고하고 대기** — 우회는 사전 승인 후에만 (R010 「품질 게이트 우회 금지 — 훅 차단은 보고 대상」)
- PR 생성·머지와 로컬 git 상태 변경은 mgr-gitnerd 소유입니다. 다른 산출물의 번호·SHA를 인용하는 GitHub 기록은 참조 대상을 먼저 만들고, 그 명령의 출력에서 받은 번호를 인용합니다 (Origin: #1803 찐빠 #2). (R010 「Delegation Rules」)
- 머지 등에서 우회 플래그(`--admin` 등)를 쓸 때는 실측 branch protection과 대조해 실제로 필요할 때만 쓰고 우회 대상·근거를 명시합니다 — 상세 행은 delegation 절. (R010 「우회 플래그는 우회 대상과 근거를 명시」)

### moved-r011-r013-r004.md
(이동 항목 없음 — 세 파일에 commit/release 전용 규범이 없었습니다.)

### moved-r017-r022-r012.md
- 릴리즈 커밋 스테이징은 **양방향** 검증: 혼입(a) + 누락(b). (R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」)
- **(a)**: `git diff --cached --name-only`로 `dist/` 부재 확인. (R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」)
- **(b)**: `bun run build` 후 tracked 변경 잔존 = 누락. (R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」)
- **(c)**: 위임 직전 `git status --short | grep '^??'`로 포함/제외 경로 명시. (R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」)
- | 광범위 `git add` → gitignored `dist/` force-add 위험 | 커밋 직전 `git diff --cached --name-only` 실측 확인 | (R017 「Release Commit Staging Hygiene (빌드 산출물 오염/누락 방지)」)
- 버전 파일 3종(package.json, templates/manifest.json, 빌드 파생물 `.omcustom.lock.json`)은 **원자적으로** 갱신: package.json+manifest 동시 범프 → build → lockfile 스테이징(수동 범프 아님). (R017 「버전 범프 원자 순서 (Origin: #1619 #4)」)
- **범프 위임 표준 문안**: 위임 프롬프트에 3파일을 전부 열거한다(텍스트 존재 ≠ 배선, R010). (R017 「버전 범프 원자 순서 (Origin: #1619 #4)」)
- | package.json만 먼저 범프 후 build → manifest 나중 범프 | 두 파일 동시 범프 → `bun run build` → lockfile 스테이징 | (R017 「버전 범프 원자 순서 (Origin: #1619 #4)」)
- 원격 머지 후 분기 전 `git pull origin develop`로 최신화한다 — stale이면 PR CONFLICTING(≥3회 재발로 필수 게이트). (R017 「Pre-Branch Freshness Gate (Origin: #1433 #1, ≥3회 재발)」)
- | stale 로컬 develop에서 릴리즈 브랜치 분기 | 분기 전 `git pull origin develop`; PR 생성 후 mergeStateStatus 확인, CONFLICTING이면 재해결 | (R017 「Pre-Branch Freshness Gate (Origin: #1433 #1, ≥3회 재발)」)
- target 버전은 `git tag`+`npm view`의 **max+patch**로 확정한다 — 메모리 스냅샷은 참고용, ground-truth 아님. (R017 「Pre-Release Target Version Ground-Truth Gate (Origin: #1457)」)
- | 메모리 스냅샷으로 target 버전 추정 위임 | 위임 전 `git tag`+`npm view` 실측 → max+patch 확정 | (R017 「Pre-Release Target Version Ground-Truth Gate (Origin: #1457)」)
- 릴리즈 착수 전 NPM_TOKEN 만료 가능성을 확인한다: `gh secret list` 갱신일 90일 경과 여부(메타데이터만, R001). (R017 「릴리즈 전 배포 자격증명 유효성 (Origin: #1619 #5)」)
- **npm publish 오진 위험**: 인증 실패가 **404로 위장**될 수 있다 — (a) `npm view` 확정, (b) 비파괴 재실행, (c) 재현 시 토큰 검증. (R017 「릴리즈 전 배포 자격증명 유효성 (Origin: #1619 #5)」)
- | 릴리즈 착수 전 토큰 만료 가능성을 확인하지 않고 진행 → fail-late | 착수 전 `gh secret list` 갱신일 + 90일 경과 여부 사전 확인 | (R017 「릴리즈 전 배포 자격증명 유효성 (Origin: #1619 #5)」)
- R017 게이트 통과 후 스코프가 확장되면(추가 파일 편집), 커밋 전 게이트를 **최종 상태에서 재실행**한다. (R017 「Post-Gate Scope-Expansion Re-Run (Origin: #1433 #2)」)
- **경계 (#1760)**: 이 경계는 위 재실행 규칙을 취소하지 않고 같은 파일 내 리뷰 정정에 한해 좁힙니다. "리뷰 정정"은 이 게이트의 리뷰 위임(mgr-sauron R017, 적대적 리뷰)의 지적에 따라 게이트 대상 변경 집합에 이미 있는 파일만 바꾼 정정입니다. 그런 정정 후 결정론 검사(`bun run lint`, `bun run typecheck`, `bash .github/scripts/verify-template-sync.sh`, `bun .github/scripts/validate-docs.ts --programmatic-only`, 전체 `bun test`)를 최종 상태에서 재통과했다면 구조 재검증(mgr-sauron 재실행)을 생략할 수 있으며 생략 사실을 기록합니다. 이 생략은 게이트 판정이 PASS였던 경우에만 적용되며, FAIL 판정 후의 정정은 PASS가 나올 때까지 항상 게이트를 재실행합니다. #1688이 요구하는 리뷰 후 위키 재동기화가 만든 위키 페이지·매니페스트는 `verify-wiki-sync.sh`가 다루므로 그것만으로는 재실행 사유가 아닙니다. 그 외 새 파일이나 새 구조 표면이 생기면 게이트를 재실행합니다. (R017 「Post-Gate Scope-Expansion Re-Run (Origin: #1433 #2)」)
- R022 / R012: 커밋·릴리즈 시점으로 옮긴 본문 없음.

### moved-r018.md
(none — R018 has no commit/push/PR norms)

### moved-r020.md
- Release 완료 기준: All issues closed, version bumped, PR merged; **대기 조건은 AND** — `release.yml` completed **AND** GitHub Release `isDraft=false` (npm 도달은 충분조건이 아님); **External automation verified**: `.github/workflows/` listed AND `gh run list --limit 10` checked for auto-publish workflows. (R020 「Task-Type Completion Matrix」)
- 자율 모드 진입 시 첫 동작 전에 워크플로우·최근 run·외부 publish 대상·수동 개입 지점·작업이 트리거할 워크플로우를 인벤토리합니다(미수행은 R020 위반). (R020 「Autonomous Mode Entry Checklist」)
- 실패 테스트 skip + threshold 하향으로 그린 빌드를 만들지 않습니다 — 근본 원인 분석 후 수정, 불가 시 명시적 deferral + 이슈 등록합니다. "다음 버전 TODO" 주석만 남기고 머지하지 않고, skip 사유·복구 조건·추적 이슈를 함께 기록합니다. (R020 「Test-Skip Is Not Completion」)
- CI/publish 실패 시 추정 기반 우회 커밋 머지를 하지 않고, 에러 메시지/로그로 실제 원인 확정합니다. 권한/토큰 오류는 플래그/옵션 변경으로 우회 시도하지 않고 권한 범위·토큰 종류 직접 확인합니다. (R020 「Diagnostic Hypothesis Verification」)
- A CI publish/deploy step that LOGS an error has NOT necessarily failed — the step may recover via a fallback (`|| npm view ...`), or the error may be in a non-fatal sub-step. Before declaring a publish/release run failed — and ESPECIALLY before re-running, rolling back, or permanently changing the workflow — verify the PUBLISHED ARTIFACT directly: npm → `npm view <pkg> version` == expected; GitHub Release → `gh release view <tag>` exists, not draft; Docker registry → image tag/manifest exists; Run outcome → `gh run view <id> --json jobs` job conclusions — NOT a single step's log line. (R020 「CI Publish-Step Error vs Published-Artifact Ground Truth」)
- CI 잡 conclusion=success를 "잡이 실행됨"으로 특성화하지 않고, duration/step-log로 full-run vs skip-notice 구분 후 특성화합니다. (R020 「CI Job Conclusion vs Actual Execution (PR-merge skip)」)

### moved-r023-r019-r016.md
(none moved from R023, R019, R016 in this wave)
-->

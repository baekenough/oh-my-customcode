# Delegation Context Pack (L2)

이 팩은 Agent·Task·SendMessage 호출 직전에 세션·에이전트당 1회 주입됩니다. 위임서(프롬프트)를 쓸 때 적용하는 규범이며, 파이프라인 위임은 `.claude/skills/pipeline/workflows/auto-dev.yaml` implement Rules의 「Standard delegation-prompt block」도 함께 따릅니다. 항목 끝 `(R0NN 「heading」)`은 세부 위치입니다.

## 1. 위임서에 적는 사실은 실측값

- 저장소 상태를 적는 위임서는 작성 직전에 `git rev-parse --abbrev-ref HEAD` / `git rev-parse --short HEAD` / `git branch --list` 3줄을 실행하고 출력 원문을 붙입니다. 이전 턴의 SHA·브랜치 이름은 쓰지 않습니다(브랜치 이름도 턴 단위 수명). `gh pr merge --delete-branch` 같은 부수효과 명령 뒤에는 재실행합니다. 상태변경 위임 직전마다 재실측·대조합니다. (R010 「저장소 상태 기재도 같은 규율」, R017 「게이트는 분기 시점 1회가 아니라 상태변경 위임마다」)
- 메모리 TODO·스냅샷은 위임 전 실측 재확인하거나 "스냅샷 — 직접 확인"을 명시합니다(스냅샷으로 semver·baseline을 판정하지 않음, #1601). target 버전은 `git tag`+`npm view`의 max+patch로 확정합니다. 수치 옆에는 측정 명령을 병기합니다. CC 버전 노트 반영 전에는 `npm view`+`claude --version`으로 상한 이후 릴리즈와 CHANGELOG를 확인합니다. (R017 「릴리즈 착수 전 실측 게이트」 외)
- 미확인 플래그는 확정형으로 쓰지 않습니다 — 실행 전 `--help`로 실측하거나 "예시 — 실제 플래그는 확인 후 사용"을 명시합니다. (R010 「Delegation Prompt Command Examples」)
- 카운트 동기화 위임에는 "실측값 기준으로 동기화하라"를 명시하고, 파일 목록 열거 대신 전수 grep으로 이전 값 히트를 모두 수집한 뒤 카운트 의미만 정정하게 합니다(무관한 숫자는 정정 대상 아님, `--include='*.md'`는 이중 확장자를 놓침). 기존 디렉토리 내 신규 문서는 카운트 불변. (R017 「Count Sync」)
- 버전 범프 위임은 3파일(package.json, templates/manifest.json, `.omcustom.lock.json`)을 전부 열거합니다. package.json과 manifest를 동시 범프 → `bun run build` → lockfile 스테이징 순서입니다. (R017 「버전 범프 원자 순서」)

## 2. 출처 인용과 문안

- 이슈·CHANGELOG 문장은 도구 출력에서 복사하고 완료 조건에 `grep -F` 원문 대조를 둡니다. Origin 사실은 원문을 동봉하고 "원문과 다르면 원문 우선"을 명시합니다. 범위 요약에는 `[요약 — 원문 우선]`, 오케스트레이터의 함의에는 `[가설 — 실측이 반대면 반대로 기재]`와 판정 기준을 붙입니다. (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- 룰 최종 문안은 서브에이전트가 이슈 본문에서 직접 작성하고, 오케스트레이터는 포인터·삽입 위치·제약만 지정합니다. 인용 대상 코드·파일과 대조한 뒤에만 룰로 승격합니다. 배선 판정은 후보 파일·앵커만 제시하고 커버 여부는 서브에이전트가 해당 문장을 인용해 판정합니다. (R010 동일 heading)
- 조항 삽입 위임의 완료 조건: 같은 주제 기존 문장 grep + 모순·stale 참조 갱신, 키워드 grep과 삽입 지점 ±1 heading의 Anti-pattern 표 전수 대조, "위 표"·"직전 조항" 같은 상대 위치 참조 재바인딩 확인. (R010 동일 heading)
- 묶음 버전 노트는 문장마다 "(NNN)" 릴리즈 태그와 항목별 CHANGELOG 원문을 동봉하고 `grep -F`로 대조합니다. RETIRED 주석 참조는 cross-ref 대신 인라인합니다(반영 대상은 주로 `guides/claude-code/15-version-compatibility.md`). 위임서에 "advisory는 판정과 같은 응답에 제시"를 명시하고, PASS 후 도착한 권고는 이월 검토합니다. (R017 「묶음 버전 노트 위임서」 외)

## 3. 승인·특권·파괴적 작업 경계

- 사용자 발언을 승인 근거로 인용하지 않습니다 — 허용 작업·금지 작업·완료 조건만 열거합니다(작업 범위를 사용자 요청에 연결해 서술하는 것은 허용). (R010 「Delegation Prompt Framing — 승인 인용 금지」)
- prod/특권 자원을 건드리는 위임에는 승인된 작업, 명시적 금지 작업(예: "do NOT delete files, do NOT query prod DB"), 권한 범위를 적습니다. 승인된 작업에서 미요청 특권 작업으로 연쇄하지 않으며(예: delete tunnel X → create tunnel Y는 위반), 넓은 단일 작업("migrate + backfill")은 도메인별로 미리 분해합니다. (R010 「Pre-Delegation Privileged-Scope Boundary」 외)
- 우회 플래그(`--admin` 등)는 실측 branch protection과 대조해 실제 필요할 때만, 우회 대상(예: `enforce_admins=false`이므로 그 N종 CI 게이트)과 근거를 명시합니다. (R010 「우회 플래그는 우회 대상과 근거를 명시」)
- 파괴적 git 명령 위임 전에는 `git status --short`, `git diff --stat`(및 `--cached`), `git stash show --stat`, `git clean -nd`로 정확한 대상을 열거합니다. 위임서에는 대상 목록 + `!` 명령 + 가역 대안을 함께 적습니다. 삭제 래퍼(`trash` alias)가 있으면 `command rm`·`\rm`·`/bin/rm` 우회 금지를 위임서 금지 문구에 넣습니다. (R001 「Pre-Delegation Blast-Radius Enumeration」)
- 브랜치 전환 위임은 파일 집합 차이를 관측값으로만 열거하고 결과 예측("untracked가 됩니다")은 쓰지 않습니다. 금지 목록(`stash`/`reset`/`clean`)과 "거부 시 즉시 중단, 오류 전문 보고"를 표준 문구로 넣습니다. (R010 「참인 전제 ≠ 참인 함의 — 브랜치 전환 위임」)
- GitHub 메타데이터 작업(이슈·코멘트·라벨, `gh run rerun`, 읽기 전용 `gh`)은 오케스트레이터 직접 실행이 허용되고, PR 생성·머지와 로컬 git 상태 변경은 mgr-gitnerd 소유입니다. (R010 「Delegation Rules」)
- sys-memory-keeper 위임에는 "압축·정리·티어 재평가 불요 — 지시한 항목만 기록"을 명시합니다. (R011 「Attention-Weight Memory Tiering」)

## 4. 병렬 위임

- 각 프롬프트에 동시 실행 에이전트 수 + 각자 담당 범위 + "자기 담당 범위만 기준으로 보고"를 명시합니다. 같은 검증 명령을 각 완료 조건에 넣어 병렬 발주하지 않고(공유 고지 또는 오케스트레이터 직렬 1회 회수), 임시 파일은 에이전트별 고유 경로만 씁니다. 병렬 그룹 위임서에 "전 그룹 공통 결과" 서술을 넣지 않습니다. (R010 「Parallel Delegation — Sibling-Agent Disclosure」 외)
- 정황만으로 원인을 형제에 귀속하지 않고 개입 실험(제거→재현 / 복원→소멸)으로 확정합니다. 간헐 실패를 "플래키"로 종결하지 않고 "원인 미귀속"으로 보고합니다. (R010 「"플래키"는 원인이 아니다」 외)
- git 상태변경 에이전트는 편집 파일이 disjoint해도 동시 1개로 직렬화합니다. 검증 명령은 tracked 파일 이동·초 단위 타임아웃에 의존하지 않을 때만 병렬이며, 초 단위 타임아웃 테스트는 동시 실행 금지, 테스트가 tracked 파일을 `cp`→`rm`→`finally` 복구하지 않고 고유 임시 디렉토리 사본을 씁니다. (R009 「파일 disjoint ≠ 자원 disjoint」 외)
- 가변 크기 리스트의 LLM 배치는 ≤40개 청크 분할 + 항목당 길이 제약(max_tokens만 올리면 불충분). 병렬 병합 후에는 통합 빌드 + 런타임/스모크 게이트를 오케스트레이터가 먼저 실행합니다. (R009 「LLM Batch Output Token Budget」 외)
- 구체적 `subagent_type`과 `model`을 쓰고 독립 단위는 같은 메시지의 별도 Agent 호출로 보냅니다. (R009)

## 5. 스폰 announce 형식

- 병렬 스폰은 각 Agent `description`이 `[N]`(1-indexed, Running display와 일치)로 시작하고 단일 스폰에는 `[N]`을 쓰지 않습니다. 예: `Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert")`. announce는 `[secretary][opus] → Spawning:` 다음에 줄 시작 `[1] lang-golang-expert:sonnet → Go code review`. 금지: 번호 앞 리스트 마커·백틱, `Spawning` 뒤 콜론 생략, 화살표 대신 콜론 연결. (R008 「Parallel Spawn Prefix Rule」 외)
- 단일 스폰도 호출 직전에 `[claude][opus] → Tool: Agent` / `[claude][opus] → Target: mgr-updater:sonnet → R008 clause update`를 씁니다. 형식은 `subagent_type:model → description`이며 `subagent_type`은 실제 파라미터와 일치해야 하고 임의 이름은 불가합니다. (R008 「Parallel Spawn Prefix Rule」)
- SendMessage로 에이전트를 재개할 때 announce에는 실측한 에이전트 타입을 쓰고, 타입을 실측하지 못했으면 「(타입 미확인)」으로 표기합니다 — 추정 타입을 쓰고 사후 정정하지 않습니다. (#1968 찐빠 #4, R008·R015)
- Tier-3 도구(AskUserQuestion, TodoWrite, EnterPlanMode, ExitPlanMode)도 접두사가 필요하고 Skill만 예외입니다. 식별: 라우팅 없음 `claude (default)`, 라우팅 `claude ({routing-skill})`, 스킬 호출 `claude → {skill-name}`. (R008 「Multi-Turn Self-Check (MANDATORY)」 외)
- 결과 집계는 `[Summary] {succeeded}/{total} tasks completed`. 완료 알림에 보고 본문이 없으면 한 턴 기다리고, 그래도 없으면 산출물을 실측한 뒤 SendMessage로 재요청합니다. (R009 「Result Aggregation」)

## 6. 위임 전 능력 사전 점검

- 위임 프롬프트를 쓰기 전에 R010 「Known Limitations (Active Cache)」 표에서 대상 에이전트 이름을 조회하고, 걸리는 완료 조건은 제거하거나 대체 경로를 지정합니다(표가 있어도 참조되지 않으면 무효). arch-documenter는 Bash 불가이므로 `diff`/`md5`/`verify-*.sh`를 그 완료 조건에 넣지 말고 오케스트레이터가 직접 실행하거나 `general-purpose`로 분리합니다. arch-documenter, fe-design-expert, mgr-supplier, qa-planner, qa-writer, sys-naggy는 `tools:`의 `Grep`/`Glob`을 제거하지 않습니다. 예: arch-documenter에 `gh issue view` 위임은 "Bash not allowed"로 2-3분 왕복 낭비입니다. (R010 「Agent Capability Pre-Check」, 「Known Limitations (Active Cache)」)
- 점검 항목: `gh`/셸 → `tools:`에 Bash 포함 + `disallowedTools:`에서 제외; Read/Write → 해당 도구; MCP → `mcpServers:`; 대상 경로는 존재(`ls`/`find`)하고, 기존 파일 편집·커밋 대상은 `git ls-files <path>`로 tracked 여부까지 확인(untracked면 범위 제외 또는 force-add 사전 결정). (R010 「Required Checks」)
- N곳 동일 변경은 위임 전 `md5`/`diff -q`로 일치를 확인하고 drift면 canonical 기준 정렬을 명시합니다. 미러 동기화는 "추가·수정·삭제 세 방향으로 en과 일치" + "en에 없는 행 0건 grep" 완료 조건을 씁니다. (R010 「Required Checks」)
- 전문 에이전트(`lang-*`/`be-*`/`fe-*`)가 있으면 사용하고 general-purpose는 파일 이동·단순 스크립트에만 씁니다. (R010 「Delegation Rules」)

## 7. 모델·권한·산출물

- Agent 도구 `model`은 `sonnet` | `opus` | `haiku` | `fable` 4값만 받고 전체 ID는 frontmatter 전용입니다. 예: `Agent(subagent_type: "...", model: "opus", mode: "bypassPermissions", prompt: "...")`. `sonnet5`/`opus5`/`opus48`은 무효, frontmatter의 Fable 5는 `claude-fable-5`, `xhigh`는 최고난도 작업에 한정합니다(`guides/claude-code/16-fable5-prompting.md`). (R006 「Model Specification — 3 Tiers」)
- `mode`는 CC 2.1.212 미만에서 필요하고 이후 무시되지만 계속 전달하며(값: `default`/`acceptEdits`/`bypassPermissions`/`plan`/`dontAsk`/`auto`) 무인 실행 증거로 보지 않습니다. `omitClaudeMd: true` 에이전트 출력은 rule-unaware로 취급합니다. (R006 「Permission Mode Guidance」, 「Optional Frontmatter」)
- 핸드오프는 아티팩트 파일 경로만 전달하고(`.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md`) 읽기·쓰기를 분리하며 한 아티팩트는 한 에이전트만 작성합니다. `report-*.md` Write 거부 시 텍스트로 반환하게 하고 파일은 오케스트레이터가 `ls -la`로 확인합니다. `bypassPermissions`에서 `.claude/**`·`.git/` 직접 Write/Edit는 허용입니다. (R006 「Artifact Output Convention」)

## 8. 서브에이전트 보고의 검증 (위임서 완료 조건)

- 서브에이전트의 원인 분석은 결론이 아니라 가설로 접수하고 결정론적 명령으로 정정한 뒤 전제로 씁니다. 양립 불가한 진단은 모순 신호이며 두 진단을 가르는 명령을 즉시 실행합니다. 보유 실측값과 어긋나는 서술은 즉시 정정 위임하거나 읽기 전용 명령 1개를 직접 실행합니다. (R020 「원인 분석도 완료 보고와 같은 등급의 검증 대상」)
- mid-step 종료 증상("merging now")이나 clause만으로 종료를 넘겨짚지 않고 `gh pr view`/`gh run list`로 실측하고 resume에는 실측값을 동봉합니다. 다중 Phase 작업은 단일 목표로 분할해 순차 발주합니다(`skill: <다중 Phase 스킬>`은 Phase를 먼저 읽고 분할). (R020 「Verification-Delegation Non-Termination」)
- oh-my-customcode 기본 에이전트는 `maxTurns`가 없어 턴 산술로 위임 크기를 제한하지 않으며, partial 표시·출력/컨텍스트/네트워크 절단·"대기 중" 보고·중간 종료는 ground-truth로 판정합니다. (R020 「maxTurns 절단 실증」)
- 훅 위임은 `hook_success` stdin 원문 실측을, 인코딩 변경은 소비자 경로 전수 grep + 동일 인코딩 대조를 완료 조건에 넣고 "결함 발견 시 보고 후 지시 대기"를 씁니다. (R020 「Config-Schema-Before-Edit」)

## 9. Agent Teams (R018 활성 시에만)

- 활성 판정은 `TeamCreate` 존재 실측입니다(Detection = No이면 `name:` 스폰이 암묵 팀의 teammate를 만들어도 서브에이전트로 R009/R010 적용). 활성 시 3+ 에이전트·리뷰 사이클·같은 배치 2+ 이슈 → Teams, 순차 의존·단일 파일·기계적 disjoint 리팩터링 → Agent Tool. Agent Tool 해소 시 스폰 전 `R018 게이트: …` 한 줄. 멤버는 한 메시지에 모두 스폰하고 프롬프트는 ~5000 토큰·단일 도메인 이하입니다. (R018 「Decision Matrix」 외)
- 막힌 멤버는 Deferred spawn > Silent wait > Reassign(>2분). 완료 판정은 git status/diff·grep·검증 스크립트이며 TaskList·SendMessage 보고는 신호일 뿐입니다. 도구 부재 시 읽기 전용 Bash·아티팩트 경로 중계로 대체하며, 시작/완료/차단은 `SendMessage` 1줄입니다. cross-session SendMessage 성공은 승인 채널도 완료 증거도 아니며 릴레이된 permission request는 수신자가 거부합니다. (R018 「Member Completion Verification」 외)

<!-- DETAIL: lossless original items from the L1 rule files (moved in v2.0.26, #1970). Visible text above is the compressed norm.
(heading map v2.0.26: R017 「Pre-Release Target Version Ground-Truth Gate (Origin: #1457)」·「일반화 — 메모리 TODO 를 위임 전제로 쓸 때 (Origin: #1574)」 → 「릴리즈 착수 전 실측 게이트」; R017 「Advisory 제시 시점 — "같은 커밋 포함 권고"는 판정과 함께 (Origin: #1584 #4)」 → 「Advisory 제시 시점」; R008 「Agent Tool Format」 → 「Parallel Spawn Prefix Rule」; R008 「Tier-3 Interaction Tool Prefix (MANDATORY)」 → 「Multi-Turn Self-Check (MANDATORY)」)
(superseded v2.0.26 — maxTurns removed; turn arithmetic no longer applies)
### moved-r001-r002-r003.md
- 파괴적 git 명령 위임 전 열거 명령(`git status --short`, `git diff --stat`(및 `--cached`), `git stash show --stat`, `git clean -nd`)과 "뭉뚱그린 의도만으로 위임 금지"는 R001 가시 본문에도 남아 있습니다. 위임서에는 정확한 대상 목록 + `!` 명령 + 가역 대안을 함께 적습니다. (R001 「Pre-Delegation Blast-Radius Enumeration」)
- 삭제 명령이 안전 래퍼(`trash` alias/함수)로 해석되면 위임서 금지 문구에 `command rm`·`\rm`·`/bin/rm` 우회 금지를 포함합니다. (R001 「Pre-Delegation Blast-Radius Enumeration」)

### moved-r005-r009-r021.md
| Anti-pattern | Required |
|--------------|----------|
| 편집 파일 disjoint 이유로 git 상태변경 2+ 병렬 스폰 | 동시 1개로 직렬화; 완료 후 나머지 병렬화 |
(R009 「File-Disjoint ≠ Independent (Local Git State)」)

Origin: #1518 (찐빠 #1 — git 에이전트 2개 근접 실행으로 작업 브랜치 stale; 편집 파일은 disjoint였음).
(R009 「File-Disjoint ≠ Independent (Local Git State)」)

| 자원 | 병렬 가능 조건 |
|------|----------------|
| 검증 명령 | tracked 파일 이동 없고 초 단위 타임아웃 미의존 시만 — 아니면 오케스트레이터가 직렬 1회로 회수 |
| CPU | 초 단위 타임아웃 테스트는 동시 실행 금지 |
| `$TMPDIR` | 에이전트별 고유 경로 사용 시만 |
(R009 「파일 disjoint ≠ 자원 disjoint」)

| Anti-pattern | Required |
|--------------|----------|
| 편집 파일이 disjoint하므로 동일 `bun test`를 각 에이전트 완료조건에 넣어 병렬 발주 | 검증을 직렬 1회로 회수하거나 형제 경합을 먼저 배제 |
| 테스트가 tracked 파일을 `cp`→`rm`→`finally` 복구 | 고유 임시 디렉토리에 사본을 만들어 조작 — 원본은 읽기 전용 |
(R009 「파일 disjoint ≠ 자원 disjoint」)

Origin: #1598 (R010, R023).
(R009 「파일 disjoint ≠ 자원 disjoint」)

| Anti-pattern | Required |
|--------------|----------|
| 가변 크기 리스트를 고정 소형 max_tokens로 단일 호출 | ≤40개 청크 분할 + 항목당 길이 제약 |
| max_tokens만 올림 | 불충분 — 청크 분할이 불변 해법 |
(R009 「LLM Batch Output Token Budget」)

Reference: #1320, #1321, `feedback_llm_batch_truncation.md`.
(R009 「LLM Batch Output Token Budget」)

- Use specific `subagent_type` (not "general-purpose" when specialist exists)
- Use `model` parameter for cost optimization (haiku for search, sonnet for code, opus for reasoning)
- Each independent unit = separate Agent tool call in the SAME message
(R009 「Agent Tool Requirements」)

```
[1] mgr-creator:sonnet → Create Go agent
[2] lang-python-expert:sonnet → Review Python code
[3] Explore:haiku → Search codebase
```
(R009 「Display Format」)

`[N] {subagent_type}:{model}` 형식 사용 — `[N]`은 1-indexed이며 Agent 도구 `description` 파라미터 접두사와 일치해야 Running display가 상관된다.
(R009 「Display Format」)

Single agent spawns do NOT use the `[N]` prefix.
(R009 「Display Format」)

| Anti-pattern | Required |
|--------------|----------|
| 리스트 마커나 백틱을 번호 앞에 붙임 | 줄 시작에 대괄호 숫자 — 앞에 공백 외 문자를 두지 않음 |
| 헤더에 콜론 생략 | Spawning 뒤에 **콜론 필수** |
| 화살표 없이 콜론만으로 연결 | 에이전트타입:모델 다음에 화살표 필수 |
(R009 「Narrative Announcement Format」)

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```
(R009 「Result Aggregation」)

완료 알림에 보고 본문이 없으면 한 턴 기다리고, 그래도 없으면 산출물을 실측(ground truth)한 뒤 SendMessage로 재요청합니다 — 모든 위임 결과 수집 단계에 적용됩니다.
(R009 「Result Aggregation」)

| Anti-pattern | Required |
|--------------|----------|
| 각 병렬 subagent의 "build green"만 신뢰하고 완료 선언 | 병합 결과에 통합 빌드 + 런타임/스모크 게이트를 오케스트레이터가 먼저 실행 |
(R009 「Parallel Feature Integration Gate」)

### moved-r006.md
- The Agent tool's `model` parameter accepts ONLY `sonnet` | `opus` | `haiku` | `fable`. It does NOT accept full model IDs (Tier 2) and does NOT accept `sonnet5`/`opus5`/`opus48` (never valid anywhere — retire these names). Note `fable` is valid HERE (Tier 3) but is NOT a Tier-1 frontmatter alias — Fable 5 in frontmatter requires the Tier-2 full ID `claude-fable-5`. (R006 「Model Specification — 3 Tiers」)
- Skill/rule text instructing "spawn with `model: opus`" refers to this tier — always the bare 4-value alias, never a full ID. (R006 「Model Specification — 3 Tiers」)
- Example: `Agent(subagent_type: "...", model: "opus", mode: "bypassPermissions", prompt: "...")` (R006 「Model Specification — 3 Tiers」)
- Fable 5는 high effort가 기본값이며, `xhigh`는 capability-sensitive 작업(최고난도 아키텍처/추론)에 한정합니다 — 불필요한 `xhigh` 남용은 지양합니다(R005 비용/지연 인식). Fable 5/Mythos 5 프롬프팅 상세: `guides/claude-code/16-fable5-prompting.md`. (R006 「Model Specification — 3 Tiers」)
- Canonical source: R010 (MUST-orchestrator-coordination.md) "Universal bypassPermissions". Below CC 2.1.212 pass `mode: "bypassPermissions"` explicitly (default `acceptEdits`); from 2.1.212 the `mode` parameter is ignored (parent mode inherited; frontmatter `permissionMode`, table below, may override). Keep passing `mode`; see R010's version table and self-check. Modes: `default` CC decides per-tool prompting; `acceptEdits` auto-accept file edits, prompt for others; `bypassPermissions` skip all permission prompts; `plan` require plan approval; `dontAsk` non-interactive, deny unapproved; `auto` AI decides safety. (R006 「Permission Mode Guidance」)
- `omitClaudeMd: true` — 서브에이전트가 CLAUDE.md/룰을 전혀 로드하지 않고 실행(비용 절감용; managed policy 파일은 계속 로드); 그렇게 스폰된 에이전트는 R007/R008/R010을 보지 못하므로 오케스트레이터는 그 출력을 rule-unaware로 취급합니다. (R006 「Optional Frontmatter」)
- Skills persist output to `.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md`. Opt-in, git-untracked. Final subagent writes (R010). Observed (#1858, CC 2.1.296/2.1.310): a subagent Write of a report-named file (`report-*.md`) was refused; trigger unmeasured [가설]. On refusal the subagent returns the content as text and reports the refusal; if a downstream agent needs a file, the orchestrator delegates a separate writer with a filename outside report/summary/findings/analysis names [가설]. The orchestrator confirms every file deliverable with its own `ls -la`. (R006 「Artifact Output Convention」)
- CC v2.1.121+: `bypassPermissions`에서 `.claude/**`(templates 미러 포함)·`.git/`·`.vscode/` 직접 Write/Edit/Bash 허용 — 레거시 `/tmp/*.sh` 우회는 폐기(#1101). 파괴적 셸 작업은 별도 가드가 차단합니다. (R006 「Sensitive Path Handling」)
- 에이전트 간 결과 핸드오프 시 **아티팩트 파일을 채널로 사용**하는 프로토콜. | Path-only transfer | 다음 에이전트에 전달할 때 **파일 경로만 전달**, 본문 inline 전달 금지(거부 중계 시 별도 writer 1회 제외 — 위 Convention) | Read-write 분리 | 생산 에이전트는 Write(거부 시 위 Convention의 중계 경로), 소비 에이전트는 Read (파일 경쟁 방지) | Session-scoped | 아티팩트는 세션 범위 — `{YYYY-MM-DD}` 디렉토리로 격리 | Single-writer | 한 아티팩트는 하나의 에이전트만 작성. 후속 에이전트는 새 아티팩트 생성 (R006 「Artifact Channel Protocol」)

### moved-r007-r008-r015.md
- Parallel spawns: each Agent `description` MUST start with a `[N]` prefix (1-indexed); single spawns do NOT use `[N]`. Example literals: `Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert")` / `Agent(description: "[2] Python code review", subagent_type: "lang-python-expert")`. (R008 「Parallel Spawn Prefix Rule」)
- Running display and spawn announcement must match: `⏺ Running 2 agents…` with `[1] Go code review` / `[2] Python code review`, announced as `[secretary][opus] → Spawning:` followed by line-start `[1] lang-golang-expert:sonnet → Go code review` and `[2] lang-python-expert:sonnet → Python code review`. (R008 「Parallel Spawn Prefix Rule」)
- A single spawn still needs the Core Rule prefix line before the call: `[claude][opus] → Tool: Agent` / `[claude][opus] → Target: mgr-updater:sonnet → R008 clause update`. Anti-pattern: announcing a single spawn only as a standalone line. (R008 「Parallel Spawn Prefix Rule」)
- Spawn announce literal: forbidden are a list marker or backtick before the number, omitting the colon after `Spawning`, and joining description with a colon instead of an arrow — all three fail to match the advisor regex. (R008 「Spawn Announce 리터럴 — advisor 정규식 정합」)
- Agent tool format: `subagent_type:model → description`; `subagent_type` MUST match the actual Agent tool parameter; custom names are not allowed. Models: `opus` (reasoning) / `sonnet` (default) / `haiku` (fast). (R008 「Agent Tool Format」)
- Tier-3 interaction tools (AskUserQuestion, TodoWrite, EnterPlanMode, ExitPlanMode) require the prefix; only Skill is exempt (identified by the R007 integrated header `claude → {skill-name}`). (R008 「Tier-3 Interaction Tool Prefix (MANDATORY)」)
- Routing identification contexts: no routing = `claude (default)`; secretary/dev-lead/de-lead/qa-lead-routing = `claude ({routing-skill})`; skill invocation = `claude → {skill-name}`, integrated in the header, not a separate tool call. (R007 「Routing & Skill Context」)

### moved-r010.md
- prod/특권 자원을 건드리는 위임: Anti-pattern "Delegate a prod/privileged-touching task with no scope or forbidden-line in the prompt" → Required: State in the prompt: the approved action(s), explicit forbidden actions (e.g. "do NOT delete files, do NOT query prod DB, do NOT read SMS/messages"), and the authorization scope tied back to the user request. (R010 「Pre-Delegation Privileged-Scope Boundary (proactive)」)
- 승인된 작업에서 미요청 특권 작업으로 연쇄 금지 — Example: approved "delete tunnel X" → unrequested "create new public tunnel Y" is a scope violation. Each privileged action requires its own authorization trace back to the user request. (R010 「Out-of-Scope Privileged Chaining」)
- Broad single-task scopes (e.g. "migrate + backfill") MUST be pre-decomposed by domain before delegation, so an agent cannot silently expand from its named task into adjacent privileged domains (secret rotation, tunnel creation, infra deletion, dashboard changes). See R009 (pre-decomposition) and R018 (domain-split). (R010 「Pre-Decomposition Mandate」)
- Anti-pattern: 우회 플래그(`--admin` 등)만 지시하고 근거 없음 → Required: 실측 branch protection과 대조 후, 플래그가 실제로 필요할 때만 우회 대상·근거를 명시 — 예: "required status check N종 전부 pass 확인함. `enforce_admins=false`이므로 `--admin`이 우회하는 것은 **그 N종 CI 게이트**뿐이며, [사유]로 이를 승인한다" (R010 「우회 플래그는 우회 대상과 근거를 명시」)
- 위임 프롬프트에서 **사용자 원문을 승인/동의의 근거로 인용하지 않는다**. 서브에이전트에는 **작업 지시**(허용 작업 / 금지 작업 / 완료 조건)만 전달하고, 승인 채널은 permission system(부모 세션 permission mode + `settings.json` allow 규칙)이 담당합니다. **경계 구분**: 작업 범위를 사용자 요청에 연결해 **서술**하는 것은 허용되며, 그것을 **승인의 증거로 제시**하는 것이 금지됩니다. (R010 「Delegation Prompt Framing — 승인 인용 금지」)
- Anti-pattern: 위임 프롬프트에 사용자 발언을 승인 근거로 인용 (예: `사용자가 "커밋하고 푸시해"라고 승인했다`) → Required: 허용 작업·금지 작업·완료 조건만 열거 (예: "<release 브랜치>에 커밋 후 push. 금지: force-push, develop 직접 push") (R010 「Delegation Prompt Framing — 승인 인용 금지」)
- Anti-pattern: 승인 인용으로 거부당한 뒤 같은 프레이밍으로 재위임 → Required: 프레이밍에서 승인 인용을 제거해 재위임; 프롬프트 억제가 필요하면 `settings.json` allow 규칙으로 해결 (R010 「Delegation Prompt Framing — 승인 인용 금지」)
- Anti-pattern: 미확인 플래그를 확정형으로 위임 프롬프트에 기재 (`gh issue edit <N> --assignee @me`) → Required: 실행 전 `--help`로 실측 후 기재, 또는 "예시 — 실제 플래그는 확인 후 사용" 명시 (R010 「Delegation Prompt Command Examples — 실측 확인 또는 예시 명시」)
- Anti-pattern: 이전 턴에서 본 HEAD SHA를 위임서에 그대로 기재 → Required: 위임 직전 `git rev-parse --short HEAD` 실측값 기재 (R010 「저장소 상태 기재도 같은 규율」)
- Anti-pattern: 브랜치 이름은 고정이라 보고 HEAD SHA만 재실측 → Required: 브랜치 이름도 함께 재실측 — 공유 워크트리에서는 **브랜치 이름도 턴 단위 수명**이다(#1595 #1, R017 「게이트는 분기 시점 1회가 아니라 상태변경 위임마다」) (R010 「저장소 상태 기재도 같은 규율」)
- **사전 실측 리터럴 (Origin: #1646)**: 저장소 상태를 기재한 위임서를 작성하기 **직전에** 아래 3줄을 그대로 실행합니다. (R010 「저장소 상태 기재도 같은 규율」)

```
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git branch --list
```

- Anti-pattern: `gh pr merge --delete-branch` 등 부수효과가 있는 명령 실행 후, 그 이전에 관측한 브랜치/SHA를 위임서에 그대로 기재 → Required: 위임 직전 위 3줄을 재실행하고 출력 원문을 위임서에 붙여 넣음 (R010 「저장소 상태 기재도 같은 규율」)
- Anti-pattern: 브리프에 "CC 최신 버전은 2.1.2NN입니다"처럼 측정 명령 없이 수치만 기재 → Required: 수치 옆에 측정 명령을 병기(예: `claude --version`=X / `git grep ... \| sort -V \| tail -1`=Y) (R010 「브리프 실측값에는 측정 명령을 병기」)
- Anti-pattern: 메모리 요약·기억으로 Origin 사실을 위임서에 확정형 기재 → Required: 출처 문장을 `gh issue view`/원문에서 인용해 동봉하고 "원문과 다르면 원문 우선"을 명시 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 삽입 위치와 문안만 지정한 조항 삽입 위임 → Required: 같은 주제의 기존 문장 grep + 모순·stale 참조 갱신을 완료 조건에 포함 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: CHANGELOG·이슈 문장을 위임서에 수기로 옮겨 적음 → Required: 도구 출력에서 복사 + 완료 조건에 `grep -F` 원문 대조 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 인용 대상 코드를 보지 않고 제안 문안을 룰로 승격 → Required: 인용문이 가리키는 코드·파일과 대조 후 기재 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 오케스트레이터의 함의를 확정형으로 위임서에 기재 → Required: `[가설 — 실측이 반대면 반대로 기재]` 표기 + 판정 기준 동봉 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 룰 문안 **최종 문안**을 오케스트레이터가 직접 작성해 위임서에 기재 → Required: 서브에이전트가 이슈 본문에서 사실·수치를 직접 뽑아 작성; 오케스트레이터는 포인터·삽입 위치·제약만 지정 — 인용 원문·실측 사실·승인/금지 목록·표준 금지 문구·`[가설]` 표기·재실행 금지 목록은 오케스트레이터가 계속 기재 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 위임서의 "요구사항 요약"을 오케스트레이터가 산문으로 재구성해 확정형으로 기재 (예: "…만 지정") → Required: 이슈 제안 문장을 `gh issue view` 출력에서 복사해 전달; 오케스트레이터의 범위 요약에는 `[요약 — 원문 우선]` 표기 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 같은 주제 키워드 grep만으로 인접성 점검 완료 판정 → Required: 키워드 grep + 삽입 지점 ±1 heading의 Anti-pattern 표 전수 대조를 병행 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: ±1 heading 대조를 모순 여부에만 국한 → 인접 문구의 "위 표"·"아래 표"·"직전 조항" 참조가 삽입 후 다른 대상으로 재바인딩된 것을 놓침 → Required: ±1 heading 대조에 상대 위치 참조 재바인딩 확인을 포함 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: 위임서에 오케스트레이터의 배선 판정("기존 bullet이 커버")을 확정형으로 기재 → Required: 배선 대상 후보 파일·앵커만 제시하고 커버 여부는 서브에이전트가 해당 문장을 인용해 판정 (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- Anti-pattern: "대상 브랜치에 없는 파일이므로 전환 후 untracked가 됩니다"처럼 전환 결과를 확정형으로 위임서에 기재 → Required: 파일 집합 차이를 관측값으로만 열거; 결과 예측은 기재하지 않음 (R010 「참인 전제 ≠ 참인 함의 — 브랜치 전환 위임」)
- Anti-pattern: 전환 거부 시 서브에이전트가 `stash`/`reset`/`clean`으로 자체 우회 → Required: 위임서에 금지 목록 + "거부 시 즉시 중단, 오류 전문 보고"를 표준 문구로 포함 (R010 「참인 전제 ≠ 참인 함의 — 브랜치 전환 위임」)
- Anti-pattern: 병렬 스폰 프롬프트에 형제 에이전트 고지 없이 위임 → 공유 뷰 출력을 오독하거나 원인을 "외부 프로세스"로 오귀속 → Required: 각 프롬프트에 동시 실행 에이전트 수 + 각자 담당 범위 + "자기 담당 범위만 기준으로 보고" 지시 명시 (R010 「Parallel Delegation — Sibling-Agent Disclosure」)
- Anti-pattern: 파일 소유권만 고지하고 동일 검증 명령을 각 에이전트 완료 조건에 넣어 병렬 발주 → Required: 검증 명령 공유를 고지하거나 검증을 오케스트레이터가 직렬 1회로 회수 (R010 「Parallel Delegation — Sibling-Agent Disclosure」)
- Anti-pattern: 공유 `$TMPDIR`에 고정 경로로 임시 파일을 쓰고 그 디렉토리를 전수 계수 → Required: 에이전트별 고유 경로 사용 + 그 경로만 계수 (R010 「Parallel Delegation — Sibling-Agent Disclosure」)
- Anti-pattern: 고지받은 형제의 담당 범위와 겹친다는 정황만으로 실패 원인을 형제에 귀속 → Required: 개입 실험(제거→재현 / 복원→소멸)으로 인과를 확정한 뒤 귀속 (R010 「고지는 귀속 후보를 늘릴 뿐 증거 등급을 올리지 않는다」)
- Anti-pattern: 병렬 그룹 위임서에 "전 그룹 공통 결과" 서술 작업 포함 → 기재 시점 참이 완료 순서에 따라 거짓화 → Required: 교차 서술은 전 그룹 완료 실측 후 오케스트레이터 대조 또는 후속 위임으로 (R010 「형제 결과의 교차 서술 금지」)
- Anti-pattern: 간헐 실패를 "플래키"·"부하 의존"으로 판정하고 종료 → Required: 개입 실험으로 귀속; 실패 시 "원인 미귀속"으로 보고(무작위라 단정 금지) (R010 「"플래키"는 원인이 아니다」)
- Before delegating a task to a subagent, MUST verify the target agent's tool capabilities against the task requirements. Failure to pre-check causes round-trip waste (delegation → failure → re-delegation). (R010 「Agent Capability Pre-Check」)
- **표 조회 배선 (MUST, #1593 #1)**: 위임 프롬프트를 작성하기 **전에** "Known Limitations (Active Cache)" 표에서 대상 에이전트 이름을 조회합니다. 표에 항목이 있으면 그 제약에 걸리는 완료 조건 항목을 제거하거나 대체 경로를 지정합니다. **표가 존재해도 참조되지 않으면 무효**입니다 — R016 Rule Wiring Check의 "텍스트 ≠ 배선" 원칙이 위임 습관에도 그대로 적용됩니다. (R010 「Agent Capability Pre-Check」)
- Required Checks (original rows): `gh` / shell commands → `tools:` includes Bash AND `disallowedTools:` excludes Bash; `Read` external files → `tools:` includes Read; `Write` files → `tools:` includes Write (and target path not in `disallowedTools` scope); MCP server calls → `mcpServers:` includes the required server; Task targets a specific file path → The path EXISTS (`ls`/`find`, or `Glob` when present — not `git ls-files`, which reports an existing untracked path as absent; tracked status is the next row) — capability check alone does not catch a missing/renamed file; Task targets an EXISTING file for editing/commit (not a newly-created file) → The path is git-tracked (`git ls-files <path>` non-empty) — an existing-but-untracked target needs an explicit scope decision before delegation. (R010 「Required Checks」)
- Anti-pattern: 경로 존재(`ls`/`Glob`)만 확인하고 위임 → 기존 파일 대상이 untracked라 커밋 단계에서야 발견 → Required: 기존 파일 편집·커밋 대상에 한해 `git ls-files <path>`(또는 `git check-ignore -v --no-index <path>`)로 tracked 여부까지 확인; untracked면 위임 범위에서 제외하거나 force-add 여부를 사전 결정. 신규 생성 대상은 이 확인에서 제외 (R010 「Required Checks」)
- Anti-pattern: `find`로 N곳 존재 확인 후 "N곳 동일 변경" 위임 → Required: 위임 전 `md5`/`diff -q`로 N곳 내용 일치 확인; drift 시 canonical 기준 정렬을 위임 prompt에 명시 (R010 「Required Checks」)
- Anti-pattern: 미러 동기화 위임을 "en의 새 내용을 ko에 반영하라"로만 지시(추가 전용) → Required: "추가·수정·삭제 세 방향으로 en과 일치"를 표준 문안에 고정 + "en에 없는 행 0건 grep" 완료 조건 포함 (R010 「Required Checks」)
- Anti-pattern: 신규 파일이 기존 디렉토리 내 문서인데 "카운트 N→N+1"로 위임 → Required: 위임 전 토픽 디렉토리 vs 문서 판별; 문서면 카운트 불변 전달 + "실측값 기준" 방어선 명시 (R010 「Required Checks」)
- Known Limitations original row 1: `arch-documenter` | `disallowedTools: [Bash]` — cannot run `gh`, shell scripts, `diff`/`md5`/`verify-*.sh` | Pre-collect data via orchestrator, pass as content; OR use `general-purpose` for the Bash-needing portion. **Completion-condition guard (#1593 #1)**: do NOT put `diff` / `md5` / `verify-*.sh` execution into arch-documenter's completion criteria — the orchestrator must run these itself, or split off a `general-purpose` agent for the Bash-needing verification (R010 「Known Limitations (Active Cache)」)
- Known Limitations original row 2 (normative part): `arch-documenter`, `fe-design-expert`, `mgr-supplier`, `qa-planner`, `qa-writer`, `sys-naggy` (frontmatter parse: `Bash` in `disallowedTools`) — No Bash, so every search path is the dedicated `Grep`/`Glob` listed in their `tools:` (`sys-naggy` lists `Grep` only) — Do not remove `Grep`/`Glob` from these agents' `tools:` — without Bash they would have no search path left. Measurement sentence → version-narrative. (R010 「Known Limitations (Active Cache)」)
- Example: ❌ WRONG: Delegate `gh issue view` to arch-documenter without pre-check → Agent fails ("Bash not allowed") → 2-3min round-trip waste. ✓ CORRECT: Pre-check arch-documenter.disallowedTools → collect data first → pass as content. (R010 「Known Limitations (Active Cache)」 → 「Common Violation」)
- Delegation Rules original language rows (body now says `lang-*`/`be-*`/`fe-*`): Python/FastAPI → lang-python-expert / be-fastapi-expert; Go code → lang-golang-expert; TypeScript/Next.js → lang-typescript-expert / fe-vercel-agent; Kotlin/Spring → lang-kotlin-expert / be-springboot-expert. Also: Use specialized agents, not general-purpose, when one exists; general-purpose only for truly generic tasks (file moves, simple scripts); No exceptions for "small" or "quick" changes. (R010 「Delegation Rules」)
- GitHub 메타데이터 작업(이슈 생성·코멘트·라벨·마일스톤, `gh run rerun`, 읽기 전용 `gh` 조회)은 프로젝트 파일 쓰기가 아니므로 오케스트레이터 직접 실행이 허용됩니다 — 위임도 허용되며, PR 생성·머지와 로컬 git 상태 변경은 계속 mgr-gitnerd 소유입니다 (Origin: #1683 찐빠 #6). (R010 「Delegation Rules」)
- Members spawn sub-agents or message peers only if `Agent`/`SendMessage` are available to them (directly or loadable via `ToolSearch`); otherwise the orchestrator relays via files and spawns on their behalf (R018 「멤버 도구 부재 시 대체 규약」). When Detection = No, every agent spawned via the Agent tool is treated as a subagent under the Core Rule by policy (even if a named spawn appears as a Teammate in `ListAgents`). Quick rule (applies only when active): 3+ agents OR review cycle OR 2+ issues in same batch → use Agent Teams; using Agent tool when Agent Teams criteria are met needs correction per R018. (R010 「Agent Teams (required when enabled)」)

### moved-r011-r013-r004.md
- sys-memory-keeper에 메모리 갱신을 위임할 때는 위임서에 "압축·정리·티어 재평가 불요 — 지시한 항목만 기록"을 명시합니다(정리는 별도 위임, #1660). (R011 「Attention-Weight Memory Tiering」)

### moved-r017-r022-r012.md
- 무관한 숫자는 정정 대상 아님. `--include='*.md'`는 이중 확장자를 놓친다. (R017 「Count Sync — Exhaustive Grep, Not File Enumeration」)
- | 카운트 동기화를 "갱신할 파일 목록" 열거로 위임 | 전수 grep으로 이전 값 히트를 모두 수집한 뒤 카운트 의미만 정정 | (R017 「Count Sync — Exhaustive Grep, Not File Enumeration」)
- 위임 프롬프트에는 항상 **"실측값 기준으로 동기화하라"**를 명시한다(#1443). (R017 「Count Sync — Exhaustive Grep, Not File Enumeration」; 가시 본문에도 유지)
- 범프 위임 표준 문안: 위임 프롬프트에 3파일을 전부 열거한다(텍스트 존재 ≠ 배선, R010). (R017 「버전 범프 원자 순서 (Origin: #1619 #4)」)
- | package.json만 먼저 범프 후 build → manifest 나중 범프 | 두 파일 동시 범프 → `bun run build` → lockfile 스테이징 | (R017 「버전 범프 원자 순서 (Origin: #1619 #4)」)
- | 초반 실측 브랜치·HEAD를 세션 내내 유효로 사용 | 상태변경 위임 직전마다 재실측·대조 | (R017 「게이트는 분기 시점 1회가 아니라 상태변경 위임마다」)
- | 메모리 스냅샷으로 target 버전 추정 위임 | 위임 전 `git tag`+`npm view` 실측 → max+patch 확정 | (R017 「Pre-Release Target Version Ground-Truth Gate (Origin: #1457)」)
- 원리는 메모리 항목 전반에 적용 — `MEMORY.md` TODO는 스냅샷이므로 위임 전 실측 재확인하거나 측정 시점을 표기한다. (R017 「일반화 — 메모리 TODO 를 위임 전제로 쓸 때 (Origin: #1574)」)
- 추가 사례(#1601): semver 오판·baseline(메모리 vs 실측 2291) 모두 스냅샷을 판정 근거로 쓰면 안 된다. (R017 「일반화 — 메모리 TODO 를 위임 전제로 쓸 때 (Origin: #1574)」)
- | 메모리 TODO를 현재 상태로 간주해 전제 기재 | 위임 전 실측 재확인 또는 "스냅샷 — 직접 확인" 명시 | (R017 「일반화 — 메모리 TODO 를 위임 전제로 쓸 때 (Origin: #1574)」)
- | 이슈 버전(스코프 상한)까지만 조사해 반영 | 반영 전 `npm view`+`claude --version` 실측, 상한 이후 CHANGELOG 확인 | (R017 「CC 버전 노트 반영 전 — 스코프 상한 이후 릴리즈 확인 (Origin: #1584 #1)」)
- 여러 릴리즈를 한 노트로 묶을 때, 위임서는 **문장마다 릴리즈 번호 태그**를 의무화한다(헤더만 묶으면 오귀속). v1.1.77+ 반영 대상은 주로 `guides/claude-code/15-version-compatibility.md`(R016 정책) — 룰에는 행동 변화 항목만 1줄. (R017 「묶음 버전 노트 위임서 — 문장별 (NNN) 태그와 합쇼체 예시 (Origin: #1688 — Iteration 3 #3·#4)」)
- | 헤더에 번호를 묶고 문장 태그 없이 위임 | 문장마다 "(NNN)" 태그, 항목별 CHANGELOG 원문 동봉 | (R017 「묶음 버전 노트 위임서 — 문장별 (NNN) 태그와 합쇼체 예시 (Origin: #1688 — Iteration 3 #3·#4)」)
- **보강**: CHANGELOG 원문은 복사+`grep -F` 대조; 은퇴(RETIRED) 처리된 주석을 참조할 때는 cross-ref 대신 인라인. (R017 「묶음 버전 노트 위임서 — 문장별 (NNN) 태그와 합쇼체 예시 (Origin: #1688 — Iteration 3 #3·#4)」)
- 재실행 비용 절감을 위해 권고를 **판정 시점에** 받는다 — 위임서에 "advisory는 판정과 같은 응답에 제시"를 명시한다. (R017 「Advisory 제시 시점 — "같은 커밋 포함 권고"는 판정과 함께 (Origin: #1584 #4)」; 가시 본문에도 유지)
- | 게이트 PASS 후 도착한 권고 반영으로 스코프 확장 | 위임서에 "advisory는 판정과 함께 제시" 명시; 도착분은 이월 검토 | (R017 「Advisory 제시 시점 — "같은 커밋 포함 권고"는 판정과 함께 (Origin: #1584 #4)」)
- R022 / R012: 위임 절차로 옮긴 본문 없음. R022 「Delegation」(위키 쓰기는 wiki-curator, R010)은 가시 본문에 그대로 남아 있습니다.

### moved-r018.md
- Decision Matrix (활성 시): Teams — Multi-step with shared state; Research requiring discussion; Complex debugging across modules; Code review + fix cycle (Review → fix → re-review loop); Dynamic agent creation + usage; Multi-issue release batch; Large plan / multi-domain prompt (>5000 tokens, 3+ areas: domain-split + review avoids single-agent timeout). Agent Tool — Simple independent subtasks; Sequential-dependency init/scaffolding (blocked agents waste tokens polling); Cost-sensitive batch ops; Single file operations; Mechanical disjoint-file refactoring (bulk delete + reference cleanup; Teams stall risk outweighs benefit, R009). When Agent Teams is enabled and criteria are met, usage is required. (R018 「Decision Matrix」)
- Self-Check (Before Agent Tool): user explicitly preferred plain subagents this session? → Agent Tool (R000 > R018). Otherwise 3+ agents OR review cycle → Agent Teams. Sequential deps/scaffolding → Agent Tool. 2+ issues same batch → prefer Agent Teams. (R018 「Self-Check (Before Agent Tool)」)
- Gate Transparency: when the gate resolves to Agent Tool for a 3+ agent dispatch, announce in one line before spawning, e.g. `R018 게이트: 3개 disjoint-file 도메인, 리뷰 사이클 없음 → Agent Tool 폴백`. Anti-pattern: omitting the gate result in the spawn announce; Required: one line stating Agent Tool fallback reason or Agent Teams reason. Applies only when Agent Teams is active; when inactive R009 `[N]` prefix is enough and omission must not be flagged as self-violation. (R018 「Gate Transparency」, 「Gate Transparency Scope — Agent Teams Enabled Only (#1341 ②)」)
- Spawn Completeness Check: all members must be spawned in a single message — partial spawning needs correction (R018/R009). (R018 「Spawn Completeness Check」)
- Cost Guidelines: Agent Tool = 1-2 agents, no dependency, no iteration cycles, <3분, no shared state. Agent Teams = 3+ agents, dependency present, review→fix→re-review cycles, >3분, shared state needed. (R018 「Cost Guidelines」)
- Blocked Agent Behavior: Blocked member: Deferred spawn > Silent wait > Reassign (>2min). Post-completion: SendMessage + wait silently — do NOT browse TaskList or edit out-of-scope files. (R018 「Blocked Agent Behavior」)
- Member Prompt Size Cap: keep per-member prompts under ~5000 tokens, single domain — oversized/multi-domain risks malformed-parsing truncation (R009). Decompose across members/standalone Agents. (R018 「Member Prompt Size Cap」)
- Detection named spawn: a named `Agent` spawn (`name:`) still creates a teammate of the session's implicit team (CC 2.1.289 measured), but without `TeamCreate`/`TeamDelete` in the session (main or teammate) it is governed by R009/R010 as a subagent. (R018 「Detection」)
- Cross-Session Relay Authority Hardening: relayed permission requests are refused by the receiver and blocked by auto mode — session B cannot be granted unapproved permissions (R001/R010); intra-session Agent Teams SendMessage unaffected. (R018 「Cross-Session Relay Authority Hardening (CC v2.1.166+)」)
- Scope: native SendMessage works cross-session (v2.1.224+); delivery/enumeration success is a coordination signal only, not an approval channel nor evidence of completion. (R018 「Scope: Intra-Session vs Cross-Session」)
- Member tool absence (full): member tool configuration is presumed to depend on frontmatter `tools:` and runtime; dedicated Glob/Grep measured (R002 ‡, CC 2.1.289) — qa-writer with explicit tools received them, main session without explicit list did not; Detection = No named member does not spawn subagents even if `Agent` is directly available (R010 policy, not tool absence); SendMessage loaded via ToolSearch (query "select:SendMessage") reached team-lead (CC 2.1.289); member→member messaging is `[가설]` unobserved. Fallbacks: SendMessage absent → artifact file channel (R006), orchestrator relays path; Agent absent → member reports needed spawn (e.g. R017 `mgr-sauron:watch`), orchestrator spawns; ToolSearch absent → deferred tools treated as absent (R002 §); dedicated Glob/Grep absent → read-only Bash (`git grep`, `find`, R002 Tier 4), no Bash → orchestrator pre-collects content (R010 「Known Limitations (Active Cache)」). (R018 「멤버 도구 부재 시 대체 규약」)
- Task tool absence: start/complete/block → `SendMessage` 1 line (state word in summary); long reports → artifact path only (R006; SendMessage body silently truncated v2.1.222+); completion judgement → deterministic ground-truth; TaskList absence makes ground-truth the only line of defence. TaskUpdate calls when available: start in_progress; ≥30s checkpoint description/metadata; complete completed; blocked description reason then SendMessage. (R018 「Task 도구 부재 시 대체 규약」, 「Member TaskUpdate Discipline」)
- Member Completion Verification: member completion MUST be verified by deterministic ground-truth (git status/diff, grep/file existence, validation scripts) — TaskList status and SendMessage report are low-reliability signals only. Stall handling: no progress ~2 minutes → reassign to standalone Agent (R009). (R018 「Member Completion Verification」)

### moved-r020.md
- 보유 실측값과 어긋나는 서브에이전트 서술을 "리뷰 항목으로 넘깁니다"라며 이월하지 않습니다 — 즉시 정정 위임 또는 판정을 가르는 **읽기 전용** 명령 1개를 직접 실행(`git show` / `gh … view` 등 — 파일 수정·상태 변경은 계속 위임, R010)합니다. (R020 「보유 실측값과 어긋나는 서브에이전트 서술은 즉시 정정」)
- 서브에이전트의 원인 분석은 **결론이 아니라 가설**로 접수하고, 결정론적 명령으로 정정합니다. 서브에이전트의 원인 분석을 결론으로 접수하고 후속 계획의 전제로 사용하지 않습니다 — 가설로 접수 → 결정론적 명령으로 정정 후 전제화합니다. (R020 「원인 분석도 완료 보고와 같은 등급의 검증 대상」)
- 진단별 필요한 실측: "대상 브랜치에 이미 tracked로 존재하며 내용이 다르다" → `git cat-file -e <branch>:<path>` (존재 여부), `git show --name-status <sha>` (추가/수정 구분); "이 실패는 X 때문이다"(오류 메시지 해석에 근거) → 같은 메시지를 내는 **다른 시나리오**를 열거하고, 시나리오를 가르는 명령을 1개 이상 실행; "형제/부하/환경 때문이다" → 개입 실험으로 귀속 — R010 「"플래키"는 원인이 아니다」. (R020 「원인 분석도 완료 보고와 같은 등급의 검증 대상」)
- 오케스트레이터와 서브에이전트의 진단이 양립 불가한데 어느 쪽이 맞는지 실측 없이 한쪽 채택하지 않습니다 — 양립 불가를 **모순 신호**로 취급 — 두 진단을 가르는 명령을 즉시 실행합니다. (R020 「원인 분석도 완료 보고와 같은 등급의 검증 대상」)
- 위임 프롬프트 clause 명시만으로 판정을 신뢰하지 않습니다 — clause는 보조 수단; 오케스트레이터가 항상 직접 ground-truth 실측합니다. (R020 「Verification-Delegation Non-Termination」)
- mid-step 종료 증상(예: "merging now")으로 결과를 넘겨짚지 않고, 매번 `gh pr view`/`gh run list` 등으로 실측 후 완료/미완료 판정합니다. (R020 「Verification-Delegation Non-Termination」)
- resume 시 빈 재촉만 전달하지 않고, 실측값을 resume 메시지에 동봉해 재폴링 루프 차단합니다. (R020 「Verification-Delegation Non-Termination」)
- 다중 Phase 작업(3-Phase 검증, 3-커밋 시퀀스)을 한 에이전트에 위임하고 clause로 종료를 막으려 하지 않습니다 — 위임 단위를 단일 목표 1개로 분할해 순차 발주 — 경계 분할이 clause 강화보다 실효적입니다. (R020 「위임 경계를 Phase 개수로 설계」)
- 파이프라인 정의가 `skill: <다중 Phase 스킬>`이므로 그대로 호출하지 않습니다 — 스킬 정의의 Phase를 먼저 읽고 단일 목표 위임으로 분할해 순차 발주; 파이프라인 정의에도 분할 지시를 배선합니다. (R020 「위임 경계를 Phase 개수로 설계」)
- 파일 수만 세어 위임 크기 판정하지 않습니다(조항 다수 파일에서 절단) — 편집 항목 수 × 2턴 + 파일 고정비(3턴)로 산술합니다. (R020 「maxTurns 절단 실증」)
- 리서치 위임이 수집을 끝낸 뒤 일괄 기록하지 않도록 첫 2턴 내 골격 Write + 증분 Edit를 지시합니다. (R020 「maxTurns 절단 실증」)
- "대기 중" 보고를 미완료로 단정하지 않고, 훅 피드백 잠식 가능성 포함해 ground-truth로 완료 여부 판정합니다. (R020 「maxTurns 절단 실증」)
- 문서 미러·parity 위임을 "파일 4~5개 상한" 근거로 7파일까지 단일 발주하지 않습니다 — 문서 미러·parity 위임은 파일 3개 이하로 분할 + 턴 산술(파일 × 3 + 항목 × 2 ≤ 16)을 위임서에 기재(상한 가이드 — 통과해도 절단 가능)합니다. (R020 「maxTurns 절단 실증」)
- 훅 위임서에 "가드 추가·`?` 억제" 처방만 전달하지 않고, 읽는 필드의 실제 형상(`hook_success` stdin 원문 + 바이너리 훅 문서) 실측을 위임서 완료 조건에 포함합니다. (R020 「Config-Schema-Before-Edit」)
- 값의 정규화·인코딩만 바꾸고 소비자 경로를 열거하지 않은 위임을 하지 않고, 소비자 경로 전수 grep + 동일 인코딩 대조를 완료 조건에 포함합니다. (R020 「Config-Schema-Before-Edit」)
- "소비자 로직 변경 금지"로 결함 수정까지 봉쇄하지 않고 "결함 발견 시 보고 후 지시 대기"로 완화합니다. (R020 「Config-Schema-Before-Edit」)

### moved-r023-r019-r016.md
### Sample-Value Assembly Local Verification (Origin: #1455 #1)

### #1968 찐빠 #4 (gh issue view 1968 원문)
└─ 제안: 재개 announce에는 실측 타입 또는 "(타입 미확인)" 표기

### Pre-trim visible body (10,462 chars, superseded by the compressed visible text above)
# Delegation Context Pack (L2)

이 팩은 Agent·Task·SendMessage 호출 직전에 세션·에이전트당 1회 주입됩니다. 위임서(프롬프트)를 쓸 때 적용하는 규범이며, 파이프라인 위임은 `.claude/skills/pipeline/workflows/auto-dev.yaml` implement Rules의 「Standard delegation-prompt block」도 함께 따릅니다. 항목 끝 `(R0NN 「heading」)`은 규칙 파일의 세부 위치입니다.

## 1. 위임서에 적는 사실은 실측값

- 저장소 상태를 적는 위임서는 작성 직전에 `git rev-parse --abbrev-ref HEAD` / `git rev-parse --short HEAD` / `git branch --list` 3줄을 실행하고 출력 원문을 붙입니다. 이전 턴의 SHA·브랜치 이름은 쓰지 않습니다(브랜치 이름도 턴 단위 수명). `gh pr merge --delete-branch` 같은 부수효과 명령 뒤에는 재실행합니다. 상태변경 위임 직전마다 재실측·대조합니다. (R010 「저장소 상태 기재도 같은 규율」, R017 「게이트는 분기 시점 1회가 아니라 상태변경 위임마다」)
- 메모리 TODO·스냅샷은 위임 전 실측 재확인하거나 "스냅샷 — 직접 확인"을 명시합니다(스냅샷으로 semver·baseline을 판정하지 않음, #1601). target 버전은 `git tag`+`npm view`의 max+patch로 확정합니다. 수치 옆에는 측정 명령을 병기합니다. CC 버전 노트 반영 전에는 `npm view`+`claude --version`으로 상한 이후 릴리즈와 CHANGELOG를 확인합니다. (R017 「일반화 — 메모리 TODO 를 위임 전제로 쓸 때」, 「Pre-Release Target Version Ground-Truth Gate」, 「CC 버전 노트 반영 전」, R010 「브리프 실측값에는 측정 명령을 병기」)
- 미확인 플래그는 확정형으로 쓰지 않습니다 — 실행 전 `--help`로 실측하거나 "예시 — 실제 플래그는 확인 후 사용"을 명시합니다. (R010 「Delegation Prompt Command Examples」)
- 카운트 동기화 위임에는 "실측값 기준으로 동기화하라"를 명시하고, 파일 목록 열거 대신 전수 grep으로 이전 값 히트를 모두 수집한 뒤 카운트 의미만 정정하게 합니다(무관한 숫자는 정정 대상 아님, `--include='*.md'`는 이중 확장자를 놓침). 신규 파일이 기존 디렉토리 내 문서면 카운트 불변을 전달합니다. (R017 「Count Sync」, R010 「Required Checks」)
- 버전 범프 위임은 3파일(package.json, templates/manifest.json, `.omcustom.lock.json`)을 전부 열거합니다. package.json과 manifest를 동시 범프 → `bun run build` → lockfile 스테이징 순서입니다. (R017 「버전 범프 원자 순서」)

## 2. 출처 인용과 문안

- 이슈·CHANGELOG 문장은 도구 출력에서 복사하고 완료 조건에 `grep -F` 원문 대조를 둡니다. Origin 사실은 원문을 동봉하고 "원문과 다르면 원문 우선"을 명시합니다. 범위 요약에는 `[요약 — 원문 우선]`, 오케스트레이터의 함의에는 `[가설 — 실측이 반대면 반대로 기재]`와 판정 기준을 붙입니다. (R010 「출처 인용과 인접 문구 점검도 같은 규율」)
- 룰 최종 문안은 서브에이전트가 이슈 본문에서 직접 작성하고, 오케스트레이터는 포인터·삽입 위치·제약만 지정합니다. 인용 대상 코드·파일과 대조한 뒤에만 룰로 승격합니다. 배선 판정은 후보 파일·앵커만 제시하고 커버 여부는 서브에이전트가 해당 문장을 인용해 판정합니다. (R010 동일 heading)
- 조항 삽입 위임의 완료 조건: 같은 주제 기존 문장 grep + 모순·stale 참조 갱신, 키워드 grep과 삽입 지점 ±1 heading의 Anti-pattern 표 전수 대조, "위 표"·"직전 조항" 같은 상대 위치 참조 재바인딩 확인. (R010 동일 heading)
- 묶음 버전 노트는 문장마다 "(NNN)" 릴리즈 태그와 항목별 CHANGELOG 원문을 동봉하고 `grep -F`로 대조합니다. RETIRED 주석 참조는 cross-ref 대신 인라인합니다(반영 대상은 주로 `guides/claude-code/15-version-compatibility.md`). 위임서에 "advisory는 판정과 같은 응답에 제시"를 명시하고, PASS 후 도착한 권고는 이월 검토합니다. (R017 「묶음 버전 노트 위임서」, 「Advisory 제시 시점」)

## 3. 승인·특권·파괴적 작업 경계

- 사용자 발언을 승인 근거로 인용하지 않습니다 — 허용 작업·금지 작업·완료 조건만 열거합니다(작업 범위를 사용자 요청에 연결해 서술하는 것은 허용). 승인 인용으로 거부당하면 인용을 제거해 재위임하고, 억제가 필요하면 `settings.json` allow 규칙을 씁니다. (R010 「Delegation Prompt Framing — 승인 인용 금지」)
- prod/특권 자원을 건드리는 위임에는 승인된 작업, 명시적 금지 작업(예: "do NOT delete files, do NOT query prod DB"), 권한 범위를 적습니다. 승인된 작업에서 미요청 특권 작업으로 연쇄하지 않으며(예: delete tunnel X → create tunnel Y는 위반), 넓은 단일 작업("migrate + backfill")은 도메인별로 미리 분해합니다. (R010 「Pre-Delegation Privileged-Scope Boundary」, 「Out-of-Scope Privileged Chaining」, 「Pre-Decomposition Mandate」)
- 우회 플래그(`--admin` 등)는 실측 branch protection과 대조해 실제 필요할 때만, 우회 대상(예: `enforce_admins=false`이므로 그 N종 CI 게이트)과 근거를 명시합니다. (R010 「우회 플래그는 우회 대상과 근거를 명시」)
- 파괴적 git 명령 위임 전에는 `git status --short`, `git diff --stat`(및 `--cached`), `git stash show --stat`, `git clean -nd`로 정확한 대상을 열거합니다. 위임서에는 대상 목록 + `!` 명령 + 가역 대안을 함께 적습니다. 삭제 래퍼(`trash` alias)가 있으면 `command rm`·`\rm`·`/bin/rm` 우회 금지를 위임서 금지 문구에 넣습니다. (R001 「Pre-Delegation Blast-Radius Enumeration」)
- 브랜치 전환 위임은 파일 집합 차이를 관측값으로만 열거하고 결과 예측("untracked가 됩니다")은 쓰지 않습니다. 금지 목록(`stash`/`reset`/`clean`)과 "거부 시 즉시 중단, 오류 전문 보고"를 표준 문구로 넣습니다. (R010 「참인 전제 ≠ 참인 함의 — 브랜치 전환 위임」)
- GitHub 메타데이터 작업(이슈·코멘트·라벨, `gh run rerun`, 읽기 전용 `gh`)은 오케스트레이터 직접 실행이 허용됩니다. PR 생성·머지와 로컬 git 상태 변경은 mgr-gitnerd 소유이며, 다른 산출물의 번호·SHA를 인용하는 기록은 참조 대상을 먼저 만들고 그 출력의 번호를 씁니다. (R010 「Delegation Rules」)
- sys-memory-keeper 위임에는 "압축·정리·티어 재평가 불요 — 지시한 항목만 기록"을 명시합니다. (R011 「Attention-Weight Memory Tiering」)

## 4. 병렬 위임

- 각 프롬프트에 동시 실행 에이전트 수 + 각자 담당 범위 + "자기 담당 범위만 기준으로 보고"를 명시합니다. 같은 검증 명령을 각 완료 조건에 넣어 병렬 발주하지 않고(공유 고지 또는 오케스트레이터 직렬 1회 회수), 임시 파일은 에이전트별 고유 경로만 씁니다. 병렬 그룹 위임서에 "전 그룹 공통 결과" 서술을 넣지 않습니다. (R010 「Parallel Delegation — Sibling-Agent Disclosure」, 「형제 결과의 교차 서술 금지」)
- 정황만으로 원인을 형제에 귀속하지 않고 개입 실험(제거→재현 / 복원→소멸)으로 확정합니다. 간헐 실패를 "플래키"로 종결하지 않고 "원인 미귀속"으로 보고합니다. (R010 「고지는 귀속 후보를 늘릴 뿐」, 「"플래키"는 원인이 아니다」)
- git 상태변경 에이전트는 편집 파일이 disjoint해도 동시 1개로 직렬화합니다. 검증 명령은 tracked 파일 이동·초 단위 타임아웃에 의존하지 않을 때만 병렬이며, 초 단위 타임아웃 테스트는 동시 실행 금지, 테스트가 tracked 파일을 `cp`→`rm`→`finally` 복구하지 않고 고유 임시 디렉토리 사본을 씁니다. (R009 「File-Disjoint ≠ Independent」, 「파일 disjoint ≠ 자원 disjoint」)
- 가변 크기 리스트의 LLM 배치는 ≤40개 청크 분할 + 항목당 길이 제약(max_tokens만 올리면 불충분). 병렬 병합 후에는 통합 빌드 + 런타임/스모크 게이트를 오케스트레이터가 먼저 실행합니다. (R009 「LLM Batch Output Token Budget」, 「Parallel Feature Integration Gate」)
- 구체적 `subagent_type`과 `model`을 쓰고, 독립 단위는 같은 메시지의 별도 Agent 호출로 보냅니다. (R009 「Agent Tool Requirements」)

## 5. 스폰 announce 형식

- 병렬 스폰은 각 Agent `description`이 `[N]`(1-indexed, Running display와 일치)로 시작하고 단일 스폰에는 `[N]`을 쓰지 않습니다. 예: `Agent(description: "[1] Go code review", subagent_type: "lang-golang-expert")`. announce는 `[secretary][opus] → Spawning:` 다음에 줄 시작 `[1] lang-golang-expert:sonnet → Go code review`. 금지: 번호 앞 리스트 마커·백틱, `Spawning` 뒤 콜론 생략, 화살표 대신 콜론 연결. (R008 「Parallel Spawn Prefix Rule」, 「Spawn Announce 리터럴」, R009 「Display Format」)
- 단일 스폰도 호출 직전에 `[claude][opus] → Tool: Agent` / `[claude][opus] → Target: mgr-updater:sonnet → R008 clause update`를 씁니다. 형식은 `subagent_type:model → description`이며 `subagent_type`은 실제 파라미터와 일치해야 하고 임의 이름은 불가합니다. (R008 「Agent Tool Format」)
- SendMessage로 에이전트를 재개할 때 announce에는 실측한 에이전트 타입을 쓰고, 타입을 실측하지 못했으면 「(타입 미확인)」으로 표기합니다 — 추정 타입을 쓰고 사후 정정하지 않습니다. (#1968 찐빠 #4, R008·R015)
- Tier-3 도구(AskUserQuestion, TodoWrite, EnterPlanMode, ExitPlanMode)도 접두사가 필요하고 Skill만 예외입니다. 식별: 라우팅 없음 `claude (default)`, 라우팅 `claude ({routing-skill})`, 스킬 호출 `claude → {skill-name}`. (R008 「Tier-3 Interaction Tool Prefix」, R007 「Routing & Skill Context」)
- 결과 집계는 `[Summary] {succeeded}/{total} tasks completed`. 완료 알림에 보고 본문이 없으면 한 턴 기다리고, 그래도 없으면 산출물을 실측한 뒤 SendMessage로 재요청합니다. (R009 「Result Aggregation」)

## 6. 위임 전 능력 사전 점검

- 위임 프롬프트를 쓰기 전에 R010 「Known Limitations (Active Cache)」 표에서 대상 에이전트 이름을 조회하고, 걸리는 완료 조건은 제거하거나 대체 경로를 지정합니다(표가 있어도 참조되지 않으면 무효). arch-documenter는 Bash 불가이므로 `diff`/`md5`/`verify-*.sh`를 그 완료 조건에 넣지 말고 오케스트레이터가 직접 실행하거나 `general-purpose`로 분리합니다. arch-documenter, fe-design-expert, mgr-supplier, qa-planner, qa-writer, sys-naggy는 `tools:`의 `Grep`/`Glob`을 제거하지 않습니다. 예: arch-documenter에 `gh issue view` 위임은 "Bash not allowed"로 2-3분 왕복 낭비입니다. (R010 「Agent Capability Pre-Check」, 「Known Limitations (Active Cache)」)
- 점검 항목: `gh`/셸 → `tools:`에 Bash 포함 + `disallowedTools:`에서 제외; 외부 파일 Read → Read; Write → Write; MCP → `mcpServers:`; 대상 경로는 존재(`ls`/`find`)하고, 기존 파일 편집·커밋 대상은 `git ls-files <path>`로 tracked 여부까지 확인(untracked면 범위 제외 또는 force-add 사전 결정, 신규 생성은 제외). (R010 「Required Checks」)
- N곳 동일 변경은 위임 전 `md5`/`diff -q`로 일치를 확인하고 drift면 canonical 기준 정렬을 명시합니다. 미러 동기화는 "추가·수정·삭제 세 방향으로 en과 일치" + "en에 없는 행 0건 grep" 완료 조건을 씁니다. (R010 「Required Checks」)
- 전문 에이전트(`lang-*`/`be-*`/`fe-*`)가 있으면 general-purpose 대신 사용하며(general-purpose는 파일 이동·단순 스크립트에만), "작은 변경" 예외는 없습니다. (R010 「Delegation Rules」)

## 7. 모델·권한·산출물

- Agent 도구 `model`은 `sonnet` | `opus` | `haiku` | `fable` 4값만 받고 전체 모델 ID는 불가(frontmatter 전용)합니다. 예: `Agent(subagent_type: "...", model: "opus", mode: "bypassPermissions", prompt: "...")`. `xhigh`는 최고난도 작업에 한정합니다(상세 `guides/claude-code/16-fable5-prompting.md`). `sonnet5`/`opus5`/`opus48`은 어디서도 무효이고, frontmatter의 Fable 5는 전체 ID `claude-fable-5`입니다. (R006 「Model Specification — 3 Tiers」)
- `mode`는 CC 2.1.212 미만에서 `bypassPermissions` 명시가 필요하고 이후는 무시되지만 계속 전달하며(모드 값: `default`/`acceptEdits`/`bypassPermissions`/`plan`/`dontAsk`/`auto`) 무인 실행의 증거로 보지 않고, 유효 모드는 R010 「Universal bypassPermissions」 Self-Check로 실측합니다. `omitClaudeMd: true` 에이전트의 출력은 rule-unaware로 취급합니다. (R006 「Permission Mode Guidance」, 「Optional Frontmatter」)
- 에이전트 간 핸드오프는 아티팩트 파일 경로만 전달하고(본문 inline 금지), 읽기·쓰기를 분리하고 한 아티팩트는 한 에이전트만 작성합니다(`.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md`). `bypassPermissions`에서 `.claude/**`·`.git/` 직접 Write/Edit는 허용입니다. 서브에이전트의 `report-*.md` Write는 거부될 수 있으므로 거부 시 텍스트로 반환하게 하고, 파일 산출물은 오케스트레이터가 `ls -la`로 확인합니다. (R006 「Artifact Output Convention」, 「Artifact Channel Protocol」)

## 8. 서브에이전트 보고의 검증 (위임서 완료 조건)

- 서브에이전트의 원인 분석은 결론이 아니라 가설로 접수하고 결정론적 명령으로 정정한 뒤 전제로 씁니다(예: `git cat-file -e <branch>:<path>`, `git show --name-status <sha>`, 같은 메시지를 내는 다른 시나리오 열거). 양립 불가한 진단은 모순 신호이며 두 진단을 가르는 명령을 즉시 실행합니다. 보유 실측값과 어긋나는 서술은 이월하지 않고 즉시 정정 위임하거나 읽기 전용 명령 1개를 직접 실행합니다. (R020 「원인 분석도 완료 보고와 같은 등급의 검증 대상」)
- mid-step 종료 증상("merging now")으로 넘겨짚지 않으며 clause만으로 종료를 신뢰하지 않고 `gh pr view`/`gh run list` 등으로 직접 실측합니다. resume에는 실측값을 동봉합니다. 다중 Phase 작업은 단일 목표로 분할해 순차 발주하고, 파이프라인이 `skill: <다중 Phase 스킬>`이면 Phase를 먼저 읽고 분할합니다. (R020 「Verification-Delegation Non-Termination」, 「위임 경계를 Phase 개수로 설계」)
- 위임 크기는 편집 항목 수 × 2턴 + 파일 고정비 3턴으로 산술합니다. 리서치는 첫 2턴 내 골격 Write + 증분 Edit, 문서 미러·parity는 파일 3개 이하 + 파일 × 3 + 항목 × 2 ≤ 16을 위임서에 기재합니다. "대기 중" 보고는 ground-truth로 완료를 판정합니다. (R020 「maxTurns 절단 실증」)
- 훅 위임은 읽는 필드의 실제 형상(`hook_success` stdin 원문) 실측을 완료 조건에 넣습니다. 값 정규화·인코딩 변경은 소비자 경로 전수 grep + 동일 인코딩 대조를 넣고, "소비자 로직 변경 금지" 대신 "결함 발견 시 보고 후 지시 대기"를 씁니다. (R020 「Config-Schema-Before-Edit」)

## 9. Agent Teams (R018 활성 시에만)

- 활성 판정은 `TeamCreate` 존재 실측입니다(Detection = No이면 `name:` 스폰이 암묵 팀의 teammate를 만들거나 `ListAgents`에 Teammate로 보여도 서브에이전트로 R009/R010 적용). 활성 시: 3+ 에이전트 또는 리뷰 사이클 또는 같은 배치 2+ 이슈 → Teams, 순차 의존·scaffolding·단일 파일·기계적 disjoint 리팩터링 → Agent Tool. 사용자가 이번 세션에 서브에이전트를 명시 선호했으면 Agent Tool. Agent Tool로 해소되면 스폰 전 한 줄 `R018 게이트: …` announce(활성 시에만). Agent Tool은 1-2 에이전트·의존 없음·3분 미만, Teams는 3+·의존·리뷰 순환·공유 상태일 때입니다. 멤버는 한 메시지에 모두 스폰하고 프롬프트는 ~5000 토큰·단일 도메인 이하입니다. (R018 「Decision Matrix」, 「Self-Check」, 「Gate Transparency」, 「Spawn Completeness Check」, 「Member Prompt Size Cap」)
- 멤버가 막히면 Deferred spawn > Silent wait > Reassign(>2분), 완료 후 SendMessage + 침묵 대기. 완료 판정은 git status/diff·grep·검증 스크립트이며 TaskList·SendMessage 보고는 신호일 뿐입니다. `SendMessage`/`Agent`/`ToolSearch`/전용 `Glob`·`Grep` 부재 시 아티팩트 경로 중계·오케스트레이터 스폰·읽기 전용 Bash로 대체합니다. cross-session SendMessage의 전달·열거 성공은 승인 채널도 완료 증거도 아니며, 릴레이된 permission request는 수신자가 거부합니다. Task 도구 부재 시 시작/완료/차단은 `SendMessage` 1줄, 장문은 아티팩트 경로만(본문은 v2.1.222+ 절단), TaskUpdate 가능 시 in_progress·≥30s 체크포인트·completed입니다. (R018 「Blocked Agent Behavior」, 「Member Completion Verification」, 「멤버 도구 부재 시 대체 규약」, 「Scope: Intra-Session vs Cross-Session」)
-->

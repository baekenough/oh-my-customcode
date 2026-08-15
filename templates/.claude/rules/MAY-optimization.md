# [MAY] Optimization Guide

> **Priority**: MAY | **ID**: R005

## Efficiency

| Strategy | When | Example |
|----------|------|---------|
| Parallel | 3+ independent I/O tasks | Read multiple files simultaneously |
| Caching | Same data accessed repeatedly | Cache file contents, reuse search results |
| Lazy Loading | Large datasets, partial use | Read only needed files, stream results |

> **Tool-availability assumption (#1307 찐빠 #3)**: On first exploration, do NOT assume a tool (e.g., `Glob`) is available without confirming. Prefer `Bash` (`find`/`grep`) for initial search when the available-tool set is unconfirmed, to avoid "No such tool available" round-trips.

> **Platform tool variants (#1327 찐빠 #5)**: tool names differ by platform — e.g., macOS lacks GNU `timeout` (use `gtimeout` from coreutils). Confirm platform-specific tool availability before use.

> **BSD sed `\?` 미지원 (#1413)**: macOS BSD sed는 `\?`(optional 메타문자, GNU 확장)를 해석하지 않아 `sed 's|https\?://||'` 치환이 무음 실패한다. URL 도메인 추출 등은 `cut -d'/' -f3` 같은 POSIX 호환 수단을 사용한다.

> **Sandbox/container tool gaps (#1401 찐빠 #4)**: `curl`, `wget`, `nc` 등 공통 CLI 도구는 샌드박스·컨테이너 환경에서 미설치일 수 있다. HTTP 요청에는 `WebFetch` 도구를 우선 사용하고, CLI 도구 사용 전 `command -v <tool>` 으로 가용성을 사전 확인한다.

> **로컬 실행 옵션 제시 전 자원 가용성 선확인 (#1455 #2)**: 로컬 실행에 의존하는 검증 옵션(로컬 스모크 테스트, 로컬 스크립트 실행 등)을 사용자에게 제시하기 **전에**, 그 실행에 필요한 로컬 자원(env 키, CLI 도구, 인증 상태)의 가용성을 먼저 확인한다. **저장소 secret 존재 ≠ 로컬 셸 env 존재** — `gh secret list`로 저장소 secret을 확인해도 로컬 셸에 해당 env가 있으리라 단정하지 말 것. 자원 부재 시 옵션에 전제조건을 명시하거나 옵션에서 제외하여, 사용자가 실행 불가한 옵션을 선택했다가 되돌리는 왕복(AskUserQuestion 재질문)을 방지한다. Cross-ref: R020(사전 검증). Origin: #1455 #2 (Session 127 회고 찐빠 #2) — 사용자가 "로컬 스모크 테스트 먼저"를 선택했으나 로컬 셸에 ANTHROPIC_API_KEY 부재로 실행 불가 → "스킵, 바로 커밋" 재선택, AskUserQuestion 왕복 1회 발생.

> **Shell output parsing — use Python, not read/grep (#1401 찐빠 #3)**: adb bounds rect, 좌표쌍, JSON 분할 등 구조화된 출력 파싱은 `read`+`grep -o` 파이프라인 대신 Python (`python3 -c "..."`) 을 사용한다. `read`+`grep -o` 조합은 공백 차이에 취약해 헛값을 산출한다. SSH 원격 `bash -c` 인자에 소괄호 포함 금지 — `ssh host "cmd; cmd2"` 형식 사용.

> **`ls | tail` 시계열 오판 (#1417)**: `ls`는 파일명을 알파벳/사전순으로 정렬하므로 `ls <dir> | tail`로 "가장 최근 파일"을 판단하면 오판한다(파일명 순서 ≠ mtime 순서). 시계열 최신 판단은 `ls -t`, `find <dir> -newermt <ts>`, 또는 stat/timestamp 기반 정렬을 명시한다. `tail`만으로 "최신" 단정 금지. Origin: #1417 (외부 통화녹음 진단 세션 — `ls TPhoneCallRecords | tail -6`이 알파벳순이라 최신을 6/18로 오판 → `find -newermt`로 6/19~20 파일 발견해 정정).

> **파이프 뒤 `$?`는 마지막 명령의 exit code (#1492, zsh 변형 #1540)**: `script.sh | tail -N; echo $?`처럼 검증 스크립트를 파이프에 연결한 뒤 `$?`로 읽으면 파이프라인 **마지막 명령**(`tail`)의 종료코드를 얻는다 — 스크립트 자체가 실패(exit 1)해도 `tail`이 성공(exit 0)하면 `$?=0`으로 "통과"를 오판한다. **1차 지침**: 검증 스크립트는 파이프 없이 단독 실행한다. 부득이 파이프를 써야 한다면, 원본 exit code를 읽는 문법은 **셸마다 다르다** — bash는 `${PIPESTATUS[0]}`(대문자, 0-indexed), zsh는 `$pipestatus[1]`(소문자, 1-indexed)이며 서로 호환되지 않는다. **이 저장소의 기본 셸이자 Claude Code Bash 도구 실행 셸은 zsh**이므로, bash 문법 `${PIPESTATUS[0]}`을 그대로 쓰면 zsh에서는 미정의 변수로 취급되어 **오류 없이 빈 값**을 반환한다 — 조건문에서 빈 값은 거짓으로 평가돼 "검증 통과"처럼 보이는 조용한 오판을 재생산한다. 셸을 사전 확인(`echo $SHELL` / `$BASH_VERSION` 존재 여부)한 뒤 해당 셸의 문법을 쓴다. **주의**: `${PIPESTATUS[0]}` 자체는 R023 Workflow JS 템플릿 리터럴 이스케이프 이슈(#1438, `${...}`를 JS가 평가해 ReferenceError)와 별개 문제 — 본 항목은 셸에서 파이프 뒤 exit code를 읽는 각도다. Origin: #1492 (Session 132 회고 찐빠 #3); zsh 변형은 #1540 (Session 138 회고 찐빠 #6) — `gh run watch ... | tail` 뒤 `${PIPESTATUS[0]}`가 zsh에서 빈 값을 반환해 CI 결론을 재실측해야 했음. Cross-ref: R020 ("command executed" ≠ "succeeded").

> **계수/매칭 방법 확인 (#1521)**: 카운트를 대조하기 전에 **비교 대상이 무엇을 어떻게 세는지** 먼저 확인한다 — 같은 지표라도 계수 방법이 다르면 값이 달라진다. 대표 함정 4종: (a) glob(`ls *.md`, 최상위만) vs 재귀 `find`(하위 디렉토리 포함), (b) 부분 문자열 grep(`grep "sdd"`가 `sdd-dev`까지 매칭), (c) 확장자 필터(`--include='*.md'`가 `CLAUDE.md.en`을 미매칭), (d) **머지 커밋 diff 기본 생략** — `git show --name-only <머지커밋>`은 diff를 기본적으로 출력하지 않아 변경 파일 0개로 오독된다. 머지 커밋의 변경 파일을 세려면 `--first-parent`(1차 부모 대비) 또는 `-m`(각 부모별 diff)을 명시한다. 검증 스크립트와 대조할 때는 **스크립트의 실제 계수 로직을 읽고** 같은 방법으로 센다. 위 `ls | tail` 시계열 오판(#1417)과 동류로, 도구의 기본 동작을 확인하지 않은 채 결과를 해석해 오탐에 이르는 패턴이다. Origin: #1521 (2026-07-20 세션에서 3회 반복; 두 서브에이전트가 독립적으로 동일 오탐에 도달); (d)는 #1553 찐빠 #4 (2026-07-30 세션에서 머지 커밋 `--name-only` 0파일을 "변경 없음"으로 오독).

> **도구 이름 ≠ 그 프로그램 (#1590)**: 도구를 쓰기 전에 `type <tool>`로 실체를 확인한다. Bash 도구의 `grep`은 `~/.claude/shell-snapshots/snapshot-zsh-*.sh`의 **셸 함수**이며 `ugrep --ignore-files`에 위임한다. 그 결과 `.gitignore`의 리터럴 `CLAUDE.md` 패턴을 존중해, **force-tracked 파일을 재귀 탐색에서 조용히 누락**한다(에러 없이 exit 0). 명시 경로를 준 grep은 정상 동작하므로 **traversal만 영향**을 받는다. 실측(2026-08-15): 동일 패턴·동일 대상에 대해 셸 함수 36 / `command grep` 43 / `git grep` 38 히트 — 셸 함수만 `CLAUDE.md`를 0 히트로 놓쳤다. 진단 함정: `git check-ignore`는 **index-aware**라 tracked 파일에 "not ignored"(exit 1)를 반환한다 — 원인을 보려면 `git check-ignore --no-index`를 써야 한다. 처방: 저장소 전수 조사는 `git grep`을 표준으로 한다(R017 Count Sync cross-ref). Origin: #1590.

<!--
> **v2.1.206+**: `/doctor`에 checked-in CLAUDE.md에서 코드베이스로부터 파생 가능한 내용을 잘라내도록 제안하는 체크가 추가되었습니다 — R005 "Context Optimization via HTML Comments"의 컨텍스트 절감 원칙과 정합(모델 불필요 메타데이터 축소).
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.44, 보존 기준 v2.1.212 미만): > **v2.1.208+**: Fixed several tool-reliability bugs: env vars like `CLAUDE_CODE_MAX_OUTPUT_TOKENS` silently used only the mantissa of scientific-notation values (`1e6` became `1`); Edit now succeeds on a file modified after being read, as long as the target text still matches uniquely; Read no longer misreports empty files as "shorter than offset"; Grep no longer silently returns "No files found" for invalid regex, no longer under-reports paginated count-mode totals; and Glob no longer crashes on a null byte in pattern/path/cwd. -->

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.210+**: Bash/PowerShell 명령이 timeout으로 auto-background될 때의 메시지가 개선되어 모델이 hang과 명시적 background 요청을 구분할 수 있으며, auto-background된 명령 내 `cd`는 적용되지 않고 tool result가 working directory 불변을 명시합니다 — auto-background 이후 cwd 의존 후속 명령은 절대 경로로 수행합니다. 또한 Grep content mode가 결과 끝을 지난 페이지네이션에서 "No matches found"를 반환하던 문제가 수정되었습니다(v2.1.208 Grep 페이지네이션 수정의 연장) — 구버전에서 이 응답은 "패턴 미존재"가 아니라 "페이지 끝"일 수 있습니다. -->

> **v2.1.212+**: MCP 도구 호출이 2분(기본값, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`로 임계값 조정·비활성) 초과 시 자동으로 백그라운드로 이동해 세션이 계속 사용 가능해집니다 — 위 v2.1.210 Bash/PowerShell auto-background의 MCP 도구 확장. 느린 MCP 호출(ontology-rag `rebuild_ontology`, code-review-graph 인덱싱 등)을 hang으로 오판하지 말고, 2분 초과 시 백그라운드 전환을 전제로 후속 작업을 진행합니다.

> **v2.1.233+**: `WebFetch`의 세션 URL 캐시 TTL이 `CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS`로 조정 가능해졌습니다(기본 15분 불변). **재확인 함정**: 같은 URL을 TTL 내 재조회하면 캐시가 반환되므로 **독립적인 2차 확인이 아닙니다** — R020 Degraded-Output Re-Verification Gate가 요구하는 "결정론적 2차 소스"로 동일 URL의 WebFetch 재호출을 쓰지 말고, 다른 소스나 CLI 실측(`npm view`, `gh`)을 사용합니다.

> **v2.1.224+**: mid-turn에 연결된 MCP 도구가 **이름 고지 없이** tool search로 deferred되던 결함이 수정되었습니다. 구버전에서는 세션 도중 붙은 MCP 서버의 도구가 이름조차 노출되지 않아 "그런 도구 없음"으로 오판할 수 있었으므로, 위 tool-availability 주의(`command -v` 사전 확인과 동류)를 MCP 도구에도 적용합니다 — 도구 부재 결론 전에 `ToolSearch`로 실측합니다.

> **v2.1.228+**: Write 도구가 **이번 세션에 읽지 않은 기존 파일도 newer model에서는 덮어쓸 수 있도록** 변경되어 Edit 도구 규칙과 일치합니다(구모델은 여전히 read 선행 필요). 도구가 강제하던 read-before-write 가드가 모델에 따라 사라지므로, "Write가 실패했다 = 파일을 안 읽었다"는 진단이 더 이상 보편적으로 성립하지 않고, **읽지 않은 파일을 Write하면 기존 내용이 경고 없이 소실**됩니다 — 전체 교체가 아닌 변경에는 Edit을 쓰는 원칙을 도구 강제가 아니라 절차로 유지합니다. 또한 deferred-tools reminder가 skill 호출 후 모델에 두 번 전달되던 문제가 수정되었습니다(중복 컨텍스트 소모).

> **v2.1.229+**: 도구 호출의 `glob`/`file_path`/`command` 값이 **비문자열일 때 에러 화면으로 크래시**하던 문제가 수정되었습니다(해당 세션의 `--resume`에서도 재발). 구버전에서 이 크래시는 세션을 복구 불가 상태로 만들면서 **원인이 도구 인자 타입이라는 단서를 남기지 않았으므로**, 스크립트로 도구 인자를 조립할 때 문자열 타입을 보장합니다(cross-ref R023 Workflow Script Sanity Check). 좁은 터미널에서 progress bar·마크다운 표 렌더링 시 발생하던 RangeError 크래시(`claude --continue`/`--resume` 시작 시에도 발생)도 함께 수정되었습니다.

### Capability-Aware Tool Scheduling

When dispatching parallel tool calls, consider per-tool capabilities to optimize scheduling:

| Capability | Parallelizable? | Example |
|-----------|----------------|---------|
| Read-only, no side effects | Yes | Read, Glob, Grep |
| Write with independent targets | Yes | Write(file-A) + Write(file-B) |
| Write with shared target | No | Sequential edits to same file |
| External with rate limits | Throttle | WebFetch, API calls |

This aligns with R009 (parallel execution) detection criteria and extends it with tool-level scheduling awareness.

Inspired by [ouroboros PR #353](https://github.com/Q00/ouroboros/pull/353) capability graph pattern.

## Token Optimization

- Include only necessary info, remove duplicates, use summaries
- Concise expressions, minimize code blocks, no unnecessary repetition

## Task Optimization

- **Batch**: Group similar tasks (edit 10 files at once)
- **Incremental**: Process only changed parts

## When to Optimize

| Do | Don't |
|----|-------|
| Repetitive tasks, clear bottleneck, measurable gain | One-time tasks, already fast, complexity > benefit |

Readability > Optimization. No optimization without measurement.

## Context Optimization via HTML Comments (v2.1.72+)

HTML comments in all auto-injected .md files (CLAUDE.md and rules/*.md) are hidden from the model during auto-injection but visible via Read tool.

| Use Case | Example |
|----------|---------|
| Metadata tags | `<!-- agents: 44, skills: 74 -->` in CLAUDE.md |
| Validation checksums | `<!-- validate-docs: hash=abc123 -->` in CLAUDE.md |
| Conditional context | `<!-- detailed-architecture: see guides/architecture/ -->` in CLAUDE.md |
| Rule detail hiding | `<!-- DETAIL: Self-Check ... -->` in rules/*.md |

**Rule**: Move model-unnecessary metadata into HTML comments to reduce context token usage. Keep actionable instructions as visible text.

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

> **zsh 내장 `echo`는 이스케이프를 확장한다 (#1625)**: zsh(이 저장소 Bash 도구 실행 셸)의 내장 `echo`는 `\n` 등 백슬래시 이스케이프를 기본 확장하므로, JSON 문자열을 파이프에 실을 때 `echo "$var"`를 쓰면 valid JSON을 스스로 깨뜨려 하류 파서 오진을 유발한다(v1.1.53 세션 훅 오진의 실제 원인). JSON/구조화 문자열 전달은 `printf '%s' "$var"`를 표준으로 한다.

> **zsh는 미인용 `$var`를 단어 분할하지 않는다 (#1683 #5)**: bash에서 관용적인 `for l in $list` / `set -- $line` 은 zsh(이 저장소 Bash 도구 실행 셸)에서 변수 전체를 **한 단어**로 취급하므로, `set -u`와 결합하면 `$2` 접근이 `parameter not set`으로 즉시 종료됩니다. 단어 분할이 필요하면 `${=var}`(zsh 전용) 또는 배열(`arr=(a b c); for x in "${arr[@]}"`)을 사용하고, 여러 필드가 든 문자열은 `read -r a b c <<< "$line"`으로 분해합니다. Origin: #1683 찐빠 #5 (v1.1.64 세션 — pre-triage 라벨 부트스트랩 스니펫이 1턴 실패 후 명시 인자로 재실행). Cross-ref: 위 zsh `echo` 노트, 파이프 `$?` 노트(#1540 zsh 변형) — 같은 "이 저장소의 셸은 zsh" 계열입니다.

> **로컬 실행 옵션 제시 전 자원 가용성 선확인 (#1455 #2)**: 로컬 실행에 의존하는 검증 옵션(로컬 스모크 테스트, 로컬 스크립트 실행 등)을 사용자에게 제시하기 **전에**, 그 실행에 필요한 로컬 자원(env 키, CLI 도구, 인증 상태)의 가용성을 먼저 확인한다. **저장소 secret 존재 ≠ 로컬 셸 env 존재** — `gh secret list`로 저장소 secret을 확인해도 로컬 셸에 해당 env가 있으리라 단정하지 말 것. 자원 부재 시 옵션에 전제조건을 명시하거나 옵션에서 제외하여, 사용자가 실행 불가한 옵션을 선택했다가 되돌리는 왕복(AskUserQuestion 재질문)을 방지한다. Cross-ref: R020(사전 검증). Origin: #1455 #2 (Session 127 회고 찐빠 #2) — 사용자가 "로컬 스모크 테스트 먼저"를 선택했으나 로컬 셸에 ANTHROPIC_API_KEY 부재로 실행 불가 → "스킵, 바로 커밋" 재선택, AskUserQuestion 왕복 1회 발생.

> **Shell output parsing — use Python, not read/grep (#1401 찐빠 #3)**: adb bounds rect, 좌표쌍, JSON 분할 등 구조화된 출력 파싱은 `read`+`grep -o` 파이프라인 대신 Python (`python3 -c "..."`) 을 사용한다. `read`+`grep -o` 조합은 공백 차이에 취약해 헛값을 산출한다. SSH 원격 `bash -c` 인자에 소괄호 포함 금지 — `ssh host "cmd; cmd2"` 형식 사용.

> **`ls | tail` 시계열 오판 (#1417)**: `ls`는 파일명을 알파벳/사전순으로 정렬하므로 `ls <dir> | tail`로 "가장 최근 파일"을 판단하면 오판한다(파일명 순서 ≠ mtime 순서). 시계열 최신 판단은 `ls -t`, `find <dir> -newermt <ts>`, 또는 stat/timestamp 기반 정렬을 명시한다. `tail`만으로 "최신" 단정 금지. Origin: #1417 (외부 통화녹음 진단 세션 — `ls TPhoneCallRecords | tail -6`이 알파벳순이라 최신을 6/18로 오판 → `find -newermt`로 6/19~20 파일 발견해 정정).

> **`readdir` 순서는 플랫폼·런타임 의존이며 정렬되지 않는다 (#1599)**: 디렉토리 열거 결과는 **정렬순도 생성순도 아니다**. bun의 `readdir`는 APFS에서 파일시스템의 이름 해시 순서를 그대로 반환하며 node의 `readdirSync`와도 다른 순서를 낸다 — 같은 코드가 런타임·파일시스템·항목 이름에 따라 다른 순서를 낸다. 따라서 "첫 항목"·"마지막 항목"으로 대상을 고르지 말고 **정렬 키를 명시**(`.sort()`, mtime 기준 정렬)하거나 **필터로 유일성을 보장**한다. 함께: 열거 결과의 모든 항목이 디렉토리라고 가정하지 말고 `withFileTypes: true` + `isDirectory()`로 판별한다 — 관측 파일·`.DS_Store` 등이 섞이면 "첫 항목"이 디렉토리가 아닐 수 있다. **테스트에서의 파급**: 대상 디렉토리명이 `date -u +%Y-%m-%d`처럼 날짜에서 파생되면 이름이 바뀌는 날 해시 순서가 뒤집혀 **clean clone 첫 실행부터 달력 날짜의 절반에서 실패**한다(실측: 8/15 통과, 8/16~17 실패). 위 `ls | tail` 시계열 오판(#1417)의 **API 각도 변형**이다 — 도구가 순서를 보장한다는 미확인 전제에서 결과를 해석한 같은 계열. Origin: #1599 (agora 테스트 `findSessionDir`가 출력 루트를 readdir 후 전 항목을 디렉토리로 가정; 코드 조치는 `withFileTypes:true` + `isDirectory()` 필터 + 관측 파일 분리로 완료). Cross-ref: R005 「계수/매칭 방법 확인」(도구 기본 동작 미확인), R023(Conditional-Output Verification).

> **파이프 뒤 `$?`는 마지막 명령의 exit code (#1492, zsh 변형 #1540)**: `script.sh | tail -N; echo $?`처럼 검증 스크립트를 파이프에 연결한 뒤 `$?`로 읽으면 파이프라인 **마지막 명령**(`tail`)의 종료코드를 얻는다 — 스크립트 자체가 실패(exit 1)해도 `tail`이 성공(exit 0)하면 `$?=0`으로 "통과"를 오판한다. **1차 지침**: 검증 스크립트는 파이프 없이 단독 실행한다. 부득이 파이프를 써야 한다면, 원본 exit code를 읽는 문법은 **셸마다 다르다** — bash는 `${PIPESTATUS[0]}`(대문자, 0-indexed), zsh는 `$pipestatus[1]`(소문자, 1-indexed)이며 서로 호환되지 않는다. **이 저장소의 기본 셸이자 Claude Code Bash 도구 실행 셸은 zsh**이므로, bash 문법 `${PIPESTATUS[0]}`을 그대로 쓰면 zsh에서는 미정의 변수로 취급되어 **오류 없이 빈 값**을 반환한다 — 조건문에서 빈 값은 거짓으로 평가돼 "검증 통과"처럼 보이는 조용한 오판을 재생산한다. 셸을 사전 확인(`echo $SHELL` / `$BASH_VERSION` 존재 여부)한 뒤 해당 셸의 문법을 쓴다. **주의**: `${PIPESTATUS[0]}` 자체는 R023 Workflow JS 템플릿 리터럴 이스케이프 이슈(#1438, `${...}`를 JS가 평가해 ReferenceError)와 별개 문제 — 본 항목은 셸에서 파이프 뒤 exit code를 읽는 각도다. Origin: #1492 (Session 132 회고 찐빠 #3); zsh 변형은 #1540 (Session 138 회고 찐빠 #6) — `gh run watch ... | tail` 뒤 `${PIPESTATUS[0]}`가 zsh에서 빈 값을 반환해 CI 결론을 재실측해야 했음. Cross-ref: R020 ("command executed" ≠ "succeeded").

> **계수/매칭 방법 확인 (#1521)**: 카운트를 대조하기 전에 **비교 대상이 무엇을 어떻게 세는지** 먼저 확인한다 — 같은 지표라도 계수 방법이 다르면 값이 달라진다. 대표 함정 4종: (a) glob(`ls *.md`, 최상위만) vs 재귀 `find`(하위 디렉토리 포함), (b) 부분 문자열 grep(`grep "sdd"`가 `sdd-dev`까지 매칭), (c) 확장자 필터(`--include='*.md'`가 `CLAUDE.md.en`을 미매칭), (d) **머지 커밋 diff 기본 생략** — `git show --name-only <머지커밋>`은 diff를 기본적으로 출력하지 않아 변경 파일 0개로 오독된다. 머지 커밋의 변경 파일을 세려면 `--first-parent`(1차 부모 대비) 또는 `-m`(각 부모별 diff)을 명시한다. 검증 스크립트와 대조할 때는 **스크립트의 실제 계수 로직을 읽고** 같은 방법으로 센다. 위 `ls | tail` 시계열 오판(#1417)과 동류로, 도구의 기본 동작을 확인하지 않은 채 결과를 해석해 오탐에 이르는 패턴이다. Origin: #1521 (2026-07-20 세션에서 3회 반복; 두 서브에이전트가 독립적으로 동일 오탐에 도달); (d)는 #1553 찐빠 #4 (2026-07-30 세션에서 머지 커밋 `--name-only` 0파일을 "변경 없음"으로 오독).

> **도구 이름 ≠ 그 프로그램 (#1590)**: 도구를 쓰기 전에 `type <tool>`로 실체를 확인한다. Bash 도구의 `grep`은 `~/.claude/shell-snapshots/snapshot-zsh-*.sh`의 **셸 함수**이며 `ugrep --ignore-files`에 위임한다. 그 결과 `.gitignore`의 리터럴 `CLAUDE.md` 패턴을 존중해, **force-tracked 파일을 재귀 탐색에서 조용히 누락**한다(에러 없이 exit 0). 명시 경로를 준 grep은 정상 동작하므로 **traversal만 영향**을 받는다. 실측(2026-08-15): 동일 패턴·동일 대상에 대해 셸 함수 36 / `command grep` 43 / `git grep` 38 히트 — 셸 함수만 `CLAUDE.md`를 0 히트로 놓쳤다. 진단 함정: `git check-ignore`는 **index-aware**라 tracked 파일에 "not ignored"(exit 1)를 반환한다 — 원인을 보려면 `git check-ignore --no-index`를 써야 한다. 처방: 저장소 전수 조사는 `git grep`을 표준으로 한다(R017 Count Sync cross-ref). Origin: #1590.

> **v2.1.234+**: macOS/Linux 네이티브 빌드의 내장 `grep`이 pathological pattern에서 메모리 고갈 대신 fail fast하고, `-m N`과 `-A/-C` 옵션을 함께 쓸 때의 context 출력 정확도가 수정되었습니다(v2.1.235에서 추가 보강). 위 「도구 이름 ≠ 그 프로그램」(#1590) 조항과 인접한 함정입니다 — 이 저장소의 Bash 도구 `grep`은 셸 함수로 셰이딩돼 있으므로, 내장 `grep` 자체의 견고성 개선과 셰이딩 문제는 **별개 축**입니다. Darwin(이 저장소 실행 환경) 네이티브 빌드에 해당합니다.

> **v2.1.260/265+**: (260) 여러 세션이 같은 프로젝트 디렉토리를 공유할 때 간헐적으로 발생하던 "task output swap refused" 오류가 수정되었습니다 — 위 v2.1.252 Mac tasks-dir 결함과 **같은 오류 문구의 별개 원인**이므로, v2.1.252~259 환경에서는 이 메시지가 명령 자체의 결함이 아니라 동시 세션 경합에서 나왔을 수 있습니다(R020 Read-Before-Characterize). (260) 서브에이전트가 시작한 background 명령의 1시간 제한이 제거되어, 이제 메인 세션과 동일하게 종료되거나 중지될 때까지 실행됩니다 — 서브에이전트의 장시간 background 빌드가 더 이상 60분에 무음 종료되지 않습니다. (265) 디스크에 저장되는 도구 결과에 1GB 상한이 추가되고 저장 파일이 잘렸을 때 대화 내 미리보기에 그 사실이 표시됩니다 — 저장된 도구 결과 파일을 읽을 때는 이 절단 안내 유무를 먼저 확인한 뒤 완전한 것으로 간주합니다. (265) 비대화형 세션(`-p` + stream-json 입력, Agent SDK, cloud)이 매 사용자 메시지마다 셸 작업 디렉토리를 리셋하던 결함이 수정되어 `cd`가 턴 간 유지됩니다 — 턴마다 `cd`를 재실행하는 우회책을 쓴 `-p` 스크립트는 v2.1.265+에서 그 재실행이 불필요해집니다(무해하지만 제거 가능).

> **v2.1.259/261+**: (259) `claude plugin validate --json`이 기계 판독 가능한 검증 리포트를 제공합니다(cross-ref R017 v2.1.233 `plugin validate` 노트 — 사람 판독용 출력 파싱보다 이 쪽을 우선). (261) `/context`의 토큰 계산이 토큰-계산 API를 쓸 수 없을 때 추가 소형 모델 요청 대신 **로컬 추정치**를 사용하도록 바뀌었습니다 — 엔드포인트가 다운된 동안에는 `/context` 수치가 API 실측이 아니라 추정치일 수 있습니다. (261) `claude -p --resume <file>`이 트랜스크립트에 기록된 손상된 세션 ID를 그대로 채택하던 결함이 수정되어 이제 새 세션 ID로 재개합니다 — 트랜스크립트 기반 계수(R020)에서 v2.1.261+의 재개된 `-p` 세션은 재개 대상 파일과 다른 세션 ID를 가질 수 있습니다.

> **v2.1.268/269+**: (268) 서버가 응답을 계속 열어두는 경우 `WebFetch`가 무한정 걸려있던 문제가 수정되어 이제 300초 후 실패합니다(`CLAUDE_CODE_WEBFETCH_DEADLINE_MS`로 조정, 0은 비활성) — 위 WebFetch 캐시 TTL 노트의 연장선으로, 구버전에서 WebFetch가 멈춘 것은 느린 사이트가 아니라 **플랫폼 hang**이었을 수 있습니다. (268) 장기 실행 idle 세션의 busy loop로 인한 지속적 고CPU 사용과, `.claude/workflows/` 스크립트가 있는 프로젝트에서 시작 시 각 스크립트를 파싱하던 문제가 수정되었습니다. (268) localhost/점 없는 호스트명에 대한 `WebFetch` 오류 메시지가 거부 사유를 설명하고 curl 사용을 제안하도록 개선되었습니다. (269) `bashEditDiffEnabled` 설정 — Bash 도구가 파일 편집을 수행할 때 도구 결과에 명령이 변경한 파일의 diff가 포함됩니다 — 셸 기반 편집에 대한 결정론적 사후 쓰기 확인 수단입니다(cross-ref R010 오케스트레이터 직접 쓰기 금지 — 위임받은 에이전트의 `sed -i`가 이제 감사 가능해집니다).

> **v2.1.271+**: (271) `/resume`과 `/teleport`가 이전 대화의 파일-읽음 추적을 그대로 유지해, 재개된 대화가 한 번도 읽지 않은 파일을 Claude가 편집할 수 있던 결함이 수정되었습니다(위 v2.1.228 Write 노트의 read-before-write 가드가 재개 경계를 넘어 우회 가능했다는 뜻입니다). (271) 샌드박스 명령이 시작에 실패한 뒤 남은 낡은 `.git/config.lock`이 세션 나머지 동안 `git checkout -b`, `git push -u`, `git config`를 깨뜨리던 결함이 Linux에서 수정되었습니다(Darwin은 미해당 — cross-ref R017). (271) `/cd` 이후 `/reload-skills`가 슬래시 메뉴와 다른 스킬 개수를 보고하던 결함이 수정되었습니다(cross-ref R017 Count Sync — 디렉토리 변경 후 `/reload-skills` 개수는 신뢰할 수 있는 스킬-카운트 ground truth가 아니었습니다). (271) MCP 서버가 `list_changed`를 촘촘한 루프로 보낼 때 발생하던 지속적 고CPU와 반복 도구목록 요청이 수정되었습니다.

> **v2.1.273/274+**: (274) 경미한 메모리 압박 상태의 머신에서 background 명령이 30분 idle 후 중지되던 것이, 이제 메모리가 치명적으로 낮을 때만 중지되고 디버그 로그에 사유가 남습니다 — v2.1.260의 서브에이전트 background 1시간 제한 제거와 결합하면, "무음 종료"의 알려진 플랫폼 원인 두 가지가 모두 사라졌으므로 남은 종료는 실재 신호로 취급합니다. (274) Bash 도구가 플러그인 리로드마다 셸 프로파일을 재소스(수 초 지연)하던 것이, 이제 플러그인의 `bin/` 디렉토리가 바뀔 때만 그렇게 됩니다; Monitor 알림이 스크립트의 최종 출력과 종료를 하나의 알림으로 병합합니다; 서버별 `timeout`이 더 길어도 Streamable HTTP MCP 도구 호출이 ~5분에 타임아웃하던 결함이 수정되었습니다; 레거시 HTTP+SSE를 쓰는 MCP `http` 서버가 첫 요청에 4xx로 응답할 때 정상 fallback되도록 수정되었습니다(위 v2.1.265 SSE 노트의 연장선); `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`가 연결 중인 MCP 서버에 대한 첫 비대화형 턴의 대기 시간을 상한합니다. (273) MCP 서버가 세션 도중 연결이 끊기고 재연결이 포기될 때 알림이 표시됩니다(`/mcp` 확인 유도) — 이 저장소 세션에서 관측된 llm-memory 530 사례가 무음 대신 가시화됩니다.

> **v2.1.275/276+**: (275) CHANGELOG 원문: "Fixed sandboxed Bash commands on Linux reporting exit code 0 for failed commands when the shell is zsh." Linux CI/컨테이너에서 275 이전 zsh 샌드박스의 `exit 0`은 성공의 증거가 아니었으므로, 위 zsh 파이프 `$?` 노트(#1492/#1540) 및 R020 "실행됨 ≠ 성공" 계열과 같은 함정입니다 — Darwin(이 저장소 기본 실행 환경)은 미해당입니다. (275) CHANGELOG 원문: "Fixed the Read tool hanging instead of reporting an error when part of a large file could not be decoded under memory pressure." 구버전에서 대용량 파일 Read의 무응답(hang)은 느린 파일이 아니라 디코딩 실패가 오류 없이 멈춘 무음 형태였을 수 있습니다. (275) CHANGELOG 원문: "Fixed Grep, Glob and @-file suggestions hanging or running out of memory on searches over the 20MB output cap, and system ripgrep reporting \"no matches\" instead of an error after a flood of warnings." 대용량 출력 탐색에서 구버전 "no matches"는 실제 무결과가 아니라 경고 폭주 뒤의 오류 위장일 수 있었으므로, 그런 탐색의 0건 결과는 `git grep` 등으로 재확인합니다(위 「도구 이름 ≠ 그 프로그램」#1590 계열). (275) CHANGELOG 원문: "Fixed `/rewind` in a forked or background session restoring a zero-filled or truncated file when the session's file-history backups could not be fully copied." fork/background 세션에서 275 이전 `/rewind` 복원 결과는 내용을 신뢰하기 전 `wc -c` 등으로 바이트 수를 확인합니다(R020 Degraded-Output Re-Verification Gate 계열). (276) CHANGELOG 원문: "Fixed every request failing with `400 … Input tag 'advisor_20260301'` when `ANTHROPIC_BASE_URL` points at a proxy or gateway (2.1.275 regression)." 275 단독 환경에서 게이트웨이·프록시 경유 세션의 전체 요청 400 실패는 설정 오류가 아니라 플랫폼 회귀였으며, 276에서 해소되었으므로 R004 Retryable 재시도로 해결되는 종류가 아니었습니다.

<!--
> **v2.1.206+**: `/doctor`에 checked-in CLAUDE.md에서 코드베이스로부터 파생 가능한 내용을 잘라내도록 제안하는 체크가 추가되었습니다 — R005 "Context Optimization via HTML Comments"의 컨텍스트 절감 원칙과 정합(모델 불필요 메타데이터 축소).
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.44, 보존 기준 v2.1.212 미만): > **v2.1.208+**: Fixed several tool-reliability bugs: env vars like `CLAUDE_CODE_MAX_OUTPUT_TOKENS` silently used only the mantissa of scientific-notation values (`1e6` became `1`); Edit now succeeds on a file modified after being read, as long as the target text still matches uniquely; Read no longer misreports empty files as "shorter than offset"; Grep no longer silently returns "No files found" for invalid regex, no longer under-reports paginated count-mode totals; and Glob no longer crashes on a null byte in pattern/path/cwd. -->

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.210+**: Bash/PowerShell 명령이 timeout으로 auto-background될 때의 메시지가 개선되어 모델이 hang과 명시적 background 요청을 구분할 수 있으며, auto-background된 명령 내 `cd`는 적용되지 않고 tool result가 working directory 불변을 명시합니다 — auto-background 이후 cwd 의존 후속 명령은 절대 경로로 수행합니다. 또한 Grep content mode가 결과 끝을 지난 페이지네이션에서 "No matches found"를 반환하던 문제가 수정되었습니다(v2.1.208 Grep 페이지네이션 수정의 연장) — 구버전에서 이 응답은 "패턴 미존재"가 아니라 "페이지 끝"일 수 있습니다. -->

> **v2.1.212+**: MCP 도구 호출이 2분(기본값, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`로 임계값 조정·비활성) 초과 시 자동으로 백그라운드로 이동해 세션이 계속 사용 가능해집니다 — 위 v2.1.210 Bash/PowerShell auto-background의 MCP 도구 확장. 느린 MCP 호출(ontology-rag `rebuild_ontology`, code-review-graph 인덱싱 등)을 hang으로 오판하지 말고, 2분 초과 시 백그라운드 전환을 전제로 후속 작업을 진행합니다.

> **v2.1.233+ (정정: v2.1.239에서 실제로 보장됨)**: `WebFetch`의 세션 URL 캐시 TTL이 `CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS`로 조정 가능해졌습니다(기본 15분 — **단, v2.1.239 이전에는 이 15분이 지켜지지 않고 만료된 콘텐츠가 세션 전체 동안 메모리에 남아있었습니다**. v2.1.239가 이 결함을 수정해 이제야 15분 TTL이 실제로 보장됩니다). **재확인 함정**: 같은 URL을 TTL 내 재조회하면 캐시가 반환되므로 **독립적인 2차 확인이 아닙니다** — R020 Degraded-Output Re-Verification Gate가 요구하는 "결정론적 2차 소스"로 동일 URL의 WebFetch 재호출을 쓰지 말고, 다른 소스나 CLI 실측(`npm view`, `gh`)을 사용합니다. **회고적 함의**: v2.1.239 이전 세션에서는 이 재확인 함정이 "TTL 15분 이내"가 아니라 **세션 내내** 유효했으므로, 그 시기의 WebFetch 재조회 기반 판단은 15분보다 훨씬 오래된 stale 데이터에 의존했을 수 있습니다.

> **v2.1.224+**: mid-turn에 연결된 MCP 도구가 **이름 고지 없이** tool search로 deferred되던 결함이 수정되었습니다. 구버전에서는 세션 도중 붙은 MCP 서버의 도구가 이름조차 노출되지 않아 "그런 도구 없음"으로 오판할 수 있었으므로, 위 tool-availability 주의(`command -v` 사전 확인과 동류)를 MCP 도구에도 적용합니다 — 도구 부재 결론 전에 `ToolSearch`로 실측합니다.

> **v2.1.228+**: Write 도구가 **이번 세션에 읽지 않은 기존 파일도 newer model에서는 덮어쓸 수 있도록** 변경되어 Edit 도구 규칙과 일치합니다(구모델은 여전히 read 선행 필요). 도구가 강제하던 read-before-write 가드가 모델에 따라 사라지므로, "Write가 실패했다 = 파일을 안 읽었다"는 진단이 더 이상 보편적으로 성립하지 않고, **읽지 않은 파일을 Write하면 기존 내용이 경고 없이 소실**됩니다 — 전체 교체가 아닌 변경에는 Edit을 쓰는 원칙을 도구 강제가 아니라 절차로 유지합니다. 또한 deferred-tools reminder가 skill 호출 후 모델에 두 번 전달되던 문제가 수정되었습니다(중복 컨텍스트 소모).

> **v2.1.229+**: 도구 호출의 `glob`/`file_path`/`command` 값이 **비문자열일 때 에러 화면으로 크래시**하던 문제가 수정되었습니다(해당 세션의 `--resume`에서도 재발). 구버전에서 이 크래시는 세션을 복구 불가 상태로 만들면서 **원인이 도구 인자 타입이라는 단서를 남기지 않았으므로**, 스크립트로 도구 인자를 조립할 때 문자열 타입을 보장합니다(cross-ref R023 Workflow Script Sanity Check). 좁은 터미널에서 progress bar·마크다운 표 렌더링 시 발생하던 RangeError 크래시(`claude --continue`/`--resume` 시작 시에도 발생)도 함께 수정되었습니다.

> **v2.1.233+**: Linux에서 Bash 도구 명령에 **memory cgroup**을 걸 수 있게 되어(`CLAUDE_CODE_TOOL_MEMORY_LIMIT`, opt-in) 폭주하는 빌드가 세션을 마비시키지 못합니다. 이 변수가 설정된 환경에서는 대용량 빌드·테스트가 **OOM으로 죽을 수 있으므로**, 실패를 코드 결함으로 특성화하기 전에 이 변수 설정 여부를 확인합니다(R020 Read-Before-Characterize). 같은 릴리즈에서 **샌드박스 활성 Linux의 유휴 세션이 CPU 코어 1개를 100% 점유하던 문제**도 수정되었습니다 — 구버전 Linux에서 병렬 배치의 CPU 포화·타임아웃 실패를 "부하 의존"으로 귀속하기 전에 유휴 세션의 상시 점유를 배제해야 했습니다(cross-ref R009 「파일 disjoint ≠ 자원 disjoint」). 이 저장소의 기본 실행 환경은 Darwin이므로 두 항목 모두 **현재 미적용**이며, Linux CI·컨테이너 실행에만 해당합니다.

> **v2.1.252+/v2.1.257+**: (252) 일부 Mac에서 Bash 명령이 "task output swap refused (tasks dir moved or linked)"로 실패하던 결함 수정 — Darwin이 이 저장소 기본 실행 환경이므로 직접 해당하며, 구버전에서 이 문구의 Bash 실패는 명령 결함이 아니라 플랫폼 tasks 디렉토리 처리 결함이었습니다(R020 Read-Before-Characterize). (257) `timeout`/`setsid`로 셸에서 분리된 background 명령이 task stop·CC 종료 후에도 살아남던 결함 수정, background 명령을 tasks 패널에서 중지하면 이제 Claude에 통지됨, `claude -p --input-format stream-json`에 비-JSONL 입력 시 무한 메모리 증가 대신 즉시 실패. 위 macOS `gtimeout` 노트(#1327)와 결합하면, `gtimeout`으로 감싼 백그라운드 명령이 세션 종료 후 잔존하던 관측은 이 결함의 산물일 수 있습니다.

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

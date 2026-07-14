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

> **v2.1.206+**: `/doctor`에 checked-in CLAUDE.md에서 코드베이스로부터 파생 가능한 내용을 잘라내도록 제안하는 체크가 추가되었습니다 — R005 "Context Optimization via HTML Comments"의 컨텍스트 절감 원칙과 정합(모델 불필요 메타데이터 축소).

> **v2.1.208+**: Fixed several tool-reliability bugs: env vars like `CLAUDE_CODE_MAX_OUTPUT_TOKENS` silently used only the mantissa of scientific-notation values (`1e6` became `1`); Edit now succeeds on a file modified after being read, as long as the target text still matches uniquely; Read no longer misreports empty files as "shorter than offset"; Grep no longer silently returns "No files found" for invalid regex, no longer under-reports paginated count-mode totals; and Glob no longer crashes on a null byte in pattern/path/cwd.

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

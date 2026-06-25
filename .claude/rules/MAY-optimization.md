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

> **Shell output parsing — use Python, not read/grep (#1401 찐빠 #3)**: adb bounds rect, 좌표쌍, JSON 분할 등 구조화된 출력 파싱은 `read`+`grep -o` 파이프라인 대신 Python (`python3 -c "..."`) 을 사용한다. `read`+`grep -o` 조합은 공백 차이에 취약해 헛값을 산출한다. SSH 원격 `bash -c` 인자에 소괄호 포함 금지 — `ssh host "cmd; cmd2"` 형식 사용.

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

---
name: omcustom-improve-report
description: Read-only report of improvement suggestions from eval-core analysis engine
scope: harness
user-invocable: true
---

# Improve Report

Display improvement suggestions from eval-core analysis engine as read-only report. No file modifications, no GitHub mutations.

## Purpose

Surface actionable improvement suggestions gathered by the eval-core analysis engine. Reads from eval-core's local database and renders insights as structured markdown. Useful for understanding routing quality, skill effectiveness, and agent usage patterns.

## Usage

```
/omcustom:improve-report
```

## Workflow

### Step 1: Check eval-core availability

```bash
command -v eval-core 2>/dev/null || ls node_modules/.bin/eval-core 2>/dev/null
```

If not found → skip to Step 4 (fallback).

### Step 2: Run analysis

```bash
eval-core analyze --format markdown
```

### Step 3: Data sufficiency check

Count sessions recorded from the output metadata:

| Sessions recorded | Confidence | Behavior |
|-------------------|------------|----------|
| < 5 | `[confidence: low]` | Show results with message: "최소 5세션 이상의 데이터가 필요합니다. 현재 데이터로도 초기 분석은 가능하지만, 정확도는 제한적입니다." |
| 5–20 | `[confidence: medium]` | Show results with medium confidence note |
| > 20 | `[confidence: high]` | Show results normally |

### Step 4: Display

If output contains data → display as structured markdown with confidence annotation prepended.

If command not found OR output is empty:

```
[omcustom:improve-report] 데이터 없음
eval-core가 설치되어 있지 않거나 아직 충분한 세션 데이터가 수집되지 않았습니다.
eval-core를 설치하거나 더 많은 세션을 진행한 후 다시 실행하세요.
```

## Notes

- **Read-only**: No file modifications, no GitHub issue creation, no external mutations
- **R010 compliant**: Only executes Bash for read-only analysis — no write operations delegated
- **Graceful fallback**: Falls back silently if eval-core or its DB doesn't exist
- **Confidence-aware**: Reports data sufficiency alongside results per R011 conventions

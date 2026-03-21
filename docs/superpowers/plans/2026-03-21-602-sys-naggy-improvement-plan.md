# Issue #602: sys-naggy SessionStart Hook — Stale TODO Auto-Detection

**Date**: 2026-03-21
**Issue**: #602
**Priority**: P2
**Estimated Size**: S-M (Small-Medium)
**Target PR**: Single PR covering Phase 1 + Phase 2

---

## 배경 및 문제 분석 (Background & Problem Analysis)

### Current State

`sys-naggy` is declared as an active TODO management agent with stale detection capabilities, but in practice it is entirely passive — it only operates when manually invoked by the user. Two capability claims in its agent definition are never exercised in production:

1. **">24h stale detection"** — logic to flag TODOs that haven't been updated in over 24 hours
2. **"Rule violation pattern detection (3+ occurrences)"** — cross-references compliance history and proposes rule patches

As a result, TODO files have silently drifted:

| File | Last Updated | Days Stale | Stale Items |
|------|-------------|------------|-------------|
| `TODO.md` | 2026-02-10 | 39 days | #52, #54, #55, #56 (all closed) |
| `.claude/TODO.md` | 2026-03-08 | 13 days | #213 Phase 3 (completed) |

MEMORY.md's "Next Session TODO" section has de-facto replaced sys-naggy's role as the primary task tracker — which is a workaround, not the intended design.

### Root Cause

sys-naggy has no automatic trigger. Without a SessionStart hook, it cannot surface stale TODO state at the beginning of a session when that information is most actionable.

---

## 팩트 교정 (Factual Corrections from Professor-Triage)

All three cross-analysis perspectives (Architect / Colleague / Professor) independently identified a factual error in the initial triage:

> **Claim**: "2 SessionStart hooks exist — `session-env-check.sh` and `serve-autostart.sh`"
> **Reality**: Only **1 SessionStart hook** exists (`session-env-check.sh`, 218 lines).

`serve-autostart.sh` does not exist. The SubagentStart section at `hooks.json` L120-131 was misidentified as a SessionStart hook. The new `stale-todo-scanner.sh` will be the **2nd** SessionStart hook.

---

## 범위 (Scope)

This plan covers **Phase 1 + Phase 2** in a single PR, per triage recommendation.

| Phase | Description | In This PR |
|-------|-------------|-----------|
| Phase 1 | SessionStart hook script (`stale-todo-scanner.sh`) + `hooks.json` update | YES |
| Phase 2 | TODO file cleanup (`TODO.md` + `.claude/TODO.md`) | YES |
| Phase 3 | Rule violation pattern detection activation | NO — separate issue |

**Phase 3 is excluded** because it requires a compliance infrastructure (`session-compliance-report.sh`) that was deleted in v0.34.0. A follow-up issue should be filed referencing #602.

---

## 기술 컨텍스트 (Technical Context)

### Existing SessionStart Hook Pattern

Reference: `.claude/hooks/scripts/session-env-check.sh` (218 lines)

Key patterns that `stale-todo-scanner.sh` MUST follow:

```bash
set -euo pipefail           # Strict mode
input=$(cat)                # Capture stdin at start
# ... logic ...             # All output via stderr (>&2)
# Status file:              /tmp/.claude-env-status-${PPID}
# Cache-only principle:     no network calls
echo "$input"               # Pass-through stdin at end
# Always exits 0            (advisory-only, never blocks)
```

### Current hooks.json SessionStart Section

Location: `.claude/hooks/hooks.json` L108-118

```json
"SessionStart": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "bash .claude/hooks/scripts/session-env-check.sh"
      }
    ],
    "description": "Check codex CLI and Agent Teams availability at session start"
  }
]
```

### sys-naggy Agent

Location: `.claude/agents/sys-naggy.md`
- **Model**: sonnet, **Memory**: local, **Effort**: low
- **Tools**: Read, Write, Edit, Grep
- **Commands**: list, add, done, remind
- **Rule Pattern Detection**: reads violation history, cross-references compliance data, proposes patches for 3+ violations (currently inactive)

---

## 구현 계획 (Implementation Plan)

### Phase 1a: stale-todo-scanner.sh

**File**: `.claude/hooks/scripts/stale-todo-scanner.sh`
**Action**: Create new hook script (~80-120 lines)

#### Functional Requirements

1. **Scan target files**:
   - `TODO.md` (root) — project-level TODO
   - `.claude/TODO.md` — agent-system-level TODO

2. **Staleness detection**:
   - Parse `Last updated:` date line from each file
   - Calculate days elapsed since that date
   - Apply thresholds:
     - >7 days → `⚠ stale >7d` warning
     - >30 days → `⚠⚠ critical` warning
   - Missing TODO file → skip silently (no error)

3. **Closed issue detection** (cache-based):
   - Scan TODO items matching `#\d+` pattern in `- [ ]` lines
   - Check issue state via `gh issue view --json state`
   - Cache results at `/tmp/.claude-todo-issue-cache-${PPID}` — check once per session only
   - If `gh` is unavailable → skip closed-issue detection gracefully (no error, no warning about gh absence unless it was previously available)

4. **Output format** (stderr only, always):
   ```
   --- [TODO Health Check] ---
     TODO.md: last updated 39 days ago (⚠⚠ critical >30d)
     .claude/TODO.md: last updated 13 days ago (⚠ stale >7d)
     Pending items: 4 (root) + 1 (.claude)
     ⚠ 4 items may reference closed issues
   ------------------------------------
   ```

5. **Exit behavior**: Always `exit 0`. This is advisory-only and must never block session start.

#### Script Structure

```bash
#!/usr/bin/env bash
set -euo pipefail

input=$(cat)  # Capture stdin for pass-through

# --- Helper functions ---
# check_staleness(file_path, label)
# scan_pending_items(file_path)
# detect_closed_issues(file_path)

# --- Main logic ---
# 1. Check TODO.md
# 2. Check .claude/TODO.md
# 3. Print summary to stderr
# 4. Pass stdin through

echo "$input"
exit 0
```

### Phase 1b: hooks.json Update

**Files**:
- `.claude/hooks/hooks.json`
- `templates/.claude/hooks/hooks.json` (MUST be kept in sync — R017)

**Change**: Append a second entry to the `SessionStart` array:

```json
{
  "matcher": "*",
  "hooks": [
    {
      "type": "command",
      "command": "bash .claude/hooks/scripts/stale-todo-scanner.sh"
    }
  ],
  "description": "Scan TODO.md files for stale items and closed issue references at session start"
}
```

> Note: The hook type MUST be `"command"` (shell script), NOT `"prompt"` (LLM call). This is consistent with all existing advisory hooks and avoids unnecessary token consumption at session start.

### Phase 2: TODO File Cleanup

**File**: `TODO.md` (root)
- Remove completed/closed items: #52, #54, #55, #56
- Update `Last updated:` to 2026-03-21
- Add currently open items from MEMORY.md "Next Session TODO", or mark as minimally archived

**File**: `.claude/TODO.md`
- Remove completed #213 Phase 3 item (completed in v0.34.0 era)
- Update `Last updated:` to 2026-03-21
- Sync with MEMORY.md "Next Session TODO" section for current open items

### Template Sync (R017 compliance)

**File**: `templates/.claude/hooks/scripts/stale-todo-scanner.sh`
- Create as a copy of `.claude/hooks/scripts/stale-todo-scanner.sh`
- This ensures the `template-sync` CI check passes

---

## 구현 순서 (Implementation Steps)

| Step | File | Action | Notes |
|------|------|--------|-------|
| 1 | `.claude/hooks/scripts/stale-todo-scanner.sh` | Create hook script | Follow session-env-check.sh patterns |
| 2 | `.claude/hooks/hooks.json` | Add SessionStart entry | Append to existing array |
| 3 | `templates/.claude/hooks/hooks.json` | Sync template | Mirror step 2 |
| 4 | `templates/.claude/hooks/scripts/stale-todo-scanner.sh` | Create template copy | Mirror step 1 |
| 5 | `TODO.md` | Remove closed issues, update date | #52, #54, #55, #56 |
| 6 | `.claude/TODO.md` | Remove completed items, update date | #213 Phase 3 |
| 7 | **Verify** | `echo '{}' \| bash .claude/hooks/scripts/stale-todo-scanner.sh` | Must exit 0 cleanly |
| 8 | **Commit** | All changes in single commit | Via mgr-gitnerd |

---

## 검증 체크리스트 (Verification Checklist)

### Hook Script
- [ ] `stale-todo-scanner.sh` exits 0 in all cases (including error paths)
- [ ] Script handles missing `TODO.md` gracefully (skip, no error)
- [ ] Script handles missing `.claude/TODO.md` gracefully (skip, no error)
- [ ] Script handles missing `gh` CLI gracefully (skip closed-issue detection, no crash)
- [ ] No network calls on cold start — issue status uses local cache only
- [ ] All output goes to stderr (`>&2`) only
- [ ] stdin is captured and passed through at end (`echo "$input"`)
- [ ] Staleness thresholds work: >7d = warning, >30d = critical
- [ ] Issue reference detection finds `#\d+` patterns in `- [ ]` lines

### Integration
- [ ] `hooks.json` is valid JSON after edit (validate with `python3 -m json.tool`)
- [ ] `templates/.claude/hooks/hooks.json` matches source `hooks.json` (R017)
- [ ] `templates/.claude/hooks/scripts/stale-todo-scanner.sh` exists and matches source

### TODO Cleanup
- [ ] `TODO.md` no longer references #52, #54, #55, #56
- [ ] `.claude/TODO.md` no longer references #213 Phase 3
- [ ] Both files have updated `Last updated:` dates

### Regression
- [ ] `bun test` passes (1427+ tests, 0 failures)
- [ ] `bun run build` succeeds
- [ ] CI template-sync check passes (script file parity check added in v0.48.3)

---

## 리스크 평가 (Risk Assessment)

| Risk | Level | Mitigation |
|------|-------|-----------|
| Hook blocks session start | None | Always exits 0; script uses `set -euo pipefail` but catches errors gracefully |
| `gh` CLI unavailable | Low | Graceful skip — no crash, no output about gh absence |
| `Last updated:` date format mismatch | Low | Parse multiple common date formats (YYYY-MM-DD, Month DD YYYY) |
| Template sync miss | Low | Step 3+4 explicitly cover template updates |
| TODO cleanup removes wrong items | Low | Items explicitly listed by issue number |
| Breaking change to hooks.json | None | Additive only — existing hooks untouched |

**Overall**: Low risk. Advisory-only hook, exit 0 always, no blocking behavior. Entirely additive.

---

## 범위 외 항목 (Out of Scope — Phase 3)

The following capabilities exist in sys-naggy's design but are NOT included in this PR:

- **Rule violation pattern detection**: Requires `session-compliance-report.sh` (deleted in v0.34.0)
- **Compliance infrastructure restoration**: Larger effort, separate issue needed
- **sys-naggy auto-trigger on TODO updates**: Would require PostToolUse hook, separate design

**Action required**: File a follow-up issue for Phase 3, referencing #602.

---

## 관련 파일 참조 (Related File References)

| File | Purpose |
|------|---------|
| `.claude/hooks/scripts/session-env-check.sh` | Reference implementation for hook pattern |
| `.claude/hooks/hooks.json` | Hook configuration (SessionStart, SubagentStart, etc.) |
| `.claude/agents/sys-naggy.md` | Agent definition being enhanced |
| `TODO.md` | Root-level TODO file (cleanup target) |
| `.claude/TODO.md` | Agent-system TODO file (cleanup target) |
| `templates/.claude/hooks/hooks.json` | Template mirror (R017 sync required) |
| `templates/.claude/hooks/scripts/` | Template scripts directory (R017 sync required) |

---

## 완료 기준 (Definition of Done)

Per R020 completion verification:

```
[Contract] Task: sys-naggy SessionStart Hook (#602)
├── Criterion 1: stale-todo-scanner.sh exists, passes manual test, exits 0
├── Criterion 2: hooks.json valid JSON with new SessionStart entry
├── Criterion 3: templates/ in sync (R017 compliant)
├── Criterion 4: TODO.md cleaned (no closed issue references, date updated)
├── Criterion 5: .claude/TODO.md cleaned (no stale items, date updated)
└── Criterion 6: bun test passes, CI checks pass
```

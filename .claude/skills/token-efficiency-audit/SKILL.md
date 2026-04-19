---
name: token-efficiency-audit
description: Three-layer token defense stack — audit current settings, apply safe/CI levers, and monitor status
scope: package
user-invocable: true
argument-hint: "[audit|apply-interactive|apply-ci|status]"
version: 1.0.0
---

# Token Efficiency Audit Skill

Layer 3 of the three-layer token defense stack. Audits current Claude Code settings against the token efficiency lever reference table, applies safe interactive levers, and reports combined layer status.

Reference guide: `guides/claude-code/14-token-efficiency.md`

## Three-Layer Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: cc-token-saver (CACHE DEFENSE)                        │
│  Before session — protect prompt cache TTL from idle expiry     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: R013 Ecomode (RUNTIME COMPRESSION)                    │
│  During session — compact output, aggregate results, prune input│
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: token-efficiency-audit (PRE-SESSION PREVENTION)       │
│  Config time — disable injections before they happen            │
└─────────────────────────────────────────────────────────────────┘
```

Each layer is independently deployable and non-overlapping. Layer 3 (this skill) operates at config time — it prevents overhead from ever entering the context window.

## Modes

### audit (default)

1. Read `.claude/settings.json` (project-level, git-tracked)
2. Read `.claude/settings.local.json` (local, not git-tracked)
3. Check each lever from the Interactive Session Levers table in the guide:
   - `includeGitInstructions`
   - `autoConnectIde`
   - `attribution.commit`
   - `attribution.pr`
   - `env.BASH_MAX_OUTPUT_LENGTH`
   - `env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`
   - `env.MAX_MCP_OUTPUT_TOKENS`
4. Output a table:

```
[Token Efficiency Audit]
Reference: guides/claude-code/14-token-efficiency.md (CC v2.1.114+)

| Lever                               | Current     | Recommended | Gap    | Location              |
|-------------------------------------|-------------|-------------|--------|-----------------------|
| includeGitInstructions              | true        | false       | ⚠ SET  | settings.json         |
| autoConnectIde                      | true        | false       | ⚠ SET  | settings.json         |
| attribution.commit                  | auto text   | ""          | ⚠ SET  | settings.json         |
| attribution.pr                      | auto text   | ""          | ⚠ SET  | settings.json         |
| BASH_MAX_OUTPUT_LENGTH              | unlimited   | 15000       | ⚠ SET  | settings.local.json   |
| CLAUDE_CODE_FILE_READ_MAX_OUTPUT... | unlimited   | 8000        | ⚠ SET  | settings.local.json   |
| MAX_MCP_OUTPUT_TOKENS               | unlimited   | 8000        | ⚠ SET  | settings.local.json   |

Run /token-efficiency-audit apply-interactive to apply all safe levers.
```

Gap column values:
- `OK` — already at recommended value
- `⚠ SET` — currently at default, recommended change available
- `CUSTOM` — non-default value that differs from recommendation (display actual value)

### apply-interactive

Applies Interactive Session Levers only (safe for development use).

1. Read `.claude/settings.json` and `.claude/settings.local.json` (create if not exists)
2. Apply to `settings.json`:
   ```json
   {
     "includeGitInstructions": false,
     "autoConnectIde": false,
     "attribution": {
       "commit": "",
       "pr": ""
     }
   }
   ```
3. Apply to `settings.local.json` (env block):
   ```json
   {
     "env": {
       "BASH_MAX_OUTPUT_LENGTH": "15000",
       "CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS": "8000",
       "MAX_MCP_OUTPUT_TOKENS": "8000"
     }
   }
   ```
4. Preserve all existing settings (merge, do not overwrite unrelated keys)
5. Report applied changes:
   ```
   [Done] Interactive levers applied

   settings.json:
     includeGitInstructions: true → false
     autoConnectIde: true → false
     attribution.commit: (auto) → ""
     attribution.pr: (auto) → ""

   settings.local.json:
     BASH_MAX_OUTPUT_LENGTH: (none) → 15000
     CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: (none) → 8000
     MAX_MCP_OUTPUT_TOKENS: (none) → 8000

   Note: settings.json is git-tracked. Commit if appropriate.
   Takes effect on next claude session restart.
   ```

### apply-ci

Applies CI/Worker-Only Levers. These disable core oh-my-customcode functionality.

**R001 Risk: HIGH** — Display this warning prominently BEFORE applying:

```
⚠ WARNING — CI/WORKER LEVERS

These settings disable core oh-my-customcode functionality:
  • CLAUDE_CODE_DISABLE_CLAUDE_MDS=1  → ALL rules and routing offline (R010 disabled)
  • CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1 → All 48 agents unavailable
  • ENABLE_CLAUDEAI_MCP_SERVERS=false → MCP-dependent skills unavailable
  • CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 → No persistent memory across sessions

Only use for CI/worker pipelines. Never apply to interactive development sessions.

Type "yes" to confirm, or anything else to cancel:
```

1. Require explicit user confirmation ("yes") before proceeding
2. On confirmation, apply to `settings.local.json`:
   ```json
   {
     "env": {
       "CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1",
       "CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS": "1",
       "ENABLE_CLAUDEAI_MCP_SERVERS": "false",
       "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"
     }
   }
   ```
3. Report:
   ```
   [Done] CI/Worker levers applied to settings.local.json

   This file is NOT git-tracked.
   To undo: remove the four env keys or run /token-efficiency-audit status
   ```
4. On cancellation: `[Cancelled] No changes made.`

### status

Reports current state of all three layers.

1. Check Layer 1 — cc-token-saver:
   - Check if plugin is present (look for cc-token-saver in `.claude/` plugin config or known plugin markers)
   - Report: Installed / Not installed
2. Check Layer 2 — R013 Ecomode:
   - Read `.claude/settings.json` for ecomode config
   - Report: threshold, result_format, max_result_length if set; otherwise "auto-threshold (4 tasks)"
3. Check Layer 3 — Settings levers:
   - Run the same lever checks as `audit` mode
   - Summarize: N/7 levers at recommended values
4. Check OTel availability:
   - Look for `CLAUDE_CODE_ENABLE_TELEMETRY` in settings
   - If present: report "OTel enabled — use /monitoring-setup status for metrics"
5. Output:

```
[Token Efficiency Status]

Layer 1: cc-token-saver    ✓ Installed / ✗ Not installed
Layer 2: R013 Ecomode      ✓ Active (threshold: 4) / ✗ Not configured
Layer 3: Settings levers   4/7 at recommended

Layer 3 details:
  includeGitInstructions: false ✓
  autoConnectIde: true ⚠
  attribution.commit: "" ✓
  attribution.pr: "" ✓
  BASH_MAX_OUTPUT_LENGTH: 15000 ✓
  CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: unlimited ⚠
  MAX_MCP_OUTPUT_TOKENS: unlimited ⚠

Run /token-efficiency-audit apply-interactive to fix ⚠ levers.
OTel: not enabled — run /monitoring-setup enable to measure effectiveness.
```

## Codex Levers

When Codex CLI is in use (detected by presence of `~/.codex/config.toml`):

Recommended settings in `config.toml`:
```toml
[features]
apps = false

[apps._default]
enabled = false

web_search = "disabled"

tool_output_token_limit = 10000
```

Non-interactive Codex CLI flag reference: `guides/claude-code/13-cli-flags.md`

## Guardrails

### The Re-Call Trap

Setting output limits too low forces repeated re-call loops — the model issues `tail -n 50 output.txt` or re-reads files in chunks, costing more tokens than the original uncapped output.

**Enforce these minimum floors (never go below):**

| Variable | Safe minimum | Recommended |
|----------|-------------|-------------|
| `BASH_MAX_OUTPUT_LENGTH` | 10000 | 15000 |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | 4000 | 8000 |
| `MAX_MCP_OUTPUT_TOKENS` | 4000 | 8000 |
| Codex `tool_output_token_limit` | 5000 | 10000 |

If a user requests values below these floors, warn them of the re-call trap risk before applying.

### Version Drift

Settings defaults change with minor CC version releases. After each upgrade, re-run `/token-efficiency-audit audit` to verify active defaults. Reference baseline: CC v2.1.114+ / Codex v0.121.0+.

## Cross-References

- `guides/claude-code/14-token-efficiency.md` — Full three-layer stack guide and lever table
- `.claude/rules/SHOULD-ecomode.md` (R013) — Layer 2 specification
- `.claude/skills/monitoring-setup/SKILL.md` — Measure effectiveness via OTel metrics
- `guides/cc-token-saver/README.md` — Layer 1 detailed guide
- `guides/claude-code/13-cli-flags.md` — Non-interactive/CI CLI flags

---
title: "Token Efficiency — Three-Layer Defense Stack"
type: guide
updated: 2026-04-19
sources:
  - guides/claude-code/14-token-efficiency.md
  - guides/cc-token-saver/README.md
  - .claude/rules/SHOULD-ecomode.md
related:
  - [[cc-token-saver]]
  - [[R013]]
  - [[R012]]
  - [[R010]]
  - [[R001]]
  - [[13-cli-flags]]
---

# Token Efficiency — Three-Layer Defense Stack

Three complementary, non-overlapping layers that address token waste at different points in the session lifecycle. Each layer is independently deployable.

## The Stack

```
Layer 1: cc-token-saver  — before session  (cache TTL defense)
Layer 2: R013 Ecomode    — during session  (runtime compression)
Layer 3: Settings Gates  — config time     (pre-session prevention)
```

## Layer 1: cc-token-saver (Prompt Cache TTL Guard)

Detects when the 1-hour prompt cache TTL is about to expire due to idle time and warns before the cache invalidates. Key features: Token Guardian idle detection, `/continue` zero-cost context restore, `/usage-view` cost dashboard.

**When to use:** Always — install as a plugin and leave active.

See [[cc-token-saver]] for conflict resolution with R012 statusline.

## Layer 2: R013 Ecomode (Runtime Output Compression)

Compresses agent output at runtime. Auto-activates at 4+ parallel tasks, 80%+ context usage, or batch operations. Agents return `status + 1-2 sentence summary + key_data only`. File lists compressed to count; error traces to first/last 3 lines.

See [[R013]] for activation config and full behavior spec.

## Layer 3: Settings-Based Gates (Pre-Session Prevention)

Disables token-consuming injections before sessions start. Key levers:

| Setting | Default | Recommended | Impact |
|---------|---------|-------------|--------|
| `includeGitInstructions` | `true` | `false` | Medium — removes git context injection |
| `autoConnectIde` | `true` | `false` | Low — removes IDE file list injection |
| `BASH_MAX_OUTPUT_LENGTH` | unlimited | `15000` | High — caps bash output |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | unlimited | `8000` | Medium |
| `MAX_MCP_OUTPUT_TOKENS` | unlimited | `8000` | Medium |

CI-only (destructive — disables oh-my-customcode): `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`. Never apply to interactive sessions.

## Re-call Trap Guardrail

Setting output limits too low forces repeated re-call loops that cost more than the original uncapped output. Safe minimums: `BASH_MAX_OUTPUT_LENGTH` 10000, file/MCP read tokens 4000.

## Cross-References

- [cc-token-saver guide](cc-token-saver.md) — Layer 1 detailed integration
- [13-cli-flags guide](guides/claude-code/13-cli-flags.md) — CLI flags for CI/non-interactive invocation
- [[R013]] — Layer 2 Ecomode specification
- [[R012]] — HUD statusline (CTX% measures combined Layer 2+3 impact)
- [[R010]] — `CLAUDE_CODE_DISABLE_CLAUDE_MDS` disables R010 enforcement (CI-only)
- [[R001]] — apply-ci mode is Risk Level High, requires user confirmation

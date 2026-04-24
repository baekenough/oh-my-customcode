# Token Efficiency — Five-Layer Defense Stack

> **Source**: [Claude Code & Codex token efficiency by settings adjustment](https://www.stdy.blog/increasing-token-efficiency-by-setting-adjustment-in-claude-and-codex/)
> **Reference baseline**: Claude Code v2.1.114+ / Codex v0.121.0+

## Why This Matters

Token spend in Claude Code is not purely a function of task complexity. A significant portion of token consumption occurs through structural overhead: auto-injected git instructions, IDE file listings, tool output that exceeds what the model actually needs, and session state reloaded unnecessarily across turns.

The five-layer defense stack addresses this overhead at distinct points in the session lifecycle:

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: cc-token-saver (CACHE DEFENSE)                        │
│  Before session — protect prompt cache TTL from idle expiry     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: R013 Ecomode (RUNTIME COMPRESSION)                    │
│  During session — compact output, aggregate results, prune input│
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Settings-Based Gates (PRE-SESSION PREVENTION)         │
│  Config time — disable injections before they happen            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: playwright-compress (MCP OUTPUT INTELLIGENCE)         │
│  PostToolUse hook — Haiku summarization of browser MCP output   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: caveman (OUTPUT STYLE COMPRESSION)                    │
│  SessionStart hook — primitive-speech output reduces token spend│
│  English scenarios only — R000 Korean-first contexts use Layer 2│
└─────────────────────────────────────────────────────────────────┘
```

Each layer is independently deployable and non-overlapping. Together they form a complete defense.

---

## Layer 1: cc-token-saver (Prompt Cache TTL Guard)

**What it does:** Detects when the 1-hour prompt cache TTL is about to expire due to idle time. Warns before cache invalidates, preventing a full re-spend on the next turn.

**Why it matters:** Claude Code's prompt cache has a 1-hour TTL on idle. If you pause a long session, the entire cached context must be re-processed at full cost on the next message. cc-token-saver intercepts this.

**Key features:**
- Token Guardian: idle TTL detection and warning
- `/continue`: zero-cost context restore after session pause
- `/usage-view`: cost dashboard for session/cumulative spend

**When to use:** Always — install as a plugin and leave active.

**Reference:** `guides/cc-token-saver/README.md`

---

## Layer 2: R013 Ecomode (Runtime Behavior Compression)

**What it does:** Compresses agent output at runtime — compact result format, aggregated multi-agent results, and active pruning of irrelevant input context.

**Why it matters:** Without ecomode, subagents return verbose outputs that accumulate across parallel invocations. At 4+ concurrent agents, unchecked output grows the context window rapidly.

**Activation triggers:**
- 4+ parallel tasks running simultaneously
- Batch operations on independent targets
- Context usage approaching 80%
- Explicit "ecomode on"

**Key behaviors:**
- Agents return `status + 1-2 sentence summary + key_data only`
- File lists compressed to count (when > 5 files)
- Error traces: first/last 3 lines only
- Code references: `path:line` ref instead of full block

**When to use:** Auto-activates on threshold — configure threshold in ecomode config if needed.

**Reference:** `.claude/rules/SHOULD-ecomode.md` (R013)

---

## Layer 3: Settings-Based Gates (Pre-Session Prevention)

**What it does:** Disables token-consuming injections and sets output caps in configuration files before sessions start. These gates prevent overhead from ever entering the context window.

**Why it matters:** Certain Claude Code defaults inject tokens on every session start regardless of whether they are needed:
- `includeGitInstructions: true` (default) injects git workflow context on every session
- `autoConnectIde: true` injects file lists from connected IDEs
- Uncapped `BASH_MAX_OUTPUT_LENGTH` allows tool output to flood the context

**How to apply:** `token-efficiency-audit` skill — see `.claude/skills/token-efficiency-audit/SKILL.md`

---

## Lever Reference Table

### Interactive Session Levers (safe for development)

| Lever | Location | Default | Recommended | Token Impact | Risk |
|-------|----------|---------|-------------|-------------|------|
| `includeGitInstructions` | settings.json | `true` | `false` | Medium — removes git workflow injection | None for most projects |
| `autoConnectIde` | settings.json | `true` | `false` | Low — removes IDE file list injection | Loses IDE file awareness |
| `attribution.commit` | settings.json | auto text | `""` | Low — removes attribution boilerplate | None |
| `attribution.pr` | settings.json | auto text | `""` | Low — removes attribution boilerplate | None |
| `BASH_MAX_OUTPUT_LENGTH` | env | unlimited | `15000` | High — caps bash output | Output truncated if > 15000 chars |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | env | unlimited | `8000` | Medium — caps file read output | Large files truncated |
| `MAX_MCP_OUTPUT_TOKENS` | env | unlimited | `8000` | Medium — caps MCP output | MCP results truncated |
| `CLAUDE_CODE_GLOB_NO_IGNORE` | env | `true` | `false` | Low — respects .gitignore | Fewer files visible in globs |

### CI/Worker-Only Levers (destructive — disables oh-my-customcode)

> These settings disable core oh-my-customcode functionality. **Never apply to interactive sessions.**

| Lever | What it disables | Token impact | oh-my-customcode impact |
|-------|-----------------|-------------|------------------------|
| `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` | All `.claude/*.md` files including CLAUDE.md | High | ALL global rules and routing offline |
| `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` | Built-in agent definitions | High | All 48 agents unavailable |
| `ENABLE_CLAUDEAI_MCP_SERVERS=false` | MCP server connections | Medium | MCP-dependent skills unavailable |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | Agent auto-memory | Low | No persistent memory across sessions |

### Codex CLI Levers

| Lever | Location | Default | Recommended | Token Impact |
|-------|----------|---------|-------------|-------------|
| `features.apps` | config.toml | `true` | `false` | Medium |
| `apps._default.enabled` | config.toml | `true` | `false` | Medium |
| `web_search` | config.toml | `"auto"` | `"disabled"` | Medium — web search adds significant context |
| `tool_output_token_limit` | config.toml | `10000` | `10000` | High — do not lower below 5000 |

---

## Tradeoffs and Guardrails

### The re-call trap

Setting output limits too low forces the model into repeated re-call loops — the model issues `tail -n 50 output.txt` or re-reads files in chunks, which costs more tokens than the original uncapped output. The minimum values below are empirically safe floors:

| Variable | Safe minimum | Recommended |
|----------|-------------|-------------|
| `BASH_MAX_OUTPUT_LENGTH` | 10000 | 15000 |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | 4000 | 8000 |
| `MAX_MCP_OUTPUT_TOKENS` | 4000 | 8000 |
| Codex `tool_output_token_limit` | 5000 | 10000 |

### Version drift

Settings defaults change with minor CC version releases. After each upgrade, verify active defaults with `/token-efficiency-audit audit`. The reference baseline for this guide is CC v2.1.114+ / Codex v0.121.0+.

### includeGitInstructions tradeoff

Disabling `includeGitInstructions` removes git workflow guidance from the context. For projects with non-standard git workflows or junior contributors, this guidance may be worth keeping. For projects with experienced teams using `mgr-gitnerd` (R010), the injection is redundant.

---

## Interaction with Other Rules

| Rule / Component | Interaction |
|-----------------|-------------|
| R013 Ecomode | Layer 2 runtime compression. These layers are complementary — apply both. |
| cc-token-saver | Layer 1 cache defense. `Token Guardian` + `BASH_MAX_OUTPUT_LENGTH` together eliminate the two largest waste sources. |
| R010 Orchestrator | `CLAUDE_CODE_DISABLE_CLAUDE_MDS` disables R010 enforcement — CI-only. |
| R001 Safety | `apply-ci` mode is Risk Level High — requires user confirmation before applying. |
| R012 HUD Statusline | Statusline shows CTX% — effective measure of Layer 2+3 combined impact. |
| playwright-compress | Layer 4 hook — complements Layer 3 MAX_MCP_OUTPUT_TOKENS with intelligent lossless compression. |
| caveman | Layer 5 style compression — orthogonal to Layer 2 (volume) and Layer 4 (MCP). R000 Korean-first: use Layer 2 as primary. |

---

## Layer 4: MCP Output Intelligence Compression

PostToolUse hook that compresses Playwright and Chrome MCP tool output using Haiku summarization.

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| browser_navigate | 37,983 chars | 1,922 chars | -94% |
| browser_snapshot | 37,897 chars | 1,435 chars | -96% |

- Preserves `ref=` attribute values for interactive flow
- Skips output < 3000 chars
- Falls back to original on Haiku failure
- No API key needed (uses `claude -p` subscription auth)

Configuration: `.claude/hooks/scripts/playwright-compress.sh`
Hook trigger: `mcp__playwright__.*` and `mcp__claude-in-chrome__.*`

---

## Layer 5: caveman (Output Style Compression)

External plugin (JuliusBrussee/caveman, 41.6k stars, MIT) that rewrites Claude responses into compressed "primitive speech" via a SessionStart hook.

**Measured savings:**
- ~75% output token reduction
- ~46% input token reduction (context accumulation effect)

**Intensity levels:**

| Level | Description | Recommendation |
|-------|-------------|----------------|
| `lite` | Light compression, high readability | Recommended |
| `full` | Moderate compression | Recommended |
| `ultra` | Heavy compression, reduced readability | Caution |
| `文言文` | Classical Chinese style | Avoid for shared sessions |

**Installation:** `/plugin install caveman` (requires marketplace access)

**When to use:**

| Scenario | Layer to apply |
|----------|---------------|
| English-only output sessions (code review, commit messages) | Layer 5 (caveman) |
| Korean-first sessions (R000 contexts) | Layer 2 (R013 ecomode) — caveman articles/prepositions not present in Korean |
| Mixed sessions | Layer 2 primary, Layer 5 optional |

**Coexistence with other layers:**

- Layer 5 compresses output style; Layer 2 (ecomode) compresses output volume. These are orthogonal — both can be active simultaneously.
- Layer 5 applies globally to all responses; Layer 2 activates conditionally (4+ tasks threshold).
- For Korean-first projects following R000, Layer 2 provides the primary compression benefit. Layer 5's article-removal compression is largely ineffective against Korean (article-free language).

**R000 compatibility note:** caveman's compression relies on English grammatical structure (removing articles, prepositions). Korean lacks these structures, so compression rates are significantly lower in Korean-dominant sessions. Use `lite` or `full` mode only; avoid `ultra`/`文言文` in shared or multilingual sessions.

---

## Cross-References

- `guides/claude-code/13-cli-flags.md` — CLI flags for non-interactive/CI invocation
- `guides/cc-token-saver/README.md` — Layer 1 detailed guide
- `.claude/rules/SHOULD-ecomode.md` — Layer 2 R013 specification
- `.claude/skills/token-efficiency-audit/SKILL.md` — Layer 3 HOW: audit and apply
- `.claude/skills/monitoring-setup/SKILL.md` — Measure effectiveness via OTel metrics
- `.claude/skills/update-config/` — Generic settings.json manipulation (broader scope)
- `.claude/skills/playwright-compress/SKILL.md` — Layer 4 MCP output compression hook
- `.claude/hooks/scripts/playwright-compress.sh` — Layer 4 hook script
- `https://github.com/JuliusBrussee/caveman` — Layer 5 caveman plugin (external)

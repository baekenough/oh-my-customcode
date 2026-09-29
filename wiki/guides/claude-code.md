---
title: "Claude Code Guide"
type: guide
updated: 2026-09-29
sources:
  - guides/claude-code/01-overview.md
  - guides/claude-code/03-tools.md
  - guides/claude-code/04-agent-skills.md
  - guides/claude-code/05-agent-sdk.md
  - guides/claude-code/06-mcp.md
  - guides/claude-code/07-prompt-engineering.md
  - guides/claude-code/08-testing.md
  - guides/claude-code/09-guardrails.md
  - guides/claude-code/10-monitoring.md
  - guides/claude-code/11-sub-agents.md
  - guides/claude-code/12-workflow-patterns.md
  - guides/claude-code/13-cli-flags.md
  - guides/claude-code/14-token-efficiency.md
  - guides/claude-code/15-version-compatibility.md
  - guides/claude-code/16-fable5-prompting.md
related:
  - [[r006]]
  - [[r009]]
  - [[r010]]
  - [[r011]]
  - [[r012]]
  - [[r013]]
  - [[r016]]
  - [[r020]]
  - [[r023]]
---

# Claude Code Guide

`guides/claude-code/` is oh-my-customcode's "standard library" for the underlying Claude Code platform — 15 reference documents that agents and skills (especially `arch-documenter` and the `claude-native` auto-generation skill) consult rather than re-deriving platform facts ad hoc.

| Topic | File | Role |
|-------|------|------|
| Feature/tool overview | `01-overview.md`, `03-tools.md` | Claude's native capabilities (1M context, Skills, MCP connector, tool use) as a baseline reference |
| Agent construction | `04-agent-skills.md`, `05-agent-sdk.md`, `11-sub-agents.md` | Building Skills/subagents on Claude Code, maps to R006 agent design |
| Prompting & workflow | `07-prompt-engineering.md`, `12-workflow-patterns.md`, `16-fable5-prompting.md` | Prompt patterns; Fable 5 (Mythos-class) needs shorter, less-prescriptive instructions than Opus/Sonnet — feeds R006 model aliases, R009 parallel-reliability, R020 ground-truth, R023 shift-left. Its hierarchy claim is now scoped to "above Opus 4.8" only — relative standing vs Opus 5 (`claude-opus-5`, v2.1.219+, now previous-generation) and Opus 5.5 (`claude-opus-5-5`, v2.1.280+, current default Opus) is not officially confirmed and is never asserted |
| Operations | `13-cli-flags.md`, `14-token-efficiency.md` | CLI/env reference; five-layer token defense stack (cc-token-saver → R013 Ecomode → settings gates → playwright-compress → caveman). `ANTHROPIC_MODEL` env var example now reflects `claude-opus-5-5` as the default Opus (v2.1.280+); `03-tools.md` and `06-mcp.md` API examples use `claude-sonnet-5-5` |
| Platform tracking | `15-version-compatibility.md` | CC release-note digest |
| Placeholders | `08-testing.md`, `09-guardrails.md`, `10-monitoring.md` | Sections await official Anthropic docs (`status: placeholder` in `index.yaml`) |
| Protocol reference | `06-mcp.md` | Model Context Protocol server connection guide |

**Policy reversed (v1.1.77, #1717) — destination is now this guide, not the rules**: from oh-my-customcode v1.1.9 through v1.1.76, `15-version-compatibility.md` capped its per-version log at v2.1.160 and newer CC compatibility notes accumulated inline in the affected rule files instead — that v2.1.161–v2.1.276 span of inline rule notes is preserved as-is. A `/memory` warning (#1717) measured the resulting rule corpus at 306,752 chars (comments stripped) against CC's 150,000-char limit, so [[r016]] replaced the accumulate-in-rules approach with a destination-based policy: **starting at v2.1.277, new CC release knowledge is recorded here** as a per-rule section (see the file's own version-range headers), and a rule file itself gets at most one line — only when the release changes current agent behavior — gated by [[r016]]'s new ≤140,000-char instruction-budget check. Consult this guide for v2.1.277+ changes; consult the relevant rule's version-note history for v2.1.161–276.

**v2.1.282 (#1746) / v2.1.283 (#1747)**: v2.1.282 changed project/local settings to ignore OpenTelemetry variables that turn on export, set an endpoint, or capture content (`CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_LOG_*`, and by the same class `OTEL_METRICS_EXPORTER`/`OTEL_LOGS_EXPORTER`) — a startup notice plus `/status` and `claude doctor` entries now list which telemetry variables were ignored; `.claude/skills/monitoring-setup/SKILL.md` ([[monitoring-setup]]) now branches on installed CC version, moving to user-scope `~/.claude/settings.json` or shell `export` on 2.1.282+. The same release reserved the `anthropic-skills`/`claude-ai` skill namespaces (this repo's `omcustom` namespace does not collide); v2.1.283 reverted the `claude-ai` half of that reservation while leaving `anthropic-skills` reserved. v2.1.283 also added `/doctor prompt-audit` (stale paths/commands, contradicting instruction files surfaced first) and tightened `claude plugin validate` (rejects uninstallable plugin/marketplace names, checks `outputStyles`/`themes`/`monitors`/`lspServers` paths) — both relevant to [[r016]]'s instruction-budget gate and [[r017]]'s `claude plugin validate` step. See the guide's own v2.1.282/v2.1.283 sections for the full CHANGELOG-sourced item list and per-item repo-impact assessment.

**v2.1.284 (#1755)**: CHANGELOG: "Added Claude Sonnet 5.5 (`claude-sonnet-5-5`), now the default Sonnet model on the Anthropic API — 1M context, $2/$10 per Mtok with $0.20/Mtok cache reads"; this repo moved its agent model pins to `claude-sonnet-5-5`/`claude-opus-5-5` (v1.1.89) and [[r006]]'s Tier-2 table gained the 5-5 row, while the Tier-1 `sonnet` alias stays CC-resolved. Interactive terminal and VS Code sessions now start in auto mode when no permission mode is configured (`permissions.defaultMode` still overrides) — this does not change what [[r010]]'s Self-Check measures for unattended (`-p`/headless) runs. Other items recorded in the guide's section: status line `rate_limits.spend_limit` gains `used_usd`/`limit_usd`/`period`; stream-corruption and post-thinking overloaded-error retries ([[r004]] lineage); a second compact pass when "Prompt is too long" persists ([[r013]]); externally symlinked `.claude/rules` now trigger the approval prompt; `{"decision":"block"}` from Elicitation hooks is honored; Explore inherits an unrecognized session model; auto-memory neutralizes invisible characters and CC-markup-imitating tags in `MEMORY.md` ([[r011]]). 86 further items are recorded there as not applicable to this repo. See the guide's own v2.1.284 section for the item list and per-item impact.

See also: [Token Efficiency guide](token-efficiency.md), [[cc-token-saver]], [[agent-teams]], [[r016]] (instruction-budget policy that now routes new content here), and [R017 sync verification](../rules/r017.md) for when this guide requires re-sync.

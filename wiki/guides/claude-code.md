---
title: "Claude Code Guide"
type: guide
updated: 2026-09-24
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
| Prompting & workflow | `07-prompt-engineering.md`, `12-workflow-patterns.md`, `16-fable5-prompting.md` | Prompt patterns; Fable 5 (Mythos-class) needs shorter, less-prescriptive instructions than Opus/Sonnet — feeds R006 model aliases, R009 parallel-reliability, R020 ground-truth, R023 shift-left. Its hierarchy claim is now scoped to "above Opus 4.8" only — relative standing vs Opus 5 (`claude-opus-5`, CC v2.1.219+ default Opus) is not officially confirmed and is never asserted |
| Operations | `13-cli-flags.md`, `14-token-efficiency.md` | CLI/env reference; five-layer token defense stack (cc-token-saver → R013 Ecomode → settings gates → playwright-compress → caveman). `ANTHROPIC_MODEL` env var example now reflects `claude-opus-5` as CC's default Opus model (v2.1.219+) |
| Platform tracking | `15-version-compatibility.md` | CC release-note digest |
| Placeholders | `08-testing.md`, `09-guardrails.md`, `10-monitoring.md` | Sections await official Anthropic docs (`status: placeholder` in `index.yaml`) |
| Protocol reference | `06-mcp.md` | Model Context Protocol server connection guide |

**Policy reversed (v1.1.77, #1717) — destination is now this guide, not the rules**: from oh-my-customcode v1.1.9 through v1.1.76, `15-version-compatibility.md` capped its per-version log at v2.1.160 and newer CC compatibility notes accumulated inline in the affected rule files instead — that v2.1.161–v2.1.276 span of inline rule notes is preserved as-is. A `/memory` warning (#1717) measured the resulting rule corpus at 306,752 chars (comments stripped) against CC's 150,000-char limit, so [[r016]] replaced the accumulate-in-rules approach with a destination-based policy: **starting at v2.1.277, new CC release knowledge is recorded here** as a per-rule section (see the file's own version-range headers), and a rule file itself gets at most one line — only when the release changes current agent behavior — gated by [[r016]]'s new ≤140,000-char instruction-budget check. Consult this guide for v2.1.277+ changes; consult the relevant rule's version-note history for v2.1.161–276.

See also: [Token Efficiency guide](token-efficiency.md), [[cc-token-saver]], [[agent-teams]], [[r016]] (instruction-budget policy that now routes new content here), and [R017 sync verification](../rules/r017.md) for when this guide requires re-sync.

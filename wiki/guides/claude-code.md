---
title: "Claude Code Guide"
type: guide
updated: 2026-10-06
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

**v2.1.285 (#1764) / v2.1.286 (#1765) / v2.1.287 (#1766)** — guide-only knowledge, no rule changes: (285) background Bash/PowerShell commands stop after a time limit (`timeout` with `run_in_background`, default 30 min, max 2 h) and Claude is notified; v2.1.288 later narrowed this to unattended sessions (`-p`, Agent SDK, CI, cloud) — a narrowing, not a rollback. (285) auto-mode subagents end once they hand their report back; fork subagents keep the parent's permission mode and cannot exit plan mode (reinforces [[r010]]'s Self-Check premise); a failing API request's non-streaming fallback shares the retry budget ([[r004]]). (286) one retry limit now covers a whole model call (at most 14 requests with defaults); the API-refused-model failure retries once on the previous model of the same tier; this repo has no skill named `verify`, so the new commit guidance does not apply. (287) a folder's CLAUDE.md is no longer attached twice after resume/compaction (the `SessionStart` re-injection path stays); the dangerous-`rm` safeguard no longer drops when output is also redirected to `~`/wildcard paths ([[r001]] context); whole-tool `Bash` allow rules now prompt for shell writes to files the file tools refuse; `alwaysLoad: false` defers all of an MCP server's tools; Opus 4.7+/Fable default to 1M context on Bedrock/Vertex/Foundry/gateway unless `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` ([[r013]]). Counts of items recorded as not applicable: 123 (285), 80 (286), 98 (287). See the guide's own v2.1.285–v2.1.287 sections for the CHANGELOG quotes and per-item impact.

**v2.1.288 (#1790) / v2.1.289 (#1791)** — guide-only knowledge, no rule changes; the guide's `> Updated:` header moved to 2026-10-05. (288) Mid-response API timeouts: non-interactive sessions and subagents now continue from the partial response and thinking-only responses are retried ([[r004]] lineage); a zero-token-usage last reply no longer causes "Prompt is too long" instead of auto-compact ([[r013]]); several `--resume` fixes (restored files/context kept, last response saved, truncated transcript load); `/autocompact` saves the window per model. (288) Permissions: auto-mode denials no longer point at a Bash rule for non-Bash tools; an over-long conversation is compacted for the safety classifier instead of prompting on every call; a dangerous `rm` inside `bash -c`/`sh -c` no longer runs unprompted under bypassPermissions or a shell allow rule ([[r001]] context); `BASHPID` arithmetic assignments prompt. (288) Hooks: PreToolUse/PermissionRequest hooks whose matcher evaluation fails or whose input cannot be serialized now block the call (fail-closed, [[r021]] context); path-scoped rules and nested CLAUDE.md now also load on Write/Edit. (288) background command time limits now apply only to unattended sessions. (289) Bash deny/ask rules no longer missed behind an env-variable prefix or bare assignment under sandbox auto-allow (this repo has no `sandbox` setting and no `permissions.deny`); `Read` deny rules now apply to IDE symlinked files; plugin `agent.spawn` addition and `claude plugin validate` fixes. Counts of items recorded as not applicable: 59 (288), 19 (289). See the guide's own v2.1.288 and v2.1.289 sections for the CHANGELOG quotes, `[가설]`-tagged unverified items, and per-item impact.

**permission mode / named-spawn measurement notes (#1828 / #1827, CC 2.1.289, 2026-10-06)** — two new guide sections. (#1828) `claude -p` init `permissionMode` measurement: `defaultMode` precedence is local > project > user; an ignored project/local `bypassPermissions` resolves that scope to `default` and overrides a non-bypass user value, while user `bypassPermissions` stays `bypassPermissions`; the deployed template no longer sets `permissions.defaultMode`, and the guide gives an existing-install check (`jq`) and removal example. TTY sessions, whether `default` prompts, managed/`--settings`, other versions, and subagent inheritance remain `[가설]`. The v2.1.284/v2.1.285 notes now say R010's Self-Check applies the `jq` to the user, project, and local scopes. (#1827) Named `Agent` spawns create teammates of the session's implicit team; one named teammate's tool inventory, `SendMessage` loading via `ToolSearch`, and per-model Task-tool availability (haiku teammate yes, sonnet-5-5 teammate and opus-5-5 main no, `TeamCreate`/`TeamDelete` none) are recorded, with member-to-member messaging `[가설]`. The guide's 2.1.289 action items now point at these two notes; the resulting rule edits are in [[r010]], [[r018]], and [[r002]].

## Action item 측정 근거

[15-version-compatibility.md의 Action items 작성 지침](../../guides/claude-code/15-version-compatibility.md)을 따라 측정 결과를 comment/rule의 근거로 쓰기 전에 변수별 검증 행렬을 확인하십시오. 사용자 scope 값·모델·세션 유형 등 결과에 영향을 주는 각 변수에 대해 다른 조건을 유지한 값 변경 대조를 최소 한 번 포함하십시오. 미수행 조건은 미측정으로 표시하고 일반화 근거에서 제외하십시오.

일반화 문장에는 실제 측정한 조건을 함께 적고 결과의 주체·적용범위를 구분하십시오. 관측된 값 차이보다 넓은 인과관계를 단정하지 마십시오. 행렬이 불완전하면 추가 측정 조건을 action item에 남기십시오. 이 지침은 특정 model/session의 새 동작을 측정했다는 주장이 아닙니다.

See also: [Token Efficiency guide](token-efficiency.md), [[cc-token-saver]], [[agent-teams]], [[r016]] (instruction-budget policy that now routes new content here), and [R017 sync verification](../rules/r017.md) for when this guide requires re-sync.

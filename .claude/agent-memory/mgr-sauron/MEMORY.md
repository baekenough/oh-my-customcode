# mgr-sauron Agent Memory

## System Architecture (as of 2026-03-18, post-v0.42.2)

### Expected Counts
- Agents: 44
- Skills: 75 directories
- Guides: 25 topics (templates/guides/ dirs)
- Rules: 21 files (R000-R021, R014 missing)
- Hooks: 1 (hooks.json)
- Contexts: 4 .md

### Manager Agents (6)
mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible

### Routing Skills
- secretary-routing -> 8 agents (mgr-* + sys-*)
- dev-lead-routing -> 24 agents (lang, be, fe, tool, db, arch, infra)
- de-lead-routing -> 6 agents (de-*)
- qa-lead-routing -> 3 agents (qa-*)

## Verification Patterns

### Files to Check When Agent Removed
When an agent is removed, check ALL of these:
1. CLAUDE.md - agent count, Manager row, total count
2. .claude/skills/secretary-routing/SKILL.md - Manager Agents table, Command Routing, Sub-agent Model Selection
3. .claude/agents/mgr-sauron.md - Core Capabilities list
4. templates/.claude/agents/mgr-sauron.md - same
5. templates/.claude/skills/secretary-routing/SKILL.md - same as live skill
6. templates/.claude/ontology/agents.yaml - ManagerAgent class list, agent instances
7. templates/.claude/ontology/graphs/routing.json - routes, agent_to_router
8. templates/.claude/ontology/graphs/full-graph.json - nodes, edges, adjacency
9. templates/.claude/ontology/graphs/agent-skill.json - edges, reverse
10. templates/.claude/ontology/skills.yaml - secretary-routing routes_to list

### Known Intentional Patterns
- hooks.json has duplicate PostToolUse matchers for JS/TS (Prettier + console.log check) and Python (ruff + ty) - this is CORRECT (multiple hooks per event)
- sys-memory-keeper/MEMORY.md contains historical references to removed agents - this is an ACCEPTABLE memory artifact
- .claude-backup-* directory contains old files - these are EXCLUDED from verification

### update-docs Skill Ownership
The update-docs skill is used by mgr-updater (not mgr-sync-checker which was removed).
In ontology graphs: "update-docs" -> required_by: ["mgr-updater"]

### R019 / Ontology-RAG Routing (added 2026-03-12 via PR #307)
- R019 = SHOULD-ontology-rag-routing.md
- All 4 routing skills have Ontology-RAG Enrichment section (R019 Step 4)
- The skill ref check script in R017 falsely reports tools: field as invalid skills — this is a KNOWN SCRIPT BUG (the script parses tools: as skills:). Actual skill refs are all valid.
- Skills count was 69 (not 68) before PR #307; CLAUDE.md was stale. Fixed in sauron verification.

### Skill Ref Check Script Caveat
The bash script in R017 that checks skill refs (`grep "^skills:" -A 10`) picks up the `tools:` field too. Always use the Python-based parser for accurate results.

### deep-plan Skill (added 2026-03-13)
- `/deep-plan` skill: research → plan → verify 3-phase cycle
- Category: Quality & Workflow (now 10 skills in that category)
- README files had stale counts (69 skills, 2 hooks) — fixed during R017 verification
- README "2 hooks" was a pre-existing bug (actual: 1) — fixed to "1 hook"
- Root guides/ still has 23 dirs vs templates/guides/ 25 — pre-existing issue #270, NOT caused by deep-plan

### evaluator-optimizer Skill
- scope: core, user-invocable: false (library skill, not slash command)
- Does NOT use context:fork — operates within caller's context
- grep -rl "context: fork" gives false positive for evaluator-optimizer due to body text in Constraints section
- Always use Python-based frontmatter parser for context:fork count

### context:fork Skills (current: 9/12 cap)
- secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing
- dag-orchestration, task-decomposition, worker-reviewer-pipeline, pipeline-guards
- deep-plan
- evaluator-optimizer and sauron-watch do NOT use context:fork (intentional)
- R006 documents 9/12 cap (live + template)

### v0.42.2 Release Verification (2026-03-18)
- Changes: R018 MUST-agent-teams.md update (sequential-dependency guidance + Blocked Agent Behavior section)
- Auto-fixed during R017: CLAUDE.md skill count 74→75, templates/CLAUDE.md 74→75
- Auto-fixed: deep-plan SKILL.md missing context:fork (both live + template)
- Auto-fixed: R006 context:fork list was 11/12 (documented) but actual was 8; corrected to 9/12 after adding deep-plan
- Auto-fixed: templates/.claude/rules/MUST-agent-teams.md synced to live (was missing new sections)
- All counts verified: 44 agents, 75 skills, 21 rules, 25 guides, 1 hook, 4 contexts

### v0.34.0 Release Verification (2026-03-14)
- Full R017 sauron:watch passed CLEAN for release/v0.34.0 pre-merge gate
- All 44 agents, 71 skills, 25 guides, 19 rules, 1 hook, 4 contexts: counts verified
- All template files in sync (agents, skills, rules, hooks, guides)
- evaluator-optimizer confirmed NOT using context:fork (correct)
- Quality & Workflow skill category: 11 skills (added evaluator-optimizer)
- analysis/lists/status/help reclassified from core to harness scope: confirmed
- validate-docs.ts hook counting: uses .endsWith('.json') filter — bug fixed, CI-safe
- CHANGELOG.md comparison links section is stale (pre-existing, non-blocking) — entries exist but footer links don't extend past v0.17.x
- mgr-sauron.md is 158 lines (slightly over 150 threshold) — contains output format templates, acceptable for manager agent

### omcustom: Namespace Prefix (applied 2026-03-14)
- 14 harness/package skills got `name: omcustom:{skill}` prefix in SKILL.md frontmatter
- Affected: analysis, create-agent, update-docs, update-external, audit-agents, fix-refs, monitoring-setup, npm-publish, npm-version, npm-audit, sauron-watch, lists, status, help
- CLAUDE.md command table updated (e.g. `/analysis` → `/omcustom:analysis`)
- templates/CLAUDE.md.en and .ko updated to match
- README.md and README_ko.md updated to match
- templates/.claude/skills/ all synced (same name: fields)
- Non-prefixed commands (dev-review, dev-refactor, memory-save, memory-recall, codex-exec, optimize-*, research, deep-plan, structured-dev-cycle) remain without prefix — INTENTIONAL

### Ontology Stale State (KNOWN, PRE-EXISTING, NOT blocking)
- templates/.claude/ontology/ is significantly stale — last updated ~v0.24.x era
- Missing from agents.yaml + full-graph.json + agent-skill.json: be-django-expert, sec-codeql-expert
- Missing from skills.yaml: 17 skills (analysis, codex-exec, cve-triage, dag-orchestration, deep-plan, django-best-practices, java21-best-practices, jinja2-prompts, model-escalation, multi-model-verification, pipeline-guards, pr-auto-improve, research, structured-dev-cycle, stuck-recovery, task-decomposition, worker-reviewer-pipeline)
- Missing from rules.yaml: R019 (SHOULD-ontology-rag-routing)
- This is a KNOWN pre-existing issue — ontology is advisory/RAG-only, NOT blocking functionality
- DO NOT treat ontology stale state as a verification failure; treat as issue for future ontology update PR

### v0.35.0 Release Verification (2026-03-14)
- Full R017 sauron:watch passed (1 non-blocking issue) for release/v0.35.0 pre-push gate
- All 44 agents, 71 skills, 25 guides, 19 rules, 1 hook, 4 contexts: counts verified and match manifest
- v0.35.0 changes: cost-cap-advisor.sh (new PostToolUse hook), stuck-detector.sh + task-outcome-recorder.sh updates, dev-review/dev-refactor/research SKILL.md updates (pre-flight guards + Anthropic workflow patterns)
- All template files in sync: hooks.json, statusline.sh, cost-cap-advisor.sh, stuck-detector.sh, task-outcome-recorder.sh, dev-review/dev-refactor/research SKILL.md
- Hook scripts: 10 referenced in hooks.json (all exist on disk), 1 orphaned (session-compliance-report.sh)
- session-compliance-report.sh: ORPHANED SCRIPT — exists in .claude/hooks/scripts/ but NOT in hooks.json (removed in commit 5e483f0 as part of omcustom: namespace cleanup) and NOT in templates. Non-blocking, pre-existing since v0.34.0.
- stage-blocker.sh uses exit 2 (hard block for structured-dev-cycle Write/Edit guard) — INTENTIONAL, same as stuck-detector exit 1
- context:fork count: 9/10 cap (unchanged)
- scope distribution: core 57, harness 10, package 4 (71 total)
- hooks.json has 7 PreToolUse, 1 SessionStart, 1 SubagentStart, 1 SubagentStop, 11 PostToolUse, 2 Stop entries

### deer-flow P0 Soul System (added 2026-03-12, feature/deer-flow-p0)
- Soul files: `.claude/agents/souls/{name}.soul.md` with frontmatter `agent:` + `version:`
- Activation: agent frontmatter `soul: true` + routing skill Step 5 reads soul file
- `lang-golang-expert.md` was MISSING `soul: true` — fixed during R017 verification (synced to templates too)
- All 4 routing skills have Step 5: Soul Injection (secretary, dev-lead, de-lead, qa-lead)
- R006 updated: Soul Identity section + Artifact Output Convention section
- R011 updated: Behavioral Memory section (## Behaviors in MEMORY.md, lifecycle, budget management)
- sys-memory-keeper: step 2 "Extract behaviors" in session-end flow
- Artifact paths: `.claude/outputs/sessions/{YYYY-MM-DD}/{skill}-{HHmmss}.md`
- research SKILL.md: Phase 4 artifact persistence
- dev-review SKILL.md: step 6 artifact persistence (optional)
- .gitignore: `!.claude/agents/` and `!.claude/agents/souls/` negation patterns present
- Template path diff (expected/intentional): `.claude/agents/*.md` uses `templates/guides/` path; `templates/.claude/agents/*.md` uses `guides/` — NOT a sync error

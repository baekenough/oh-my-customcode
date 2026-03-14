# mgr-sauron Agent Memory

## System Architecture (as of 2026-03-14, post-#330)

### Expected Counts
- Agents: 44
- Skills: 71 directories (added evaluator-optimizer 2026-03-14 via #330)
- Guides: 25 topics (templates/guides/ dirs); 12-workflow-patterns.md added inside claude-code/ (not new top-level dir)
- Rules: 19 files (R000-R019, R014 missing)
- Hooks: 1 (hooks.json)
- Contexts: 4 .md + 1 index.yaml

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

### evaluator-optimizer Skill (added 2026-03-14 via #330)
- Skill 71: parameterized evaluator-optimizer loop for quality-critical output
- scope: core, user-invocable: false (library skill, not slash command)
- Does NOT use context:fork — operates within caller's context
- grep -rl "context: fork" gives false positive for evaluator-optimizer due to body text in Constraints section
- Always use Python-based frontmatter parser for context:fork count (actual: 9/10 cap)
- context:fork skills (9): secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing, dag-orchestration, task-decomposition, worker-reviewer-pipeline, pipeline-guards, deep-plan
- R006 updated: 8/10 -> 9/10 cap, added deep-plan to list (both live + template)
- README_ko.md had "26개 가이드" (stale) — fixed to "25개 가이드" during R017 verification
- templates/.claude/hooks/scripts/task-outcome-recorder.sh was missing pattern_used field — fixed during R017 verification
- task-decomposition SKILL.md: added Step 0 Pattern Selection
- stuck-detector.sh: added conditional hard-block (exit 1) on 5+ consecutive repetitions
- guides/claude-code/12-workflow-patterns.md: new file inside existing dir (not new top-level guide)

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

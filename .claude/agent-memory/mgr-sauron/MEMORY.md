# mgr-sauron Agent Memory

## System Architecture (as of 2026-03-13)

### Expected Counts
- Agents: 44
- Skills: 70 directories (added deep-plan 2026-03-13)
- Guides: 25 topics (templates/guides/ dirs)
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

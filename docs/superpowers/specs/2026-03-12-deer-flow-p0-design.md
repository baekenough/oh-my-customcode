# Design Specification: deer-flow Pattern Adoption (Phase 0)

> **Issue**: #275
> **Date**: 2026-03-12
> **Status**: Approved
> **Scope**: P0 items only (SOUL.md, Behavioral Memory, Artifact Output)

## Background

ByteDance deer-flow research (10-team parallel analysis, HIGH confidence) identified 8 adoptable patterns. This spec covers the 3 highest-priority items (P0).

Reference: `.claude/outputs/sessions/2026-03-11/research-deer-flow.md`

## 1. SOUL.md Per-Agent Identity System

### Problem

Agent `.md` files define capabilities and workflows but lack personality/style differentiation. All agents communicate identically regardless of their domain expertise.

### Design

**Location**: `.claude/agents/souls/{name}.soul.md`

**Format**:
```yaml
---
agent: {agent-name}        # Target agent (must match agent filename)
version: 1.0.0
---

## Personality
- Communication style preferences

## Style
- Domain-specific conventions and priorities

## Anti-patterns
- Things this agent should avoid
```

**Mechanism**:
1. R006 adds optional `soul: true` frontmatter field to agent definition
2. When routing skill spawns an agent with `soul: true`, it reads `souls/{name}.soul.md`
3. Soul content is prepended to the spawned agent's prompt as identity context
4. Soul injection is placed as the final prompt enrichment step in routing flow:
   - Step 1-3: Static routing (existing)
   - Step 4: Ontology-RAG enrichment (R019, existing)
   - Step 5: Soul injection — read `souls/{name}.soul.md`, prepend to prompt
   All 4 routing skills implement the same Step 5 placement.
5. If soul file doesn't exist → graceful fallback (no error, no injection)

**Scope**:
- Framework provides mechanism only (oh-my-customcode is a template)
- 1 example soul included: `lang-golang-expert.soul.md`
- Users customize souls for their own agents post-install

### Files to Modify

| File | Change |
|------|--------|
| `.claude/rules/MUST-agent-design.md` (R006) | Add `soul: true` optional frontmatter field, add Souls section documenting `souls/` subdirectory convention |
| `.claude/agents/souls/lang-golang-expert.soul.md` | **NEW** — Example soul file |
| `.claude/skills/dev-lead-routing/SKILL.md` | Add soul injection logic to agent spawn flow |
| `.claude/skills/secretary-routing/SKILL.md` | Add soul injection logic to agent spawn flow |
| `.claude/skills/de-lead-routing/SKILL.md` | Add soul injection logic to agent spawn flow |
| `.claude/skills/qa-lead-routing/SKILL.md` | Add soul injection logic to agent spawn flow |

### Constraints

- Soul injection adds ~100-200 tokens per spawn — negligible cost
- Soul files are under `.claude/` gitignore. Implementation should add `!.claude/agents/souls/` negation pattern to `.gitignore` for automatic tracking.
- No soul = no change in behavior (backward compatible)

## 2. Behavioral Memory Layer

### Problem

MEMORY.md stores factual knowledge (patterns, decisions, architecture) but lacks behavioral observations — how the user prefers to interact, communication patterns, workflow preferences. These behavioral insights are lost between sessions.

### Design

**Addition to MEMORY.md convention**: New `## Behaviors` section alongside existing content.

```markdown
## Behaviors [confidence: medium]
- User prefers concise responses — 3 sentences max
- Commit messages always include issue number
- Security-first review perspective

## Behavior Lifecycle
- New observation → [confidence: low]
- Seen in 2+ sessions → [confidence: medium]
- User-confirmed → [confidence: high]
- Contradicted → demote or remove
```

**Mechanism**:
1. sys-memory-keeper gains a **behavioral extraction** step at session end
2. During session summary collection, sys-memory-keeper analyzes conversation for behavioral patterns:
   - Communication preferences (verbosity, language, format)
   - Workflow patterns (tool preferences, review habits)
   - Domain priorities (security-first, performance-first, etc.)
3. New behaviors start at `[confidence: low]`, promote on repeated observation
4. Existing `[confidence: *]` tags from R011 are reused — no new tagging system

### Files to Modify

| File | Change |
|------|--------|
| `.claude/agents/sys-memory-keeper.md` | Add behavioral extraction workflow step to session-end flow |
| `.claude/rules/SHOULD-memory-integration.md` (R011) | Add Behaviors section convention, extraction guidelines |

### Constraints

- Behavioral extraction is best-effort — failure doesn't block session end
- Behaviors section stays within MEMORY.md's 200-line budget (shared with facts)
- No separate behavioral memory file — integrated into existing MEMORY.md
- Precedence: Behavioral memory observations override soul defaults when they conflict (behaviors are user-specific, souls are template defaults)
- Budget overflow strategy: When facts + behaviors approach 200-line limit, prune low-confidence behaviors first, then medium-confidence behaviors. High-confidence behaviors are never auto-pruned.

## 3. Artifact Output Layer

### Problem

Skill outputs (research reports, review results, verification reports) exist only in conversation context and are lost after `/compact` or session end. The single existing output (`.claude/outputs/sessions/2026-03-11/research-deer-flow.md`) was manually created with no convention.

### Design

**Convention**:
```
.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md
```

Example: `.claude/outputs/sessions/2026-03-12/research-143052.md`

**Mechanism**:
1. Skills that produce significant output opt-in to artifact persistence
2. The final subagent in each skill's pipeline writes the artifact:
   - `/research`: The Phase 4 synthesis agent (opus) writes the report before returning results
   - `/dev-review`: The review agent writes findings before returning
   - The orchestrator NEVER writes artifacts directly (R010 compliance)
3. Output format: skill-specific but always includes metadata header:
   ```markdown
   ---
   skill: research
   date: 2026-03-12T14:30:52+09:00
   query: "{original user query}"
   ---

   (skill output content)
   ```
4. `.claude/outputs/` is git-untracked (covered by `.claude/` in .gitignore) — local only

**Initial opt-in skills**:
- `/research` — largest output producer, most value from persistence
- `/dev-review` — code review results useful for future reference

### Files to Modify

| File | Change |
|------|--------|
| `.claude/rules/MUST-agent-design.md` (R006) | Add Artifact Output Convention section |
| `.claude/skills/research/SKILL.md` | Add output persistence step at end of research flow |
| `.claude/skills/dev-review/SKILL.md` | Add output persistence step (optional) |

### Constraints

- Output persistence is opt-in per skill — no mandatory requirement
- Skills create output directory (`mkdir -p`) before writing — no setup needed
- No indexing in P0 — simple date-based directory browsing is sufficient
- Timestamp uses local time (KST, +09:00) for user readability

## Summary

| Item | Effort | New Files | Modified Files | Risk |
|------|--------|-----------|---------------|------|
| SOUL.md | S | 1 | 5 | Low (additive, backward compatible) |
| Behavioral Memory | M | 0 | 2 | Low (extends existing convention) |
| Artifact Output | M | 0 | 2-3 | Low (opt-in, git-untracked) |
| **Total** | **S+M+M** | **1** | **9-10** | **Low** |

## Non-Goals (P1+)

- Todo re-injection advisory hook (P1)
- Context budget PreToolUse trigger (P1)
- Resume state validator (P2)
- Subagent spawn counter (P2)
- Progressive skill loading (P3)
- Output indexing/search (future)

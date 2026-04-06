---
name: omcustom:agora
description: "Multi-LLM adversarial consensus loop — 3+ LLMs compete to find flaws in designs/specs until unanimous agreement is reached"
user-invocable: true
argument-hint: "<document-path> [--rounds N] [--severity-threshold HIGH]"
effort: max
scope: core
version: 1.0.0
source:
  type: external
  origin: github
  url: https://github.com/baekenough/baekenough-skills
  version: 1.0.0
---

# Agora: Multi-LLM Adversarial Consensus

3개 이상의 LLM(Claude, Codex/GPT, Gemini)이 경쟁적으로 설계/문서의 결함을 찾고, 만장일치 합의에 도달할 때까지 반복하는 적대적 교차 검증 스킬.

## Prerequisites

- `codex-exec` skill (Codex/GPT 호출)
- `gemini-exec` skill (Gemini 호출)
- Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) or Agent tool available

## Usage

```
/agora docs/design.md                          # Default: 3 LLMs, unlimited rounds
/agora docs/design.md --rounds 10              # Max 10 rounds
/agora docs/design.md --severity-threshold HIGH # Exit when no HIGH+ findings
/agora docs/design.md --models claude,codex     # 2 LLMs only
```

## Workflow

### Phase 1: Setup
1. Read the target document
2. Create Agent Team: `TeamCreate("agora-review")`
3. Create review tasks per focus area

### Phase 2: Spawn Reviewers (parallel)
Spawn 3 reviewers as Agent Team members:

```
Agent(name: "claude-critic", model: opus, effort: max)
  → 20-point deep adversarial review
  
Agent(name: "codex-critic", model: opus)
  → Invoke Skill(codex-exec) for GPT perspective + independent Claude analysis
  
Agent(name: "gemini-critic", model: opus)  
  → Invoke Skill(gemini-exec) for Gemini perspective + independent Claude analysis
```

### Phase 3: Independent Review
Each reviewer performs adversarial review with this template:

```
For EACH review point:
### Round N: [Topic]
**Severity**: CRITICAL / HIGH / MEDIUM / LOW
**Flaw**: [Specific, concrete problem description]
**Evidence**: [Why this is real, not theoretical]
**Impact**: [What happens if not addressed]
**Counter-argument**: [Best case FOR the current design]
**Verdict**: KEEP / MODIFY / REJECT
```

Review areas (adapt to document type):
- Architecture fundamentals
- Component/service design
- Data architecture
- Security & resilience
- Feasibility & deployment
- Testing strategy
- Operational complexity

### Phase 4: Cross-Review (Peer-to-Peer)
Each reviewer sends findings to the other two via `SendMessage`.

Counter-review template:
1. Which findings do you **AGREE** with? (and why)
2. Which findings do you **DISAGREE** with? (evidence-based rebuttal)
3. What did they **MISS** that you caught?
4. What did they catch that you **MISSED**?
5. **SEVERITY** adjustments — upgrade or downgrade with justification

### Phase 5: Synthesis
Team lead aggregates all findings:

```
UNANIMOUS CRITICAL: [findings all 3 agreed on]
STRONG AGREEMENT:   [findings 2/3 agreed on]
SPLIT DECISIONS:    [findings with disagreement + resolution]
```

Determine verdict:
- **BUILD**: No CRITICAL, no unresolved HIGH
- **BUILD WITH CHANGES**: No CRITICAL, HIGH findings have accepted mitigations
- **REDESIGN**: Any unresolved CRITICAL findings
- **ABANDON**: Fundamental concept is flawed

### Phase 6: Loop (if REDESIGN)
1. Team lead produces/delegates redesign addressing ALL critical findings
2. New version sent to ALL reviewers: `SendMessage(to: "*")`
3. Reviewers re-review → GOTO Phase 4
4. Repeat until EXIT criteria met

### Phase 7: Exit (consensus reached)
When ALL reviewers agree BUILD or BUILD WITH CHANGES:
1. Produce final consensus report
2. Write to `.claude/outputs/sessions/{date}/agora-{topic}-{time}.md`
3. Shut down team: `SendMessage(to: "*", message: {type: "shutdown_request"})`

## Reviewer Principles

1. **NEUTRAL** — no reviewer has home team advantage
2. **COMPETITIVE** — find flaws others missed
3. **CRITICAL** — "fewer than 5 CRITICAL flaws = not looking hard enough"
4. **EVIDENCE-BASED** — every finding cites specific evidence
5. **CONSTRUCTIVE** — every flaw includes recommended fix
6. **CONVERGENT** — goal is consensus, not endless disagreement

## Consensus Criteria

| Condition | Required |
|-----------|----------|
| CRITICAL findings resolved | ALL |
| HIGH findings resolved or accepted | ALL |
| All reviewers rate BUILD or BUILD WITH CHANGES | YES |
| Cross-review disagreements resolved | ALL |

## Output Format

```markdown
# Agora Consensus Report

## Document: [path]
## Rounds: [N]
## Reviewers: [list with LLM models used]

## Verdict: [BUILD / BUILD WITH CHANGES / REDESIGN]

## Unanimous Findings
| # | Finding | Severity | All 3 Agree |
|---|---------|----------|-------------|

## Required Changes Before Build
1. [change with source reviewer]
2. ...

## Accepted Risks
- [finding accepted with justification]

## Unique Contributions Per Reviewer
| Reviewer | Findings Others Missed |
|----------|----------------------|

## Process Metrics
- Rounds: N
- Total findings: N
- Cross-adopted: N
- Severity upgrades: N
- Severity downgrades: N
- Disagreements raised: N
- Disagreements resolved: N/N
```

## Configuration

```yaml
# Default settings
agora:
  max_rounds: unlimited       # Set --rounds to limit
  severity_threshold: HIGH    # EXIT when no findings >= threshold
  models:
    - claude (opus, max effort)
    - codex (via codex-exec skill)
    - gemini (via gemini-exec skill)
  review_points: 20           # Per reviewer
  cross_review: true          # Peer-to-peer sharing
  auto_redesign: true         # Auto-produce redesign on REDESIGN verdict
```

## Anti-Patterns

| Anti-Pattern | Why Wrong | Correct |
|-------------|-----------|---------|
| Single LLM review | Misses blind spots | 3+ LLMs find complementary flaws |
| No cross-review | Reviewers don't challenge each other | Peer-to-peer sharing surfaces disagreements |
| Accepting first BUILD | May miss edge cases | Loop until ALL agree |
| Ignoring split decisions | Unresolved disagreements fester | Resolve every split with evidence |
| Push for consensus too fast | Premature agreement | Let reviewers challenge freely |

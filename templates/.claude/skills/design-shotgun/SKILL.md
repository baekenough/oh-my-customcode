---
name: design-shotgun
description: Generate 4-6 parallel design mockups for rapid visual comparison — adapted from gstack /design-shotgun pattern
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<component/page description>"
effort: high
---

# Design Shotgun — Parallel Mockup Generation

## Purpose

Generates 4-6 independent design variations simultaneously, then presents them side-by-side for comparison. Prevents premature convergence on a single design direction.

## Usage

```
/design-shotgun "landing page hero section"
/design-shotgun "dashboard settings panel"
/design-shotgun "mobile navigation menu"
```

## Workflow

### Phase 1: Brief Analysis

Parse the design brief to extract:
- Component type (page, section, widget, modal)
- Constraints (brand colors, existing design system, accessibility requirements)
- Target platform (web, mobile, responsive)

### Phase 2: Parallel Generation (R009)

Spawn 4 parallel agents, each generating a distinct design approach:

| Agent | Style Direction | Focus |
|-------|----------------|-------|
| 1 | Minimal | Maximum whitespace, essential elements only |
| 2 | Data-dense | Information-rich, compact layout |
| 3 | Visual | Hero imagery, bold typography, emotional |
| 4 | Conventional | Industry-standard patterns, familiar UX |

Each agent generates:
- HTML mockup (self-contained, inline CSS)
- Design rationale (2-3 sentences)
- Accessibility notes

### Phase 3: Comparison Board

Present all mockups with side-by-side comparison:

```markdown
## Design Shotgun Results: {component}

### Variation 1: Minimal
Rationale: {why}
[HTML mockup code]

### Variation 2: Data-dense
Rationale: {why}
[HTML mockup code]

### Variation 3: Visual
Rationale: {why}
[HTML mockup code]

### Variation 4: Conventional
Rationale: {why}
[HTML mockup code]

## Comparison
| Criteria | V1 | V2 | V3 | V4 |
|----------|----|----|----|----|
| Readability | ★★★ | ★★ | ★★ | ★★★ |
| Visual impact | ★ | ★★ | ★★★ | ★★ |
| Information density | ★ | ★★★ | ★★ | ★★ |
| Accessibility | ★★★ | ★★ | ★★ | ★★★ |
```

### Phase 4: Selection & Refinement

User selects preferred variation(s). Selected design can be:
- Refined with follow-up iterations
- Combined with elements from other variations
- Handed to fe-design-expert for production implementation

## Integration

| Component | Role |
|-----------|------|
| R009 | 4 parallel agents for mockup generation |
| impeccable-design | Quality baseline for generated mockups |
| fe-design-expert | Production refinement after selection |
| web-design-guidelines | Accessibility and UX compliance |

## Permission Mode

When spawning agents via the Agent tool during this skill's execution, always pass `mode: "bypassPermissions"`. The Agent tool default (`acceptEdits`) overrides agent frontmatter `permissionMode`, causing permission prompts during unattended execution.

## Source

Adapted from [garrytan/gstack](https://github.com/garrytan/gstack) /design-shotgun pattern.

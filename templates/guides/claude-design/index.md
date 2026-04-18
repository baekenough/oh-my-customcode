# Claude Design Handoff Guide

Guide for connecting Claude Design (Anthropic's conversational design tool) outputs to Claude Code's `fe-design-expert` workflow.

---

## 1. What is Claude Design?

Claude Design is Anthropic's conversational design tool that generates UI design specifications through natural language dialogue. It produces structured design artifacts — component specs, design tokens, layout definitions — intended for direct handoff to a coding workflow.

**Key distinction**: Claude Design produces *design intent* (what it should look like, why), not production code. The handoff to Claude Code is where intent becomes implementation.

---

## 2. Artifact Formats

Claude Design exports artifacts in two primary forms:

### Design Token JSON

```json
{
  "tokens": {
    "color": {
      "brand-primary": { "value": "oklch(0.65 0.22 264)", "type": "color" },
      "surface-base": { "value": "oklch(0.98 0.005 264)", "type": "color" },
      "text-primary": { "value": "oklch(0.15 0.01 264)", "type": "color" }
    },
    "spacing": {
      "xs": { "value": "4px", "type": "dimension" },
      "sm": { "value": "8px", "type": "dimension" },
      "md": { "value": "16px", "type": "dimension" },
      "lg": { "value": "24px", "type": "dimension" },
      "xl": { "value": "40px", "type": "dimension" }
    },
    "typography": {
      "heading-xl": { "fontFamily": "Inter", "fontSize": "36px", "fontWeight": "700", "lineHeight": "1.15" },
      "body-md": { "fontFamily": "Inter", "fontSize": "16px", "fontWeight": "400", "lineHeight": "1.6" }
    },
    "radius": {
      "sm": { "value": "4px" },
      "md": { "value": "8px" },
      "lg": { "value": "16px" }
    }
  }
}
```

### Component Specification

```json
{
  "component": "PrimaryButton",
  "intent": "High-emphasis action trigger",
  "variants": ["default", "hover", "active", "disabled"],
  "tokens": {
    "background": "color.brand-primary",
    "text": "color.surface-base",
    "padding": "spacing.sm spacing.md",
    "radius": "radius.md"
  },
  "motion": {
    "hover": "background lightens 8%, 150ms ease-out",
    "active": "scale(0.97), 80ms ease-in"
  },
  "states": {
    "disabled": "opacity: 0.45, cursor: not-allowed"
  }
}
```

---

## 3. Claude Design → Claude Code Handoff Workflow

```
Claude Design session
  ↓ Export artifacts (tokens JSON + component specs)
  ↓
fe-design-expert receives handoff
  ├── 1. Validate token structure and completeness
  ├── 2. Convert tokens to CSS custom properties
  ├── 3. Implement component specs as framework components
  ├── 4. Run AI Slop Test on generated output
  └── 5. Verify motion specs are purposeful, not decorative
```

### Step 1 — Token Validation

Before implementing, `fe-design-expert` checks:

| Check | Pass Condition |
|-------|---------------|
| Color format | OKLCH preferred; hex acceptable with tinting |
| Typography completeness | At least 2 scale levels (heading + body) |
| Spacing system | Consistent multiplier (e.g., 4px base) |
| No pure values | No `#000`, `#fff`, `0px` radius everywhere |

### Step 2 — CSS Custom Properties Conversion

```css
:root {
  /* Colors */
  --color-brand-primary: oklch(0.65 0.22 264);
  --color-surface-base: oklch(0.98 0.005 264);
  --color-text-primary: oklch(0.15 0.01 264);

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 40px;

  /* Typography */
  --font-heading-xl-size: 36px;
  --font-heading-xl-weight: 700;
  --font-heading-xl-line-height: 1.15;
  --font-body-md-size: 16px;
  --font-body-md-line-height: 1.6;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
}
```

### Step 3 — Component Implementation

For each component spec, fe-design-expert maps design intent to framework idioms. The component spec drives the structure; the Impeccable design language guides the aesthetic decisions.

### Step 4 — Slop Test

All handoff implementations pass the [AI Slop Test](../impeccable-design/typography.md) before shipping. Common handoff failures:

- Generic gradient applied without contextual rationale from the spec
- Uniform border radius applied to all elements despite spec differentiation
- Motion added from spec but without checking `prefers-reduced-motion`

---

## 4. fe-design-expert Validation Checklist

When receiving a Claude Design handoff, fe-design-expert verifies:

**Token Integrity**
- [ ] Color values use OKLCH or intentionally tinted hex (no pure neutrals)
- [ ] Spacing values follow a consistent scale (not random)
- [ ] Typography has clear hierarchy (not all the same weight/size)

**Component Fidelity**
- [ ] All variant states from the spec are implemented (hover, active, disabled)
- [ ] Token references in code match the CSS custom property names
- [ ] No hardcoded values where a token exists in the spec

**Motion Verification**
- [ ] Each animation has a functional purpose from the spec intent
- [ ] `prefers-reduced-motion` media query wraps all transitions
- [ ] Duration follows the spec; no arbitrary values

**Slop Check**
- [ ] Would a developer immediately identify this as AI-generated? → Must be NO
- [ ] Are spacing increments varied intentionally, not uniformly 8px everywhere?
- [ ] Does the color palette have at least one intentional tinted neutral?

---

## 5. Common Handoff Issues

| Issue | Symptom | Resolution |
|-------|---------|------------|
| Token name mismatch | CSS var not found in component | Reconcile export names with implementation names |
| Missing states | Hover/disabled not specified | Ask Claude Design to complete the variant set before handoff |
| Motion without context | Animation in spec but no intent stated | Treat as decorative — remove or add functional justification |
| Incomplete spacing system | Gaps between spec tokens and layout needs | Interpolate from the existing scale; do not introduce arbitrary values |
| Font not available | Spec font not on system/CDN | Use the closest available weight/optical size from the same family |

---

## 6. Quick Reference

| Artifact | Format | Handled by |
|----------|--------|-----------|
| Design tokens | JSON → CSS custom properties | fe-design-expert |
| Component specs | JSON → framework components | fe-design-expert |
| Layout definitions | Spatial intent → CSS Grid/Flex | fe-design-expert |
| Motion specs | Timing intent → CSS transitions/animations | fe-design-expert |
| Accessibility requirements | WCAG notes → fe-vercel-agent / web-design-guidelines | fe-vercel-agent |

**Agent handoff**: `fe-design-expert` handles aesthetics and visual implementation. For accessibility compliance and semantic HTML, pass to `fe-vercel-agent` or invoke the `web-design-guidelines` skill.

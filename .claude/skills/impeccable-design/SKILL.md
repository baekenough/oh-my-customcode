---
name: impeccable-design
description: AI design language for production-grade UI — 10 commands covering typography, color, motion, layout, and UX writing quality
scope: core
user-invocable: false
version: 1.0.0
source:
  type: external
  origin: github
  url: https://github.com/pbakaus/impeccable
---

## Purpose

Impeccable is a design language for producing intentional, production-grade UI. It defines a vocabulary of steering commands that guide an AI toward specific design dimensions — typography, color, motion, layout, and UX writing — while actively avoiding the generic patterns associated with AI-generated interfaces.

## Commands

### 10 Selected Commands

| Command | Trigger phrases | Description |
|---------|----------------|-------------|
| **critique** | "review design", "UX feedback" | UX design review: hierarchy, clarity, emotional resonance, and intentionality across the interface |
| **audit** | "design audit", "quality check" | Systematic quality checks across all design dimensions simultaneously |
| **typeset** | "fix fonts", "typography" | Fix font choices, weight contrast, scale, line-height, tracking, and type pairing |
| **colorize** | "add color", "color palette" | Introduce strategic color using OKLCH; construct tinted neutral palettes, avoid pure black/white |
| **animate** | "add motion", "animation" | Add purposeful motion using the 100ms/300ms/500ms rule; eliminate decorative or distracting animation |
| **normalize** | "align design system" | Align output with design system standards: spacing scales, token usage, component consistency |
| **polish** | "final pass", "ship ready" | Pre-ship quality sweep across all design dimensions, including AI slop test |
| **clarify** | "improve copy", "UX writing" | Improve UX copy: labels, microcopy, empty states, error messages, button specificity |
| **arrange** | "fix layout", "spacing" | Fix layout structure, whitespace, alignment, and visual rhythm |
| **adapt** | "responsive", "mobile" | Adapt design decisions for different devices, screen sizes, and input modes |

### Command Detail

#### critique
Holistic UX review. Evaluates information hierarchy, interaction clarity, emotional resonance, and whether design decisions feel intentional. Surfaces both friction points and missed opportunities. Output: prioritized list of issues with impact level (critical / moderate / minor).

#### audit
Systematic multi-dimension check. Runs all other command lenses in sequence and produces a structured report. Use when you need a full picture before starting work. Output: dimension-by-dimension audit with specific findings.

#### typeset
Typography repair. Evaluates and fixes:
- Font family selection (avoid default Inter/Roboto/Arial without rationale)
- Type scale (use modular scale, not arbitrary pixel sizes)
- Weight contrast (body vs. heading vs. label differentiation)
- Line-height and measure (optimal reading width 60-75 chars)
- Letter-spacing for display vs. body contexts
- Font pairing coherence

#### colorize
Color strategy and implementation using OKLCH. Key principles:
- Build tinted neutrals (never pure gray — always a 5-10% hue push)
- Use OKLCH for perceptually uniform lightness steps
- Establish semantic color roles (primary, surface, on-surface, accent, destructive)
- Avoid pure black backgrounds; tint with brand hue at low chroma
- Check color relationships for harmony, not just individual values

#### animate
Motion design with purpose. Core rule — 100/300/500ms:
- 100ms: micro-interactions, state transitions (hover, focus, active)
- 300ms: element entrances, panel transitions, drawer opens
- 500ms: page transitions, complex sequence animations
Avoid: bounce/elastic easing as decoration, animation on load without user trigger, looping animations in primary content areas.
Use: ease-out for entrances, ease-in for exits, linear for progress/loading.

#### normalize
Design system alignment. Enforces:
- Spacing scale usage (4/8/12/16/24/32/48/64 or 4pt grid)
- Border radius consistency (choose a base radius, derive multiples)
- Shadow scale (0-3 elevation levels, not arbitrary per-component)
- Color token usage vs. hardcoded values
- Component variant consistency

#### polish
Pre-ship quality sweep. Runs: typeset + colorize + arrange + AI slop test + final coherence check. Output includes a ship-readiness verdict (ship / ship with minor fixes / needs work).

#### clarify
UX writing improvement. Targets:
- Button labels: specific verbs over generic ("Save changes" not "Submit")
- Empty states: explain what goes here + clear action to fill it
- Error messages: say what happened + what to do (not "An error occurred")
- Tooltips and help text: answer the user's actual question
- Confirmation dialogs: describe the consequence, not the action

#### arrange
Layout and spatial design. Fixes:
- Visual hierarchy via size, weight, and position
- Negative space: increase breathing room between unrelated groups
- Alignment: establish a clear grid baseline
- Proximity: group related elements, separate unrelated ones
- Visual rhythm: consistent incremental spacing within components

#### adapt
Responsive and cross-device adaptation:
- Mobile-first breakpoint strategy
- Touch target sizing (minimum 44x44px)
- Content reflow for narrow viewports
- Progressive disclosure for complex interfaces on mobile
- Pointer vs. touch interaction mode awareness

## AI Slop Test

The AI Slop Test is a critical checkpoint embedded in every `audit` and `polish` command. It must also be run manually on any design output before declaring it complete.

**The question**: Would someone immediately identify this as AI-generated?

### Patterns to Flag as AI Slop

**Typography slop**
- Inter, Roboto, or Arial as the default font with no intentional reason stated
- All text the same weight except headings
- Line-height exactly 1.5 applied universally regardless of font size

**Color slop**
- Pure black (`#000000` or `#0d0d0d`) or pure gray (`#f5f5f5`, `#e5e5e5`) backgrounds without tinting
- One brand color on an otherwise completely neutral palette
- Blue-purple or coral-orange gradients with no contextual rationale

**Layout slop**
- Centered-everything layout that avoids making spatial decisions
- Identical card components with same border-radius, same shadow, and same padding stacked vertically
- Hero section: gradient blob behind centered heading + subheading + two buttons

**Motion slop**
- Bounce or elastic easing used as "delight" with no functional purpose
- Every element animates on page load with staggered delays
- Hover states that scale to 1.05 on every interactive element

**Copy slop**
- Empty states: "[Icon] No [items] yet. [Create button]"
- Error messages: "Something went wrong. Please try again."
- Buttons: "Submit", "Confirm", "OK"
- Tooltips: restate the label they're attached to

### Slop Test Verdict

After running the test, assign one of:
- **Clean**: No slop patterns detected
- **Mild slop**: 1-2 patterns present, easy to fix
- **Heavy slop**: 3+ patterns, requires deliberate design work before ship

## Role Separation

This skill operates in the aesthetic/creative layer. It does not replace technical compliance tooling.

| Design Aspect | impeccable-design (this skill) | web-design-guidelines |
|---------------|-------------------------------|----------------------|
| Typography | Font selection, pairing, type scale, expressive hierarchy | Minimum font sizes (16px body), contrast ratios |
| Color | Palette building, OKLCH, tinted neutrals, emotional resonance | WCAG 2.1 AA/AAA contrast compliance |
| Motion | Purposeful animation, easing curves, timing strategy, felt quality | prefers-reduced-motion compliance, no-animation-on-load |
| Layout | Visual rhythm, spatial design, negative space, hierarchy | Accessibility, semantic HTML structure, ARIA landmarks |
| Copy | Tone, clarity, specificity, label quality | (no overlap) |

**When both apply**: Run `impeccable-design` for aesthetic quality, then `web-design-guidelines` for compliance. They are complementary, not competing.

## Reference Guides

- `guides/impeccable-design/typography.md` — type scale construction, font pairing strategy, hierarchy patterns
- `guides/impeccable-design/color-and-contrast.md` — OKLCH primer, tinted neutral construction, palette strategy
- `guides/impeccable-design/motion-design.md` — 100/300/500ms rule, easing reference, purposeful vs. decorative motion
- `guides/impeccable-design/ux-writing.md` — microcopy patterns, empty state templates, error message formulas

## Execution Flow

```
1. Identify active command(s) from trigger phrase or explicit instruction
2. Read target component/page files
3. Consult relevant reference guides for the active command
4. Apply changes with explicit rationale for each decision
5. Run AI Slop Test on output
6. Report: changes made + slop test verdict + any deferred items
```

# Typography

> Reference: Impeccable Design Language — https://github.com/pbakaus/impeccable (Apache 2.0)

---

## Vertical Rhythm

Vertical rhythm creates visual consistency by spacing elements to a shared baseline grid. The line-height value serves as the foundational unit — every spacing decision derives from it.

### Base unit: 24px

A `line-height` of `1.5` on a `16px` base body font yields a 24px rhythm unit. All vertical spacing — margins, paddings, gaps — should be multiples of this unit.

```css
:root {
  --rhythm: 1.5rem; /* 24px at 16px base */
}

p {
  margin-bottom: var(--rhythm);
}

h2 {
  margin-top: calc(var(--rhythm) * 2);
  margin-bottom: var(--rhythm);
}
```

### Why rhythm matters

- Readers subconsciously detect grid regularity; violations create unease
- Rhythm aligns multi-column layouts at matching baselines
- It simplifies spacing decisions: everything is a multiple, never an arbitrary pixel value

---

## Modular Scale

A modular scale is a sequence of font sizes derived from a ratio. Using a consistent ratio ensures every size feels intentional and related.

### Type scale (rem)

| Token | rem | px (at 16px) | Use |
|-------|-----|--------------|-----|
| `xs` | 0.75rem | 12px | Labels, captions, legal |
| `sm` | 0.875rem | 14px | Secondary text, metadata |
| `base` | 1rem | 16px | Body copy |
| `lg` | 1.25rem | 20px | Large body, intro paragraphs |
| `xl` | 1.5rem | 24px | Small headings (h4, h5) |
| `2xl` | 2rem | 32px | Section headings (h3) |
| `3xl` | 2.5rem | 40px | Page headings (h2) |
| `4xl` | 3rem | 48px | Hero headings (h1) |
| `5xl` | 4rem | 64px | Display, marketing |

### Common ratios

| Name | Ratio | Character |
|------|-------|-----------|
| Major third | 1.25 | Compact, UI-appropriate |
| Perfect fourth | 1.333 | Balanced, most versatile |
| Perfect fifth | 1.5 | Dramatic, large headings |

For dense UIs (dashboards, data tables), prefer major third (1.25). For editorial and marketing pages, perfect fourth or fifth creates more visual contrast.

---

## Measure and Readability

**Measure** is the character count per line. Optimal reading requires a constrained line length.

### Optimal range

- Body text: 55–75 characters per line (use `ch` units)
- Narrow columns (sidebars, captions): 40–50ch
- Maximum: 80ch — beyond this, readers lose their place

```css
.prose {
  max-width: 65ch;
}
```

### Inverse relationship: line-height and line-length

Longer lines require taller line-height to help the eye track from end to start. Shorter lines tolerate tighter spacing.

| Line length | Recommended line-height |
|-------------|------------------------|
| 40–50ch | 1.3–1.4 |
| 55–65ch | 1.5–1.6 |
| 65–80ch | 1.6–1.7 |

### Dark mode adjustment

Light text on dark backgrounds appears to bleed optically, compressing perceived spacing. Add 0.05–0.1 to your line-height in dark mode:

```css
@media (prefers-color-scheme: dark) {
  body {
    line-height: 1.65; /* was 1.5 in light mode */
  }
}
```

---

## Font Selection

### Avoid overused fonts

These fonts are technically excellent but so ubiquitous that they signal "default" rather than considered design:

- Inter
- Roboto
- Open Sans
- Lato
- Montserrat

### Recommended alternatives (Google Fonts / free)

| Font | Character | Best for |
|------|-----------|----------|
| Instrument Sans | Clean, modern humanist | SaaS products, dashboards |
| Plus Jakarta Sans | Friendly, geometric | Consumer apps |
| Outfit | Geometric, tech-forward | AI and developer tools |
| Onest | Legible, neutral | Data-dense interfaces |
| Figtree | Rounded, approachable | Consumer-facing products |
| Urbanist | Minimal, spacious | Design-forward marketing |
| Source Sans 3 | Workhorse, wide language support | Internationalizable products |
| Nunito Sans | Warm, rounded | Educational, onboarding |
| DM Sans | Crisp, professional | B2B SaaS |

---

## Font Pairing

### One family, varied weights (preferred)

Using one versatile family with Light (300), Regular (400), Medium (500), Semibold (600), and Bold (700) weights avoids the cognitive load of managing two typefaces. The weight contrast alone provides sufficient hierarchy.

```css
:root {
  --font-body: 'Instrument Sans', sans-serif;
  /* No secondary font needed */
}

h1 { font-weight: 700; }
h2 { font-weight: 600; }
body { font-weight: 400; }
.label { font-weight: 500; }
```

### When to use two families

Only add a second typeface when you need to distinguish structurally different content — for example, a serif for editorial body copy and a sans-serif for UI chrome. Mixing two sans-serifs rarely adds value.

### Pairing rules

- Never mix two geometric sans-serifs (e.g., Outfit + Montserrat) — too similar
- Pair by contrast: geometric + humanist, serif + sans-serif
- Keep the secondary typeface to one weight if possible

---

## Web Font Loading

Poor font loading causes layout shift and flash of unstyled text. Apply all three techniques together.

### font-display: swap

```css
@font-face {
  font-family: 'Instrument Sans';
  src: url('/fonts/instrument-sans.woff2') format('woff2');
  font-display: swap;
}
```

`swap` renders immediately with fallback, then swaps in the loaded font. Preferred for body text.

### size-adjust

Adjust the fallback font's scale to match the web font's metrics, reducing layout shift when the swap occurs:

```css
@font-face {
  font-family: 'Instrument Sans Fallback';
  src: local('Arial');
  size-adjust: 104%; /* match cap-height of Instrument Sans */
  ascent-override: 90%;
  descent-override: 25%;
  line-gap-override: 0%;
}
```

### Fontaine (automated fallback generation)

The [Fontaine](https://github.com/unjs/fontaine) library automatically generates accurate fallback metrics for common web fonts. Use it in Vite/Nuxt/Next.js build pipelines to eliminate manual metric calculation.

```js
// vite.config.ts
import { fontaine } from 'vite-plugin-fontaine'

export default {
  plugins: [fontaine()]
}
```

### Preloading critical fonts

Preload the font file for your primary body weight to eliminate FOUT on first paint:

```html
<link rel="preload" href="/fonts/instrument-sans-400.woff2" as="font" type="font/woff2" crossorigin>
```

---

## Fluid Typography

Fluid typography scales smoothly between a minimum and maximum size across a viewport range, replacing breakpoint-based font size overrides.

### clamp() syntax

```css
font-size: clamp(min, preferred, max);
```

- `min`: smallest size (used below the lower viewport bound)
- `preferred`: `vw`-based interpolation expression
- `max`: largest size (used above the upper viewport bound)

### Heading example

```css
h1 {
  /* Scales from 2rem at 320px viewport to 4rem at 1280px viewport */
  font-size: clamp(2rem, 1.25rem + 3.75vw, 4rem);
}

h2 {
  font-size: clamp(1.5rem, 1rem + 2.5vw, 2.5rem);
}
```

### When NOT to use fluid type

For data-dense UIs — tables, forms, dashboards, code editors — fixed `rem` values are preferable. Fluid scaling in data contexts can create unexpected layout shifts and misalignment.

### Generating clamp values

Use [Utopia.fyi](https://utopia.fyi/) to generate a complete fluid type scale with mathematically correct clamp values for any scale ratio and viewport range.

---

## OpenType Features

OpenType features improve readability and professional finish in specific contexts. Apply via `font-variant-*` or `font-feature-settings`.

### Tabular numbers (critical for data UIs)

Ensures all digits are the same width, preventing column misalignment in tables and dashboards:

```css
.metric, td, .price {
  font-variant-numeric: tabular-nums;
}
```

### Diagonal fractions

Renders `1/2` as a proper fraction glyph rather than three separate characters:

```css
.fraction {
  font-variant-numeric: diagonal-fractions;
}
```

### Small caps

Avoids the "shouting" effect of all-caps labels while maintaining visual differentiation:

```css
.label-caps {
  font-variant-caps: all-small-caps;
}
```

### Disable ligatures in code

Ligatures in code fonts (like `fi`, `fl`, or code-specific `=>` ligatures) can confuse readers who need to see exact characters:

```css
code, pre, .monospace {
  font-variant-ligatures: none;
  /* or explicitly: */
  font-feature-settings: 'liga' 0, 'calt' 0;
}
```

---

## Design Tokens

Use semantic token names that describe purpose, never raw values. This enables theming, dark mode, and systematic changes.

### Token naming pattern

```css
:root {
  /* Semantic: describes purpose */
  --text-body: oklch(25% 0.01 250);
  --text-heading: oklch(15% 0.01 250);
  --text-muted: oklch(50% 0.01 250);
  --text-disabled: oklch(65% 0.01 250);
  --text-inverse: oklch(98% 0.01 250);
  --text-link: oklch(50% 0.15 250);
  --text-danger: oklch(45% 0.2 25);
  --text-success: oklch(40% 0.15 145);

  /* Size tokens */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
}
```

### Anti-patterns

```css
/* WRONG: value-based names break when values change */
--text-gray-500: #6b7280;
--font-16: 16px;

/* CORRECT: semantic names survive redesigns */
--text-body: oklch(45% 0.01 250);
--text-base: 1rem;
```

---

## Accessibility

Typography accessibility ensures content is readable by users with visual impairments and those who rely on zoom or assistive technology.

### Preserve zoom

Never disable text scaling. Use `rem` and `em` for all font sizes — never `px` for body text:

```css
/* WRONG: fixed pixels block zoom */
body { font-size: 14px; }

/* CORRECT: scales with user preferences */
body { font-size: 1rem; }
```

### Minimum sizes

| Element | Minimum |
|---------|---------|
| Body text | 16px (1rem) |
| Secondary/caption | 12px (0.75rem) minimum, 14px preferred |
| Touch targets | 44px × 44px minimum (not typography, but related to readability) |

### Zoom testing

Test at 200% and 400% browser zoom. Text should reflow, not overflow, at all zoom levels. Use `overflow-wrap: break-word` and `min-width: 0` on flex/grid children to prevent overflow.

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| More than 2–3 font families | Visual noise, slow loading, hard to maintain | Use weight variation within one family |
| Missing fallback stack | FOUT causes layout shift, bad UX in poor connections | Always include system fallbacks |
| Decorative fonts for body copy | Fatigue, poor legibility at small sizes | Decorative fonts for headings only |
| Pixel-based font sizes | Breaks user zoom preference, accessibility fail | Use rem/em |
| Line-height below 1.4 for body | Eye-strain, poor legibility | 1.5–1.6 for body, never below 1.3 |
| No type scale system | Arbitrary sizes, inconsistent hierarchy | Commit to a modular scale |
| Ignoring letter-spacing | Tight tracking at large sizes, loose at small | `letter-spacing: -0.02em` for headings, default for body |

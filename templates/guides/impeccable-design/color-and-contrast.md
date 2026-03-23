# Color and Contrast

> Reference: Impeccable Design Language — https://github.com/pbakaus/impeccable (Apache 2.0)

---

## OKLCH: The Preferred Color Model

OKLCH (Oklab Lightness, Chroma, Hue) is a perceptually uniform color space. Unlike HSL, equal numeric changes in OKLCH produce equal perceived differences — making it the right tool for generating accessible, harmonious palettes programmatically.

### Structure

```
oklch(lightness% chroma hue)
```

| Channel | Range | Description |
|---------|-------|-------------|
| `lightness` | 0%–100% | Perceived brightness |
| `chroma` | 0–0.4 (approx) | Color saturation/vividness |
| `hue` | 0–360 | Color angle (red=25, yellow=90, green=145, cyan=200, blue=250, purple=310) |

### Why not HSL?

HSL's lightness channel is not perceptually uniform. A blue at `hsl(250, 70%, 50%)` and a yellow at `hsl(60, 70%, 50%)` have the same numeric lightness but very different perceived brightness. This makes HSL palettes that "look right" on the screen require constant manual tuning.

OKLCH fixes this: a blue at `oklch(50% 0.15 250)` and a yellow at `oklch(50% 0.15 90)` appear equally bright.

### Browser support

OKLCH is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+). For legacy support, provide an HSL fallback:

```css
color: hsl(250, 60%, 40%); /* fallback */
color: oklch(40% 0.15 250); /* modern */
```

---

## Chroma Constraints

### Reduce chroma near white and black extremes

At very high or very low lightness values, maximum chroma cannot be rendered — the color clips to the display gamut. Reduce chroma as lightness approaches 0% or 100%:

| Lightness range | Max chroma (approx) |
|-----------------|---------------------|
| 10%–20% | 0.04–0.08 |
| 20%–40% | 0.08–0.20 |
| 40%–60% | 0.15–0.35 |
| 60%–80% | 0.10–0.25 |
| 80%–95% | 0.03–0.10 |

Check rendered output with [OKLCH.com](https://oklch.com/) — the gamut boundary is shown visually.

---

## Neutrals: Tinted, Not Pure Gray

Pure grays (chroma 0) appear cold and disconnected from the UI's color palette. Tinting neutrals with a low-chroma version of the brand hue creates cohesion.

### Formula

Use the brand hue with chroma 0.01–0.02 for neutrals:

```css
:root {
  /* Brand hue: 250 (blue) */
  --neutral-900: oklch(12% 0.01 250);
  --neutral-800: oklch(20% 0.01 250);
  --neutral-700: oklch(30% 0.01 250);
  --neutral-600: oklch(40% 0.01 250);
  --neutral-500: oklch(50% 0.01 250);
  --neutral-400: oklch(60% 0.01 250);
  --neutral-300: oklch(72% 0.01 250);
  --neutral-200: oklch(84% 0.01 250);
  --neutral-100: oklch(93% 0.01 250);
  --neutral-50:  oklch(97% 0.01 250);
}
```

### Temperature

| Hue angle | Temperature | Effect |
|-----------|-------------|--------|
| ~60° | Warm | Approachable, editorial |
| ~250° | Cool | Technical, precise, professional |

Warm neutrals (cream, off-white) suit consumer and lifestyle products. Cool neutrals suit developer tools, dashboards, and data products.

---

## Palette Architecture

### Components

| Component | Count | Purpose |
|-----------|-------|---------|
| Primary | 1 color, 3–5 shades | Brand identity, CTAs, interactive elements |
| Neutral | 9–11 shades | Backgrounds, borders, text |
| Semantic | 4 colors (success, warning, danger, info), 2–3 shades each | State communication |
| Surface | 2–3 variants | Background layering (base, raised, overlay) |

### Primary palette (5 shades)

```css
:root {
  --primary-50:  oklch(95% 0.05 250);  /* tint, hover backgrounds */
  --primary-200: oklch(80% 0.10 250);  /* light states */
  --primary-500: oklch(55% 0.20 250);  /* primary action */
  --primary-700: oklch(38% 0.18 250);  /* pressed, dark variant */
  --primary-900: oklch(22% 0.12 250);  /* text on light bg */
}
```

### Semantic palette

```css
:root {
  /* Success */
  --success-light: oklch(92% 0.06 145);
  --success:       oklch(50% 0.18 145);
  --success-dark:  oklch(35% 0.15 145);

  /* Warning */
  --warning-light: oklch(93% 0.08 85);
  --warning:       oklch(65% 0.20 85);
  --warning-dark:  oklch(45% 0.18 85);

  /* Danger */
  --danger-light:  oklch(93% 0.06 25);
  --danger:        oklch(50% 0.20 25);
  --danger-dark:   oklch(35% 0.18 25);

  /* Info */
  --info-light:    oklch(93% 0.05 230);
  --info:          oklch(52% 0.18 230);
  --info-dark:     oklch(38% 0.16 230);
}
```

---

## The 60-30-10 Rule

Visual weight should be distributed to create hierarchy without chaos:

| Proportion | Role | Example |
|------------|------|---------|
| 60% | Dominant (neutral backgrounds) | Page background, card surfaces |
| 30% | Secondary (supporting) | Sidebar, navigation, secondary panels |
| 10% | Accent (brand, CTAs) | Buttons, links, highlights, icons |

Violating this ratio — for example, a 40% brand-color background — overwhelms the interface and makes it harder to identify interactive elements.

---

## WCAG Contrast Requirements

Contrast ratio is calculated between foreground and background luminance. Use a contrast checker to verify all text/background combinations.

### Minimum ratios

| Element | WCAG AA | WCAG AAA |
|---------|---------|----------|
| Body text (< 18px / < 14px bold) | 4.5:1 | 7:1 |
| Large text (≥ 18px / ≥ 14px bold) | 3:1 | 4.5:1 |
| UI components (borders, icons, input outlines) | 3:1 | 4.5:1 |

### Practical targets

- Body text: aim for 7:1 (AAA) — the difference in effort is minimal and accessibility is significantly better
- Large headings: 4.5:1 minimum
- Placeholder text: WCAG requires 4.5:1; placeholders are not exempt despite their decorative role
- Disabled elements: WCAG exempts disabled controls from contrast requirements, but aim for 3:1 as a courtesy

### Anti-patterns

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| Light gray text on white | Classic failure — looks designed, fails AA | Use `oklch(45% 0.01 250)` on white for safe gray |
| Gray text on colored background | Double unpredictability — two variables affecting contrast | Test with a contrast checker, not by eye |
| Red on green | Colorblind failure (deuteranopia/protanopia) | Add pattern or icon; do not rely on color alone |
| Blue on red | Chromatic aberration causes vibration | Add lightness contrast; avoid hue-only contrast |
| Yellow on white | Low contrast despite perceived brightness | Yellow on white fails AA unless very dark yellow |
| Thin text over images | Impossible to guarantee; background varies | Add text shadow, overlay panel, or blur backdrop |

### Testing tools

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Chrome DevTools: Elements panel → Accessibility → Contrast
- Firefox DevTools: Accessibility panel
- Polypane: Built-in contrast checking across all breakpoints

---

## No Pure Gray or Black

Pure grays (`oklch(N% 0 0)` or `#808080`) read as cold and disconnected. Tinted grays integrate into the palette.

### Rule: chroma 0.005–0.01 minimum

```css
/* WRONG: pure gray */
color: oklch(50% 0 0);

/* CORRECT: tinted neutral */
color: oklch(50% 0.01 250);
```

### No pure black

`#000000` or `oklch(0% 0 0)` is rarely appropriate. High contrast without tint creates harshness. Instead:

```css
/* WRONG */
--text-primary: #000000;

/* CORRECT: near-black with subtle tint */
--text-primary: oklch(12% 0.01 250);
```

---

## Dark Mode

Dark mode is NOT a color inversion. Inversion breaks contrast relationships and produces garish results. Instead, dark mode requires thoughtfully redesigned color relationships.

### Principles

**Lighter surfaces indicate depth.** In light mode, shadows indicate elevation. In dark mode, lighter backgrounds indicate elevation:

| Elevation | Light mode | Dark mode |
|-----------|-----------|-----------|
| Page background | Lightest | Darkest |
| Card | +shadow | Slightly lighter |
| Modal/overlay | +deeper shadow | Lighter still |
| Tooltip | Darkest shadow | Lightest surface |

**Slightly desaturated accents.** Saturated colors are harder to look at on dark backgrounds for extended periods. Reduce chroma by 0.02–0.04:

```css
@media (prefers-color-scheme: dark) {
  --primary-500: oklch(62% 0.16 250); /* was 0.20 in light mode */
}
```

**Dark gray, never pure black.** Use 12–18% lightness for the base background:

```css
@media (prefers-color-scheme: dark) {
  --surface-base:    oklch(14% 0.01 250); /* main background */
  --surface-raised:  oklch(18% 0.01 250); /* cards */
  --surface-overlay: oklch(22% 0.01 250); /* modals */
}
```

**Redefine semantic tokens, do not invert them.** Semantic tokens exist precisely for this purpose:

```css
:root {
  --text-body:    oklch(25% 0.01 250);
  --text-muted:   oklch(50% 0.01 250);
  --bg-base:      oklch(98% 0.01 250);
}

@media (prefers-color-scheme: dark) {
  --text-body:    oklch(90% 0.01 250);
  --text-muted:   oklch(65% 0.01 250);
  --bg-base:      oklch(14% 0.01 250);
}
```

### Dark mode testing

- DevTools: Rendering panel → Emulate CSS media feature prefers-color-scheme
- Test WCAG contrast ratios in dark mode independently — they differ from light mode
- Test with vision emulation filters (protanopia, deuteranopia, achromatopsia) in DevTools

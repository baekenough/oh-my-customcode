# Motion Design

> Reference: Impeccable Design Language — https://github.com/pbakaus/impeccable (Apache 2.0)

---

## The 100/300/500 Rule

Animation duration should match the conceptual weight of the change. Too fast and users miss feedback; too slow and the interface feels sluggish.

### Duration tiers

| Tier | Duration | Use cases |
|------|----------|-----------|
| Feedback | 100–150ms | Button press, checkbox toggle, hover state, ripple |
| State change | 200–300ms | Dropdown open, tooltip appear, tab switch, accordion |
| Structural | 300–500ms | Page transition, modal open, sidebar expand |
| Entry / onboarding | 500–800ms | Hero animations, first-run sequences, loading complete |

### Exit animations are shorter

Elements leaving the screen should animate out at roughly 75% of their entrance duration. The user's attention has already moved on:

```css
.modal-enter { animation-duration: 300ms; }
.modal-exit  { animation-duration: 225ms; } /* 75% of 300ms */

.dropdown-enter { animation-duration: 200ms; }
.dropdown-exit  { animation-duration: 150ms; }
```

---

## Easing Functions

Generic browser easings (`ease`, `ease-in`, `ease-out`, `ease-in-out`) are functional but imprecise. Custom cubic-bezier curves produce more polished results.

### The three essential curves

**Ease-out** — for elements appearing on screen (entering, expanding):
```css
/* Fast start, gentle landing */
animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
```

**Ease-in** — for elements leaving screen (exiting, collapsing):
```css
/* Gradual acceleration, fast exit */
animation-timing-function: cubic-bezier(0.7, 0, 0.84, 0);
```

**Ease-in-out** — for bidirectional transitions (sliding between states):
```css
/* Symmetrical: slow start, fast middle, slow end */
animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
```

### Exponential curves (more expressive)

| Curve | CSS | Character |
|-------|-----|-----------|
| Quart-out | `cubic-bezier(0.25, 1, 0.5, 1)` | Smooth default, good for most UI |
| Quint-out | `cubic-bezier(0.22, 1, 0.36, 1)` | Dramatic, large structural changes |
| Expo-out | `cubic-bezier(0.16, 1, 0.3, 1)` | Snappy, high-energy feedback |

### CSS custom properties for easing tokens

```css
:root {
  --ease-out:     cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:      cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring:  cubic-bezier(0.25, 1, 0.5, 1);
}
```

### Anti-pattern: bounce and elastic

Bounce and elastic easings were popular in the early 2010s. They now read as amateurish and dated. They also perform poorly for accessibility (vestibular disorders). Do not use them:

```css
/* WRONG: dated, amateurish */
animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot */

/* CORRECT: expo-out is energetic without bouncing */
animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
```

---

## Performance: Only Animate transform and opacity

Layout-triggering properties (`width`, `height`, `top`, `left`, `margin`, `padding`) force the browser to recalculate layout on every frame — expensive and jank-prone. Only `transform` and `opacity` skip layout and paint, running entirely on the GPU compositor.

### Safe properties

```css
/* CORRECT: compositor-only, 60fps */
.panel { transform: translateX(-100%); opacity: 0; }
.panel.open { transform: translateX(0); opacity: 1; }
```

### Avoid layout-triggering animations

```css
/* WRONG: triggers layout recalculation every frame */
.panel { left: -300px; }
.panel.open { left: 0; }

/* WRONG: forces paint */
.card { background-color: #fff; }
.card:hover { background-color: #f5f5f5; } /* fine for hover, bad inside keyframes */
```

### Animating height with CSS grid

Animating `height: 0` to `height: auto` is a common requirement (accordion, expand/collapse) that cannot use `transform` directly. The cleanest CSS-only solution uses `grid-template-rows`:

```css
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 250ms var(--ease-out);
}

.accordion-content.open {
  grid-template-rows: 1fr;
}

.accordion-content > div {
  overflow: hidden; /* required for 0fr to clip content */
}
```

---

## Staggered Animations

Staggering applies progressively increasing delays to a list of elements, creating a wave effect. It communicates that items belong together while adding visual interest.

### CSS custom properties approach

```css
.list-item {
  animation: fade-up 300ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 50ms);
}
```

Set `--i` on each element:

```html
<li class="list-item" style="--i: 0">First</li>
<li class="list-item" style="--i: 1">Second</li>
<li class="list-item" style="--i: 2">Third</li>
```

Or set it in JavaScript:

```js
document.querySelectorAll('.list-item').forEach((el, i) => {
  el.style.setProperty('--i', i);
});
```

### Cap total stagger duration at 500ms

A list of 20 items staggered at 50ms each takes 1000ms to complete — too long. Cap the maximum total delay:

```css
animation-delay: calc(min(var(--i), 8) * 50ms); /* max 400ms total */
```

Or limit at the last item: stagger interval × item count should not exceed 500ms.

---

## Accessibility: prefers-reduced-motion

Approximately 35% of adults over 40 have vestibular disorders that can be triggered by parallax, sliding transitions, and spinning elements. The `prefers-reduced-motion` media query is not optional.

### User statistics

This is not a fringe case. `prefers-reduced-motion: reduce` affects a significant portion of users — including those who enable it for performance reasons on low-power devices.

### Replace spatial motion with crossfades

The principle: preserve the informational purpose of the animation while removing the vestibular trigger.

```css
@keyframes slide-in {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.panel {
  animation: slide-in 300ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: fade-in 150ms linear; /* shorter, opacity-only */
  }
}
```

### Preserve functional animations

Some animations communicate state changes that users need (progress bars, loading spinners, form validation). These should be preserved even for reduced-motion users — reduce their speed and intensity, do not eliminate them:

```css
@media (prefers-reduced-motion: reduce) {
  .spinner {
    /* Slow down, keep the spin so user knows loading is happening */
    animation-duration: 2s;
  }

  .progress-bar {
    /* Shorten transition but keep it */
    transition-duration: 50ms;
  }
}
```

### Global reset approach

A pragmatic approach for existing codebases:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This is a blunt instrument. Prefer targeted overrides where functional animations need preservation.

---

## Perceived Performance

Animation can make interfaces feel faster even when task completion time is identical. These techniques exploit how the brain perceives wait time.

### The 80ms threshold

Users perceive delays under 80ms as instantaneous. Responses between 80–100ms feel slightly delayed but acceptable. Above 200ms, users consciously notice the wait.

Design principle: use the delay budget wisely. If a backend call takes 300ms, an optimistic UI update at 0ms prevents the user from ever perceiving the delay.

### Active vs passive waiting

A spinner saying "Loading..." is passive waiting — the user is frozen. A progress bar, animated skeleton screen, or optimistic UI update is active — the user feels progress is happening.

- Skeleton screens reduce perceived wait time by 10–30% compared to blank space
- Content that appears progressively (top to bottom) feels faster than all-at-once reveals

### Preemptive transitions

Start a transition before the user's action completes. Hover states that begin animating at hover start (not click) make actions feel faster:

```css
.button {
  transition: background-color 150ms var(--ease-out),
              transform 100ms var(--ease-out);
}

.button:hover {
  /* Animate on hover, not just on click */
  background-color: var(--primary-600);
  transform: translateY(-1px);
}

.button:active {
  transform: translateY(0);
  transition-duration: 50ms;
}
```

### Optimistic UI

Update the UI immediately on user action, then sync with the server. Show the final state first and roll back only on error:

```js
// Optimistic update pattern
async function toggleLike(postId) {
  // 1. Update UI immediately
  setLiked(true);
  setCount(prev => prev + 1);

  try {
    // 2. Sync with server
    await api.like(postId);
  } catch {
    // 3. Roll back on failure
    setLiked(false);
    setCount(prev => prev - 1);
    showError('Could not save — please try again');
  }
}
```

---

## Performance Implementation

### will-change: use on trigger, not permanently

`will-change` promotes an element to its own GPU layer. Overuse wastes GPU memory and can slow rendering:

```css
/* WRONG: always promoted, wastes GPU memory */
.card { will-change: transform; }

/* CORRECT: promote only when animation is about to happen */
.card:hover { will-change: transform; }

/* Or in JS: add/remove on animation start/end */
el.addEventListener('mouseenter', () => el.style.willChange = 'transform');
el.addEventListener('animationend', () => el.style.willChange = 'auto');
```

### Intersection Observer for scroll animations

Never use scroll event listeners for animation triggers — they fire on every scroll event and block the main thread. Use `IntersectionObserver`:

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target); // stop observing once triggered
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
```

### Motion tokens

Centralize all durations and easings as tokens to enable systematic changes and theming:

```css
:root {
  /* Duration */
  --duration-fast:      100ms;
  --duration-normal:    200ms;
  --duration-slow:      350ms;
  --duration-deliberate: 500ms;

  /* Easing */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);
  --ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);

  /* Reduce motion override */
  --duration-motion-safe: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-motion-safe: 0.01ms;
  }
}
```

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| Animating everything | Dilutes meaning; users stop noticing what's important | Reserve motion for state changes that need emphasis |
| Feedback animation > 500ms | Feels broken; user re-clicks, creates double-trigger bugs | Keep feedback under 200ms |
| No reduced-motion support | Triggers vestibular disorders for ~35% of adults over 40 | Always implement `prefers-reduced-motion` |
| Bounce and elastic easing | Dated, amateurish, vestibular risk | Use expo-out for energy |
| `left`/`top`/`height` in keyframes | Triggers layout recalc every frame, causes jank | Use `transform` + `opacity` only |
| Stagger > 500ms total | Users wait for the list to finish before acting | Cap at 500ms total stagger |
| `will-change` on static elements | Wastes GPU memory, can slow render | Apply only during/before animation |
| Scroll listener for animations | Blocks main thread, causes jank | Use `IntersectionObserver` |

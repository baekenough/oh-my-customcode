# Accessibility Best Practices

> Reference guide for web-design-guidelines skill

## Core Principles

### WCAG 2.1 Compliance
```
Level A: Minimum accessibility
Level AA: Standard compliance (recommended)
Level AAA: Enhanced accessibility
```

### POUR Principles
```
Perceivable: Content available to senses
Operable: Interface navigable
Understandable: Clear and predictable
Robust: Works across technologies
```

## Quick Reference

### Color Contrast
```
Normal text: 4.5:1 minimum
Large text: 3:1 minimum
UI components: 3:1 minimum
```

### Keyboard Navigation
```
Tab: Move forward
Shift+Tab: Move backward
Enter/Space: Activate
Escape: Close/Cancel
Arrow keys: Navigate within component
```

### ARIA Landmarks
```html
<header role="banner">
<nav role="navigation">
<main role="main">
<aside role="complementary">
<footer role="contentinfo">
```

### Common ARIA Attributes
```html
aria-label="Description"
aria-labelledby="element-id"
aria-describedby="description-id"
aria-hidden="true|false"
aria-expanded="true|false"
aria-selected="true|false"
aria-live="polite|assertive"
```

## Testing Tools

- axe DevTools
- WAVE
- Lighthouse
- VoiceOver (macOS)
- NVDA (Windows)

---
title: "Impeccable Design Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/impeccable-design/color-and-contrast.md
related:
  - [[fe-design-expert]]
  - [[impeccable-design]]
---

# Impeccable Design Guide

Reference documentation for the Impeccable Design Language — a production-quality AI design system for UI code generation.

## Overview

Based on the open-source Impeccable design language (Apache 2.0), this guide covers perceptually uniform color with OKLCH, contrast ratios for WCAG compliance, tinted neutrals, typography scale, spacing systems, and component design patterns. Used by `fe-design-expert` and the `impeccable-design` skill for production UI code generation.

## Key Topics

- OKLCH color model: lightness, chroma, hue channels and why it beats HSL
- Chroma constraints near white/black extremes to avoid gamut clipping
- Tinted neutrals with low-chroma brand hue for palette cohesion
- WCAG contrast ratios: 4.5:1 normal text, 3:1 large text/UI
- CSS custom properties for design tokens
- Browser support and HSL fallback patterns

## Relationships

- **Used by agents**: [[fe-design-expert]]
- **Related skills**: [[impeccable-design]], [[web-design-guidelines]]
- **See also**: [[web-design]], [[elements-of-style]]

## Sources

- `guides/impeccable-design/color-and-contrast.md` — OKLCH model, chroma constraints, tinted neutrals

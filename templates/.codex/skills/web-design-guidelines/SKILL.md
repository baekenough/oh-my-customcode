---
name: web-design-guidelines
description: UI code review with 100+ rules for accessibility, performance, and UX
user-invocable: false
---

## When to Use

- UI code review
- Accessibility audit
- Design consistency check
- UX best practices verification

## Command Triggers

- "Review UI"
- "Check accessibility"
- "Design audit"
- "Verify best practices"

## Categories

### ARIA Labels
```
- All interactive elements have labels
- Proper role attributes
- aria-live for dynamic content
- Descriptive aria-describedby
```

### Focus States
```
- Visible focus indicators
- Logical focus order
- Focus trapping in modals
- Skip links for navigation
```

### Form Validation
```
- Inline error messages
- Accessible error announcements
- Clear input requirements
- Proper label associations
```

### Animations
```
- Respect prefers-reduced-motion
- Meaningful animations only
- Performance-optimized transforms
- No animation on load
```

### Typography
```
- Readable font sizes (16px min)
- Proper line height (1.5+)
- Sufficient color contrast
- Responsive text scaling
```

### Images
```
- Alt text for all images
- Decorative images marked
- Responsive images
- Lazy loading implemented
```

### Performance
```
- Minimize layout shifts
- Optimize largest contentful paint
- Reduce time to interactive
- Efficient CSS selectors
```

### Navigation
```
- Keyboard accessible
- Clear current state
- Consistent patterns
- Breadcrumbs where needed
```

### Dark Mode
```
- System preference detection
- Smooth transitions
- Consistent color tokens
- Image adjustments
```

### Touch Interaction
```
- Minimum 44px touch targets
- Appropriate spacing
- Gesture alternatives
- Haptic feedback consideration
```

### i18n
```
- RTL support
- Text expansion room
- Locale-aware formatting
- Translation-ready strings
```

## Execution Flow

```
1. Scan UI components
2. Check against category rules
3. Report violations
4. Suggest fixes
```

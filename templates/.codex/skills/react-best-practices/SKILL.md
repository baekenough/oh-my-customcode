---
name: react-best-practices
description: React/Next.js performance optimization with 40+ rules in 8 categories
user-invocable: false
---

## When to Use

- Writing React/Next.js components
- Data fetching implementation
- Performance review
- Bundle size optimization

## Categories by Priority

### Critical Priority

#### Waterfall Elimination
```
- Avoid sequential data fetching
- Use parallel data fetching
- Implement proper loading states
- Prefetch critical data
```

#### Bundle Optimization
```
- Minimize client-side JavaScript
- Use dynamic imports
- Tree-shake unused code
- Analyze bundle with tools
```

### High Priority

#### Server-Side Performance
```
- Use Server Components by default
- Minimize 'use client' directives
- Implement streaming where possible
- Cache server responses
```

### Medium-High Priority

#### Client-Side Fetching
```
- Use SWR or React Query
- Implement optimistic updates
- Handle loading/error states
- Cache API responses
```

### Medium Priority

#### Rendering
```
- Avoid unnecessary re-renders
- Use React.memo strategically
- Implement useMemo/useCallback properly
- Virtualize long lists
```

#### Caching
```
- Implement proper cache headers
- Use ISR for dynamic content
- Cache database queries
- CDN caching strategies
```

#### Code Splitting
```
- Split by route
- Lazy load below-fold content
- Dynamic import heavy libraries
- Preload critical chunks
```

### Low-Medium Priority

#### Image Optimization
```
- Use next/image
- Implement proper sizing
- Use modern formats (WebP, AVIF)
- Lazy load off-screen images
```

## Execution Flow

```
1. Identify optimization area
2. Check relevant category rules
3. Apply recommendations
4. Verify improvements
```

## Scripts

See `scripts/` directory for automation helpers.

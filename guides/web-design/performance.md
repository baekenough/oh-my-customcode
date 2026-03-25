# Performance Guidelines

> Reference guide for react-best-practices skill

## Core Web Vitals

### LCP (Largest Contentful Paint)
```
Good: < 2.5s
Needs improvement: 2.5s - 4s
Poor: > 4s
```

### FID (First Input Delay)
```
Good: < 100ms
Needs improvement: 100ms - 300ms
Poor: > 300ms
```

### CLS (Cumulative Layout Shift)
```
Good: < 0.1
Needs improvement: 0.1 - 0.25
Poor: > 0.25
```

## Optimization Strategies

### JavaScript
```
- Code splitting
- Tree shaking
- Lazy loading
- Minimize main thread work
```

### Images
```
- Modern formats (WebP, AVIF)
- Responsive images
- Lazy loading
- Proper sizing
```

### CSS
```
- Critical CSS inline
- Defer non-critical
- Remove unused
- Minimize specificity
```

### Fonts
```
- font-display: swap
- Preload critical fonts
- Subset fonts
- System font fallback
```

## Next.js Specific

### Server Components
```tsx
// Default: Server Component (no directive)
export default function Page() {
  return <div>Server rendered</div>
}
```

### Client Components
```tsx
'use client'
// Only when needed for interactivity
export default function Button() {
  return <button onClick={...}>Click</button>
}
```

### Data Fetching
```tsx
// Server: fetch in component
async function Page() {
  const data = await fetch(...)
  return <div>{data}</div>
}

// Client: use SWR/React Query
'use client'
function Component() {
  const { data } = useSWR('/api/data', fetcher)
  return <div>{data}</div>
}
```

## Measurement Tools

- Lighthouse
- WebPageTest
- Chrome DevTools Performance
- Next.js Analytics

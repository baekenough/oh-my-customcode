# [MAY] Optimization Guide

> **Priority**: MAY - Optional
> **Apply when**: Basic functionality is stable

## Efficiency Optimization

### Parallel Processing
```
Apply when:
- 3+ independent tasks
- Each task is I/O bound

Example:
- Read multiple files simultaneously
- Run independent searches in parallel
```

### Caching
```
Apply when:
- Same data accessed repeatedly
- Data changes infrequently

Example:
- Cache file contents
- Reuse search results
```

### Lazy Loading
```
Apply when:
- Large datasets
- Only portion actually used

Example:
- Read only needed files
- Stream results
```

## Token Optimization

### Context Management
```
✓ Include only necessary info
✓ Remove duplicates
✓ Use summaries
```

### Response Optimization
```
✓ Concise expressions
✓ Minimize code blocks
✓ Remove unnecessary repetition
```

## Task Optimization

### Batch Processing
```
Group similar tasks together
Example: Edit 10 files → Process at once
```

### Incremental Processing
```
Process only changed parts
Example: Full build → Incremental build
```

## Apply Criteria

### Do Optimize
```
✓ Repetitive tasks
✓ Clear performance bottleneck
✓ Measurable improvement
```

### Don't Optimize
```
✗ One-time tasks
✗ Already fast enough
✗ Complexity increase outweighs benefit
```

## Caution

```
⚠ Premature optimization is root of evil
⚠ Readability > Optimization
⚠ No optimization without measurement
```

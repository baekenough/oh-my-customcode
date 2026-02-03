---
name: optimize-bundle
description: Apply bundle size optimizations
argument-hint: "[--dry-run] [--safe]"
disable-model-invocation: true
---

# Bundle Optimization Skill

Apply bundle size optimizations to reduce build output and improve performance.

## Options

```
--dry-run        Show what would be changed without applying
--safe           Only apply safe, reversible optimizations
```

## Workflow

```
1. Run full bundle analysis
2. Identify optimization opportunities
3. Prioritize by impact and risk
4. Apply recommended changes (or show dry-run)
5. Rebuild if changes applied
6. Verify improvements
7. Report before/after metrics
```

## Optimization Levels

### Safe
- Configure code splitting
- Enable tree-shaking for ESM
- Add terser/minification
- Configure chunk optimization

### Moderate
- Replace heavy dependencies with lighter alternatives
- Add dynamic imports for routes
- Configure asset optimization

### Aggressive
- Remove unused dependencies
- Inline small modules
- Configure aggressive minification

## Output

- Applied changes list
- Before/after size comparison
- Build time comparison
- Risk assessment for each change

## Examples

```bash
# Apply all safe optimizations
optimize-bundle

# Preview changes without applying
optimize-bundle --dry-run

# Only apply safe optimizations
optimize-bundle --safe
```

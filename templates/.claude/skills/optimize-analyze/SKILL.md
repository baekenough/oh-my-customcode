---
name: optimize-analyze
description: Analyze bundle size and performance metrics
argument-hint: "[target] [--verbose]"
---

# Bundle Analysis Skill

Analyze bundle size and performance metrics for web applications.

## Arguments

```
target           Build output path or project root (optional, auto-detects)
```

## Options

```
--verbose, -v    Show detailed analysis
```

## Workflow

```
1. Identify build tool (webpack, vite, rollup, esbuild)
2. Locate build output
3. Analyze bundle composition
4. Calculate size metrics
5. Identify large dependencies
6. Detect unused code/exports
7. Generate analysis report
```

## Output

- Total bundle size
- Size breakdown by chunk/module
- Top dependencies by size
- Tree-shaking status
- Dead code detection
- Optimization recommendations

## Examples

```bash
# Analyze current project
optimize-analyze

# Analyze specific output directory
optimize-analyze ./dist

# Verbose analysis
optimize-analyze --verbose
```

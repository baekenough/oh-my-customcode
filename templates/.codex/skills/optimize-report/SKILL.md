---
name: optimize-report
description: Generate comprehensive optimization report
argument-hint: "[--baseline <file>] [--format <format>]"
---

# Optimization Report Skill

Generate comprehensive optimization report with analysis, metrics, and recommendations.

## Options

```
--baseline       Compare against previous report
--format         Output format (text, json, markdown)
                 Default: text
```

## Workflow

```
1. Run full analysis
2. Collect all metrics
3. Compare against baseline (if provided)
4. Calculate performance scores
5. Generate recommendations
6. Format report
```

## Report Sections

### Bundle Analysis
- Total size (raw and gzipped)
- Chunk breakdown
- Dependency tree

### Performance Metrics
- Estimated load times
- Core Web Vitals impact
- Build performance

### Code Quality
- Tree-shaking effectiveness
- Dead code percentage
- Duplicate code detection

### Recommendations
- High impact optimizations
- Quick wins
- Long-term improvements

### Comparison (if baseline)
- Size delta
- Performance delta
- Trend analysis

## Output

- Formatted report in requested format
- Performance grade (A-F)
- Priority action items

## Examples

```bash
# Generate current report
optimize-report

# Compare against previous report
optimize-report --baseline ./previous-report.json

# Generate markdown report
optimize-report --format markdown
```

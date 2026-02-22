# [SHOULD] Interaction Rules

> **Priority**: SHOULD | **ID**: R003

## Response Principles

| Principle | Do | Don't |
|-----------|-----|-------|
| Brevity | Key info first, answer only what's asked | Over-explanation, repetitive confirmation |
| Clarity | Specific expressions, executable code | Abstract descriptions, "maybe"/"probably" |
| Transparency | State actions, report changes, acknowledge uncertainty | Hide actions, present guesses as facts |

## Status Format

```
[Start] {task name}
[Progress] {current step} ({n}/{total})
[Done] {task name} — Result: {summary}
[Failed] {task name} — Cause: {reason} — Alternative: {solutions}
```

## Request Handling

| Type | Action |
|------|--------|
| Clear | Execute immediately |
| Ambiguous | `[Confirm] Understood "{request}" as {interpretation}. Proceed?` |
| Risky | `[Warning] This action has {risk}. Continue? Yes: {action} / No: Cancel` |

## Multiple Tasks

- Dependent: Sequential
- Independent: Parallel allowed
- Report: `[Task 1/3] Done` / `[Task 2/3] In progress...` / `[Task 3/3] Pending`

## Output Styles

| Style | Trigger | Behavior |
|-------|---------|----------|
| `concise` | effort: low, batch operations | Key result only, no preamble, no elaboration |
| `balanced` | effort: medium, general tasks | Summary + key details, minimal explanation |
| `explanatory` | effort: high, complex/learning tasks | Full reasoning, examples, trade-off analysis |

### Style Selection Priority

1. User explicit request ("be concise", "explain in detail") → Override
2. Ecomode active → Force `concise`
3. Agent effort level → Map to corresponding style
4. Default → `balanced`

### Style Examples

**Concise** (effort: low):
```
✓ 3 files updated, 0 errors
```

**Balanced** (effort: medium):
```
[Done] Updated authentication module
- Modified: auth.ts, middleware.ts, config.ts
- Added JWT validation with 24h expiry
```

**Explanatory** (effort: high):
```
[Done] Updated authentication module — Result: JWT-based auth with refresh tokens

Changes:
1. auth.ts:45 — Added JWT signing with RS256 algorithm (chosen over HS256 for key rotation support)
2. middleware.ts:12 — New auth middleware validates token and attaches user context
3. config.ts:8 — Added TOKEN_EXPIRY (24h) and REFRESH_EXPIRY (7d) constants

Trade-offs: RS256 is ~10x slower than HS256 but enables asymmetric key management.
```

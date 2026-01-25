# Prerequisites

## Status: ✅ COMPLETED

All prerequisites have been completed in baekgom-agents.

## Completed: baekgom-agents Updates

The following agents were added to baekgom-agents:

| Agent | Location | Role |
|-------|----------|------|
| **npm-expert** | agents/sw-engineer/tooling/ | npm registry deployment, package.json management, versioning |
| **optimizer** | agents/sw-engineer/tooling/ | Bundle size optimization, performance profiling, tree-shaking |
| **bun-expert** | agents/sw-engineer/tooling/ | Bun runtime specialist, Bun build/test/deploy |
| **sauron** | agents/manager/ | R017 auto-verification (5+3 rounds) |

## baekgom-agents Current State

| Item | Value |
|------|-------|
| Total agents | **37** |
| Manager agents | **6** (creator, updater, supplier, gitnerd, sync-checker, sauron) |
| SW Engineer/Tooling | **3** (npm-expert, optimizer, bun-expert) |

## npm-expert Spec

```yaml
name: npm-expert
type: sw-engineer (tooling)
location: agents/sw-engineer/tooling/npm-expert

capabilities:
  - npm publish workflow
  - package.json optimization
  - Semantic versioning management
  - npm registry configuration
  - Dependency audit

commands:
  - npm:publish
  - npm:version
  - npm:audit
  - npm:pack
```

## optimizer Spec

```yaml
name: optimizer
type: sw-engineer (tooling)
location: agents/sw-engineer/tooling/optimizer

capabilities:
  - Bundle size analysis
  - Tree-shaking verification
  - Performance profiling
  - Build optimization recommendations
  - Dead code detection

commands:
  - optimize:analyze
  - optimize:bundle
  - optimize:report
```

## bun-expert Spec

```yaml
name: bun-expert
type: sw-engineer (tooling)
location: agents/sw-engineer/tooling/bun-expert

capabilities:
  - Bun runtime expertise
  - Bun build configuration
  - Bun test setup and execution
  - Bun-specific optimizations
  - Migration from Node.js to Bun

commands:
  - bun:build
  - bun:test
  - bun:run
  - bun:migrate

triggers:
  - keywords: [bun, bunx, bun.js, bunfig]
  - file_patterns: [bunfig.toml, bun.lockb, "*.bun.ts"]
```

## sauron Spec

```yaml
name: sauron
type: manager
location: agents/manager/sauron

capabilities:
  - R017 auto-verification
  - 5-round manager verification (supplier, sync-checker, updater)
  - 3-round deep review (workflow, references, philosophy)
  - Commit gate enforcement

commands:
  - sauron:watch
  - sauron:quick
  - sauron:report
```

## Verification Completed

- [x] agents/index.yaml updated
- [x] CLAUDE.md counts updated (37 agents)
- [x] README.md updated
- [x] All symlinks valid
- [x] sync-checker passes
- [x] supplier audit passes
- [x] sauron verification passed
- [x] Committed and pushed to baekgom-agents

# Package Configuration

## package.json

```json
{
  "name": "oh-my-customcode",
  "version": "0.1.0",
  "description": "Batteries-included agent harness for Claude Code",
  "author": "baekenough",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/baekenough/oh-my-customcode"
  },
  "bin": {
    "omcc": "./dist/cli/index.js"
  },
  "files": [
    "dist",
    "templates"
  ],
  "scripts": {
    "build": "bun build ./src/cli/index.ts --outdir ./dist --target node",
    "test": "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    "test:e2e": "bun test tests/e2e",
    "test:coverage": "bun test --coverage",
    "lint": "bunx biome check .",
    "lint:fix": "bunx biome check . --apply",
    "format": "bunx biome format . --write",
    "prepublishOnly": "bun run build && bun test"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.x",
    "@types/bun": "latest",
    "typescript": "^5.x"
  },
  "dependencies": {
    "commander": "^12.x",
    "chalk": "^5.x",
    "inquirer": "^9.x",
    "i18next": "^23.x"
  }
}
```

## biome.json (Rust-based Linter/Formatter)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.0.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

## PR Template

```markdown
## Summary

<!-- Briefly describe the changes -->

## Changes

<!-- List the main changes -->

-

## Spec Impact

<!-- Mark if spec documents are affected -->

- [ ] No spec changes
- [ ] Spec updated: `docs/specs/...`

## Test

<!-- Describe how you tested -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Coverage remains 100%

## i18n

<!-- Mark if translations are affected -->

- [ ] No i18n changes
- [ ] en.json updated
- [ ] ko.json updated

## Checklist

- [ ] Code follows project style guide (Biome)
- [ ] Self-review completed
- [ ] Documentation updated if needed
- [ ] No new warnings generated
- [ ] All tests pass locally
- [ ] Coverage verified at 100%
```

## Deployment Flow

```
Development → PR → Review → develop merge
              │
              ▼
        QA on develop
              │
              ▼
        PR → release
              │
              ▼
        Tag creation (v0.1.0)
              │
              ▼
      GitHub Actions triggered
              │
       ┌──────┴──────┐
       ▼             ▼
  100% tests      Build
       │             │
       └──────┬──────┘
              ▼
        npm publish
              │
              ▼
      GitHub Release
```

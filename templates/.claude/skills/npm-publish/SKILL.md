---
name: npm-publish
description: Publish package to npm registry with pre-checks
argument-hint: "[--tag <tag>] [--dry-run]"
disable-model-invocation: true
---

# NPM Publish Skill

Publish package to npm registry with comprehensive pre-publish checks and validation.

## Options

```
--tag            npm dist-tag (default: latest)
--dry-run        Run all checks without publishing
--skip-tests     Skip test execution
```

## Workflow

```
1. Validate package.json configuration
2. Check version against registry
3. Run pre-publish checks (tests, lint, build)
4. Execute npm pack (dry-run)
5. Publish with appropriate tag
6. Verify publication success
```

## Output Format

### Success
```
[NPM Publish] package-name@1.2.3

Pre-checks: All passed
Registry: https://registry.npmjs.org
Tag: latest

Package published successfully.
```

### Failure
```
[NPM Publish] Failed

Error: {error_message}
Suggested fix: {fix_suggestion}
```

## Examples

```bash
# Publish to npm with all checks
npm-publish

# Publish to beta tag
npm-publish --tag beta

# Validate without publishing
npm-publish --dry-run
```

---
name: npm-version
description: Manage semantic versions for npm packages
argument-hint: "<major|minor|patch> [--no-tag] [--no-commit]"
disable-model-invocation: true
---

# NPM Version Management Skill

Manage semantic versions for npm packages with automatic changelog and git integration.

## Arguments

```
major            Bump major version (x.0.0)
minor            Bump minor version (0.x.0)
patch            Bump patch version (0.0.x)
```

## Options

```
--no-tag         Skip git tag creation
--no-commit      Skip commit creation (only update files)
```

## Workflow

```
1. Analyze current version from package.json
2. Determine version bump type
3. Update package.json version field
4. Update CHANGELOG.md if exists
5. Create version commit
6. Create git tag (optional)
```

## Output Format

### Success
```
[NPM Version] package-name

Previous: 1.2.3
Current:  1.2.4

Changes:
  - package.json updated
  - Commit: "chore: bump version to 1.2.4"
  - Tag: v1.2.4
```

### Failure
```
[NPM Version] Failed

Error: {error_message}
Hint: Ensure clean git working directory
```

## Examples

```bash
# Bump patch version (1.2.3 -> 1.2.4)
npm-version patch

# Bump minor version (1.2.3 -> 1.3.0)
npm-version minor

# Bump major version (1.2.3 -> 2.0.0)
npm-version major

# Update version without creating git tag
npm-version patch --no-tag
```

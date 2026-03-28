---
name: omcustom:npm-version
description: Manage semantic versions for npm packages
scope: package
argument-hint: "<major|minor|patch> [--no-tag] [--no-commit]"
disable-model-invocation: true
user-invocable: true
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

## Release Branch Integration

When working with `auto-tag.yml` (automatic tag creation on release PR merge):

1. `.npmrc` has `git-tag-version=false` — prevents local tag creation during `npm version`
2. `auto-tag.yml` creates the tag on the **merge commit** when a `release/*` PR is merged to `develop`
3. Do NOT manually push tags — let the CI workflow handle tag creation

### Release Workflow

```
1. Create release branch: release/vX.Y.Z
2. Run version bump (npm version / manual edit)  ← no local tag created
3. Build dist, commit, push
4. Create PR → merge to develop
5. auto-tag.yml creates vX.Y.Z tag on merge commit  ← correct tag target
6. release.yml triggers on tag → GitHub Release + npm publish
```

### Troubleshooting

If a tag already exists on remote (from a previous failed attempt):
```bash
git push origin :refs/tags/vX.Y.Z   # delete remote tag
# Then re-merge or let auto-tag.yml handle it
```

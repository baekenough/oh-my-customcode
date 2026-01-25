# Git Strategy

## Branch Structure (Git Flow)

```
release (default, production) ◀── tags: v0.1.0, v0.1.1 ...
    │
    └── develop (development integration)
            │
            ├── feat/xxx        # New features
            ├── fix/xxx         # Bug fixes
            ├── docs/xxx        # Documentation
            ├── refactor/xxx    # Refactoring
            └── chore/xxx       # Maintenance
```

## Workflow

```
1. Create branch from develop
   git checkout develop
   git checkout -b feat/init-command

2. Work and commit
   git commit -m "feat: add init command"

3. Create PR → develop
   - 100% test coverage required
   - Code review approval required

4. Squash & Merge → develop

5. Release preparation (after QA)
   - Create PR: develop → release
   - Final review

6. Merge to release and tag
   - Merge → release
   - Create tag: v0.1.0
   - GitHub Actions → npm publish
```

## Branch Roles

| Branch | Role | Merge Target |
|--------|------|--------------|
| release | Production version, always stable | - |
| develop | Development integration, QA target | release |
| feat/* | Feature development | develop |
| fix/* | Bug fixes | develop |

## Commit Convention

```
<type>: <description>

feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Refactoring
test:     Tests
chore:    Build, config, maintenance
```

## Tags and Versioning

```
On release branch merge:
  git tag v0.1.0
  git push origin v0.1.0

  → GitHub Actions triggered
  → npm publish oh-my-customcode@0.1.0
  → GitHub Release created (v0.1.0)
```

## Protection Rules

| Branch | PR Required | Review | Tests | Direct Push |
|--------|-------------|--------|-------|-------------|
| release | ✓ | 1+ | 100% | Forbidden |
| develop | ✓ | 1+ | 100% | Forbidden |

## Version Strategy

```
All dev + test complete → v0.1.0 release
Bug fixes → v0.1.1, v0.1.2 ...
New features → v0.2.0 ...
```

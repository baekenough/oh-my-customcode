# Testing Strategy

## Test Levels

| Level | Scope | Environment |
|-------|-------|-------------|
| Unit | Function/module | Local + CI |
| Integration | Module integration | Local + CI |
| E2E | Full CLI flow | Local + CI |
| **Deploy** | npm publish + install | **CI only** |

## Coverage Requirement

**100% coverage required for all levels. No exceptions.**

## Test Structure

```
tests/
├── unit/
│   ├── cli/
│   │   ├── init.test.ts
│   │   ├── update.test.ts
│   │   ├── list.test.ts
│   │   └── doctor.test.ts
│   ├── core/
│   │   ├── installer.test.ts
│   │   ├── updater.test.ts
│   │   └── config.test.ts
│   └── utils/
│       ├── fs.test.ts
│       └── logger.test.ts
├── integration/
│   ├── init-flow.test.ts
│   ├── update-flow.test.ts
│   └── i18n.test.ts
└── e2e/
    ├── fresh-install.test.ts
    ├── upgrade.test.ts
    └── doctor-fix.test.ts
```

## Test Commands

```bash
bun test                    # All tests
bun test:unit              # Unit only
bun test:integration       # Integration only
bun test:e2e               # E2E only
bun test:coverage          # Coverage report
```

## CI Workflows

| Workflow | Trigger | Tests |
|----------|---------|-------|
| ci.yml | PR → develop | unit, integration, e2e |
| deploy-test.yml | PR → release | deploy + install |
| release.yml | tag v* | npm publish (real) |

## Deploy Test Workflow (GitHub Actions)

```yaml
# .github/workflows/deploy-test.yml
name: Deploy Test

on:
  pull_request:
    branches: [release]

jobs:
  deploy-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      # 1. Build
      - run: bun install
      - run: bun run build

      # 2. Start local npm registry (verdaccio)
      - name: Start local registry
        run: |
          npx verdaccio &
          sleep 5

      # 3. Publish to local registry
      - name: Publish to local registry
        run: |
          npm config set registry http://localhost:4873
          npm publish --registry http://localhost:4873

      # 4. Global install test
      - name: Install globally
        run: npm install -g oh-my-customcode --registry http://localhost:4873

      # 5. CLI operation tests
      - name: Test CLI commands
        run: |
          omcc --version
          omcc --help

      # 6. init test (real project)
      - name: Test init command
        run: |
          mkdir test-project && cd test-project
          omcc init --lang en
          test -d .claude
          test -f .claude/rules/MUST-safety.md
          test -d agents

      # 7. doctor test
      - name: Test doctor command
        run: |
          cd test-project
          omcc doctor
```

## Deploy Test Checklist

- [ ] npm pack success
- [ ] Local registry publish success
- [ ] npm install -g success
- [ ] omcc --version output
- [ ] omcc --help output
- [ ] omcc init execution success
- [ ] .claude/ structure created
- [ ] agents/ structure created
- [ ] omcc doctor passes

## Parallel Test Execution

Bun test runs in parallel by default. Ensure tests are isolated and independent.

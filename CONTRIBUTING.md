# Contributing to oh-my-customcode

Thank you for your interest in contributing to oh-my-customcode!

---

## Development Principles

### Principle #1: 100% Tests Pass

**Every commit must pass all tests. No exceptions.**

This isn't negotiable. Tests are our safety net that ensures oh-my-customcode works as intended for every user.

### Testing Philosophy

Our tests are NOT about testing implementation logic. They test:

| Focus | Description | Example |
|-------|-------------|---------|
| **Philosophy** | Does the component behave according to our design principles? | Does the agent identification show up in every response? |
| **Workflow** | Does the intended user workflow work end-to-end? | Can a user create a custom agent and have it detected? |
| **Functionality** | Does the feature work as users expect? | Does `omcc init` create all required directories? |

**Bad test** (tests implementation):
```typescript
it('should call fs.writeFile with correct parameters', () => {
  // This tests HOW we do something, not WHAT we achieve
});
```

**Good test** (tests intent):
```typescript
it('should create a working agent that Claude can use', async () => {
  await createAgent('my-agent');
  const agents = await listAgents();
  expect(agents).toContainEqual(expect.objectContaining({ name: 'my-agent' }));
});
```

### Coverage Policy

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Function Coverage** | 100% | Every function must be exercised |
| **Line Coverage** | 95%+ | Defensive error handling may remain uncovered |

**What we DON'T test:**
- Error handling `catch` blocks that only exist for defensive programming
- Edge cases that require mocking the file system
- Internal implementation details

**Why not 100% line coverage?**

Uncovered lines should only be:
1. `catch` blocks that handle unexpected filesystem errors
2. Fallback code paths that protect against edge cases
3. Code that would require mocking system APIs to test

These defensive code paths exist for production safety, not for behavior specification. Testing them would mean testing implementation details, which violates our testing philosophy.

### Other Principles

2. **Customization is King** - Every feature should be easily customizable
3. **Batteries Included** - Work out of the box, customize when needed
4. **Non-Destructive** - User customizations are never overwritten
5. **Simple > Complex** - If it needs a manual, it's too complicated

---

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/baekenough/oh-my-customcode.git
   cd oh-my-customcode
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up git hooks**
   ```bash
   bun run setup:hooks
   ```

---

## Development Workflow

### Git Flow

We use Git Flow branching strategy:

- `release` - Production-ready code (default branch)
- `develop` - Development branch
- `feature/*` - Feature branches

### Making Changes

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git checkout -b feature/my-feature
   ```

2. Make your changes and ensure **ALL tests pass**:
   ```bash
   bun test           # Must show 0 failures
   bun run lint       # Must pass
   bun run typecheck  # Must pass
   ```

3. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add my new feature"
   ```

4. Push and create a pull request to `develop`

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/tooling changes

### Pre-commit Checks

The following checks run automatically before each commit:
- TypeScript type checking
- Biome linting
- **All tests must pass**

---

## Testing Guidelines

### Test Structure

```
tests/
├── unit/           # Unit tests - test individual functions
├── integration/    # Integration tests - test module interactions
└── e2e/            # E2E tests - test full CLI workflows
```

### What to Test

| Test Type | What to Verify |
|-----------|----------------|
| **Unit** | Individual functions work correctly |
| **Integration** | Modules work together as expected |
| **E2E** | Complete user workflows succeed |

### Running Tests

```bash
bun test              # Run all tests (MUST pass before commit)
bun test:unit         # Run unit tests only
bun test:integration  # Run integration tests
bun test:e2e          # Run end-to-end tests
bun test --coverage   # Check coverage (target: 100%)
```

### Writing Tests

When adding a feature, ask yourself:

1. **What workflow does this enable?** → Write E2E test
2. **How do modules interact?** → Write integration test
3. **What edge cases exist?** → Write unit tests

---

## Adding New Components

### Adding New Agents

1. Create directory structure:
   ```
   templates/agents/{category}/{agent-name}/
   ├── AGENT.md       # Agent definition
   ├── index.yaml     # Metadata
   └── refs/          # Symlinks to skills/guides (optional)
   ```

2. Update `templates/agents/index.yaml`

3. Update `templates/skills/orchestration/intent-detection/patterns/agent-triggers.yaml` if adding intent triggers

4. **Add tests** to verify the agent is detected and works

### Adding New Skills

1. Create directory structure:
   ```
   templates/skills/{category}/{skill-name}/
   ├── SKILL.md       # Skill instructions
   └── index.yaml     # Metadata
   ```

2. Link from relevant agents using symlinks in their `refs/` directory

3. **Add tests** to verify the skill is loaded correctly

---

## Code Style

- TypeScript with strict mode
- Biome for linting and formatting
- No console.log in library code (CLI output is allowed)

---

## Questions?

Open an issue or discussion on GitHub.

---

**Remember: If tests don't pass, the PR doesn't merge. This protects everyone.**

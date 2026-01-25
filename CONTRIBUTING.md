# Contributing to oh-my-customcode

Thank you for your interest in contributing to oh-my-customcode!

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

2. Make your changes and ensure tests pass:
   ```bash
   bun test
   bun run lint
   bun run typecheck
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
- All tests

## Adding New Agents

1. Create directory structure:
   ```
   templates/agents/{category}/{agent-name}/
   ├── AGENT.md       # Agent definition
   ├── index.yaml     # Metadata
   └── refs/          # Symlinks to skills/guides (optional)
   ```

2. Update `templates/agents/index.yaml`

3. Update `templates/skills/orchestration/intent-detection/patterns/agent-triggers.yaml` if adding intent triggers

## Adding New Skills

1. Create directory structure:
   ```
   templates/skills/{category}/{skill-name}/
   ├── SKILL.md       # Skill instructions
   └── index.yaml     # Metadata
   ```

2. Link from relevant agents using symlinks in their `refs/` directory

## Code Style

- TypeScript with strict mode
- Biome for linting and formatting
- No console.log in library code (CLI output is allowed)

## Testing

- Write tests for new functionality
- Maintain test coverage
- Run full test suite before submitting PR

```bash
bun test              # Run all tests
bun test:unit         # Run unit tests only
bun test:integration  # Run integration tests
bun test:e2e          # Run end-to-end tests
```

## Questions?

Open an issue or discussion on GitHub.

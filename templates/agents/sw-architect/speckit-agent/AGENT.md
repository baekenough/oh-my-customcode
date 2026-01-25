# Speckit Agent

> **Type**: SW Architect
> **Source**: External (GitHub)
> **Origin**: https://github.com/github/spec-kit

## Purpose

Spec-Driven Development agent that transforms high-level requirements into executable specifications. Manages the full specification lifecycle from constitution to implementation.

## Capabilities

### 1. Specification Workflow
- Define project constitution (principles, standards)
- Create feature specifications (user stories, requirements)
- Clarify ambiguous requirements through Q&A
- Generate technical plans (architecture, data models)
- Produce implementation task lists

### 2. Multi-Phase Development
- **0-to-1 (Greenfield)**: Build from scratch
- **Creative Exploration**: Parallel tech stack trials
- **Iterative Improvement (Brownfield)**: Enhance existing systems

### 3. Quality Assurance
- Analyze consistency across spec artifacts
- Generate quality checklists
- Validate spec coverage

## Workflow

```
1. Initialize project
   $ specify init <project> --ai claude

2. Define constitution
   /speckit.constitution
   → .specify/memory/constitution.md

3. Create specification
   /speckit.specify <feature-description>
   → .specify/specs/NNN-feature/spec.md

4. Clarify requirements
   /speckit.clarify
   → Interactive Q&A

5. Plan implementation
   /speckit.plan <tech-stack-preferences>
   → plan.md, data-model.md, research.md

6. Generate tasks
   /speckit.tasks
   → tasks.md (TDD structure)

7. Implement
   /speckit.implement
   → Execute tasks in order
```

## Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `/speckit.constitution` | Define project principles | constitution.md |
| `/speckit.specify` | Define WHAT to build (no tech stack) | spec.md |
| `/speckit.clarify` | Clarify ambiguous requirements | Q&A session |
| `/speckit.plan` | Define HOW to build (tech stack) | plan.md, data-model.md |
| `/speckit.tasks` | Generate implementation tasks | tasks.md |
| `/speckit.implement` | Execute all tasks | Code + Tests |
| `/speckit.analyze` | Check spec consistency | Analysis report |
| `/speckit.checklist` | Generate QA checklist | Checklist |

## File Structure

```
.specify/
├── memory/
│   └── constitution.md          # Project principles
├── scripts/                     # Helper scripts
├── specs/
│   └── NNN-feature-name/
│       ├── spec.md              # Feature specification
│       ├── plan.md              # Technical plan
│       ├── tasks.md             # Task breakdown
│       ├── data-model.md        # Data structures
│       ├── research.md          # Technical research
│       └── contracts/           # API specs
└── templates/                   # Spec templates
```

## Installation

```bash
# Install specify CLI
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Initialize project
specify init <project-name> --ai claude
```

## Usage Triggers

- "Create specification for..."
- "Define project constitution"
- "Plan implementation for..."
- "Generate tasks for feature"
- "Start spec-driven development"

## Integration

Works with:
- Claude Code (primary)
- GitHub Copilot
- Cursor
- Windsurf
- Other AI coding assistants

## Update

```bash
# Check for updates
# Origin: https://github.com/github/spec-kit/releases

# Update command
uv tool upgrade specify-cli --from git+https://github.com/github/spec-kit.git
```

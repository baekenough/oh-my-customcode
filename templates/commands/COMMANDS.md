# Commands System

> Command structure for Baekgom Agents

## Command Format

```
{agent}:{action} [arguments]
```

### Examples

```
lists                          # Show all commands
updater:docs                   # Sync documentation
updater:external               # Update external agents
supplier:audit golang-expert   # Audit specific agent
creator:agent my-agent         # Create new agent
dev:review src/main.go         # Review code
memory:save                    # Save session context
memory:recall auth             # Search memories for "auth"
pipeline:run code-review       # Execute code-review pipeline
pipeline:list                  # List available pipelines
intent:explain                 # Explain intent detection
naggy:add "Fix login bug"      # Add TODO item
naggy:done 3                   # Mark task #3 complete
git:commit                     # Create commit
git:branch feature/auth        # Create feature branch
```

## Available Commands

### System Commands

| Command | Description |
|---------|-------------|
| `lists` | Show all available commands |
| `status` | Show system status |
| `help` | Show help information |

### Manager Commands

| Command | Description |
|---------|-------------|
| `creator:agent` | Create a new agent |
| `updater:docs` | Sync documentation with project structure |
| `updater:external` | Update agents from external sources |
| `supplier:audit` | Audit agent dependencies |
| `supplier:fix` | Fix broken references |

### Dev Commands

| Command | Description |
|---------|-------------|
| `dev:review` | Review code for best practices |
| `dev:refactor` | Refactor code |

### Memory Commands

| Command | Description |
|---------|-------------|
| `memory:save` | Save session context to claude-mem |
| `memory:recall` | Search and recall memories |

### Pipeline Commands

| Command | Description |
|---------|-------------|
| `pipeline:run <name>` | Execute a defined pipeline |
| `pipeline:list` | List available pipelines |

### Intent Commands

| Command | Description |
|---------|-------------|
| `intent:explain` | Explain intent detection system |

### Naggy Commands (TODO Management)

| Command | Description |
|---------|-------------|
| `naggy:list` | List all pending TODOs |
| `naggy:add <task>` | Add new TODO item |
| `naggy:done <id>` | Mark task as complete |
| `naggy:priority <id> <level>` | Set task priority (high/medium/low) |
| `naggy:remind` | Show overdue tasks |

### Git Commands (Git Operations)

| Command | Description |
|---------|-------------|
| `git:commit` | Create a proper commit with conventional message |
| `git:branch <name>` | Create feature branch |
| `git:pr` | Create pull request |
| `git:sync` | Sync with remote repository |
| `git:status` | Show detailed git status |

### Sync Commands (Documentation Synchronization)

| Command | Description |
|---------|-------------|
| `sync:check` | Run full synchronization check |
| `sync:agents` | Check agent registry sync |
| `sync:commands` | Check command registry sync |
| `sync:docs` | Check documentation sync |
| `sync:fix` | Auto-fix simple inconsistencies |

## Command Workflow

```
User Input: "updater:docs"
    │
    ▼
Secretary (orchestrator)
    │
    ├── Parse command → updater:docs
    │
    ├── Route to → updater (manager)
    │
    └── Execute → docs action
```

## Adding New Commands

1. Create command file in `commands/{agent}/{action}.md`
2. Add entry to `commands/index.yaml`
3. Document parameters and workflow

## Command vs Agent

| Aspect | Command | Agent |
|--------|---------|-------|
| Purpose | User-invoked action | Worker/Manager |
| Format | `{agent}:{action}` | `{type}/{name}` |
| Scope | Single operation | Multiple capabilities |
| Example | `updater:docs` | `updater` agent |

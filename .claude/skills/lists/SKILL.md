---
name: omcustom:lists
description: Show all available commands
scope: harness
argument-hint: "[--category <category>] [--verbose]"
user-invocable: true
---

# List Commands Skill

Show all available commands with optional filtering and detailed information.

## Options

```
--verbose, -v    Show detailed descriptions
--category, -c   Filter by category (system, manager, dev)
```

## Output Format

### Default
```
AI Agent System - Available Commands

System:
  /omcustom:lists    Show all available commands
  /omcustom:status   Show system status
  /omcustom:help     Show help information

Manager:
  /omcustom:create-agent     Create a new agent
  /omcustom:update-docs      Sync documentation with project structure
  /omcustom:update-external  Update agents from external sources
  /omcustom:audit-agents     Audit agent dependencies
  /omcustom:fix-refs         Fix broken references

Dev:
  /dev-review        Review code for best practices
  /dev-refactor      Refactor code

Use "<command> --help" for detailed information.
Run "/omcustom:lists" to see the full command set (60+).
```

### Verbose Output
```
lists --verbose

AI Agent System - Available Commands (Detailed)

System Commands:
┌───────────────────┬──────────────────────────────────────┐
│ Command           │ Description                          │
├───────────────────┼──────────────────────────────────────┤
│ /omcustom:lists   │ Show all available commands          │
│ /omcustom:status  │ Show system status and health checks │
│ /omcustom:help    │ Show help for commands and agents    │
└───────────────────┴──────────────────────────────────────┘

Manager Commands:
┌─────────────────────────────┬──────────────────────────────────────┐
│ Command                     │ Description                          │
├─────────────────────────────┼──────────────────────────────────────┤
│ /omcustom:create-agent      │ Create a new agent with structure    │
│ /omcustom:update-docs       │ Sync all docs with project state     │
│ /omcustom:update-external   │ Update from external sources         │
│ /omcustom:audit-agents      │ Check dependencies and refs          │
│ /omcustom:fix-refs          │ Auto-fix broken references           │
└─────────────────────────────┴──────────────────────────────────────┘

Dev Commands:
┌──────────────┬────────────────────────────────────────┐
│ Command      │ Description                            │
├──────────────┼────────────────────────────────────────┤
│ /dev-review  │ Review code against best practices     │
│ /dev-refactor│ Suggest and apply refactoring          │
└──────────────┴────────────────────────────────────────┘

Total: 60+ commands available
```

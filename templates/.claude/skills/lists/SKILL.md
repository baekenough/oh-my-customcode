---
name: lists
description: Show all available commands
argument-hint: "[--category <category>] [--verbose]"
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
  lists              Show all available commands
  status             Show system status
  help               Show help information

Manager:
  /create-agent          Create a new agent
  /update-docs           Sync documentation with project structure
  /update-external       Update agents from external sources
  /audit-agents          Audit agent dependencies
  /fix-refs              Fix broken references

Dev:
  /dev-review        Review code for best practices
  /dev-refactor      Refactor code

Use "<command> --help" for detailed information.
```

### Verbose Output
```
lists --verbose

AI Agent System - Available Commands (Detailed)

System Commands:
┌─────────┬──────────────────────────────────────────────┐
│ Command │ Description                                  │
├─────────┼──────────────────────────────────────────────┤
│ lists   │ Show all available commands                  │
│ status  │ Show system status and health checks         │
│ help    │ Show help for commands and agents            │
└─────────┴──────────────────────────────────────────────┘

Manager Commands:
┌──────────────────┬──────────────────────────────────────┐
│ Command          │ Description                          │
├──────────────────┼──────────────────────────────────────┤
│ /create-agent    │ Create a new agent with structure    │
│ /update-docs     │ Sync all docs with project state     │
│ /update-external │ Update from external sources         │
│ /audit-agents    │ Check dependencies and refs          │
│ /fix-refs        │ Auto-fix broken references           │
└──────────────────┴──────────────────────────────────────┘

Dev Commands:
┌──────────────┬────────────────────────────────────────┐
│ Command      │ Description                            │
├──────────────┼────────────────────────────────────────┤
│ /dev-review  │ Review code against best practices     │
│ /dev-refactor│ Suggest and apply refactoring          │
└──────────────┴────────────────────────────────────────┘

Total: 10 commands available
```

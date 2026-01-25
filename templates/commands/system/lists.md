# Command: lists

> Show all available commands

## Usage

```
lists
lists --category <category>
lists --verbose
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | no | Filter by category (system, creator, updater, supplier, dev) |

## Options

```
--verbose, -v    Show detailed descriptions
--category, -c   Filter by category
```

## Output

```
Baekgom Agents - Available Commands

System:
  lists              Show all available commands
  status             Show system status
  help               Show help information

Manager:
  creator:agent      Create a new agent
  updater:docs       Sync documentation with project structure
  updater:external   Update agents from external sources
  supplier:audit     Audit agent dependencies
  supplier:fix       Fix broken references

Dev:
  dev:review         Review code for best practices
  dev:refactor       Refactor code

Use "<command> --help" for detailed information.
```

## Verbose Output

```
lists --verbose

Baekgom Agents - Available Commands (Detailed)

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
│ creator:agent    │ Create a new agent with structure    │
│ updater:docs     │ Sync all docs with project state     │
│ updater:external │ Update from external sources         │
│ supplier:audit   │ Check dependencies and refs          │
│ supplier:fix     │ Auto-fix broken references           │
└──────────────────┴──────────────────────────────────────┘

Dev Commands:
┌──────────────┬────────────────────────────────────────┐
│ Command      │ Description                            │
├──────────────┼────────────────────────────────────────┤
│ dev:review   │ Review code against best practices     │
│ dev:refactor │ Suggest and apply refactoring          │
└──────────────┴────────────────────────────────────────┘

Total: 10 commands available
```

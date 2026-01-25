# Agent System

## Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator (4)                      │
│  planner(master) │ secretary │ dev-lead │ qa-lead       │
└─────────────────────────────┬───────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Manager (6)  │    │  System (2)   │    │  Worker (25)  │
│  creator      │    │  memory-keeper│    │  sw-engineer/ │
│  updater      │    │  naggy        │    │  sw-architect/│
│  supplier     │    └───────────────┘    │  infra/       │
│  gitnerd      │                         │  qa-team/     │
│  sync-checker │                         │  tutor/       │
│  sauron       │                         └───────────────┘
└───────────────┘
```

## Agent Count: 37

| Type | Count | Agents |
|------|-------|--------|
| Orchestrator | 4 | planner, secretary, dev-lead, qa-lead |
| Manager | 6 | creator, updater, supplier, gitnerd, sync-checker, sauron |
| System | 2 | memory-keeper, naggy |
| SW Engineer/Frontend | 3 | vercel-agent, vuejs-agent, svelte-agent |
| SW Engineer/Backend | 5 | fastapi, springboot, go-backend, express, nestjs |
| SW Engineer/Language | 6 | golang, python, rust, kotlin, typescript, java21 |
| SW Engineer/Tooling | 3 | npm-expert, optimizer, bun-expert |
| SW Architect | 2 | documenter, speckit-agent |
| Infra Engineer | 2 | docker, aws |
| QA Team | 3 | qa-planner, qa-writer, qa-engineer |
| Tutor | 1 | go-tutor |

## Core Workflows

### Development (dev-lead orchestrates)
```
User request → dev-lead → [language-expert + backend-expert] → Aggregate results
```

### QA (qa-lead orchestrates)
```
Feature done → qa-lead → qa-planner → qa-writer → qa-engineer → Report
```

### Agent Management (secretary orchestrates)
```
Create agent → secretary → creator → supplier(verify) → sync-checker
```

### Deployment (secretary orchestrates)
```
Ready to deploy → secretary → optimizer → npm-expert → gitnerd
```

## Rule System

| Rule | Purpose |
|------|---------|
| R007 | Agent identification in all responses |
| R008 | Tool identification in all tool uses |
| R009 | Parallel execution for independent tasks |
| R010 | Orchestrator coordination required |
| R017 | Sync verification before commits |

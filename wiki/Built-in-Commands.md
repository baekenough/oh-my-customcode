# Built-in Commands

| Command | Agent | Description |
|---------|-------|-------------|
| `/create-agent <name>` | mgr-creator | Create a new agent |
| `/update-docs` | mgr-updater | Sync docs with project structure |
| `/audit-dependencies` | mgr-supplier | Verify agent dependencies |
| `/code-review` | lang-* experts | Review code with expert agents |
| `/run-pipeline <name>` | pipeline skill | Execute a workflow pipeline |
| `/sync-check` | mgr-sync-checker | Full synchronization check |

## Custom Pipelines

Define repeatable multi-agent workflows:

```yaml
# .claude/skills/pipelines/deploy-review.yaml
name: deploy-review
steps:
  - id: security_scan
    agent: qa-planner
    action: security_review

  - id: performance_check
    agent: tool-optimizer
    action: analyze_performance

  - id: migration_review
    agent: db-migration-expert
    action: review_migrations
```

Run it: `/run-pipeline deploy-review`

---

**See also:** [[CLI Reference]] | [[Skills]]

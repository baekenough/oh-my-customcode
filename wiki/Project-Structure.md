# Project Structure

After `omcustom init`:

```
your-project/
├── CLAUDE.md              # Entry point for Claude
└── .claude/
    ├── rules/             # Behavior rules (18 total)
    ├── hooks/             # Event hooks
    ├── contexts/          # Context files
    ├── agents/            # All agents (flat structure, 34 total)
    │   ├── lang-golang-expert/
    │   ├── be-fastapi-expert/
    │   ├── mgr-creator/
    │   └── ...
    ├── skills/            # All skills (42 total, includes slash commands)
    │   ├── development/
    │   ├── backend/
    │   ├── infrastructure/
    │   ├── system/
    │   └── orchestration/
    └── guides/            # Reference docs (13 total)
```

---

**See also:** [[Quick Start]] | [[Agents]]

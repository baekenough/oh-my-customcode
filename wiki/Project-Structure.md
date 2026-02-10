# Project Structure

After `omcustom init` (provider-specific):

Claude mode:
```
your-project/
├── CLAUDE.md              # Entry point for Claude
├── .claude/
│   ├── rules/             # Behavior rules
│   ├── hooks/             # Event hooks
│   ├── contexts/          # Context files
│   ├── agents/            # Agent definitions (flat .md files)
│   └── skills/            # Skill definitions
└── guides/                # Reference docs
```

Codex mode:
```
your-project/
├── AGENTS.md              # Entry point for Codex
├── .codex/
│   ├── rules/             # Behavior rules
│   ├── hooks/             # Event hooks
│   ├── contexts/          # Context files
│   ├── agents/            # Agent definitions (flat .md files)
│   └── skills/            # Skill definitions
└── guides/                # Reference docs
```

---

**See also:** [[Quick Start]] | [[Agents]]

# Customization

This is what oh-my-customcode is all about. **Making Claude Code yours.**

## Just Tell Claude What You Need

No manual file editing. Describe what you want in natural language, and the orchestrator delegates to the right agent:

```
"Create a migration review expert agent"
"Add a SQL optimization skill"
"Make code reviews stricter"
```

## How it works

```
User (natural language)
  -> /create-agent (routing skill)
    -> mgr-creator:sonnet       - scaffolds agent, registers, verifies
    -> mgr-updater:sonnet       - syncs documentation
    -> mgr-supplier:haiku       - checks dependencies
```

Claude Code's routing system analyzes your request, routes it to the appropriate skill and agent, and the sub-agent handles everything automatically.

---

**See also:** [[Sub Agent Model]] | [[Built-in Commands]]

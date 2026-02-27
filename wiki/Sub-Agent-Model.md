# Sub-Agent Model

Each sub-agent runs on an optimized model for its task type:

| Model | Usage | Examples |
|-------|-------|---------|
| `opus` | Complex reasoning, architecture | Code review, design analysis |
| `sonnet` | General tasks (default) | Agent creation, code generation |
| `haiku` | Fast, simple operations | File search, validation |

## Parallel Execution

Claude Code selects the appropriate model and parallelizes independent tasks (up to 4 concurrent sub-agents):

```
/create-agent
  |-- mgr-creator:sonnet       - agent scaffolding
  +-- mgr-supplier:haiku       - dependency check

/code-review
  |-- lang-golang-expert:sonnet - Go implementation
  |-- lang-python-expert:sonnet - Python implementation
  +-- qa-engineer:sonnet        - test generation
```

---

**See also:** [[Customization]] | [[Agents]]

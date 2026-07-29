# Sub-Agent Model

Each sub-agent runs on an optimized model for its task type. Model specification is 3-tier — see [[wiki/rules/r006]] "3-tier model specification": Tier-1 native alias (`sonnet`/`opus`/`haiku`/`opusplan`, valid in both frontmatter and the Agent-tool `model` param), Tier-2 full model ID (frontmatter only, recommended), Tier-3 Agent-tool `model` param enum (`sonnet`\|`opus`\|`haiku`\|`fable` — exactly these 4). The **frontmatter** value each agent actually carries (Tier 2):

| Model (frontmatter, Tier 2) | Usage | Examples |
|------------------------------|-------|---------|
| `opus` (Tier-1 alias, CC-resolved — not pinned by this project) | Complex reasoning, architecture, legacy usage | Design analysis (legacy — project agents migrated to `claude-opus-5`) |
| `claude-opus-5` | Elevated reasoning, structural verification (CC default Opus, v2.1.219+) | mgr-sauron, sec-codeql-expert, db-alembic-expert, de-pipeline-expert, infra-aws-expert |
| `sonnet` (Tier-1 alias, CC-resolved — not pinned by this project) | General tasks, legacy usage | Legacy — project agents migrated to `claude-sonnet-5` |
| `claude-sonnet-5` | General tasks (CC default model, v2.1.197+) | Agent creation, code generation, most language/backend agents |
| `haiku` | Fast, simple operations | File search, validation, mgr-supplier/sys-naggy/tracker-checkpoint |

> `sonnet5`/`opus5`/`opus48` are not real values in any tier — CC does not interpret them; a spawn using them fails.

## Parallel Execution

Claude Code selects the appropriate model and parallelizes independent tasks (up to 4 concurrent sub-agents). The `:model` suffix below is the **Agent-tool `model` param** (Tier 3) — this position accepts ONLY the 4-value enum (`sonnet`\|`opus`\|`haiku`\|`fable`), not full model IDs or `sonnet5`/`opus5`:

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

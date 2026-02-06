---
name: claude-code-bible
description: Fetch and verify Claude Code official documentation. Use when checking official spec compliance or updating local reference docs.
disable-model-invocation: true
---

# Claude Code Bible

Official documentation reference management for Claude Code.

## Purpose

Maintain up-to-date local copies of Claude Code official documentation and verify that agents/skills comply with the official specifications.

## Commands

### /claude-code-bible update

Fetch the latest documentation from code.claude.com.

**What it does:**
- Fetches `https://code.claude.com/docs/llms.txt`
- Extracts all documentation URLs from the llms.txt content
- Downloads each documentation page and saves as markdown
- Writes a timestamp file for cache tracking
- Respects a 24-hour cache (skip if fresh, unless `--force` used)

**Usage:**
```bash
# Fetch latest docs (skip if cached < 24h)
node .claude/skills/claude-code-bible/scripts/fetch-docs.js

# Force update even if cache is fresh
node .claude/skills/claude-code-bible/scripts/fetch-docs.js --force

# Custom output directory
node .claude/skills/claude-code-bible/scripts/fetch-docs.js --output /path/to/output
```

**Default output location:**
```
~/.claude/references/claude-code/
├── llms.txt              # Master index
├── last-updated.txt      # ISO timestamp
├── <doc-name>.md         # Individual doc pages
└── ...
```

**Exit codes:**
- `0`: Success (or cache is fresh)
- `1`: Fatal error

### /claude-code-bible verify

Verify agents and skills against official Claude Code specifications.

**What it checks:**
- Agent structure compliance (frontmatter fields, file format)
- Skill structure compliance (SKILL.md format, disable-model-invocation usage)
- Tool usage patterns match official recommendations
- Workflow patterns align with Claude Code best practices
- Agent/skill naming conventions follow official guidelines

**Usage:**
```bash
# Verify all agents and skills
/claude-code-bible verify

# Verify specific agent
/claude-code-bible verify --agent mgr-creator

# Verify specific skill
/claude-code-bible verify --skill go-best-practices

# Verbose output
/claude-code-bible verify --verbose
```

**Verification rules:**
1. **Agent frontmatter** must include:
   - `name`: kebab-case identifier
   - `description`: one-line summary
   - `model`: sonnet | opus | haiku
   - `tools`: array of allowed tools
   - `skills`: array of skill names

2. **Skill frontmatter** must include:
   - `name`: kebab-case identifier
   - `description`: when/why to use this skill
   - `disable-model-invocation`: true (if skill is procedural/scripted)

3. **Agent files** should NOT contain:
   - Detailed skill instructions (belongs in .claude/skills/)
   - Reference documentation (belongs in guides/)
   - Implementation scripts (belongs in .claude/skills/{name}/scripts/)

4. **Skill files** should contain:
   - Clear purpose statement
   - Usage examples
   - Input/output specifications
   - Integration points with agents

## Implementation Notes

### Fetch Script (fetch-docs.js)

**Features:**
- Uses only Node.js built-in modules (https, fs, path)
- Handles HTTP redirects (3xx responses)
- Respects server with 200ms delay between requests
- 24-hour cache to avoid unnecessary fetches
- Comprehensive error reporting

**Cache behavior:**
- Checks `last-updated.txt` timestamp
- Skips fetch if < 24 hours old (unless --force)
- Always updates timestamp on successful fetch

**Error handling:**
- Reports HTTP errors with status codes
- Continues on individual page failures
- Prints summary of successes and failures

### Verify Command (future implementation)

The verify command should:
1. Read official specs from `~/.claude/references/claude-code/`
2. Parse all agents in `.claude/agents/*.md`
3. Parse all skills in `.claude/skills/*/SKILL.md`
4. Check each against official requirements
5. Report violations with suggestions for fixes

## Integration with Other Skills

### create-agent
- Should verify new agents against official spec
- Use `/claude-code-bible verify --agent <name>` after creation

### update-docs
- Should update local docs first: `/claude-code-bible update`
- Then verify sync with: `/claude-code-bible verify`

### dev-review
- Can reference official docs for best practices
- Verify code patterns against Claude Code recommendations

## Benefits

1. **Compliance**: Ensure agents/skills match official specifications
2. **Up-to-date**: Always have latest documentation locally
3. **Offline access**: Work with docs even without internet
4. **Automation**: Verify compliance automatically before commits
5. **Learning**: Reference official patterns when creating new components

## Example Workflow

```bash
# 1. Update local docs
node .claude/skills/claude-code-bible/scripts/fetch-docs.js

# 2. Create a new agent
/create-agent my-new-agent

# 3. Verify it matches official spec
/claude-code-bible verify --agent my-new-agent

# 4. Fix any violations

# 5. Verify again
/claude-code-bible verify --agent my-new-agent

# 6. Commit when all checks pass
```

## Notes

- The verify command implementation is left for future work
- The fetch script is production-ready and can be used immediately
- Consider running `/claude-code-bible update` weekly to stay current
- Add this as a pre-commit hook to enforce compliance automatically

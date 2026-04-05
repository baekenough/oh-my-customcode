---
name: skills-sh-search
description: Search and install skills from skills.sh marketplace when internal skills are insufficient
scope: core
argument-hint: "<query> [--install] [--global]"
user-invocable: true
---

# Skills.sh Search Skill

Search the [skills.sh](https://skills.sh/) marketplace for reusable AI agent skills when no matching internal skill exists. Install discovered skills directly into the project.

## Prerequisites

- Node.js and npx available in PATH
- Network access to skills.sh registry

## Options

```
<query>          Required. Search query describing the capability needed
--install, -i    Install selected skill after search
--global, -g     Install to ~/.claude/skills/ instead of project .claude/skills/
--list, -l       List currently installed skills.sh skills
--check, -c      Check for updates on installed skills.sh skills
--source, -s     Search source: "skills-sh" (default) | "agentskills" | "all"
```

## Workflow

```
1. Search skills.sh marketplace
   ├── Run: npx --yes skills find "<query>"
   ├── Review results (name, description, install count)
   └── Present top candidates to user

2. User selects skill
   ├── Confirm selection with user
   └── Check for namespace conflicts with existing skills

3. Install skill
   ├── Run: npx --yes skills add <source> [-g]
   ├── Verify installation in .claude/skills/
   └── Check installed SKILL.md frontmatter

4. Post-install adaptation
   ├── Review installed SKILL.md frontmatter
   ├── Add oh-my-customcode fields if missing:
   │   ├── user-invocable: true|false
   │   ├── model-invocable (if not present)
   │   └── argument-hint (if applicable)
   └── Add source metadata:
       ├── source-type: skills-sh
       └── source-origin: <owner/repo>

5. Ontology sync
   ├── Notify: run "omcustom ontology build" to register new skill
   └── Or manually add to skills.yaml if ontology CLI unavailable
```

## Namespace Conflict Check

Before installing, verify no existing skill shares the same name:

```bash
# Check for conflict
ls .claude/skills/ | grep -w "<skill-name>"
```

If conflict exists:
- Warn user about the conflict
- Suggest renaming or skipping
- Never overwrite existing skills without explicit approval

## Output Format

### Search Results
```
[skills-sh-search] Searching marketplace...

Query: "<query>"
Results: 5 found

  1. owner/skill-name (12.3K installs)
     Description of the skill

  2. owner/another-skill (8.1K installs)
     Description of the skill

  3. owner/third-skill (3.5K installs)
     Description of the skill

Select [1-3] or "skip" to cancel:
```

### Install Success
```
[skills-sh-search] Installed

Skill: <skill-name>
Source: <owner/repo>
Location: .claude/skills/<skill-name>/SKILL.md
Adapted: ✓ (added user-invocable, source metadata)

Next: Run "omcustom ontology build" to register in ontology.
```

### Install Failure
```
[skills-sh-search] Failed

Error: <error_message>
Suggested Fix: <suggestion>
```

### No Results
```
[skills-sh-search] No Results

Query: "<query>"
Suggestions:
  - Try broader search terms
  - Check https://skills.sh/ directly
  - Consider creating a custom skill with /create-agent
```

## Alternative Sources

### agentskills.io (opt-in)

Search the [agentskills.io](https://agentskills.io/) community skill registry as an alternative source.

**Search workflow:**
```
1. Try: npx --yes @agentskill.sh/cli search "<query>"
2. If CLI unavailable: WebSearch "site:agentskills.io <query>"
3. Present results with source attribution
```

**Install workflow:**
```
1. Run: npx --yes @agentskill.sh/cli install <slug>
2. Verify installation in .claude/skills/
3. Add source metadata:
   ├── source-type: agentskills-io
   └── source-origin: <slug>
```

**Usage:**
```bash
# Search agentskills.io only
/skills-sh-search "memory management" --source agentskills

# Search both sources
/skills-sh-search "testing patterns" --source all
```

**Fallback chain:**
| Step | Tool | Condition |
|------|------|-----------|
| 1 | `@agentskill.sh/cli search` | Primary — if CLI available |
| 2 | `WebSearch site:agentskills.io` | CLI unavailable or no results |
| 3 | Report no results | Both failed |

## Examples

```bash
# Search for Terraform skills
/skills-sh-search terraform infrastructure

# Search and install
/skills-sh-search "react testing patterns" --install

# Install globally
/skills-sh-search "git workflow" --install --global

# List installed skills.sh skills
/skills-sh-search --list

# Check for updates
/skills-sh-search --check

# Search agentskills.io
/skills-sh-search "agent memory" --source agentskills

# Search all sources
/skills-sh-search "code review" --source all --install
```

## Integration

### With intent-detection
When intent-detection finds no matching agent and the domain is identifiable, this skill can be suggested as a fallback to find relevant external skills.

### With update-external
Installed skills.sh skills are tracked with `source-type: skills-sh` metadata, enabling `update-external` to check for updates via `npx skills check`.

### With create-agent
If a skills.sh skill provides domain knowledge, `create-agent` can reference it when building a new agent for that domain.

### With agentskills.io
Installed agentskills.io skills are tracked with `source-type: agentskills-io` metadata, enabling `update-external` to check for updates. Default source remains skills.sh; agentskills.io is opt-in via `--source` flag.

## Safety

- **Read-only by default**: Search does not modify anything
- **Explicit install**: Installation requires `--install` flag or user confirmation
- **No auto-execution**: Installed skills are not auto-invoked without ontology registration
- **Conflict protection**: Never overwrites existing skills
- **Telemetry opt-out**: Set `DISABLE_TELEMETRY=1` to disable skills CLI telemetry

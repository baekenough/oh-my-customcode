---
name: update-external
description: Update agents from external sources (GitHub, docs, etc.)
argument-hint: "[agent-name] [--check] [--force]"
disable-model-invocation: true
---

# Update External Sources Skill

Updates agents, skills, and guides that have external sources (GitHub, official docs, etc.) to their latest versions.

## Options

```
--check, -c      Check for updates without applying
--force, -f      Force update even if current
--verbose, -v    Show detailed changes
```

## External Sources

### Agents
```yaml
fe-vercel-agent:
  source: https://github.com/vercel-labs/agent-skills
  type: github
```

### Skills (from external agents)
```yaml
react-best-practices:
  source: https://github.com/vercel-labs/agent-skills
  type: github

web-design-guidelines:
  source: https://github.com/vercel-labs/agent-skills
  type: github
```

### Guides (reference documentation)
```yaml
golang:
  source: https://go.dev/doc/effective_go
  type: documentation

python:
  source: https://peps.python.org/pep-0008/
  type: documentation
```

## Workflow

```
1. Identify external resources
   ├── Scan index.yaml files
   ├── Find source.type = "external"
   └── Collect URLs and versions

2. Check for updates
   ├── GitHub: Check releases/commits
   ├── Documentation: Check last-modified
   └── Compare with current version

3. Fetch updates
   ├── Download new content
   ├── Parse and extract relevant parts
   └── Validate content

4. Apply updates
   ├── Update content files
   ├── Update version in index.yaml
   ├── Update last_updated timestamp
   └── Run mgr-supplier:audit to validate
```

## Version Tracking

Updates are tracked in each resource's index.yaml:

```yaml
source:
  type: external
  origin: github
  url: https://github.com/vercel-labs/agent-skills
  version: "1.2.0"
  last_updated: "2026-01-22"
  update_history:
    - version: "1.0.0"
      date: "2026-01-20"
    - version: "1.2.0"
      date: "2026-01-22"
```

## Output Format

### Check Mode
```
[mgr-updater:external --check]

Checking for external updates...

Agents:
  fe-vercel-agent
    Current: v1.0.0
    Latest:  v1.2.0
    Status:  UPDATE AVAILABLE

Skills:
  react-best-practices
    Source: github.com/vercel-labs/agent-skills
    Status: UPDATE AVAILABLE (linked to agent)

Guides:
  golang
    Source: go.dev/doc/effective_go
    Last fetched: 2026-01-22
    Status: UP TO DATE

Summary:
  Updates available: 1 agent, 1 skill
  Up to date: 11 guides

Run "mgr-updater:external" to apply updates.
```

### Update Mode
```
[mgr-updater:external]

Updating external resources...

[1/2] Updating fe-vercel-agent
  Fetching from github.com/vercel-labs/agent-skills...
  ✓ Downloaded v1.2.0
  ✓ Updated AGENT.md
  ✓ Updated index.yaml (version: 1.0.0 → 1.2.0)
  ✓ Updated related skills

[2/2] Validating updates
  Running mgr-supplier:audit...
  ✓ All dependencies valid

Summary:
  Updated: 1 agent
  Synced: 3 skills
  Validated: ✓

All external resources updated successfully.
```

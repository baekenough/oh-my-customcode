# Command: updater:external

> Update agents from external sources

## Purpose

Updates agents, skills, and guides that have external sources (GitHub, official docs, etc.) to their latest versions.

## Usage

```
updater:external
updater:external --check
updater:external <agent-name>
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| target | string | no | Specific agent/skill/guide to update |

## Options

```
--check, -c      Check for updates without applying
--force, -f      Force update even if current
--verbose, -v    Show detailed changes
```

## External Sources

### Agents
```yaml
vercel-agent:
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

# ... and others
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
   └── Run supplier:audit to validate
```

## Output

### Check Mode

```
[updater:external --check]

Checking for external updates...

Agents:
  vercel-agent
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

  python
    Source: peps.python.org/pep-0008
    Last fetched: 2026-01-22
    Status: UP TO DATE

Summary:
  Updates available: 1 agent, 1 skill
  Up to date: 11 guides

Run "updater:external" to apply updates.
```

### Update Mode

```
[updater:external]

Updating external resources...

[1/2] Updating vercel-agent
  Fetching from github.com/vercel-labs/agent-skills...
  ✓ Downloaded v1.2.0
  ✓ Updated AGENT.md
  ✓ Updated index.yaml (version: 1.0.0 → 1.2.0)
  ✓ Updated related skills

[2/2] Validating updates
  Running supplier:audit...
  ✓ All dependencies valid

Summary:
  Updated: 1 agent
  Synced: 3 skills
  Validated: ✓

All external resources updated successfully.
```

### Single Target Update

```
[updater:external vercel-agent]

Updating vercel-agent...

Source: https://github.com/vercel-labs/agent-skills
Current version: v1.0.0

Fetching latest...
  ✓ Found v1.2.0

Changes:
  - New skill: nextjs-optimization
  - Updated: react-best-practices (40 → 45 rules)
  - Updated: web-design-guidelines (100 → 110 rules)

Apply update? [y/n]: y

Applying...
  ✓ Updated AGENT.md
  ✓ Updated skills (3 files)
  ✓ Updated index.yaml
  ✓ Version: v1.0.0 → v1.2.0

Update complete.
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

## Error Handling

```yaml
network_error:
  action: Retry with backoff
  fallback: Skip with warning

parse_error:
  action: Log and skip
  fallback: Keep current version

validation_error:
  action: Rollback changes
  fallback: Alert user
```

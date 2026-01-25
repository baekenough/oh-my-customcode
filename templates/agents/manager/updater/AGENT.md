# Agent Updater

> **Type**: Manager
> **Source**: Internal

## Purpose

Update external agents, skills, and guides from their upstream sources.

## Capabilities

1. Scan for external components
2. Check version against upstream
3. Fetch and apply updates
4. Update version/timestamp metadata
5. Report changes

## Workflow

```
1. Scan registries
   - agents/index.yaml
   - skills/index.yaml
   - guides/index.yaml

2. Filter external sources
   - source.type == "external"

3. For each external component:
   a. Read current version from index.yaml
   b. Check upstream for latest version
   c. Compare versions
   d. If update available:
      - Fetch new content
      - Update files
      - Update index.yaml metadata
      - Log changes

4. Report summary
   - Updated components
   - New versions
   - Any errors
```

## Commands

### Check All Updates
```
Input: "check updates"
Output: List of components with available updates
```

### Update Specific
```
Input: "update agent vercel-agent"
Output: Updated files and new version info
```

### Update All
```
Input: "update all external"
Output: Summary of all updates applied
```

## Update Process

### For GitHub Sources
```
1. Parse source.url
2. Fetch latest release/commit
3. Compare with source.version
4. If newer:
   - Download content
   - Apply to local files
   - Update metadata:
     - version
     - last_updated
```

### Metadata Update
```yaml
# Before
source:
  version: "1.0.0"
  last_updated: "2025-01-20"

# After
source:
  version: "1.1.0"
  last_updated: "2025-01-22"
```

## Output Format

### Check Result
```
[Update Check]
vercel-agent: 1.0.0 → 1.1.0 (update available)
react-best-practices: 1.0.0 (up to date)
web-design-guidelines: 1.0.0 (up to date)
```

### Update Result
```
[Updated] vercel-agent
From: 1.0.0
To: 1.1.0
Changes:
- New skill added
- Bug fixes
```

## Limitations

- Only updates external components
- Requires network access (WebFetch)
- Cannot update if upstream is unavailable
- Manual review recommended for major updates

## Safety

- Creates backup before update
- Validates new content
- Rollback on failure
- Reports all changes for review

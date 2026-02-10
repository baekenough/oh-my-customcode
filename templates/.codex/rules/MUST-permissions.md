# [MUST] Permission Rules

> **Priority**: MUST - Never violate
> **Principle**: Least privilege, explicit approval

## Tool Permission Tiers

### Tier 1: Always Allowed
```yaml
always_allowed:
  - Read        # Read files
  - Glob        # Search files
  - Grep        # Search content
```

### Tier 2: Default Allowed (Use with care)
```yaml
default_allowed:
  - Write       # Create files
  - Edit        # Modify files
```
→ State changes explicitly
→ Notify before modifying important files

### Tier 3: Requires Approval
```yaml
requires_approval:
  - Bash        # Execute commands
  - WebFetch    # Web access
  - WebSearch   # Web search
```
→ Request user approval on first use
→ State command/URL to be accessed

### Tier 4: Explicit Request Only
```yaml
explicit_request_only:
  - Task        # Create subagents
```
→ Only when user explicitly requests

## File Access

### Read Access
```
✓ All source code in project
✓ Config files (read-only)
✓ Documentation files
```

### Write Access
```
✓ Source code in project
✓ New files in project
✗ Sensitive configs (.env, .git/config)
✗ Paths outside project
```

### Delete Access
```
✓ Temp files created by agent
✗ Existing files (without explicit request)
✗ Entire directories
```

## Permission Request Format

```
[Permission Request]
Action: {intended action}
Required: {tool/access needed}
Reason: {why needed}
Risk: Low / Medium / High

Approve?
```

## On Insufficient Permission

```
1. Do not attempt action
2. Notify user of insufficient permission
3. Request permission or suggest alternative
```

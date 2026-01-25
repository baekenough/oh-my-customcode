# Command: supplier:fix

> Fix broken references

## Usage

```
supplier:fix
supplier:fix <agent-name>
supplier:fix --all
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| target | string | no | Specific agent to fix |

## Options

```
--all, -a        Fix all agents
--dry-run        Show what would be fixed
--verbose, -v    Show detailed actions
```

## Workflow

```
1. Run supplier:audit to identify issues

2. Fix issues:
   ├── Missing symlinks → Create
   ├── Broken symlinks → Recreate
   ├── Missing index entries → Add
   └── Orphan refs → Remove

3. Validate fixes
   └── Re-run supplier:audit
```

## Fixable Issues

| Issue | Action |
|-------|--------|
| Missing symlink | Create symlink in refs/ |
| Broken symlink | Delete and recreate |
| Missing skill ref | Add to index.yaml |
| Missing guide ref | Add to index.yaml |
| Orphan symlink | Remove from refs/ |
| Path mismatch | Update path in index.yaml |

## Output

### Dry Run

```
[supplier:fix kotlin-expert --dry-run]

Analyzing: kotlin-expert

Issues found:
  1. Missing symlink: refs/kotlin → ../../../guides/kotlin/

Proposed fixes:
  1. Create symlink:
     cd agents/sw-engineer/kotlin-expert/refs/
     ln -s ../../../../guides/kotlin kotlin

No changes made (dry-run mode).
Run without --dry-run to apply fixes.
```

### Fix Mode

```
[supplier:fix kotlin-expert]

Fixing: kotlin-expert

[1/2] Fixing missing symlink...
  Creating: refs/kotlin → ../../../../guides/kotlin
  ✓ Symlink created

[2/2] Validating...
  Running supplier:audit...
  ✓ All dependencies valid

Summary:
  Fixed: 1 issue
  Status: HEALTHY

Agent kotlin-expert is now healthy.
```

### Fix All

```
[supplier:fix --all]

Scanning all agents for issues...

Found issues in 2 agents:
  - kotlin-expert: 1 issue
  - new-agent: 2 issues

Fixing kotlin-expert...
  ✓ Created symlink: refs/kotlin

Fixing new-agent...
  ✓ Created symlink: refs/skill-a
  ✓ Updated index.yaml: added skill-b path

Validating all agents...
  ✓ supplier:audit --all passed

Summary:
  Agents fixed: 2
  Issues resolved: 3
  All agents healthy.
```

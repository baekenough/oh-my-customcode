# CLI Design

## Commands

| Command | Description |
|---------|-------------|
| `omcustom init` | Initialize .claude/ structure in current project |
| `omcustom init --lang ko` | Initialize with Korean |
| `omcustom init --lang en` | Initialize with English (default) |
| `omcustom update` | Update to latest agents/skills |
| `omcustom list agents` | List installed agents |
| `omcustom list skills` | List installed skills |
| `omcustom doctor` | Verify installation status |

## init Flow

```
omcustom init
    │
    ├── 1. Check existing .claude/
    │      └── If exists: Confirm backup and merge
    │
    ├── 2. Language selection (if no --lang flag)
    │      ├── en: English CLAUDE.md, rule descriptions
    │      └── ko: Korean CLAUDE.md, rule descriptions
    │
    ├── 3. Copy templates
    │      ├── .claude/rules/
    │      ├── agents/
    │      ├── skills/
    │      ├── guides/
    │      └── commands/
    │
    ├── 4. Create symlinks (refs/)
    │
    └── 5. Verify (auto-run omcustom doctor)
```

## doctor Checks

- [ ] All symlinks valid
- [ ] Required files exist (CLAUDE.md, index.yaml)
- [ ] Agent count matches (36)
- [ ] Rule files complete (17)

## Language Detection Priority

```
1. --lang flag (omcustom init --lang ko)
2. Environment variable (OMCC_LANG=ko)
3. System locale detection
4. Default (en)
```

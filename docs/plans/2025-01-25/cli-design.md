# CLI Design

## Commands

| Command | Description |
|---------|-------------|
| `omcc init` | Initialize .claude/ structure in current project |
| `omcc init --lang ko` | Initialize with Korean |
| `omcc init --lang en` | Initialize with English (default) |
| `omcc update` | Update to latest agents/skills |
| `omcc list agents` | List installed agents |
| `omcc list skills` | List installed skills |
| `omcc doctor` | Verify installation status |

## init Flow

```
omcc init
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
    └── 5. Verify (auto-run omcc doctor)
```

## doctor Checks

- [ ] All symlinks valid
- [ ] Required files exist (CLAUDE.md, index.yaml)
- [ ] Agent count matches (36)
- [ ] Rule files complete (17)

## Language Detection Priority

```
1. --lang flag (omcc init --lang ko)
2. Environment variable (OMCC_LANG=ko)
3. System locale detection
4. Default (en)
```

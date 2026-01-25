# i18n Design

## Supported Languages

| Language | Code | Default |
|----------|------|---------|
| English | `en` | ✓ |
| Korean | `ko` | |

## Structure

```
src/
└── i18n/
    ├── index.ts              # i18n initialization and helpers
    ├── locales/
    │   ├── en.json           # English messages
    │   └── ko.json           # Korean messages
    └── types.ts              # Type definitions

templates/
├── .claude/
│   └── rules/
│       ├── en/               # English rule descriptions
│       └── ko/               # Korean rule descriptions
├── CLAUDE.md.en              # English version
└── CLAUDE.md.ko              # Korean version
```

## Message Examples

```json
// en.json
{
  "cli": {
    "init": {
      "start": "Initializing oh-my-customcode...",
      "success": "Successfully initialized!",
      "exists": "Existing .claude/ found. Backup and merge?"
    },
    "doctor": {
      "checking": "Checking installation...",
      "passed": "All checks passed!",
      "failed": "Some checks failed."
    }
  }
}

// ko.json
{
  "cli": {
    "init": {
      "start": "oh-my-customcode 초기화 중...",
      "success": "초기화 완료!",
      "exists": "기존 .claude/가 있습니다. 백업 후 병합할까요?"
    },
    "doctor": {
      "checking": "설치 상태 확인 중...",
      "passed": "모든 검사 통과!",
      "failed": "일부 검사 실패."
    }
  }
}
```

## Language Detection Priority

```
1. --lang flag (omcc init --lang ko)
2. Environment variable (OMCC_LANG=ko)
3. System locale detection
4. Default (en)
```

## Documentation

| File | Language |
|------|----------|
| README.md | English |
| README_ko.md | Korean |
| docs/guides/*.md | English |
| docs/guides/*_ko.md | Korean |

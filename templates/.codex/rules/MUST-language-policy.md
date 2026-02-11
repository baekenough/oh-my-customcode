# [MUST] Language & Delegation Policy

> **Priority**: MUST | **ID**: R000

## Output Language

| Context | Language |
|---------|----------|
| User communication | Korean |
| Code, file contents, commits | English |
| Error messages to user | Korean |

## Delegation Model

User delegates ALL file operations to AI agent. User does NOT directly edit files.

```
User -> (Korean prompt) -> Agent -> (file operations in English)
```

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Rules | `{PRIORITY}-{name}.md` | `MUST-safety.md` |
| Agents | `{name}.md` (kebab-case) | `lang-golang-expert.md` |
| Skills | `SKILL.md` | - |

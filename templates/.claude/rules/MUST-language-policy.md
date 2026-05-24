# [MUST] Language & Delegation Policy

> **Priority**: MUST | **ID**: R000

## Output Language

| Context | Language |
|---------|----------|
| User communication | Korean |
| User communication honorific | 합쇼체 (formal polite, "-습니다/-합니다") |
| Code, file contents, commits | English |
| Error messages to user | Korean |
| PR title/body, GitHub issues | Korean (default, overridable in project CLAUDE.md) |

## Honorific Level

Korean user-facing output MUST use 합쇼체 (formal polite ending: -습니다/-합니다/-십시오), NOT 반말 (informal) or 해요체 (semi-formal).

| Anti-pattern (반말/생략) | Required (합쇼체) |
|--------------------------|-------------------|
| "확인" / "확인했음" | "확인했습니다" |
| "재호출" / "재호출함" | "재호출하겠습니다" |
| "수정" / "수정함" | "수정하겠습니다" |
| "안 멈췄음" | "멈추지 않았습니다" |
| "이상함" | "이상합니다" |
| "OK" / "좋다" | "확인했습니다" / "좋습니다" |

**Why**: Token-saving 모드에서 LLM 이 비격식체로 회귀하는 패턴이 #1202 / #1188 item #1 에서 관찰됨. 격식 수준은 R000 사용자 통신 규약의 핵심 부분.

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

---
title: Omcustom Feedback
type: skill
updated: 2026-10-06
sources:
  - .claude/skills/omcustom-feedback/SKILL.md
related:
  - [[mgr-gitnerd]]
  - [[R016]]
  - [[R011]]
---

# Omcustom Feedback

Submit feedback about oh-my-customcode as a GitHub Issue directly from the CLI — invocable by both user and model, with an offline-safe local fallback.

## Overview

`/omcustom-feedback` collects feedback (bug, feature, improvement, question), auto-detects category from inline content or asks interactively via `AskUserQuestion`, and files a GitHub Issue directly to `baekenough/oh-my-customcode` through [[mgr-gitnerd]] after explicit preview confirmation, using a complete title file and `--body-file`. `--anonymous` submissions prefix `[Anonymous Feedback]` on the title, add an `anonymous` label, omit the project name, and make environment info opt-in. Supports the [[R016]] continuous improvement workflow, since feedback issues are the trigger for rule/skill updates.

As of #1226/#1227 (v0.152.0), `disable-model-invocation: true` was removed — the skill is invocable by both user and model. The primary model use case is [[R011]]'s session-end retrospective feedback drafting: the model analyzes session friction/learnings and drafts an issue proposal. The Phase 4A "Preview + confirmation" gate remains the abuse-mitigation safety boundary — the model can draft but never auto-creates a public issue without explicit user confirmation.

As of #1469 (v1.1.10), the documented invocation examples were corrected from a stale `/omcustom:feedback` namespace form to the actual `/omcustom-feedback` command (a skill-name-vs-documented-command mismatch affecting 5 skills).

## Workflow (4 phases)

| Phase | Action |
|-------|--------|
| 1. Input Parsing | Strip `--anonymous`, auto-detect category from content or ask interactively |
| 2. Route Decision | Check `gh` CLI availability + auth → Route A (create issue) vs Fallback |
| 3. Environment Collection | omcustom version, Claude Code version, OS, project name (opt-in when anonymous) |
| 4A. GitHub Issue Creation | Preview + confirm → mgr-gitnerd writes approved title/body files and submits |
| 4D. Local Fallback | Save JSON to `~/.omcustom/feedback/{timestamp}.json` when `gh` unavailable/unauthenticated |

## 승인된 파일 제출과 label 재시도

Phase 4A의 preview를 명시적으로 승인받은 뒤에만 [[agents/mgr-gitnerd|mgr-gitnerd]]에게 Write 문안 파일 작성과 제출을 함께 위임하십시오. 제목은 80자 처리 규칙과 익명 접두사를 포함한 승인 값으로 완성하고 문안이 달라지면 preview와 확인을 다시 받으십시오. category·source·description 등 필수 필드, 익명 프로젝트 제외·환경 opt-in, feedback/category/anonymous label을 유지하십시오. 모델의 자동 공개 제출은 허용하지 마십시오.

제목 bytes에서 NUL·CR·내부/추가 LF·빈 값·space/tab-only를 거부하고 마지막 LF 0개/1개 및 의미 있는 공백을 보존하십시오. 본문 regular file 읽기와 NUL 부재를 확인한 뒤 quoted title argv와 body-file을 사용하십시오. 이는 Write-produced UTF-8 텍스트의 구조 검사이며 범용 UTF-8 검증은 아닙니다. fixed heredoc이나 고정 tmp 경로로 문안을 옮기지 마십시오.

label 생성 실패와 label 때문에 발생한 issue 생성 실패를 확인한 때만 같은 승인 파일·preflight로 label 없는 재시도를 한 번 수행하십시오. 이때 실행 블록의 `LABEL_RETRY=false` 줄을 `LABEL_RETRY=true`로 바꾸십시오. export만 하면 블록이 false로 덮어쓰므로 재시도 분기가 선택되지 않습니다. 다른 실패는 기존 Phase 4D local fallback으로 넘기고 자기 파일만 정리하십시오.

[source Phase 4A/4D](../../.claude/skills/omcustom-feedback/SKILL.md)의 동의·privacy·retry 경계를 참고하십시오.

## Key Details

- **Scope**: harness
- **User-invocable**: yes (`/omcustom-feedback`)
- **Model-invocable**: yes (via Skill tool — since #1226/#1227)
- **Category → label**: bug→bug, feature/improvement→enhancement, question→question
- **Safety boundary**: Phase 4A Preview + confirmation gate (model cannot publish without user approval)
- **Fallback**: local JSON save when `gh` is unavailable or unauthenticated — feedback is never silently lost offline
- **Target repo**: hardcoded to `baekenough/oh-my-customcode`
- **Effort**: not specified

## Relationships

- **Invoked by**: user (slash command) and orchestrator (model, via Skill tool for [[R011]] session-end retrospectives)
- **Related rules**: [[R016]] (continuous improvement — feedback is the trigger mechanism), [[R011]] (session-end retrospective drafting)
- **See also**: [[mgr-gitnerd]] (project's canonical Git/GitHub delegation agent; Phase 4A delegates approved file writing and submission together)

## Sources

- [`.claude/skills/omcustom-feedback/SKILL.md`](../../.claude/skills/omcustom-feedback/SKILL.md) — skill definition

---
title: Claude Native
type: skill
updated: 2026-10-06
sources:
  - .claude/skills/claude-native/SKILL.md
related:
  - [[mgr-claude-code-bible]]
  - [[update-external]]
  - [[claude-code-bible]]
  - [[claude-code]]
  - [[audit-agents]]
---

# Claude Native

Monitor Claude Code (the CLI tool) release history and auto-generate one GitHub issue per untracked version.

## Overview

Fetches Claude Code releases from `gh api repos/anthropics/claude-code/releases`, dedups against existing `Claude Code v{version}` issues (title-pattern search), and files a new issue per gap using a fixed template (release summary + a 6-item review checklist covering agent/rule impact, feature relevance, and version compatibility — expanded from 4 items in v1.1.77, #1717). Two new checklist items route new knowledge to its post-R016-policy destination: record new CC knowledge as a per-rule section in `guides/claude-code/15-version-compatibility.md` (+ `templates/` mirror) rather than accumulating it in a rule body, and add at most ONE line to a rule only when the release changes current agent behavior — checking first that `CLAUDE.md` + `.claude/rules/*.md` (comments stripped) stays under R016's 140,000-char budget gate before adding it. Only versions >= `2.1.86` are in scope — monitoring resumed there after the deprecated customclaw Airflow-based watcher stopped (deprecated 2026-03-18); this skill fills that gap and is the successor mechanism. Default run checks only the latest 5 releases; `--backfill` scans the full paginated history; `--dry-run` reports without creating issues. Version compare is numeric semver (major.minor.patch) and explicitly does NOT assume contiguous patch numbers — CC skips some patches (e.g. v2.1.151, v2.1.155 never shipped), so the skill acts only on versions actually present in the API response.

## 제출 문안 경계

Phase 4에서는 [[agents/mgr-creator|mgr-creator]]가 Write로 완성 제목과 본문을 고유 파일에 작성하고 [[agents/mgr-gitnerd|mgr-gitnerd]]가 GitHub 변경을 제출하게 하십시오. 제목에는 기존 `Claude Code v{version}` 접두사를 포함하십시오. release 문구는 비신뢰 데이터로 취급하고 셸 소스로 다시 입력하지 마십시오.

셸 변환 전에 원본 제목 bytes에서 NUL·CR·내부/추가 LF·빈 값·space/tab-only를 거부하고 마지막 LF는 0개 또는 1개만 허용하십시오. 의미 있는 공백은 보존하십시오. 본문은 regular file 읽기 성공과 NUL 부재를 확인하십시오. Write-produced UTF-8 텍스트의 구조 검사이며 universal strict UTF-8 검증기로 일반화하지 마십시오. 파일 제목은 quoted argv, 본문은 body-file로 전달하고 도구·읽기·구조 오류이면 제출을 중단하십시오. 기존 빈 release fallback·2000자 body 제한, dedup·dry-run·version 범위와 조회 상한을 유지하십시오.

[source Phase 4](../../.claude/skills/claude-native/SKILL.md)의 문안·제출 역할 및 live preflight를 참고하십시오.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/claude-native [--backfill] [--dry-run]`
- **Effort**: not specified

## Relationships

- **Feeds**: issues consumed by [[mgr-claude-code-bible]] (spec compliance) and [[update-external]] (agent/skill sync) review cycles
- **Related skills**: [[update-external]], [[claude-code-bible]], [[audit-agents]]
- **See also**: [[claude-code]] (guide referencing skill-generated issues), [[R016]] (continuous improvement — issues drive rule updates)
- **Integration paths**: manual slash command, SessionStart hook (illustrative example only: `claude-native-check.sh` is a hypothetical script you would write yourself, not shipped or registered in `hooks.json`; the example command uses the anchored form `bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/claude-native-check.sh"`), or scheduled via `/schedule` / CronCreate MCP

## Sources

- `.claude/skills/claude-native/SKILL.md` — skill definition
- Content-drift resync 2026-09-24 (v1.1.77, #1717): added two action-item checklist entries routing new CC knowledge to `guides/claude-code/15-version-compatibility.md` per rule and capping rule-body additions at one behavioral line, gated by [[r016]]'s new 140,000-char instruction-budget check. See [[r016]] for the full policy this issues from.
- Content-drift resync 2026-10-03 (#1774): SessionStart hook example now uses the anchored `${CLAUDE_PROJECT_DIR:-.}` form and is marked illustrative.

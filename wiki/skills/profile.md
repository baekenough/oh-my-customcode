---
title: Profile
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/profile/SKILL.md
related:
  - [[sys-memory-keeper]]
  - [[token-efficiency-audit]]
  - [[profiles-manifest-install]]
  - [[r006]]
  - [[r010]]
  - [[r013]]
---

# Profile

Load a skill profile to switch active plugin set for a specific workflow context.

## Overview

Switches the active plugin set in `~/.claude/settings.json` to match a named workflow profile, reducing per-spawn skill enumeration overhead. Four built-in profiles cover common contexts: web-app, data-eng, harness-dev, and minimal. Profile changes take effect after session restart. Addresses #1041 hypothesis A (token overhead from full plugin enumeration).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/profile <profile-name> | list | current`
- **Argument hint**: `<profile-name> | list | current`
- **Allowed tools**: Read, Bash, Edit, Write

## Commands

| Command | Action |
|---------|--------|
| `/profile list` | Show all available profiles and currently active one |
| `/profile current` | Show currently active profile |
| `/profile load <name>` | Activate a profile (requires session restart) |
| `/profile reset` | Remove active profile marker (restores full plugin set) |

## Built-in Profiles

| Profile | Purpose |
|---------|---------|
| `web-app` | Web application development (frontend + auth + deploy) |
| `data-eng` | Data engineering sessions (Airflow, Spark, Kafka, Snowflake, dbt) |
| `harness-dev` | oh-my-customcode harness development (agent/skill/rule authoring) |
| `minimal` | Minimal plugin set for low-overhead sessions (memory + core only) |

## Implementation Notes

- Profile JSON files live in `.claude/profiles/*.json`
- Active profile marker stored in `.claude/profiles/.active`
- All `.claude/` writes use direct Write/Edit/Bash under `mode: "bypassPermissions"` (CC v2.1.121+, [[r010]] sensitive-path relaxation) — the legacy `/tmp/*.sh` bypass wrapper is deprecated
- `/profile reset` deletes the marker via `Bash: /bin/rm .claude/profiles/.active` (explicit binary path, not a bare `rm`)
- `enabledPlugins` in `~/.claude/settings.json` is updated with per-plugin boolean flags
- Plugins not listed in a profile retain their current state; changes apply only after session restart

## Manifest Profile Integration

`templates/manifest.json#profiles`의 Manifest profiles는 설치 시 에이전트·스킬·가이드 범위를 지정한다. Plugin profiles(plugin on/off)와 별개의 독립 시스템으로, 동일 이름(`web-app` 등)으로 두 시스템을 함께 사용할 수 있다.

| 시스템 | 경로 | 역할 | 적용 시점 |
|--------|------|------|-----------|
| Plugin profiles | `.claude/profiles/*.json` | plugin on/off | 세션 재시작 후 |
| Manifest profiles | `templates/manifest.json#profiles` | 설치 자산 범위 | `omcustom install --profile` |

Manifest profile `include` 패턴: `"*"`(카테고리 전체), `"mgr-*"`(prefix glob), `{"scope": "core"}`(SKILL.md scope 필드 기준), 또는 특정 이름 하나만 지정.

전체 사용 가이드: [[profiles-manifest-install]]

## Relationships

- **Related issues**: #1041 (token overhead), #1080 (skill implementation), #1177 (manifest profiles), #1101 (bypassPermissions relaxation)
- **See also**: [[r010]], [[r013]], [[r006]]

## Sources

- `.claude/skills/profile/SKILL.md` — skill definition
- `guides/profiles/manifest-install.md` — manifest profile 전체 가이드

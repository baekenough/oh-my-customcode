---
name: profile
description: Load a skill profile to switch active plugin set. Use when user wants to focus on a specific workflow (web-app/data-eng/harness-dev/minimal) and reduce skill enumeration block size per #1041.
scope: core
user-invocable: true
argument-hint: "<profile-name> | list | current"
allowed-tools: [Read, Bash, Edit, Write]
---

# Profile Loader

Switch the active plugin set to match a workflow profile, reducing per-spawn skill enumeration overhead (see #1041, #1080).

## Usage

```
/profile list                   # Show all available profiles
/profile current                # Show currently active profile
/profile load <name>            # Activate a profile (requires session restart)
/profile reset                  # Remove active profile marker (restores full plugin set)
```

## Implementation rules

> **.claude/ path handling (CC v2.1.121+)**
> Direct Write/Edit on `.claude/profiles/.active` and `~/.claude/settings.json` is permitted under `mode: "bypassPermissions"` (CC v2.1.121+, #1101). The legacy `/tmp/*.sh` bypass is deprecated. For CC < v2.1.121, see git history for the legacy pattern.

## Profiles directory

Profiles live in `.claude/profiles/*.json`. Active profile marker: `.claude/profiles/.active` (plain text, contains profile name).

Global plugin state is stored in `~/.claude/settings.json` under `enabledPlugins` (object: plugin-key → boolean).

## Workflow: `/profile list`

1. `Read .claude/profiles/` — glob `*.json`
2. For each JSON file: read `name` and `description` fields
3. Check `.claude/profiles/.active` for currently active profile
4. Print table:

```
Available profiles:
  web-app      Web application development (frontend + auth + deploy)
  data-eng     Data engineering sessions (Airflow, Spark, Kafka, Snowflake, dbt)
  harness-dev  oh-my-customcode harness development (agent/skill/rule authoring)
  minimal      Minimal plugin set for low-overhead sessions (memory + core only)

Active: web-app  (restart required to apply plugin changes)
```

## Workflow: `/profile current`

1. Read `.claude/profiles/.active`
2. If exists: print `Active profile: <name>`
3. If missing: print `No profile active (full plugin set in use)`

## Workflow: `/profile load <name>`

1. Locate `.claude/profiles/<name>.json`
2. Read profile JSON — extract `plugins.enabled` and `plugins.disabled`
3. Read `~/.claude/settings.json` — extract current `enabledPlugins` object
4. Compute diff:
   - Plugins to enable: in `plugins.enabled` but currently `false` or absent
   - Plugins to disable: in `plugins.disabled` but currently `true`
5. Show diff to user:

```
Profile: web-app
  Enable:  context7, superpowers, vercel, ui-design, ...
  Disable: codex, ralph-wiggum, agent-sdk-dev, ...
```

6. Apply changes via /tmp script:

```bash
cat > /tmp/profile-apply-$$.sh << 'APPLY'
#!/usr/bin/env python3
import json, sys

settings_path = "/Users/<user>/.claude/settings.json"  # resolve from $HOME
with open(settings_path) as f:
    settings = json.load(f)

profile_path = ".claude/profiles/<name>.json"
with open(profile_path) as f:
    profile = json.load(f)

for plugin in profile["plugins"]["enabled"]:
    settings.setdefault("enabledPlugins", {})[plugin] = True
for plugin in profile["plugins"]["disabled"]:
    settings.setdefault("enabledPlugins", {})[plugin] = False

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")

print("Settings updated.")
APPLY
python3 /tmp/profile-apply-$$.sh
```

7. Write active marker via /tmp script:

```bash
cat > /tmp/profile-marker-$$.sh << 'MARKER'
echo "<name>" > .claude/profiles/.active
MARKER
bash /tmp/profile-marker-$$.sh
```

8. Confirm:

```
[Done] Profile 'web-app' applied to ~/.claude/settings.json
Active marker written to .claude/profiles/.active
IMPORTANT: Restart this Claude Code session for plugin changes to take effect.
```

## Workflow: `/profile reset`

1. Remove `.claude/profiles/.active` marker via /tmp script
2. Print: `[Done] Profile marker removed. Full plugin set will be active after restart.`
3. Note: does NOT revert `~/.claude/settings.json` — user should re-run `/profile load <other>` or manually restore

## Notes

- Profile changes to `~/.claude/settings.json` take effect only after session restart
- Profiles define a subset: plugins not listed in `enabled` or `disabled` keep their current state
- Profile JSON `enabled`/`disabled` lists use full plugin keys: `<name>@<marketplace>` format
- All `.claude/` writes use the /tmp bypass pattern (see Implementation rules above)

## Manifest Profile Integration

`templates/manifest.json` 의 `profiles` 키는 **자산 필터링** (에이전트·스킬·가이드 범위)을 정의합니다. 기존 `.claude/profiles/*.json` 의 **플러그인 전환** 역할과 분리된 개념입니다.

### 두 프로필 시스템 비교

| 시스템 | 경로 | 역할 | 적용 시점 |
|--------|------|------|-----------|
| Plugin profiles | `.claude/profiles/*.json` | `~/.claude/settings.json` plugin on/off | 세션 재시작 후 |
| Manifest profiles | `templates/manifest.json#profiles` | 설치 시 에이전트·스킬·가이드 범위 지정 | `omcustom install --profile <name>` |

### Manifest Profile 사용 시나리오

```bash
# 최소 자산으로 설치 (학습·실험 환경)
omcustom install --profile minimal

# Web 앱 개발 전용 자산 설치
omcustom install --profile web-app

# 데이터 엔지니어링 전용 자산 설치
omcustom install --profile data-eng

# 전체 자산 설치 (기본값)
omcustom install --profile full
# 또는 (profile 생략 시 full과 동일)
omcustom install
```

### include 패턴 해석 규칙

| 패턴 | 의미 | 예시 |
|------|------|------|
| `"*"` | 해당 카테고리 전체 포함 | `"include": "*"` |
| `"mgr-*"` | glob 패턴, 접두사 매칭 | mgr-creator, mgr-gitnerd 등 |
| `{"scope": "core"}` | SKILL.md의 scope 필드 기준 | scope: core인 스킬 전체 |
| `"react-best-practices"` | 특정 스킬/가이드 이름 | 해당 항목만 포함 |

### Plugin + Manifest 프로필 연동 가이드

동일 이름(예: `web-app`)으로 두 시스템을 함께 사용할 수 있습니다:

```bash
# 1. Manifest profile로 자산 설치
omcustom install --profile web-app

# 2. Plugin profile로 플러그인 전환
/profile load web-app
```

두 시스템은 독립적이므로 어느 하나만 사용해도 무방합니다.

### 관련 문서

- `guides/profiles/manifest-install.md` — 전체 사용 가이드 및 프로필별 자산 표
- `templates/manifest.json#profiles` — 프로필 정의 소스

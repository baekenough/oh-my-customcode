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

6. Apply changes via direct Edit on `~/.claude/settings.json` (`mode: "bypassPermissions"`, CC v2.1.121+):
   - Read `~/.claude/settings.json`, merge the computed diff into `enabledPlugins` (set enabled plugins to `true`, disabled plugins to `false`), then Write the updated JSON back.

7. Write active marker via direct Write on `.claude/profiles/.active` (`mode: "bypassPermissions"`):
   - Write the profile `<name>` as plain text content to `.claude/profiles/.active`.

8. Confirm:

```
[Done] Profile 'web-app' applied to ~/.claude/settings.json
Active marker written to .claude/profiles/.active
IMPORTANT: Restart this Claude Code session for plugin changes to take effect.
```

## Workflow: `/profile reset`

1. Remove `.claude/profiles/.active` marker via direct `Bash: /bin/rm .claude/profiles/.active` (`mode: "bypassPermissions"`)
2. Print: `[Done] Profile marker removed. Full plugin set will be active after restart.`
3. Note: does NOT revert `~/.claude/settings.json` — user should re-run `/profile load <other>` or manually restore

## Notes

- Profile changes to `~/.claude/settings.json` take effect only after session restart
- Profiles define a subset: plugins not listed in `enabled` or `disabled` keep their current state
- Profile JSON `enabled`/`disabled` lists use full plugin keys: `<name>@<marketplace>` format
- All `.claude/` writes use direct Write/Edit/Bash (CC v2.1.121+, no `/tmp` wrapping — see Implementation rules above)

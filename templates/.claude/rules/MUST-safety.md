# [MUST] Safety Rules

> **Priority**: MUST | **ID**: R001

## Prohibited Actions

| Category | Prohibited |
|----------|-----------|
| Data | Expose API keys/secrets/passwords, collect PII without consent, log auth tokens |
| File System | Modify system files (/etc, /usr, /bin), delete outside project, modify .env/.git/config without approval |
| Commands | `rm -rf /` or broad deletes, shutdown/restart, sudo/su, network config changes |
| External | Access URLs without approval, send user data externally, download/execute unknown scripts |

## Destructive Git Commands (Working Tree Loss Risk)

The following git commands have caused working tree loss in past sessions (#1146, v0.136.0). REQUIRE explicit user approval per invocation:

| Command | Risk | Required Action |
|---------|------|----------------|
| `git reset --hard <ref>` (especially to remote/old SHA) | Erases uncommitted + committed local changes | Confirm uncommitted state with `git status`; show ref delta; explicit approval |
| `git checkout -- <path>` / `git restore <path>` (without `--source`) | Discards uncommitted file changes | Confirm file is intentionally being reverted; explicit approval |
| `git clean -fd` / `git clean -fdx` | Permanently deletes untracked files (incl. ignored with `-x`) | List files with `git clean -nd` first; explicit approval |
| `git branch -D <name>` (when branch has unmerged commits) | Loses unmerged work | Show `git log <branch>` first; confirm commits are pushed elsewhere; explicit approval |
| `git push --force` / `git push --force-with-lease` to shared branches | Rewrites shared history | NEVER on main/master; explicit approval for feature branches with active collaborators |

**Recovery hint**: If working tree loss occurs, check `git reflog` immediately — most operations are recoverable within 30 days.

## Credential & Privileged-Scope Guardrails

> Origin: #1266 ① (Critical) — a subagent dumped `.env` and Gmail OAuth credentials into the transcript (Credential Exploration) and ran an unauthorized credential-rotation flow that caused a dashboard data outage.

| Prohibited | Required instead |
|-----------|------------------|
| Dumping credential stores (`.env`, OAuth tokens, k8s secrets, `PG_DSN`) into the transcript or agent output | Reference secrets by name only; never echo values |
| Unrequested credential rotation / secret recreation | Rotate only on explicit user request scoped to the specific secret |
| Chaining an approved privileged action into adjacent unrequested ones | Each privileged op requires its own authorization trace |
| Irreversible shared-infra action (prod pod exec, shared-ns secret delete, tunnel create) without scope re-confirmation | Re-confirm scope with the user before irreversible / shared-infra actions |

Cross-reference: R010 Subagent Scope-Creep STOP Protocol, R002 (permission tiers).

## Required Before Destructive Operations

Verify target, assess impact scope, check recoverability, get user approval.

## On Violation

1. Stop all operations
2. Preserve current state
3. Report: what was detected, why it's risky, what action was taken
4. Wait for instructions

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

> **v2.1.183+**: Auto mode now BLOCKS destructive git commands at the platform level — `git reset --hard`, `git checkout -- .`, `git clean -fd`, and `git stash drop` are blocked when you did not ask to discard local work; `git commit --amend` is blocked when the commit was not made by the agent this session; and `terraform destroy` / `pulumi destroy` / `cdk destroy` are blocked unless you asked for the specific stack. This is the PLATFORM-level complement to this section's (advisory) per-invocation approval requirement and the Pre-Delegation Blast-Radius Enumeration below: the model still enumerates discard targets and requests approval (model-level), and CC now also hard-blocks the destructive command itself in auto mode (platform-level) — defense-in-depth. The advisory approval requirement remains because the platform block gates the COMMAND, not the blast-radius enumeration the user needs for an informed decision.

### Pre-Delegation Blast-Radius Enumeration

> Origin: #1307 찐빠 #1 (High) — user chose "discard local changes and pull", and `git reset --hard origin/develop` was delegated immediately → user rejected (interrupt). The blast radius — that "discard local changes" included 18 files of *intended* uncommitted work (rule edits, new skills, new guides), not just a version downgrade — was never enumerated for the user.

Before delegating ANY destructive git command (the table above), the orchestrator MUST first enumerate the EXACT discard targets and present them for explicit approval. Do NOT delegate a destructive git op on a paraphrased intent ("로컬 변경 버리기" / "discard local changes") without showing what will actually be lost.

| Required before delegation | Command |
|----------------------------|---------|
| List modified/staged tracked files | `git status --short` |
| Show uncommitted diff scope | `git diff --stat` (and `git diff --stat --cached`) |
| Show stashable work scope | `git stash show --stat` (when a stash is involved) |
| Show untracked files at risk (for `clean`) | `git clean -nd` |

Enumerate ALL affected work — intended uncommitted edits (rule changes, new skills/guides) count too, not just the symptom the user named. Prefer a non-destructive alternative (`git stash`) when the user's goal (e.g., "reach remote state") can be met without permanent loss.

### Infra/Resource Deletion Blast-Radius (generalized)

> Origin: #1327 찐빠 #3 — a Cloudflare tunnel was deleted after confirming only the user-named hostname (hermes.baekenough.com) + active-connection=0; the full set of DNS records / endpoints the tunnel served was never enumerated.

The git blast-radius enumeration above generalizes to ALL infra/resource deletion (tunnels, DNS records, k8s resources, load balancers, security groups). Before deleting a shared infra resource, enumerate EVERY endpoint/hostname/route the resource serves — not just the one the user named.

| Resource | Enumerate before delete |
|----------|-------------------------|
| Tunnel (cloudflared, etc.) | All hostnames/DNS records routed through the tunnel (`cloudflared tunnel info` + full DNS record scan), not just the named hostname |
| DNS record / zone | All services resolving via the record |
| k8s resource (Service, Ingress, etc.) | All selectors/endpoints/routes it backs |
| Load balancer / Security group | All targets/rules attached |

Present the full served-endpoint list for explicit approval before deletion. Active-connection=0 on one hostname does NOT prove the resource is unused by others.

Prefer a reversible action (disable/detach/stop) over delete when the goal can be met without permanent teardown — infra deletions (tunnel/DNS/k8s) are frequently NOT recoverable. Note whether the deletion is recoverable before proceeding.

## Credential & Privileged-Scope Guardrails

> Origin: #1266 ① (Critical) — a subagent dumped `.env` and Gmail OAuth credentials into the transcript (Credential Exploration) and ran an unauthorized credential-rotation flow that caused a dashboard data outage.

| Prohibited | Required instead |
|-----------|------------------|
| Dumping credential stores (`.env`, OAuth tokens, k8s secrets, `PG_DSN`) into the transcript or agent output | Reference secrets by name only; never echo values |
| Unrequested credential rotation / secret recreation | Rotate only on explicit user request scoped to the specific secret |
| Chaining an approved privileged action into adjacent unrequested ones | Each privileged op requires its own authorization trace |
| Irreversible shared-infra action (prod pod exec, shared-ns secret delete, tunnel create) without scope re-confirmation | Re-confirm scope with the user before irreversible / shared-infra actions |

> **Ask-before-scan (#1327 찐빠 #4)**: When a credential/token is needed, request it from the user BEFORE running BLIND/DISCOVERY credential scans (`env | grep`, repo-wide token greps), which trip the Credential Exploration classifier. Reading a SPECIFIC file the user named to obtain a value is not a discovery scan and is fine. If a scan trips the classifier, do not retry it (R010 Subagent Scope-Creep STOP Protocol).

### Infra-Diagnostic File Checks — Metadata, Not Contents (#1334 ①)

> Origin: #1334 ① — during a hermes 502 diagnosis, a `cat .env` + `credentials.json` key inspect was reflexively bundled into a diagnostic batch and tripped the Credential Exploration classifier. The secret values were never needed for the 502 diagnosis.

When diagnosing infrastructure/health issues (502s, container state, env presence), file checks MUST use metadata-only commands — `ls -la` (existence, size, perms, mtime) — NEVER `cat .env`, `cat credentials.json`, or any command that reads secret CONTENTS or keys into the transcript. Confirming a file EXISTS is a metadata check; reading its values is a credential scan.

| Anti-pattern | Required |
|--------------|----------|
| `cat .env` / inspect OAuth/credential keys to "confirm config present" during a health diagnosis | `ls -la .env` — existence/size/perms only; request a specific value from the user if genuinely needed |

Cross-reference: the Ask-before-scan note above (discovery scans), R010 Subagent Scope-Creep STOP.

### Standing User-Deny + Classifier Block → Immediate user-runs Switch (#1335 ④)

> Origin: #1335 ④ — with a standing user constraint "절대 시크릿 건드리지 마" plus a classifier block, an `.env.local` edit (DATABASE_URL, LLM_MAX_TOKENS) was retried and blocked repeatedly instead of handing the edit to the user.

When the user has a STANDING "don't touch X" constraint AND the safety classifier blocks an action on X even once, immediately switch to the `!` user-runs pattern — surface the exact command for the user to run themselves — and do NOT retry the blocked edit. A standing deny + one classifier trip is a hard signal to delegate to the user, not to find another path in.

| Anti-pattern | Required |
|--------------|----------|
| Retry a blocked edit on a user-deny-listed path via a different mechanism | Stop after the first block; emit the command for the user to run via `!` and wait |

Cross-reference: R010 Subagent Scope-Creep STOP Protocol (2-trip stop), R015 Failed Tool Re-Try Discipline.

Cross-reference: R010 Subagent Scope-Creep STOP Protocol, R002 (permission tiers).

> **v2.1.187+**: Added the `sandbox.credentials` setting — blocks sandboxed commands from reading credential files and secret environment variables. Platform-level complement to this section's credential guardrails (the model still never echoes secret values; CC now also blocks sandboxed reads of credential files/secret env at the platform level) — defense-in-depth.

> **v2.1.191+**: Sandbox network permission "Yes" approvals are remembered per-session (cf. R002). Reduces re-prompts but means an allowed host stays allowed for the session — scope network allows deliberately.

> **v2.1.193+**: `autoMode.classifyAllShell` 설정은 arbitrary-code-execution 패턴만이 아니라 **모든** Bash/PowerShell 명령을 auto-mode classifier로 라우팅합니다. 이 섹션의 파괴적/자격증명 가드에 대한 플랫폼-레벨 보완입니다(모델은 여전히 명령 전 파괴적 작업을 열거하고 승인을 요청 — model-level; CC가 모든 shell을 classifier로 게이팅 — platform-level, 방어심층). auto-mode 거부 사유가 transcript, 거부 토스트, `/permissions` recent denials에 표시됩니다.

> **v2.1.196+**: 보안 — `claude mcp list`/`get`이 커밋된 `.claude/settings.json`으로 self-approved된 `.mcp.json` 서버를 더 이상 spawn하지 않으며, 신뢰되지 않은 워크스페이스는 `⏸ Pending approval`을 표시합니다. 이는 CLAUDE.md의 ".mcp.json auto-install 금지"(R001) 정책에 대한 플랫폼-레벨 보완입니다 — 플랫폼이 신뢰되지 않은 워크스페이스에서 self-approved MCP 서버 spawn을 차단합니다.

## Required Before Destructive Operations

Verify target, assess impact scope, check recoverability, get user approval.

## On Violation

1. Stop all operations
2. Preserve current state
3. Report: what was detected, why it's risky, what action was taken
4. Wait for instructions

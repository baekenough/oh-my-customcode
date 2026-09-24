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

다음 git 명령은 과거 작업트리 손실을 유발했으므로(#1146) 호출마다 명시적 사용자 승인이 필요합니다:

<!-- DETAIL: destructive git commands intro
The following git commands have caused working tree loss in past sessions (#1146, v0.136.0). REQUIRE explicit user approval per invocation:
-->

| Command | Risk | Required Action |
|---------|------|----------------|
| `git reset --hard <ref>` (especially to remote/old SHA) | Erases uncommitted + committed local changes | Confirm uncommitted state with `git status`; show ref delta; explicit approval |
| `git checkout -- <path>` / `git restore <path>` (without `--source`) | Discards uncommitted file changes | Confirm file is intentionally being reverted; explicit approval |
| `git clean -fd` / `git clean -fdx` | Permanently deletes untracked files (incl. ignored with `-x`) | List files with `git clean -nd` first; explicit approval |
| `git branch -D <name>` (when branch has unmerged commits) | Loses unmerged work | Show `git log <branch>` first; confirm commits are pushed elsewhere; explicit approval |
| `git push --force` / `git push --force-with-lease` to shared branches | Rewrites shared history | NEVER on main/master; explicit approval for feature branches with active collaborators |

**Recovery hint**: If working tree loss occurs, check `git reflog` immediately — most operations are recoverable within 30 days.

<!--
> **v2.1.183+**: Auto mode now BLOCKS destructive git commands at the platform level — `git reset --hard`, `git checkout -- .`, `git clean -fd`, and `git stash drop` are blocked when you did not ask to discard local work; `git commit --amend` is blocked when the commit was not made by the agent this session; and `terraform destroy` / `pulumi destroy` / `cdk destroy` are blocked unless you asked for the specific stack. This is the PLATFORM-level complement to this section's (advisory) per-invocation approval requirement and the Pre-Delegation Blast-Radius Enumeration below: the model still enumerates discard targets and requests approval (model-level), and CC now also hard-blocks the destructive command itself in auto mode (platform-level) — defense-in-depth. The advisory approval requirement remains because the platform block gates the COMMAND, not the blast-radius enumeration the user needs for an informed decision.
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.44, 보존 기준 v2.1.212 미만): > **v2.1.208+**: Catastrophic removals (e.g. `rm -rf ~`) wrapped in `$(…)`/backticks/`<(…)` now trigger the same prompt as the plain form in `--dangerously-skip-permissions` and auto mode — closes a subshell-obfuscation gap in the v2.1.183 platform-level destructive-command block above. -->

<!-- DETAIL: v2.1.223/224+ dialog integrity/sandbox deny
> **v2.1.223/224+**: 승인 다이얼로그·샌드박스 경계의 표시 무결성 결함 두 건이 수정되었습니다. (223) 탭·비가시 유니코드로 패딩한 명령이 승인 다이얼로그에서 자기 일부를 숨길 수 있던 결함 — 사용자가 **본 것과 승인한 것이 달랐다**는 뜻이므로, 위 Pre-Delegation Blast-Radius Enumeration(모델이 파괴 대상을 별도로 열거)이 플랫폼 다이얼로그로 대체될 수 없음을 재확인시킵니다. (224) sandbox filesystem deny 항목의 후행 슬래시(`denyRead: "~/.aws/"`)가 조용히 우회 가능하던 결함, 그리고 sandbox 위반 상세가 Bash 도구 결과에 전혀 나타나지 않던 결함 — 후자는 위반이 **관측 불가**했다는 의미이므로, 구버전에서 "sandbox 위반 없음"은 위반 부재의 증거가 아닙니다. credential deny 규칙 작성 시 후행 슬래시를 제거합니다(cross-ref R002).
-->

<!-- DETAIL: v2.1.221/222+ worktree isolation destructive git
> **v2.1.221/222+**: v2.1.222에서 worktree-isolated 세션과 그 subagent가 main checkout에 대해 파괴적 git 명령을 실행할 수 있던 문제가 수정되어, isolation이 모든 세션 타입의 file edit과 Bash에 적용됩니다. v2.1.221에서는 `/fork` 세션이 원본 세션 checkout이 아니라 자체 worktree를 생성하도록 변경되었습니다. **완화 아님**: 위 Destructive Git Commands 표의 per-invocation 승인 요구와 아래 Pre-Delegation Blast-Radius Enumeration은 그대로 유지됩니다. 플랫폼 isolation은 격리 경계를 강화할 뿐, 사용자가 판단하는 데 필요한 blast-radius 열거를 대체하지 않습니다(v2.1.183/208 플랫폼 블록과 동일한 defense-in-depth 관계).
-->

<!-- DETAIL: v2.1.234/236/238+ dialog integrity series
> **v2.1.234/236/238+**: 승인 다이얼로그 표시 무결성 결함이 3개 릴리즈 연속으로 발견·수정되었습니다. (234) permission 프롬프트 comment 필드에서 Shift+Tab을 누르면 필드를 닫는 대신 **edit을 승인하고 세션 전체 edit 권한을 부여**하던 결함. (236) managed-settings 승인 프롬프트가 **표시되지 않으면서 첫 키입력을 승인으로 소비**하던 결함 — 프롬프트를 보지 못한 사용자의 무관한 입력이 승인으로 처리될 수 있었습니다. (238) 대화상자 표시 텍스트와 "don't ask again" 옵션이 이제 항상 실제 승인 범위와 일치하도록 개선되고, 내용이 완전히 표시될 수 없으면 "don't ask again"이 보류됩니다. 이 3건은 위 v2.1.223 "탭·비가시 유니코드 패딩 명령이 자기 일부를 숨김" 결함과 **같은 계열의 반복**이며, 단발 결함이 아니라 승인 다이얼로그 표시 무결성이 여러 릴리즈에 걸쳐 계속 발견되고 있는 구조적 계열임을 실증합니다. Pre-Delegation Blast-Radius Enumeration(모델이 파괴 대상을 별도 열거)이 플랫폼 다이얼로그로 대체될 수 없다는 원칙은 이 반복으로 더욱 강화됩니다.
-->

<!-- DETAIL: v2.1.236+ macOS sandbox wildcard deny
> **v2.1.236+**: macOS 샌드박스에서 wildcard read-deny 규칙(예: `**/.env`)이 이제 허용된 read 영역 **내부에서도 우선 적용**되고, 매칭된 디렉토리의 콘텐츠까지 커버하며, 파일명 변경으로 우회할 수 없습니다. 위 v2.1.224 "sandbox filesystem deny 항목의 후행 슬래시가 조용히 우회 가능하던 결함"과 같은 sandbox deny 규칙 우회 계열의 추가 하드닝입니다 — 구버전에서는 read-deny 와일드카드가 허용 영역 안에서 무력화되거나 파일명 rename으로 우회될 수 있었습니다.
-->

<!-- DETAIL: v2.1.246/251+ credential transmission boundary
> **v2.1.246/251+**: 자격증명 전송 경계 결함 2건이 수정되었습니다. (246) 서드파티 게이트웨이(`ANTHROPIC_BASE_URL`)용 API 키가 Anthropic 텔레메트리/메트릭 요청에 함께 실려 전송되던 결함 — 구버전에서는 게이트웨이 자격증명이 자기 호스트 밖으로 유출됐습니다. (251) `/ultrareview` 및 로컬 시딩 cloud session이 `prod.env` 계열·`*.tfvars` 파일, 또는 자격증명 파일의 에디터 swap/temp/backup 사본(`key.pem.tmp`, `id_rsa.swo`)을 업로드하던 결함 — 이제 로컬에 남습니다. 이 저장소는 `/ultrareview`를 사용하지 않으나, 두 항목 모두 이 섹션의 "자격증명 저장소 덤프 금지" 원칙과 동일한 위협 클래스에 대한 플랫폼 측 방어이므로 기록합니다.
-->

<!-- DETAIL: v2.1.261+ rm -rf prompt coverage/diagram upload
> **v2.1.261+**: 위험한 `rm` 안전 프롬프트가 **positional parameter에 대한 `rm -rf`**(`rm -rf "$@"` 등)와 **큰따옴표로 감싼 `sh -c` 스크립트 내부**의 `rm -rf`까지 잡도록 확장되었습니다 — 위 Destructive Git Commands 표의 per-invocation 승인 요구와 동일한 원칙을 셸 레벨에서 보강하는 플랫폼 측 defense-in-depth이며, Pre-Delegation Blast-Radius Enumeration을 대체하지 않습니다. 또한 auto mode가 **공개 다이어그램 렌더러 URL에 다이어그램 소스를 실어 보내는 링크**(mermaid/kroki류 렌더 URL)를 그 사이트로의 **업로드**로 취급해, 사용자가 요청하지 않은 한 더 이상 auto-approve하지 않습니다. 이 저장소의 다이어그램 스킬(`eraser-diagrams`, mermaid 렌더링)이 이런 링크를 생성할 수 있으므로, 이런 링크에서 classifier가 멈추는 것은 정상 동작이지 오작동이 아닙니다 — 재시도하지 않습니다(cross-ref R010 Subagent Scope-Creep STOP Protocol).
-->

<!-- DETAIL: v2.1.260/265/267+ bash-mode sandbox/symlink path
> **v2.1.260/265/267+**: (260) `!` bash-mode 프롬프트에서 직접 입력한 명령은 strict sandbox mode에서도 샌드박스 **밖에서** 실행됩니다 — 즉 위 「Standing User-Deny + Classifier Block」섹션의 "`!`로 사용자에게 넘기는" 패턴은 설계상 **비샌드박스 경로**임을 명시적으로 인지해야 합니다. (265) macOS/Linux에서 백슬래시를 포함한 플러그인 경로가 symlink containment 검사를 우회하던 결함, (267) fetched marketplace entry 경로에 대한 동일 계열 결함이 각각 수정되었습니다 — 둘 다 v2.1.233 `\??\` device prefix 노트와 같은 **경로 표기 우회 계열**(같은 위치를 다르게 표기해 검사를 피함)입니다. 또한 (259) 동시 세션이 서로의 `~/.claude.json` 변경(workspace trust 초기화, MCP/project state 유실)을 조용히 되돌리던 결함도 수정되었습니다 — 공유 워크트리 다중 세션 실행 시 관련됩니다.
-->

<!-- DETAIL: v2.1.268+ credential exposure two directions
> **v2.1.268+**: 자격증명 노출 결함이 두 방향에서 수정되었습니다 — 플러그인/마켓플레이스 오류가 git 소스 URL에 담긴 토큰·비밀번호를 표시하던 결함, `/mcp`·`/plugin` 서버 상세·`claude mcp list`/`get`·MCP 로그인 오류가 MCP config의 `${VAR}` placeholder를 **해석된 값**으로 표시하던 결함(274에서 MCP connection 오류·MCP 로그인 도구 설명까지 동일하게 수정). 이 섹션의 "자격증명 저장소 덤프 금지"와 동일한 위협 클래스입니다 — 구버전에서는 MCP 오류 메시지를 트랜스크립트나 이슈에 붙여 넣는 것만으로 해석된 시크릿이 함께 노출될 수 있었으므로(위 v2.1.232 GitLab 토큰 redaction 노트와 동일 원칙), 과거 로그를 공유하기 전 이 점을 확인합니다. 또한 (268) Bash 샌드박스 안내 문구가 실제보다 격리를 과장 서술하던 결함 — filesystem isolation이 꺼진 상태에서 경로 목록을 표시하거나, strict mode가 "명령이 샌드박스 밖에서 절대 실행되지 않는다"고 주장하던 사례 — 이 수정되었습니다. 샌드박스 안내 문구를 보장으로 취급하지 않습니다(위 `!` bash-mode 비샌드박스 경로 노트 cross-ref).
-->

<!-- DETAIL: v2.1.275+ CHANGELOG plugin secret/npm install
> **v2.1.275+**: (275) `Fixed plugin and marketplace messages, logs and "claude plugin marketplace list" showing a password or token stored in a git, ssh or marketplace URL` — 위 v2.1.268 노트와 같은 위협 클래스(자격증명 저장소 덤프 금지 원칙 유지)이며, 구버전 로그·`claude plugin marketplace list` 출력을 공유하기 전 자격증명 잔존 가능성을 확인합니다. (275) `Changed plugins installed from an npm source to be fetched with "npm pack --ignore-scripts" and integrity-verified, so a package's install scripts no longer run` — supply-chain 각도의 강화이며, 구버전에서는 npm 소스 플러그인 설치 시 install script가 실행될 수 있었습니다; 이 저장소는 플러그인을 마켓플레이스로 설치하므로 npm 소스 플러그인은 현재 미사용입니다(기록용).
-->

<!-- DETAIL: v2.1.271/273/274+ subshell rm/multibyte edit preview
> **v2.1.271/273/274+**: (273) bypass 모드에서 subshell 안에 숨긴 위험한 `rm`이 프롬프트를 우회하던 결함이 수정되었습니다(위험한 `rm` 프롬프트 계열: v2.1.261 positional parameter·`sh -c` 커버리지의 연장선). (274) 멀티바이트 문자가 포함된 파일에서 Edit 권한 프롬프트 미리보기가 실제 승인 대상과 **다른 위치**를 보여주던 결함이 수정되었습니다 — 이 파일 시리즈(v2.1.223/234/236/238/257)의 **여섯 번째** 승인 다이얼로그 무결성 결함이며, 멀티바이트 문자 전반에 대한 결함(한글 포함)이라 이 저장소의 룰·위키가 한글로 작성되므로 직접 영향을 받는 첫 사례입니다 — 구버전에서는 한글 파일의 Edit 미리보기가 엉뚱한 줄을 가리킬 수 있었습니다. Pre-Delegation Blast-Radius Enumeration(모델이 파괴 대상을 별도 열거)은 여전히 1차 방어선입니다. (271) 샌드박싱된 auto mode에 명령별 `allowed_domains`가 추가되어(cross-ref R002), 세션 전체 네트워크 허용보다 좁은 egress 승인이 가능해졌습니다.
-->

### Pre-Delegation Blast-Radius Enumeration

<!-- DETAIL: Origin #1307 blast-radius
> Origin: #1307 찐빠 #1 (High) — user chose "discard local changes and pull", and `git reset --hard origin/develop` was delegated immediately → user rejected (interrupt). The blast radius — that "discard local changes" included 18 files of *intended* uncommitted work (rule edits, new skills, new guides), not just a version downgrade — was never enumerated for the user.
-->

파괴적 git 명령 위임 전 오케스트레이터는 정확한 삭제 대상을 전부 열거해 명시적 승인을 받아야 합니다 — "로컬 변경 버리기" 같은 뭉뚱그린 의도만으로 위임을 금지합니다.

<!-- DETAIL: pre-delegation enumerate requirement
Before delegating ANY destructive git command (the table above), the orchestrator MUST first enumerate the EXACT discard targets and present them for explicit approval. Do NOT delegate a destructive git op on a paraphrased intent ("로컬 변경 버리기" / "discard local changes") without showing what will actually be lost.
-->

| Required before delegation | Command |
|----------------------------|---------|
| List modified/staged tracked files | `git status --short` |
| Show uncommitted diff scope | `git diff --stat` (and `git diff --stat --cached`) |
| Show stashable work scope | `git stash show --stat` (when a stash is involved) |
| Show untracked files at risk (for `clean`) | `git clean -nd` |

사용자가 지목한 증상뿐 아니라 의도된 미커밋 편집까지 전부 열거하고, 가능하면 `git stash` 등 비파괴적 대안을 우선합니다.

<!-- DETAIL: enumerate all affected work
Enumerate ALL affected work — intended uncommitted edits (rule changes, new skills/guides) count too, not just the symptom the user named. Prefer a non-destructive alternative (`git stash`) when the user's goal (e.g., "reach remote state") can be met without permanent loss.
-->

### Infra/Resource Deletion Blast-Radius (generalized)

<!-- DETAIL: Origin #1327 infra deletion
> Origin: #1327 찐빠 #3 — a Cloudflare tunnel was deleted after confirming only the user-named hostname (hermes.baekenough.com) + active-connection=0; the full set of DNS records / endpoints the tunnel served was never enumerated.
-->

위 git blast-radius 원칙은 모든 공유 인프라 삭제(터널·DNS·k8s·로드밸런서 등)에 일반화됩니다 — 사용자가 지목한 것 외 모든 엔드포인트를 열거합니다.

<!-- DETAIL: infra deletion generalization
The git blast-radius enumeration above generalizes to ALL infra/resource deletion (tunnels, DNS records, k8s resources, load balancers, security groups). Before deleting a shared infra resource, enumerate EVERY endpoint/hostname/route the resource serves — not just the one the user named.
-->

| Resource | Enumerate before delete |
|----------|-------------------------|
| Tunnel (cloudflared, etc.) | All hostnames/DNS records routed through the tunnel (`cloudflared tunnel info` + full DNS record scan), not just the named hostname |
| DNS record / zone | All services resolving via the record |
| k8s resource (Service, Ingress, etc.) | All selectors/endpoints/routes it backs |
| Load balancer / Security group | All targets/rules attached |

삭제 전 전체 서빙 엔드포인트 목록을 제시해 명시적 승인을 받습니다 — 한 호스트명의 연결 0건이 전체 무사용의 증거는 아닙니다.

<!-- DETAIL: present full endpoint list
Present the full served-endpoint list for explicit approval before deletion. Active-connection=0 on one hostname does NOT prove the resource is unused by others.
-->

목표 달성에 영구 삭제가 불필요하면 가역적 조치(비활성화/분리/중지)를 우선하고, 진행 전 복구 가능 여부를 명시합니다.

<!-- DETAIL: prefer reversible action
Prefer a reversible action (disable/detach/stop) over delete when the goal can be met without permanent teardown — infra deletions (tunnel/DNS/k8s) are frequently NOT recoverable. Note whether the deletion is recoverable before proceeding.
-->

## Credential & Privileged-Scope Guardrails

<!-- DETAIL: Origin #1266 credential dump
> Origin: #1266 ① (Critical) — a subagent dumped `.env` and Gmail OAuth credentials into the transcript (Credential Exploration) and ran an unauthorized credential-rotation flow that caused a dashboard data outage.
-->

| Prohibited | Required instead |
|-----------|------------------|
| Dumping credential stores (`.env`, OAuth tokens, k8s secrets, `PG_DSN`) into the transcript or agent output | Reference secrets by name only; never echo values |
| Unrequested credential rotation / secret recreation | Rotate only on explicit user request scoped to the specific secret |
| Chaining an approved privileged action into adjacent unrequested ones | Each privileged op requires its own authorization trace |
| Irreversible shared-infra action (prod pod exec, shared-ns secret delete, tunnel create) without scope re-confirmation | Re-confirm scope with the user before irreversible / shared-infra actions |

Ask-before-scan(#1327): 크레덴셜/토큰이 필요하면 블라인드 디스커버리 스캔(`env | grep`, 전역 토큰 grep) 전에 먼저 사용자에게 요청합니다 — 사용자가 지정한 특정 파일 읽기는 허용되며, 스캔이 classifier에 걸리면 재시도하지 않습니다(R010).

<!-- DETAIL: Ask-before-scan full text
> **Ask-before-scan (#1327 찐빠 #4)**: When a credential/token is needed, request it from the user BEFORE running BLIND/DISCOVERY credential scans (`env | grep`, repo-wide token greps), which trip the Credential Exploration classifier. Reading a SPECIFIC file the user named to obtain a value is not a discovery scan and is fine. If a scan trips the classifier, do not retry it (R010 Subagent Scope-Creep STOP Protocol).
-->

### Infra-Diagnostic File Checks — Metadata, Not Contents (#1334 ①)

<!-- DETAIL: Origin #1334 infra-diagnostic file check
> Origin: #1334 ① — during a hermes 502 diagnosis, a `cat .env` + `credentials.json` key inspect was reflexively bundled into a diagnostic batch and tripped the Credential Exploration classifier. The secret values were never needed for the 502 diagnosis.
-->

When diagnosing infrastructure/health issues (502s, container state, env presence), file checks MUST use metadata-only commands — `ls -la` (existence, size, perms, mtime) — NEVER `cat .env`, `cat credentials.json`, or any command that reads secret CONTENTS or keys into the transcript. Confirming a file EXISTS is a metadata check; reading its values is a credential scan.

| Anti-pattern | Required |
|--------------|----------|
| `cat .env` / inspect OAuth/credential keys to "confirm config present" during a health diagnosis | `ls -la .env` — existence/size/perms only; request a specific value from the user if genuinely needed |

Cross-ref: 위 Ask-before-scan, R010 STOP Protocol.

<!-- DETAIL: cross-ref infra-diagnostic
Cross-reference: the Ask-before-scan note above (discovery scans), R010 Subagent Scope-Creep STOP.
-->

### Standing User-Deny + Classifier Block → Immediate user-runs Switch (#1335 ④)

<!-- DETAIL: Origin #1335 standing deny classifier block
> Origin: #1335 ④ — with a standing user constraint "절대 시크릿 건드리지 마" plus a classifier block, an `.env.local` edit (DATABASE_URL, LLM_MAX_TOKENS) was retried and blocked repeatedly instead of handing the edit to the user.
-->

When the user has a STANDING "don't touch X" constraint AND the safety classifier blocks an action on X even once, immediately switch to the `!` user-runs pattern — surface the exact command for the user to run themselves — and do NOT retry the blocked edit. A standing deny + one classifier trip is a hard signal to delegate to the user, not to find another path in.

| Anti-pattern | Required |
|--------------|----------|
| Retry a blocked edit on a user-deny-listed path via a different mechanism | Stop after the first block; emit the command for the user to run via `!` and wait |

Cross-reference: R010 STOP Protocol(2-trip), R015 Retry Discipline, R002 permission tiers.

<!-- DETAIL: cross-ref standing-deny originals
Cross-reference: R010 Subagent Scope-Creep STOP Protocol (2-trip stop), R015 Failed Tool Re-Try Discipline.

Cross-reference: R010 Subagent Scope-Creep STOP Protocol, R002 (permission tiers).
-->

<!--
> **v2.1.187+**: Added the `sandbox.credentials` setting — blocks sandboxed commands from reading credential files and secret environment variables. Platform-level complement to this section's credential guardrails (the model still never echoes secret values; CC now also blocks sandboxed reads of credential files/secret env at the platform level) — defense-in-depth.
-->

<!-- ARCHIVED CC version note (historical):
> **v2.1.191+**: Sandbox network permission "Yes" approvals are remembered per-session (cf. R002). Reduces re-prompts but means an allowed host stays allowed for the session — scope network allows deliberately.
-->


<!--
> **v2.1.193+**: `autoMode.classifyAllShell` 설정은 arbitrary-code-execution 패턴만이 아니라 **모든** Bash/PowerShell 명령을 auto-mode classifier로 라우팅합니다. 이 섹션의 파괴적/자격증명 가드에 대한 플랫폼-레벨 보완입니다(모델은 여전히 명령 전 파괴적 작업을 열거하고 승인을 요청 — model-level; CC가 모든 shell을 classifier로 게이팅 — platform-level, 방어심층). auto-mode 거부 사유가 transcript, 거부 토스트, `/permissions` recent denials에 표시됩니다.

> **v2.1.196+**: 보안 — `claude mcp list`/`get`이 커밋된 `.claude/settings.json`으로 self-approved된 `.mcp.json` 서버를 더 이상 spawn하지 않으며, 신뢰되지 않은 워크스페이스는 `⏸ Pending approval`을 표시합니다. 이는 CLAUDE.md의 ".mcp.json auto-install 금지"(R001) 정책에 대한 플랫폼-레벨 보완입니다 — 플랫폼이 신뢰되지 않은 워크스페이스에서 self-approved MCP 서버 spawn을 차단합니다.

> **v2.1.205+**: auto mode가 session transcript 파일 변조(tampering)를 차단하는 규칙이 추가되었습니다 — transcript 의존 스킬(homework/episodic-memory) 무결성 보호. 또한 Windows worktree 제거가 NTFS junction/symlink 존재 시 worktree 밖 파일을 삭제하던 문제가 수정되었습니다.
-->

<!-- DETAIL: v2.1.232+ GitLab token redaction/tmp socket hardening
> **v2.1.232+**: 시크릿·격리 보호가 확장되었습니다 — GitLab 토큰 계열(`glrt-`/`gloas-`/`glptt-`/`glagent-`/`glimt-`/`glsoat-`/`glcbt-`/`glft-`/`glffct-`) redaction 추가와 routable `glpat-`/`gldt-` 전체 redaction, `glab` CLI config가 `gh`와 동일한 샌드박스·자격증명 경로 보호를 받습니다. 또한 공유 `/tmp`의 cross-session messaging 소켓 디렉토리가 사전에 심어진 symlink나 타 사용자 소유 디렉토리를 **사용 대신 거부**하도록, Linux 파일시스템 샌드박스가 protected-path 우회에 대해 하드닝되었습니다. **구버전에서 GitLab 토큰은 redaction 대상이 아니었으므로 트랜스크립트·에이전트 출력에 원문 노출이 가능했습니다** — 과거 세션 로그를 공유하기 전 이 점을 전제합니다. 위 표의 "자격증명 저장소 덤프 금지"는 플랫폼 redaction과 무관하게 유지합니다(redaction은 최후 방어선이지 1차 방어선이 아님).
-->

<!-- DETAIL: v2.1.257+ containment escape/consent dialog/credential exposure
> **v2.1.257+**: 시크릿·격리 보호가 4건 추가로 강화되었습니다. (a) auto mode에 **Containment Escape** 규칙이 신설되어, 클라우드 메타데이터 자격증명 조회·egress 회피·cross-tenant 접근이 환경이 "expected"로 명시하지 않는 한 더 이상 auto-approve되지 않습니다 — 이 섹션의 "자격증명 저장소 덤프 금지" 원칙과 R010 Subagent Scope-Creep STOP Protocol의 플랫폼 측 대응이며, 인프라 위임 서브에이전트가 이 규칙에 걸리면 R010의 trip 계수 대상으로 취급합니다. (b) Remote Control 동의 프롬프트를 Esc 또는 `n`으로 닫은 것이 **동의로 계상**되어 다음 요청이 확인 없이 연결되던 결함이 수정되었습니다 — 위 v2.1.223/234/236/238 승인 다이얼로그 표시 무결성 계열의 다섯 번째 사례로, 단발 결함이 아니라 구조적 계열임을 재확인시킵니다. (c) 자격증명 전송·노출 경계 4건도 함께 수정되었습니다 — Foundry API-key 모드에서 잔여 Anthropic API 키/토큰이 함께 전송되던 결함, 게이트웨이가 Foundry/Vertex/Bedrock에 stray host `Authorization`·프로필 헤더를 보내던 결함, MCP 연결·OAuth 디버그/에러 로그의 URL·헤더 자격증명 미redaction, 샌드박스 `deniedDomains`가 후행 점(`example.com.`)이 붙은 호스트를 차단하지 못하고 "don't ask again"도 무한 재프롬프트되던 결함 — 위 v2.1.246/251 자격증명 전송 경계 노트와 같은 위협 클래스입니다. (d) 플러그인이 선언된 command/agent/skill/hooks 경로가 symlink일 때 이를 따라가 자기 디렉토리 밖 파일을 읽던 결함이 수정되어 이제 에러로 거부되며, Cowork·claude.ai cloud 세션에서 자신의 것이 아닌 artifact를 읽는 동작은 auto mode에서도 항상 먼저 확인을 거치도록 변경되었습니다.
-->

## Required Before Destructive Operations

Verify target, assess impact scope, check recoverability, get user approval.

## On Violation

1. Stop all operations
2. Preserve current state
3. Report: what was detected, why it's risky, what action was taken
4. Wait for instructions

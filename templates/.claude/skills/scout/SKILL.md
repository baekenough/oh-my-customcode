---
name: scout
description: Analyze external URL to evaluate fit with oh-my-customcode project and auto-create GitHub issue with verdict
scope: core
version: 1.0.1
user-invocable: true
argument-hint: "<url>"
---

# /scout — External Link Analysis

Analyze an external URL (tech blog, tool, library, methodology) to evaluate its fit with the oh-my-customcode project and auto-create a GitHub issue with a structured verdict.

## Usage

```
/scout <url>
/scout https://news.hada.io/topic?id=27673
/scout https://github.com/user/repo
```

## Verdict Taxonomy

| Verdict | Meaning | Label | Follow-up |
|---------|---------|-------|-----------|
| **INTERNALIZE** | Aligns with project philosophy; should become a skill/agent/guide | `scout:internalize` + `P1`/`P2`/`P3` | `/research` or direct implementation |
| **INTEGRATE** | Useful but best kept as external dependency | `scout:integrate` + `P2`/`P3` | Plugin/MCP integration review |
| **SKIP** | Irrelevant or duplicates existing functionality | `scout:skip` | Issue created then closed |

## Pre-flight Guards

### Pre-flight Execution Checklist (MANDATORY before Phase 1)

**Both guards MUST be executed before entering Phase 1.** Skipping either guard is a workflow violation.

- [ ] Guard 1: URL Validity check passed (abort if invalid)
- [ ] Guard 2: Duplicate Scout check passed (warn and confirm if duplicate found)

Proceed to Phase 1 only after both checkboxes are satisfied.

### Guard 1: URL Validity (GATE)

Before any work, validate the URL:

```bash
# Check URL is syntactically valid
echo "$URL" | grep -qE '^https?://'
```

If invalid: `[Pre-flight] GATE: Invalid or unreachable URL. Please check and retry.` — abort.

### Guard 2: Duplicate Scout (WARN)

Search existing GitHub issues for prior scout reports on the same URL domain:

```bash
DOMAIN=$(echo "$URL" | sed 's|https\?://||' | cut -d'/' -f1)
gh issue list --state all --label "scout:internalize,scout:integrate,scout:skip" \
  --json number,title,body --jq ".[] | select(.body | contains(\"$DOMAIN\"))" 2>/dev/null
```

If found: `[Pre-flight] WARN: Similar URL already scouted in issue #N. Proceed anyway? [Y/n]`

> **Why mandatory?** Guard 2 생략으로 인해 동일 도메인 중복 scout 이슈가 생성된 사례 발생 (세션 회고 #1281). 중복 triage 낭비를 방지하기 위해 Pre-flight 체크리스트로 승격.

## Display Format

Before execution, show the plan:

```
[Scout] {url}
├── Phase 1: 콘텐츠 수집 및 요약
├── Phase 2: 프로젝트 철학 로드
├── Phase 3: 적합성 분석 (sonnet)
└── Phase 4: 이슈 생성

예상: ~1분 | 비용: ~$0.5-1.5
실행하시겠습니까? [Y/n]
```

> **암묵 승인 시 필수**: "되면 /scout으로 보고", "실행해줘" 등 묵시적 승인인 경우에도 위 plan 요약을 **반드시 1줄 이상 표시한 뒤 진행**한다 (R015 intent transparency). plan 표시 없이 바로 Phase 1으로 진입하는 것은 위반.

## Workflow

### Phase 1: Fetch & Summarize

1. `WebFetch(url)` — retrieve page content
2. Extract core information:
   - Title and purpose
   - Key technology / methodology
   - Approach and principles
3. If fetch fails — report error, abort

### Phase 2: Load Project Philosophy

1. `Read(CLAUDE.md)` — extract architecture philosophy:
   - Compilation metaphor (source -> build -> artifact)
   - Separation of concerns (R006)
   - Dynamic agent creation ("no expert? create one")
   - Skill/agent/guide/rule structure
2. `Read(README.md)` — extract project overview and component inventory
3. `Glob(.claude/skills/*/SKILL.md)` — list existing skills for overlap detection

### Phase 3: Fit Analysis

> **MUST**: Agent tool 호출 시 반드시 `mode: "bypassPermissions"` 파라미터를 포함해야 한다 (R010 Universal bypassPermissions). CC Agent tool의 기본값은 `acceptEdits`이며, 이는 agent frontmatter의 `permissionMode`를 덮어쓴다. `mode` 누락 시 Bash/WebFetch 권한 프롬프트가 발생하여 비대화형 실행이 중단된다.
>
> ```
> ❌ Agent(subagent_type: "general-purpose", prompt: "...")
> ✓  Agent(subagent_type: "general-purpose", mode: "bypassPermissions", prompt: "...")
> ```

Spawn 1 sonnet agent with `mode: "bypassPermissions"` and the following analysis prompt.

**Inputs**:
- Fetched content summary (Phase 1)
- Project philosophy context (Phase 2)
- Existing skill list (Phase 2)

**Analysis dimensions**:

| Dimension | Question |
|-----------|----------|
| Philosophy alignment | Does it match the compilation metaphor, separation of concerns, "create experts on demand"? |
| Technical fit | Does it complement or overlap with existing skills/agents/guides? |
| Integration effort | How much work to internalize vs. use externally? |
| Value proposition | What concrete benefit does it bring to the project? |

**Agent prompt template**:

```
You are a project fit analyst. Given:

1. External content summary:
{phase1_summary}

2. Project philosophy:
{phase2_philosophy}

3. Existing skills ({skill_count} total):
{skill_list}

Analyze the external content against the project philosophy across 4 dimensions:
- Philosophy alignment
- Technical fit (overlap with existing skills?)
- Integration effort (XS/S/M/L)
- Value proposition

Return a structured verdict:
- verdict: INTERNALIZE | INTEGRATE | SKIP
- priority: P1 | P2 | P3
- rationale: 2-3 sentences
- philosophy_table: criterion/fit/rationale for each dimension
- recommendation: specific integration plan or skip reason
- next_steps: 2-3 actionable items
- IMPORTANT: Write all analysis output in Korean. Technical terms, code references, label names, and skill/agent names stay in English.
- escalation: true/false (INTERNALIZE + M/L effort = true)
```

**Output**: Structured verdict with rationale.

### Phase 4: Issue Creation

> **NOTE**: Phase 4는 orchestrator가 직접 `gh issue create` (Bash)로 처리한다. 만약 이슈 생성을 Agent(mgr-gitnerd 등)에 위임할 경우, 해당 Agent tool 호출에도 반드시 `mode: "bypassPermissions"`를 포함해야 한다 (R010).

1. Ensure scout labels exist (defensive, idempotent):
```bash
gh label create "scout:internalize" --color "0E8A16" --description "Scout: should be internalized" 2>/dev/null || true
gh label create "scout:integrate" --color "1D76DB" --description "Scout: keep as external" 2>/dev/null || true
gh label create "scout:skip" --color "D4C5F9" --description "Scout: skip" 2>/dev/null || true
```

2. Create GitHub issue:
```bash
gh issue create \
  --title "[scout:{verdict}] {content_title}" \
  --label "scout:{verdict},P{n}" \
  --body "{issue_body}"
```

3. If verdict is `SKIP`: auto-close the issue:
```bash
gh issue close {number} -c "Auto-closed: scout verdict is SKIP"
```

### Issue Body Template

```markdown
## Scout 리포트: {title}

**출처**: {url}
**판정**: {INTERNALIZE / INTEGRATE / SKIP}
**우선순위**: {P1 / P2 / P3}

## 요약
{외부 콘텐츠에 대한 2-3문장 요약}

## 프로젝트 철학 정합성
| 기준 | 적합 | 근거 |
|------|------|------|
| Compilation metaphor | {check/cross} | {설명} |
| Separation of concerns (R006) | {check/cross} | {설명} |
| Dynamic agent creation | {check/cross} | {설명} |
| 기존 스킬 중복 | {check/cross} | {중복 스킬 목록} |

## 권장 사항
{구체적 통합 계획 — 어떤 skill/agent/guide를 생성할지, 또는 건너뛰는 이유}

## 다음 단계
- [ ] {후속 조치 1}
- [ ] {후속 조치 2}

---
`/scout`에 의해 생성됨
```

## Escalation

When verdict is `INTERNALIZE` and integration effort is M or L:

```
[Advisory] 심층 분석 권장.
└── 실행 검토: /research {url}
```

## Result Display

```
[Scout 완료] {title}
├── 판정: {INTERNALIZE / INTEGRATE / SKIP}
├── 우선순위: {P1 / P2 / P3}
├── 이슈: #{number}
└── 에스컬레이션: {/research 권장 | 없음}
```

## Model Selection

| Phase | Model | Rationale |
|-------|-------|-----------|
| Phase 1 (Fetch) | orchestrator | Simple WebFetch, no agent needed |
| Phase 2 (Load) | orchestrator | Simple Read/Glob, no agent needed |
| Phase 3 (Analysis) | sonnet | Balanced reasoning for fit analysis |
| Phase 4 (Issue) | orchestrator | gh issue create via Bash |

## Integration

| Rule | How |
|------|-----|
| R009 | Single agent in Phase 3 — no parallelism needed |
| R010 | Orchestrator manages phases 1/2/4; analysis delegated to sonnet agent in Phase 3 |
| R015 | Display scout plan before execution (Display Format section) |

## When NOT to Use

| Scenario | Better Alternative |
|----------|--------------------|
| Deep multi-source research | `/research <url>` |
| Internal project analysis | `/omcustom:analysis` |
| Known tool evaluation | Direct agent conversation |
| Bulk URL analysis (5+) | `/research` with URL list |

## Differences from /research

| Aspect | /scout | /research |
|--------|--------|-----------|
| Purpose | Quick fit evaluation | Deep multi-dimensional analysis |
| Teams | 1 agent | 10 teams |
| Cost | ~$0.5-1.5 | ~$8-15 |
| Duration | 1-2 min | 10-20 min |
| Output | Issue with verdict | Full report with ADOPT/ADAPT/AVOID |
| When | First contact with new link | Deep dive after scout recommends |

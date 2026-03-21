# Deep Plan — Issue #605: Workflow Engine Epic Design

> Generated: 2026-03-21
> Issue: https://github.com/baekenough/oh-my-customcode/issues/605
> Type: Architecture Design + Epic Decomposition

## Issue Summary

oh-my-customcode에 **워크플로우(Workflow)** 개념을 도입합니다. 워크플로우는 여러 스킬을 YAML 선언형으로 체이닝하여 완전 자동 파이프라인을 실행하는 새로운 레이어입니다.

### Upstream Architecture Decisions (from issue)

| 항목 | 결정 |
|------|------|
| 위치 | `workflows/` 별도 디렉토리 (스킬/에이전트와 분리) |
| 호출 | `/workflow:name` 스킬 인터페이스로 호출 가능 |
| 정의 | YAML 선언형 (`workflows/omcustom-dev.yaml`) |
| 자동화 | 완전 자동 (게이트 없이 끝까지 실행) |
| 에러 | 실패 시 중단 + 리포트, `/workflow:resume`으로 재개 |
| 상태 추적 | 실행 상태를 파일로 영속 (resume 지원) |

---

## Architecture Design Decisions

### 1. workflows/ Directory Structure

**Decision**: `workflows/` at project root, peer to `.claude/`

```
project/
├── .claude/
│   ├── agents/
│   ├── skills/
│   │   └── workflow-runner/    ← execution engine (prompt-driven)
│   │       └── SKILL.md
│   └── rules/
├── workflows/                  ← NEW: workflow definitions
│   └── omcustom-dev.yaml       ← first workflow
└── CLAUDE.md
```

**Rationale**:
- Workflows are user-facing pipeline definitions, not internal agent tools
- Separation mirrors the skill/guide separation pattern (R006)
- `workflows/` is gittracked — workflow definitions are project artifacts
- SKILL.md files are the engine; `workflows/` YAML files are the configuration

### 2. Workflow YAML Schema

```yaml
name: string                    # unique identifier (kebab-case)
description: string             # one-line summary
mode: auto | gated              # auto = fully automatic, gated = confirm at each step
error: halt-and-report | retry | skip  # error handling strategy

steps:
  - skill: string               # skill name to invoke (from .claude/skills/)
    filter: object              # optional input filter (label, state, etc.)
    input: string               # reference to previous step output variable

  - skill: string
    foreach: string             # iterate over a collection from prior step output

  - action: string              # built-in action: implement | create-pr
    foreach: string             # iterate over collection
```

**omcustom-dev example** (from issue):
```yaml
name: omcustom-dev
description: verify-done 이슈 릴리즈 배치 → 계획 → 구현 → 검증 → PR
mode: auto
error: halt-and-report

steps:
  - skill: professor-triage
    filter: { label: verify-done, state: open }
  - skill: release-plan
    input: triage-results
  - skill: deep-plan
    foreach: release-group
  - action: implement
    foreach: planned-issue
  - skill: deep-verify
  - action: create-pr
```

### 3. Execution Engine Location

**Decision**: Prompt-driven skill, NOT compiled TypeScript code

- Location: `.claude/skills/workflow-runner/SKILL.md`
- The SKILL.md reads the target `workflows/{name}.yaml`
- Builds an execution plan from the YAML steps
- Invokes each step's skill via the Skill tool
- Tracks state throughout execution

**Rationale**:
- Consistent with oh-my-customcode philosophy — everything is a skill
- No build artifacts, no compilation step
- Inherits all skill composition patterns (R006, R009, R010)
- Easier to modify and extend (just edit SKILL.md)

**Entry point**: `/workflow:omcustom-dev` → invokes `workflow-runner` skill with `name=omcustom-dev`

### 4. State Machine

**States per step**:
```
pending → running → completed
                 → failed
                 → halted (user-requested stop)
```

**State file format** (JSON, persisted to `/tmp/`):
```json
{
  "workflow": "omcustom-dev",
  "started_at": "2026-03-21T10:00:00Z",
  "overall_status": "running",
  "steps": [
    {
      "index": 0,
      "skill": "professor-triage",
      "status": "completed",
      "output_ref": "triage-results",
      "completed_at": "2026-03-21T10:05:00Z"
    },
    {
      "index": 1,
      "skill": "release-plan",
      "status": "running",
      "started_at": "2026-03-21T10:05:30Z"
    },
    {
      "index": 2,
      "skill": "deep-plan",
      "status": "pending"
    }
  ]
}
```

**State file location**: `/tmp/.claude-workflow-{name}-{PPID}.json`
- PID-scoped per project pattern (consistent with other session temp files)
- Survives Claude session within same process
- Resume reads from this file

### 5. Resume Mechanism

`/workflow:resume` behavior:
1. Locate state file: `/tmp/.claude-workflow-*-${PPID}.json` (most recent)
2. Read current state
3. Skip all `completed` steps
4. Restart from first `failed` or `halted` step
5. Continue sequentially through `pending` steps

**Edge cases**:
- No state file found → error: "No workflow state to resume. Start with /workflow:name"
- Multiple state files → resume most recently modified
- `gated` mode on resume → re-prompt for confirmation at each remaining step

### 6. Integration with Existing Skills

**Skill invocation** (`skill:` step):
- Invokes the named skill via the Skill tool
- Passes `filter` and `input` as skill arguments
- Captures output as named variable (e.g., `triage-results`)

**Built-in actions** (`action:` step):
- `implement`: Orchestrator delegates to appropriate specialist agents (dev-lead-routing)
- `create-pr`: Delegates to `mgr-gitnerd` (R010 compliant)

**foreach iteration**:
- Splits prior step output into individual items
- Invokes the step's skill/action once per item
- Can be parallelized when items are independent (R009)

---

## Implementation Steps

| Step | Task | Files | Agent |
|------|------|-------|-------|
| 1 | Define YAML schema and validate with examples | `docs/superpowers/specs/2026-03-21-workflow-schema.md` | arch-documenter |
| 2 | Create workflow-runner skill | `.claude/skills/workflow-runner/SKILL.md` | mgr-creator |
| 3 | Create first workflow definition | `workflows/omcustom-dev.yaml` | general-purpose |
| 4 | Update templates for template sync | `templates/.claude/skills/workflow-runner/SKILL.md` | general-purpose |
| 5 | Add `/workflow:*` to CLAUDE.md command table | `CLAUDE.md` | general-purpose |
| 6 | Gitignore: ensure `workflows/` is tracked | `.gitignore` | general-purpose |

---

## Sub-Issue Decomposition

### #606 — Engine Core (YAML parser, executor, state machine)

**Scope**: Implement `workflow-runner` SKILL.md
- Parse `workflows/{name}.yaml`
- Build step execution plan
- Implement state machine (pending/running/completed/failed/halted)
- Write state to `/tmp/.claude-workflow-{name}-{PPID}.json`
- Execute steps sequentially (or parallel for independent foreach)

**Agent**: lang-typescript-expert (for YAML parsing guidance) + mgr-creator (for SKILL.md creation)
**Depends on**: #605 (this epic, schema finalized)

### #607 — State Persistence + /workflow:resume

**Scope**: Resume mechanism
- `/workflow:resume` skill entry point
- State file discovery and parsing
- Skip completed steps, restart from failure point
- Handle edge cases (no state, multiple states, gated mode)

**Agent**: mgr-creator
**Depends on**: #606 (state file format must exist)

### #608 — Skill Interface Bridge (/workflow:name invocation)

**Scope**: Entry point skill
- `/workflow:{name}` slash command pattern
- Routes to `workflow-runner` with `name` parameter
- Validates workflow YAML exists before execution
- Error: "Workflow '{name}' not found in workflows/"

**Agent**: mgr-creator
**Depends on**: #606 (workflow-runner skill must exist)

### #609 — omcustom-dev Workflow Definition + Integration Test

**Scope**: First real workflow
- `workflows/omcustom-dev.yaml` definition
- Integration test: dry-run mode (validate YAML, check skill refs exist)
- Add to CLAUDE.md command table
- Template sync

**Agent**: lang-typescript-expert (integration test) + general-purpose (YAML + docs)
**Depends on**: #607, #608 (both bridge and resume must work)

---

## Acceptance Criteria

- [ ] YAML schema defined and documented in `docs/superpowers/specs/`
- [ ] `workflows/` directory exists at project root
- [ ] `workflows/omcustom-dev.yaml` created and valid
- [ ] `.claude/skills/workflow-runner/SKILL.md` created with full engine logic
- [ ] `/workflow:omcustom-dev` invocable (routes through skill bridge)
- [ ] `/workflow:resume` invocable (reads state, skips completed steps)
- [ ] CLAUDE.md updated with `/workflow:*` commands
- [ ] Template sync updated
- [ ] Design decisions documented for sub-issues (#606–#609)

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Prompt-driven engine reliability for complex multi-step flows | Medium | Start with simple linear flows; add foreach/parallel in #609 |
| State file format changes breaking resume | Low | Pin state schema version in JSON (`"schema_version": 1`) |
| foreach parallelism conflicts with R018 (Agent Teams gate) | Low | Document: foreach parallel only when items are independent + no review cycle |
| YAML parsing in prompt context | Low | Skill reads YAML via Read tool; model parses declaratively |
| Skill name resolution (typos in workflow YAML) | Low | Validate skill refs exist at workflow start (before first step runs) |

---

## Compilation Metaphor Alignment (R006)

```
workflows/{name}.yaml    ← Source: declarative pipeline definition
workflow-runner/SKILL.md ← Compiler/Executor: reads YAML, runs steps
.claude/skills/*         ← Standard library: individual skill units
.claude/agents/*         ← Build artifacts: specialists invoked by actions
```

This fits the existing architecture philosophy perfectly — workflows are a new "source layer" above skills.

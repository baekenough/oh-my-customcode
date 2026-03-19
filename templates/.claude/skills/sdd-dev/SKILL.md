---
name: sdd-dev
description: Spec-Driven Development workflow — enforces sdd/ folder hierarchy with planning-first gates, current-state artifacts, and completion verification
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "[task description or leave empty for guided workflow]"
---

# SDD (Spec-Driven Development) Skill

Spec-Driven Development workflow that enforces the `sdd/` folder hierarchy. All development work proceeds through planning-first gates and produces current-state artifacts as completion evidence.

## Trigger Keywords

Invoke this skill when user requests:
- 개발해, 작업해, 구현해, 수정해, 고쳐, 리팩토링해, 테스트해, 배포해
- 화면명세서, 화면설계서, UI, 디자인, screen spec, screen design
- develop, implement, fix, refactor, build, deploy

## sdd/ Folder Hierarchy

```
sdd/
├── 01_planning/     # Requirements, constraints, stakeholder input
├── 02_plan/         # Execution plan, acceptance criteria, approach
├── 03_build/        # Current build state, implementation notes
├── 04_verify/       # Verification evidence, test results, residual risks
├── 05_operate/      # Deployment notes, runbooks (conditional)
└── 99_toolchain/    # Tool configs, scripts, environment setup
```

**Key Principle**: These folders are **current-state artifacts**, not history archives. Each file reflects the current state of the work — update in place rather than appending new versions.

## Workflow

### Step 0: Activation Check

Verify `sdd/` folder exists in the project root:

```bash
ls sdd/ 2>/dev/null || echo "sdd/ folder not found"
```

If `sdd/` does not exist:
1. Inform the user that SDD workflow requires a `sdd/` folder
2. Offer to create the folder structure: `mkdir -p sdd/{01_planning,02_plan,03_build,04_verify,05_operate,99_toolchain}`
3. Ask user to confirm before proceeding

If `sdd/` exists, continue to Step 1.

### Step 1: Planning Review (Gate)

**MUST complete before any coding begins.**

Read all relevant planning documents:

```
[SDD] Reading planning documents...
├── sdd/01_planning/ — requirements, constraints
└── sdd/99_toolchain/ — tool configs, environment
```

Actions:
1. Read `sdd/01_planning/` contents (all .md files)
2. Read `sdd/99_toolchain/` if present
3. Identify: What is the task? What constraints exist? What is in scope?
4. If planning docs are empty or missing, prompt user to fill them before proceeding

**Gate**: If planning docs are absent or insufficient, pause and ask user to provide requirements. Do NOT proceed to plan phase without understanding the context.

### Step 2: Plan Phase

Create or update `sdd/02_plan/` with the execution plan.

Artifact to produce: `sdd/02_plan/current.md`

```markdown
# Execution Plan

## Task
{task description}

## Approach
{implementation strategy}

## Acceptance Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}
- [ ] {criterion N}

## Out of Scope
- {what will NOT be done}

## Dependencies
- {prerequisite or dependency}
```

**Display**:
```
[SDD Plan] Created sdd/02_plan/current.md
├── Approach: {one-line summary}
├── Criteria: {N} acceptance criteria defined
└── Gate: Plan ready — proceeding to build
```

### Step 3: Build Phase

Implement the changes. Update `sdd/03_build/` with current build state.

Artifact to produce or update: `sdd/03_build/current.md`

```markdown
# Build State

## Status
{In Progress | Complete}

## Implemented
- {file or component}: {what was done}

## Decisions Made
- {decision}: {rationale}

## Known Issues
- {issue}: {planned resolution}
```

During implementation:
- Follow the plan from Step 2
- Update `sdd/03_build/current.md` as work progresses
- Keep the artifact current (not a log — overwrite stale entries)

**Display**:
```
[SDD Build] Implementing changes...
[SDD Build] Updated sdd/03_build/current.md
└── Status: {In Progress | Complete}
```

### Step 4: Verify Phase

Run verification and update `sdd/04_verify/` with evidence.

Artifact to produce or update: `sdd/04_verify/current.md`

```markdown
# Verification Evidence

## Acceptance Criteria Results
- [x] {criterion 1}: {evidence}
- [x] {criterion 2}: {evidence}
- [ ] {criterion N}: {reason if not passing}

## Tests Run
- {test command or suite}: {result}

## Residual Risks
- {risk}: {severity} — {mitigation plan}

## Verdict
{Pass | Fail | Conditional Pass}
```

Actions:
1. Check each acceptance criterion from `sdd/02_plan/current.md`
2. Run applicable tests or verification commands
3. Document evidence (do NOT just say "tests pass" — include actual output or reference)
4. List residual risks honestly

**Gate**: If verdict is Fail, return to Step 3 (Build). Do NOT declare done with a Fail verdict.

**Display**:
```
[SDD Verify] Running verification...
[SDD Verify] Updated sdd/04_verify/current.md
├── Criteria: {N}/{total} passing
├── Residual risks: {count}
└── Verdict: {Pass | Fail | Conditional Pass}
```

### Step 5: Operate Phase (Conditional)

Only execute if deployment is in scope for this task.

Artifact to produce or update: `sdd/05_operate/current.md`

```markdown
# Operate State

## Deployment
- Environment: {target}
- Method: {how deployed}
- Timestamp: {when}

## Runbook
{steps to operate, restart, rollback}

## Monitoring
{what to watch, alerts, logs}
```

Skip this step if:
- Task is code-only (no deployment)
- User did not request deployment
- Deployment is handled by CI/CD automatically

### Step 6: Completion Gate

Before declaring `[Done]`, verify:

```
[SDD Done?] Checking completion gates...
├── sdd/02_plan/current.md — exists? {Y/N}
├── sdd/03_build/current.md — exists and current? {Y/N}
├── sdd/04_verify/current.md — exists and verdict Pass? {Y/N}
└── sdd/05_operate/current.md — exists (if deploy in scope)? {Y/N}
```

If any gate fails, complete the missing artifact before declaring done.

Final display:
```
[SDD Done] Task complete
├── Plan: sdd/02_plan/current.md
├── Build: sdd/03_build/current.md
├── Verify: sdd/04_verify/current.md (Verdict: Pass)
└── Artifacts are current-state — ready for next iteration
```

## Artifact Maintenance Rules

1. **Overwrite, don't append**: Update files in place. These are current-state docs, not logs.
2. **One file per folder**: `current.md` is the canonical artifact. Supplementary files are allowed but the main doc is always `current.md`.
3. **Checkboxes reflect reality**: Do NOT pre-check criteria. Update checkboxes as work is verified.
4. **Residual risks are honest**: List known risks even after passing. Hiding risks defeats the purpose.

## Integration with Other Skills

| Skill | When to Use Together |
|-------|---------------------|
| `/deep-plan` | Before `/sdd-dev` when requirements are ambiguous — use deep-plan to research, then sdd-dev to execute |
| `/structured-dev-cycle` | Alternative workflow without sdd/ folder — use sdd-dev when project uses sdd/ hierarchy |
| `/dev-review` | After Step 4 — use dev-review for additional code quality check |
| `/adversarial-review` | After Step 4 — use adversarial-review for security-sensitive changes |

## Example Usage

```
/sdd-dev add user authentication to the API
/sdd-dev implement pagination for the product list screen
/sdd-dev 화면명세서 기반으로 대시보드 UI 구현
/sdd-dev refactor the payment module
/sdd-dev  # (no argument — guided workflow)
```

When no argument is provided, ask: "어떤 작업을 진행할까요? sdd/01_planning/ 의 요구사항을 기반으로 계획을 수립합니다."

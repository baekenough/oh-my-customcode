# Hook Parallel Execution Groups

> Issue #437: Hook chain serial execution bottleneck on Edit/Write tools

## Analysis of PostToolUse hooks (from hooks.json)

This document classifies each PostToolUse hook by its state dependencies to identify
which hooks are theoretically parallelizable and which require serial ordering.

---

## Hook Inventory

| Hook script | Trigger (PostToolUse) | Reads | Writes | Blocks? |
|---|---|---|---|---|
| `audit-log.sh` | Edit, Write, Bash, Agent | none | `~/.claude/audit.jsonl` | never (exit 0) |
| `context-budget-advisor.sh` | Edit, Write, Agent, Task, Read, Glob, Grep, Bash | `/tmp/.claude-context-budget-$PPID` | `/tmp/.claude-context-budget-$PPID` | never (exit 0) |
| `stuck-detector.sh` | Edit, Write, Bash, Task, Agent | `/tmp/.claude-tool-history-$PPID` | `/tmp/.claude-tool-history-$PPID` | exits 1 on hard-block only |
| `cost-cap-advisor.sh` | Edit, Write, Bash, Task, Agent | `/tmp/.claude-cost-$PPID`, `/tmp/.claude-cost-advisory-$PPID` | `/tmp/.claude-cost-advisory-$PPID` | never (exit 0) |
| `content-hash-validator.sh` (PostToolUse/Read) | Read | none | `/tmp/.claude-content-hashes-$PPID` | never (exit 0) |
| `content-hash-validator.sh` (PreToolUse/Edit) | Edit (PreToolUse) | `/tmp/.claude-content-hashes-$PPID` | none | never (exit 0) |
| `secret-filter.sh` | Bash, Read, Grep | none (scans stdin output) | none | never (exit 0) |
| `prettier` (inline) | Edit .ts/.tsx/.js/.jsx | filesystem (file being edited) | filesystem (file being edited) | never (exit 0) |
| `tsc check` (inline) | Edit .ts/.tsx | filesystem (tsconfig, files) | none (noEmit) | never (exit 0) |
| `console.log check` (inline) | Edit .ts/.tsx/.js/.jsx | filesystem (file being edited) | none (stdout warning) | never (exit 0) |
| `gofmt` (inline) | Edit .go | filesystem (file being edited) | filesystem (file being edited) | never (exit 0) |
| `ruff format+check` (inline) | Edit .py | filesystem (file being edited) | filesystem (file being edited) | never (exit 0) |
| `ty check` (inline) | Edit .py | filesystem (file being edited) | none (noEmit) | never (exit 0) |
| `PR URL logger` (inline) | Bash | none (scans stdin output) | none | never (exit 0) |

---

## Group Classification

### Group A: State-recording (independent, parallelizable)

These hooks only WRITE to independent, non-overlapping state files.
No other hook reads their output during the same tool invocation.

- **`audit-log.sh`** → writes `~/.claude/audit.jsonl` (append-only, independent path)
- **`content-hash-validator.sh` (PostToolUse/Read mode)** → writes `/tmp/.claude-content-hashes-$PPID`
  - Written when tool == "Read"; read only by PreToolUse/Edit (different trigger, different invocation)

**Parallelizable**: Yes — each writes to a distinct file; no hook in this group reads another's output.

---

### Group B: Advisory (independent, parallelizable)

These hooks READ state and emit `stderr` warnings only. They do not write shared state
that other hooks depend on within the same invocation.

- **`context-budget-advisor.sh`** → reads+writes `/tmp/.claude-context-budget-$PPID`
  (self-contained counter; no other hook reads this file)
- **`cost-cap-advisor.sh`** → reads `/tmp/.claude-cost-$PPID` (written by `statusline.sh`, not a hook);
  reads+writes `/tmp/.claude-cost-advisory-$PPID` (self-contained dedup state)
- **`stuck-detector.sh`** → reads+writes `/tmp/.claude-tool-history-$PPID` (self-contained ring buffer);
  can exit 1 on hard-block — this is the **only non-advisory hook in this group**
- **`secret-filter.sh`** → reads only from stdin JSON (no filesystem state)

**Parallelizable**: Yes for `context-budget-advisor.sh`, `cost-cap-advisor.sh`, `secret-filter.sh`.
`stuck-detector.sh` is advisory but has a hard-block code path — treat as advisory for normal
operation, but note that its exit code matters for blocking.

---

### Group C: Formatter (must run sequentially, file-mutating)

These hooks mutate the file that was just edited. Because they all operate on the same
file path and some depend on the result of a prior formatter (e.g., prettier before tsc),
they must run sequentially and must complete before the next tool call proceeds.

- **`prettier`** → reads and writes `.ts/.tsx/.js/.jsx` file
- **`tsc --noEmit`** → reads `.ts/.tsx` file (should run after prettier normalizes it)
- **`console.log check`** → reads `.ts/.tsx/.js/.jsx` file (pure read, but logically after prettier)
- **`gofmt`** → reads and writes `.go` file
- **`ruff format + ruff check --fix`** → reads and writes `.py` file
- **`ty check`** → reads `.py` file (should run after ruff normalizes it)

**Parallelizable**: No — all operate on the same file; formatters mutate it.
Within a language group (e.g., TypeScript) the recommended order is:
  1. prettier (formatter)
  2. tsc --noEmit (type check — depends on formatted output)
  3. console.log check (advisory scan)

---

### Group D: Sequential (ordering required)

These hooks have explicit ordering requirements with other hooks or with the tool itself.

- **`stage-blocker.sh`** (PreToolUse/Write+Edit) — MUST run before any Write/Edit tool
  executes; blocks the tool entirely if stage check fails.
- **`content-hash-validator.sh`** (PreToolUse/Edit) — MUST run after the PostToolUse/Read
  instance has stored the hash (cross-invocation ordering: Read invocation → Edit invocation).
- **`schema-validator.sh`** (PreToolUse/Write+Edit+Bash) — MUST run before the tool executes
  to validate tool input structure.
- **`git-delegation-guard.sh`** (PreToolUse/Agent+Task) — MUST run before agent spawn.
- **`agent-teams-advisor.sh`** (PreToolUse/Agent+Task) — MUST run before agent spawn.
- **`model-escalation-advisor.sh`** (PreToolUse/Agent+Task) — MUST run before agent spawn.

**Parallelizable**: No — these are PreToolUse hooks that gate the tool call itself.

---

## Dependency Graph (PostToolUse hooks only)

```
stdin JSON (hook input)
       │
       ├──[A: independent writers]──────────────────────── can be parallel
       │      audit-log.sh
       │      content-hash-validator.sh (Read mode)
       │
       ├──[B: advisory readers]──────────────────────────── can be parallel
       │      context-budget-advisor.sh
       │      cost-cap-advisor.sh
       │      secret-filter.sh
       │      stuck-detector.sh (may exit 1)
       │
       └──[C: file formatters]────────────────────────────── serial per language
              prettier → tsc → console.log check   (TypeScript/JS)
              gofmt                                 (Go)
              ruff format → ruff check → ty check  (Python)
```

---

## Recommended Parallel Strategy

| Group | Hooks | Strategy |
|-------|-------|----------|
| A (state-recording) | audit-log.sh, content-hash-validator.sh (Read) | Safe to parallelize — no read dependencies between them |
| B (advisory) | context-budget-advisor.sh, cost-cap-advisor.sh, secret-filter.sh | Safe to parallelize — read-only advisory, no shared output |
| B+ (advisory+block) | stuck-detector.sh | Safe to parallelize with Group B, but exit code must be checked |
| C (formatters) | prettier, tsc, gofmt, ruff, ty | Must be sequential — file mutation with ordering within language |
| D (PreToolUse gates) | stage-blocker, content-hash-validator (Edit), schema-validator, git/teams/escalation advisors | Must be sequential — gate the tool execution itself |

**Theoretical maximum parallelism**: Groups A + B can all run concurrently (6 hooks in parallel
on Edit/Write/Bash invocations). This would reduce serial hook time from ~6× to ~1× for those groups.

**Current constraint**: Claude Code's hook system runs all hooks in the order defined in `hooks.json`.
True parallelism is not yet supported by the runtime. This document serves as the design intent
for when parallel hook execution becomes available, and as input for hook ordering optimization.

**Ordering recommendation** (for minimal serial latency):
1. Run Group D (PreToolUse) — blocking gates
2. Run Groups A + B concurrently (PostToolUse) — non-blocking advisors and recorders
3. Run Group C serially within language (PostToolUse) — formatters must be ordered

---

## Profiling Instrumentation

Three hooks have timing instrumentation added (Issue #437):

- `.claude/hooks/scripts/audit-log.sh`
- `.claude/hooks/scripts/context-budget-advisor.sh`
- `.claude/hooks/scripts/stuck-detector.sh`

Each records wall-clock time (nanoseconds via `date +%s%N`) before and after execution,
appending a line to `/tmp/.claude-hook-perf-${PPID}.log`:

```
[Hook Perf] audit-log.sh: 12ms
[Hook Perf] context-budget-advisor.sh: 8ms
[Hook Perf] stuck-detector.sh: 23ms
```

**Reading the perf log**:
```bash
cat /tmp/.claude-hook-perf-${PPID}.log
```

**macOS note**: `date +%s%N` is available on macOS via GNU coreutils (`gdate`). The scripts
use a graceful fallback: if `date +%s%N` returns a non-numeric "0", profiling is skipped
silently (no-op, no output written).

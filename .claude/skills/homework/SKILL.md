---
name: homework
description: On explicit /homework invocation, analyze the current and linked previous sessions, extract mistakes (찐빠), and report them via omcustom-feedback with a confirmation gate. Auto-activation on session cleanup/session-end signals is OPT-IN (default OFF) — requires an explicit project/user directive. Use when explicitly auditing recent work for harness gaps.
scope: harness
user-invocable: true
argument-hint: "[--dry-run] [--days <n>] [--severity <critical|high|medium|low>]"
version: 0.1.0
effort: medium
---

# Homework — Session Mistake Extractor

On session cleanup ("세션 정리") or `/homework` invocation, analyze the current and linked previous sessions to extract 찐빠 (mistakes: rule violations, scope-creep, hallucinations, premature hypotheses, missed conventions, etc.), then report findings via `omcustom-feedback` with a mandatory user confirmation gate.

This skill is the dedicated entry point for R011's "Session-End Retrospective Feedback (Model-Drafted)" pattern. It formalizes the retrospective workflow that produced issue #1266.

## Usage

```
/homework                          # Analyze current session, report findings
/homework --dry-run                # Analyze only, no omcustom-feedback invocation
/homework --days 3                 # Include linked sessions from last N days
/homework --severity high          # Filter to critical/high findings only
```

## Trigger Detection

**Default: OFF for auto-activation.** This skill does NOT auto-run on session cleanup or session-end signals unless explicitly enabled. The default is `false` — silence is a non-trigger.

Activate ONLY when:
- **Explicit `/homework` invocation** (always runs)
- **Explicit opt-in**: the user/project has explicitly directed homework to run on session cleanup — e.g., a CLAUDE.md directive such as "run homework on every session cleanup", or a settings flag. A one-off explicit request ("회고 돌려줘", "homework 실행") also counts.

If no explicit opt-in exists, treat session-cleanup / session-end phrases ("세션 정리", "숙제", "회고", "끝", "종료", "마무리", "done", "wrap up", "session cleanup", "end session") as **NON-triggers** — do NOT auto-run. You MAY briefly remind the user that `/homework` is available, then proceed with normal session-end handling.

When auto-activation IS explicitly enabled and fires as a session-end signal, this skill runs BEFORE sys-memory-keeper's MEMORY.md update (R011 session-end self-check order: homework → memory save).

## Workflow

### Phase 1: Trigger Parsing

Parse arguments:
- `--dry-run`: analyze only, skip Phase 5 (omcustom-feedback invocation)
- `--days <n>`: extend linked-session search to last N days (default: 0 = current session only)
- `--severity <level>`: filter output to this severity and above (default: all)

### Phase 2: Session Gathering

#### 2a. Current Session Transcript

Attempt deterministic transcript extraction. Preferred sources (in order):

1. **Grep for rule-violation markers** in the current conversation context:
   - Safety classifier trip signals: `[Safety]`, `[R001]`, `[Warning]`, classifier denial messages
   - Self-corrections: "sorry", "I made an error", "let me correct", "이전 답변 수정", "죄송합니다"
   - Premature hypothesis signals: "I assume", "probably", "should be" followed by a contradiction in a later turn
   - Interrupt + re-plan events: user corrections, "no", "wrong", "다시", "아니"

2. **Transcript files** (CC v2.1.x session JSONL):
   ```bash
   find ~/.claude/projects -name "session-*.jsonl" -newer "$(date -v-1d +%Y-%m-%dT00:00:00)" 2>/dev/null | head -5
   ```
   Parse `type: "error"`, `type: "correction"`, `type: "feedback"` events.

3. **Fallback**: Rely on the model's recall of the current conversation (impressionistic, lower confidence — mark findings as `[recall]` not `[transcript]`).

#### 2b. Linked Previous Sessions (when `--days` > 0)

Use the `episodic-memory` plugin's `search-conversations` / `episodic-memory:remembering-conversations` to retrieve sessions from the last N days linked to this project. Pass project directory as context.

If `episodic-memory` is unavailable, scan JSONL files:
```bash
find ~/.claude/projects -name "session-*.jsonl" \
  -newer "$(date -v-${DAYS}d +%Y-%m-%dT00:00:00)" 2>/dev/null
```

**R020 read-before-characterize**: Do NOT characterize a session's mistakes before reading it. Read the session transcript (or a representative sample) first, then characterize.

### Phase 3: Mistake (찐빠) Analysis

Categorize each finding with the following structure (mirror #1266 format):

```
찐빠 #N — [{severity}] {short title}
├── 증상: {what was observed — cite evidence: session line ref or commit SHA}
├── 근거: {transcript evidence or recall note — always read first per R020}
├── 원인: {root cause — why did this happen?}
├── 영향 규칙: {R0xx, R0yy — affected rule IDs}
└── 제안: {concrete corrective action or harness change}
```

**Severity scale:**

| Level | Criteria | Examples |
|-------|----------|---------|
| Critical | Safety classifier trip, credential exposure, scope-creep into privileged domains, working-tree loss | R001 violation, secret dump, unauthorized infra action |
| High | Rule violation with downstream impact, hallucinated fact acted upon, premature hypothesis causing permanent change | R020 Parallel Read+Change, wrong root cause → wrong fix |
| Medium | Process gap, missed convention, advisory rule ignored | R007 header missing, bypassPermissions omitted, count sync missed |
| Low | Minor style drift, non-impactful oversight | honorific regression, ecomode token waste |

**Mistake categories to look for:**

| Category | Signals |
|----------|---------|
| Rule violations (R0xx) | Header missing (R007), tool prefix absent (R008), file write by orchestrator (R010), sequential when parallel required (R009) |
| Scope-creep | Subagent task expanding beyond its named scope (R010 Subagent Scope-Creep STOP Protocol) |
| Hallucinated facts | External UI fields stated as fact (R003 Unverifiable External Product UI), in-cluster hostnames, unverified URLs |
| Premature hypotheses | Diagnosis before reading evidence (R020 Read-Before-Characterize), parallel Read+permanent-change dispatch (R020 Variant) |
| Missed conventions | Count sync drift (3-way sync), template mirror omitted, bypassPermissions missing |
| Over-claim completion | [Done] without verification (R020), test-skip masking failures |

**Do NOT over-claim.** If evidence for a finding is weak or based on recall only, mark it `[recall, low-confidence]` and note what would be needed to confirm it. R020 read-before-characterize applies to this analysis itself.

### Phase 4: Draft Feedback Issue

Assemble a feedback issue in Korean using the #1266 format:

```markdown
**제목**: 세션 회고: {date} 세션 찐빠 {N}건 — {top finding title}

**카테고리**: improvement

**본문**:
## 세션 회고 — {YYYY-MM-DD}

### 개요
총 {N}건의 찐빠가 발견되었습니다 (Critical: {c}, High: {h}, Medium: {m}, Low: {l}).

### 찐빠 목록

{찐빠 #1 ~ #N — structured format from Phase 3}

### 하네스 제안 (있는 경우)
{Concrete skill/rule/hook changes that would prevent recurrence}

---
*Generated by `/homework` skill (v0.1.0)*
```

If `--severity` filter is active, include only findings at or above the threshold. Note the filter in the issue body.

If no findings are discovered, output:
```
[homework] 이번 세션에서 찐빠를 발견하지 못했습니다. (세션 정상 종료)
```
and skip Phase 5.

### Phase 5: Report via omcustom-feedback (Phase 4A gate)

**MUST go through the `omcustom-feedback` skill's Phase 4A preview + confirmation gate.**
**NEVER auto-submit.** User approval is always required before any GitHub issue is created.

Invoke the `omcustom-feedback` skill with the drafted issue content. The user will see a preview and must confirm before any GitHub issue is created.

```
[homework] 피드백 이슈 초안을 omcustom-feedback으로 전달합니다.
아래 미리보기를 확인하고 제출 여부를 결정해 주세요.
```

If `--dry-run` is active, skip this phase and output the draft directly to the conversation instead.

### Phase 6: Output Summary

```
[homework] 완료
├── 분석: {N}건 찐빠 발견 (Critical: {c}, High: {h}, Medium: {m}, Low: {l})
├── 제출: {이슈 URL | dry-run (미제출) | 사용자 취소}
└── 다음 액션: {harness 제안 있으면 표시, 없으면 "없음"}
```

## Options Reference

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | off | Analyze only, no omcustom-feedback invocation |
| `--days <n>` | 0 | Include linked sessions from last N days (0 = current session only) |
| `--severity <level>` | all | Filter findings to this level and above |

## Rules & Cross-References

| Rule | Relevance |
|------|-----------|
| R011 (SHOULD-memory-integration) | This skill is the dedicated entry point for "Session-End Retrospective Feedback (Model-Drafted)". Runs before sys-memory-keeper MEMORY.md update. |
| R020 (MUST-completion-verification) | Analysis MUST read transcript evidence before characterizing a mistake. Do NOT characterize before reading (Read-Before-Characterize). Parallel Read + Permanent-Change Dispatch anti-pattern applies here too. |
| R016 (MUST-continuous-improvement) | Genuine defects/process gaps → feedback issue. The /homework output feeds R016's continuous improvement loop. |
| R010 (MUST-orchestrator-coordination) | Any file writes in this workflow must be delegated to subagents. This skill orchestrates, never directly writes except to `.claude/outputs/`. |
| R001 (MUST-safety) | Analysis must not dump credential values, secrets, or PII. Reference sensitive items by name only. |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `omcustom-feedback` | Reporting channel (Phase 5). Model-invocable with Phase 4A confirmation gate. |
| `instinct-extractor` | Cross-session failure-pattern mining (complements /homework's single-session focus). For multi-session patterns, run instinct-extractor after homework. |
| `episodic-memory:search-conversations` | Cross-session retrieval for `--days` mode. |
| `sys-memory-keeper` | Runs after /homework at session end (R011 order: homework → memory save). |

## Artifact Output

```
.claude/outputs/sessions/{YYYY-MM-DD}/homework-{HHmmss}.md
```

If Phase 5 is skipped (`--dry-run`), the draft issue body is written to this artifact path for reference.

## Permission Mode Note

This skill does not spawn subagents directly. If future versions delegate analysis to subagents, ALL Agent tool calls MUST include `mode: "bypassPermissions"` per R010 Universal bypassPermissions.

## Context Fork Note

This skill does NOT use `context: fork`. The fork cap is at 10/12; homework is a single-agent orchestration skill and does not require a forked context.

## Limitations

- **Transcript availability**: CC `session-*.jsonl` schema may change; Phase 2a source (1) grep is more resilient than JSONL parsing.
- **Recall accuracy**: When transcript files are unavailable, findings are marked `[recall]` and confidence is lower.
- **episodic-memory dependency**: `--days` mode degrades gracefully when the plugin is unavailable (falls back to JSONL scan).
- **Scope**: This skill analyzes session behavior, not code quality. For code-quality retrospectives, use `dev-review` or `adversarial-review`.

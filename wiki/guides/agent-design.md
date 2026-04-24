---
title: "Agent Design Patterns"
type: guide
updated: 2026-04-24
sources:
  - guides/agent-design/ralph-loop-pattern.md
related:
  - [[r006]]
  - [[r011]]
  - [[guides/harness-engineering]]
  - [[guides/skill-bundle-design]]
  - [[agents/sys-memory-keeper]]
  - [[skills/secretary-routing]]
---

# Agent Design Patterns

에이전트 설계 시 참조할 패턴 모음. 세션 지속성, 메모리 통합, 역할 분리 등 에이전트 수명주기 전반의 실천 패턴을 다룬다.

## Patterns

### Ralph Loop Pattern

세션 경계를 넘는 지속 진화 메커니즘. Q00/ouroboros에서 내재화 (#966, v0.106.0).

**Core idea**: 각 세션의 sticky patterns(실패 교훈, 선호 패턴)을 다음 세션 초기 컨텍스트로 주입하여 tacit knowledge 손실 방지.

**4-step cycle**:
1. **Bootstrap** — 세션 시작 시 MEMORY.md에서 이전 요약 로드
2. **Evolve** — 세션 중 발견한 패턴/실패를 feedback memory에 즉시 기록 (mid-session save)
3. **Compact** — 세션 종료 시 sys-memory-keeper가 Ralph Loop 요약 수행
4. **Persist** — claude-mem MCP에 long-term save (cross-session search)

**Claude Code 통합**:
- `claude-mem MCP` — feedback memories + session archives 영속 저장소
- `sys-memory-keeper` — 세션 종료 요약 에이전트 (R011 위임)
- `R011 native auto-memory` — primary writer (MEMORY.md)

**Anti-patterns**: 세션마다 처음부터 시작하는 sessionless 모드 / 모든 로그를 저장하는 brute-force persistence.

→ Full guide: `guides/agent-design/ralph-loop-pattern.md`

## Relationships

- **Rules**: [[r006]] (agent design frontmatter), [[r011]] (memory integration and session-end protocol)
- **Agents**: [[agents/sys-memory-keeper]] (Ralph Loop Compact executor)
- **Guides**: [[guides/harness-engineering]] (context engineering), [[guides/skill-bundle-design]] (composability)
- **Source issues**: #966 ouroboros repository re-evaluation

## Sources

- `guides/agent-design/ralph-loop-pattern.md` — Ralph Loop Pattern v0.106.0 via #966

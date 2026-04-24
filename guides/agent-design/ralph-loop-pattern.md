# Ralph Loop Pattern — 세션 경계 지속 진화

> 출처: Q00/ouroboros Ralph Loop 패턴 (INTEGRATE #966)
> 도입일: v0.106.0

## Context

LLM 에이전트는 세션 종료 시 누적된 맥락(tacit knowledge, 실패 교훈, 선호 패턴)을 잃는다. Ralph Loop는 세션 간 경계를 넘는 지속 진화 메커니즘으로, 각 세션의 실패/성공 sticky patterns를 다음 세션의 초기 컨텍스트로 주입한다.

## Claude Code 통합

- **claude-mem MCP**: feedback memories + session archives를 영속 저장소로
- **sys-memory-keeper 에이전트**: 세션 종료 시 Ralph Loop 요약 수행
- **R011 Memory Integration**: native auto-memory를 Ralph Loop의 primary writer로

## Pattern

1. **Bootstrap**: 세션 시작 시 MEMORY.md에서 이전 Ralph Loop 요약 로드
2. **Evolve**: 세션 진행 중 발견한 새 패턴/실패를 feedback memory에 기록
3. **Compact**: 세션 종료 시 sys-memory-keeper가 Ralph Loop 요약을 MEMORY.md 업데이트
4. **Persist**: claude-mem MCP에 long-term save (cross-session search)

## Anti-patterns

- 세션마다 처음부터 다시 시작하는 sessionless 모드 (R011 native memory 사용)
- 모든 세션 로그를 저장하는 brute-force persistence (selective feedback만)

## References

- R011 SHOULD-memory-integration.md
- sys-memory-keeper 에이전트
- Q00/ouroboros `ooo interview/run/ralph` CLI

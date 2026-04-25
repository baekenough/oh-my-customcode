# Release v0.110.0

## Highlights

- **Output Styles 레이어 도입** — Claude Code 네이티브 시스템 프롬프트 레이어로 R007/R008/R000 강제력 격상 (#1003)
- **roundtable-debate 스킬 신설** — Devil's Advocate + 소수의견 보호 + 2라운드 하드캡으로 다중 에이전트 토론의 anti-groupthink 메커니즘 내재화 (#1007)
- **agora 보강** — Anti-Groupthink Mode 옵션 추가, 수렴 vs 발산 보존 패턴 구분 명확화

## :rocket: Features

- **Output Styles 도입** (#1003): `.claude/output-styles/korean-engineer.md` 신규 작성 — Korean-first 출력 + R007/R008 에이전트 식별 + R003 balanced 스타일을 시스템 프롬프트로 격상. R003 SHOULD-interaction.md에 Session-Level Style Enforcement 위임 섹션 추가, settings.local.json `outputStyle` 활성화.
- **roundtable-debate 스킬** (#1007): 발산 보존(divergence preservation)을 목표로 하는 다중 에이전트 구조화 토론 스킬. context: fork (10/12), 핵심 메커니즘 4종(Independent-first parallel analysis, Devil's Advocate 강제 주입, 소수의견 보호 프로토콜, 2라운드 하드캡). cc-roundtable 패턴 attribution.
- **agora Anti-Groupthink Mode** (#1007): 기존 만장일치 수렴 워크플로우에 옵션 모드 추가 — Devil's Advocate slot + minority opinion protection + round soft cap. `--mode anti-groupthink` 플래그로 활성화.

## :books: Documentation

- **multi-agent-debate-patterns 가이드 신설** (#1007): 3대 고질병(Anchoring/Groupthink/Degeneration of Thought) 정의 + agora vs roundtable-debate 선택 매트릭스 + 연구 근거.
- **CLAUDE.md 권장 플러그인** (#1007): cc-roundtable 외부 플러그인 항목 추가 — 패턴 내재화 후에도 원본 직접 사용 경로 보존.
- **wiki R022 동기화**: 신규 페이지 3종(roundtable-debate, multi-agent-debate-patterns, output-styles) + 업데이트 3종(agora, R003, R006), wiki/index.yaml 갱신.

## :wrench: Other Changes

- ARCHITECTURE.md fork count drift 보정 (9 → 10), Workflow/orchestration skills 카운트 5 → 6.
- 7곳 카운트 동기화: skills 113→114, guides 44→45, version 0.109.0→0.110.0.
- templates/ 3중 동기화 검증: verify-template-sync.sh / verify-wiki-sync.sh / verify-fork-list.sh 모두 통과.

## Resource Changes

| Resource | Before | After | Delta |
|----------|--------|-------|-------|
| Rules | 22 | 22 | 0 (R003/R006 본문 갱신) |
| Skills | 113 | 114 | +1 (roundtable-debate) |
| Agents | 49 | 49 | 0 |
| Guides | 44 | 45 | +1 (multi-agent-debate-patterns) |
| Wiki pages | 257 | 260 | +3 |
| Fork context (cap 12) | 9 | 10 | +1 |

## Breaking Changes

없음. Output Styles는 비파괴 신규 레이어, roundtable-debate는 신규 스킬, agora는 옵션 모드 추가(기본 동작 변동 없음).

---
_Release notes generated with Claude Code_

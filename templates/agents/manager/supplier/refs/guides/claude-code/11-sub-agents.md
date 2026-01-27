# Sub-agent 가이드

Claude Code에서 특화된 서브에이전트를 생성하고 사용하는 방법

## 개요

서브에이전트는 특정 작업을 처리하는 특화된 AI 어시스턴트입니다. 각 서브에이전트는 자체 컨텍스트 윈도우에서 실행되며, 사용자 정의 시스템 프롬프트, 특정 도구 액세스, 독립적인 권한을 가집니다.

## 서브에이전트의 이점

- **컨텍스트 보존**: 탐색과 구현을 주 대화에서 분리
- **제약 적용**: 서브에이전트가 사용할 수 있는 도구 제한
- **비용 제어**: 작업에 맞는 모델로 라우팅

## Task Tool

서브에이전트는 `Task` 도구를 통해 생성됩니다.

### 기본 문법

```
Task(
  subagent_type: "general-purpose",
  prompt: "수행할 작업 설명",
  model: "sonnet"
)
```

### 파라미터

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `subagent_type` | ✓ | 에이전트 유형 (general-purpose, Explore, Plan 등) |
| `prompt` | ✓ | 수행할 작업 설명 |
| `model` | - | 사용할 모델 (opus, sonnet, haiku, inherit) |
| `description` | ✓ | 짧은 작업 설명 (3-5 단어) |

## 모델 지정

### 사용 가능한 모델

| 모델 | 특성 | 용도 |
|------|------|------|
| `opus` | 가장 강력, 복잡한 추론 | 아키텍처 설계, 복잡한 판단 |
| `sonnet` | 균형 잡힌 성능 | 일반 개발 작업 (기본값) |
| `haiku` | 빠르고 저렴 | 단순 작업, 파일 검색 |
| `inherit` | 부모 모델 상속 | 일관성 필요 시 |

### 모델 선택 기준

```
판단이 필요한 작업 → opus
  - 아키텍처 분석
  - 복잡한 코드 리뷰
  - 설계 결정

생성이 필요한 작업 → sonnet
  - 코드 작성
  - 문서 작성
  - 일반 개발

단순한 작업 → haiku
  - 파일 검색
  - 간단한 검증
  - 상태 확인
```

## 기본 제공 서브에이전트

### Explore

코드베이스 탐색에 최적화된 빠른 읽기 전용 에이전트

- **모델**: haiku (빠름, 낮은 지연시간)
- **도구**: 읽기 전용 (Write, Edit 불가)
- **용도**: 파일 검색, 코드 검색, 코드베이스 탐색

### Plan

계획 모드에서 컨텍스트를 수집하는 연구 에이전트

- **모델**: inherit (부모 모델 상속)
- **도구**: 읽기 전용
- **용도**: 계획을 위한 코드베이스 연구

### general-purpose

탐색과 작업 모두를 수행하는 범용 에이전트

- **모델**: inherit (기본값) 또는 지정
- **도구**: 모든 도구
- **용도**: 복잡한 연구, 다단계 작업, 코드 수정

## 사용 예시

### 복잡한 분석 (opus)

```
Task(
  description: "Analyze architecture",
  subagent_type: "general-purpose",
  prompt: "Analyze the agent architecture and identify improvement opportunities",
  model: "opus"
)
```

### 코드 구현 (sonnet)

```
Task(
  description: "Implement feature",
  subagent_type: "general-purpose",
  prompt: "Implement the user authentication feature following the existing patterns",
  model: "sonnet"
)
```

### 빠른 검색 (haiku)

```
Task(
  description: "Search files",
  subagent_type: "Explore",
  prompt: "Find all files that handle authentication",
  model: "haiku"
)
```

## 병렬 실행

독립적인 작업은 병렬로 실행할 수 있습니다 (최대 4개).

```
# 단일 메시지에서 여러 Task 호출
Task(prompt: "Task A", model: "haiku")
Task(prompt: "Task B", model: "haiku")
Task(prompt: "Task C", model: "haiku")
```

## 비용 최적화

| 전략 | 설명 |
|------|------|
| 탐색은 haiku | 파일 검색, 구조 파악에 haiku 사용 |
| 구현은 sonnet | 일반적인 코딩 작업에 sonnet 사용 |
| 판단은 opus | 중요한 결정에만 opus 사용 |
| 병렬화 | 독립 작업은 병렬로 실행하여 시간 절약 |

## 주의사항

- 서브에이전트는 다른 서브에이전트를 생성할 수 없음
- 백그라운드 서브에이전트는 권한 프롬프트 자동 거부
- 모델 미지정 시 기본값은 sonnet

## 참고 문서

- [Claude Code Sub-agents 공식 문서](https://docs.anthropic.com/claude-code/sub-agents)
- R009: Parallel Execution Rules
- R010: Orchestrator Coordination Rules

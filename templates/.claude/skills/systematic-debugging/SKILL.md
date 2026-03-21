---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior. Enforces a strict reproduce-first, root-cause-first, failing-test-first debugging workflow before fixing.
version: 1.0.0
user-invocable: false
---

<!-- Source: https://github.com/tmdgusya/engineering-disciplines (MIT License) -->

# Systematic Debugging

엄격한 디버깅 워크플로우다. 버그, 테스트 실패, 예기치 않은 동작을 다룰 때 사용한다.

핵심 목적은 세 가지다.

1. 증상이 아니라 원인을 고친다.
2. 추측 기반 수정을 막는다.
3. 실패를 테스트로 고정한 뒤 수정한다.

## Hard Gates

다음 규칙은 예외 없이 따른다.

1. **재현 또는 관측 가능 상태를 만들기 전에는 수정하지 않는다.**
2. **원인 가설을 명시하기 전에는 수정하지 않는다.**
3. **실패 테스트 또는 동등한 재현 장치를 만들기 전에는 수정하지 않는다.**
4. **한 번에 하나의 가설만 검증한다.**
5. **수정 시 "while I'm here" 리팩터링을 금지한다.**
6. **수정 시도가 3번 실패하면 추가 패치 전에 구조적 문제를 의심한다.**

이 과정을 어기는 것은 디버깅 실패로 본다.

## When To Use

다음 상황이면 이 스킬을 사용한다.

- 테스트가 실패할 때
- 운영 또는 로컬에서 버그가 발생할 때
- 예상과 다른 응답, 상태, 렌더링, 쿼리 결과가 나올 때
- 성능 저하, 타임아웃, 레이스 컨디션, 간헐 실패를 조사할 때
- 이미 한 번 이상 고쳤는데 다시 깨졌을 때

다음 핑계는 허용하지 않는다.

- "간단해 보여서 바로 고치면 된다"
- "시간이 없으니 일단 패치하고 보자"
- "이거 같으니까 그냥 바꿔보자"

## Required Output Contract

이 스킬을 사용할 때는 내부적으로 아래 항목을 반드시 고정한다.

1. **Problem statement**: 무엇이 잘못되었는지 한 문장으로 정의
2. **Reproduction path**: 어떻게 실패를 재현하거나 관측할지
3. **Evidence**: 실제 관측 결과
4. **Root-cause hypothesis**: 왜 이 문제가 발생한다고 보는지
5. **Failing guard**: 실패 테스트, 재현 스크립트, 로그 검증 중 하나
6. **Fix**: 원인에 대한 단일 수정
7. **Verification**: 수정 후 재현 경로와 관련 테스트 결과

이 7개 중 빠진 항목이 있으면 아직 끝난 일이 아니다.

## Workflow

반드시 아래 순서로 진행한다.

### Phase 1. Define The Problem

먼저 문제를 축약한다.

- 실제 기대 동작은 무엇인가
- 실제 관측 동작은 무엇인가
- 영향 범위는 어디까지인가
- 항상 재현되는가, 간헐적인가

출력 형식:

```text
Problem: <expected> but got <actual> under <condition>
```

증상과 추측을 섞지 않는다.

```text
Good: Product detail API returns 500 when brand is null.
Bad: Serializer is broken because brand mapping seems wrong.
```

### Phase 2. Reproduce Or Instrument

수정 전에 실패를 다시 볼 수 있어야 한다.

우선순위:

1. 기존 테스트로 재현
2. 최소 통합 테스트로 재현
3. 단위 테스트로 재현
4. 재현 스크립트 또는 명령으로 관측
5. 로그/계측 추가 후 관측

규칙:

- 재현 경로는 가능한 한 가장 작게 만든다.
- UI에서만 보이는 버그라도 더 아래 계층에서 재현 가능하면 그쪽을 선호한다.
- 간헐 실패면 로그, 입력, 시간, 동시성 조건을 추가해 관측성을 높인다.
- 재현되지 않으면 수정으로 넘어가지 말고 관측 수단을 늘린다.

재현 불가 상태에서 해야 할 일:

1. 입력값 기록
2. 환경 차이 확인
3. 최근 변경점 확인
4. 경계 지점별 로그 추가
5. 동일 증상을 만드는 더 작은 조건 탐색

### Phase 3. Gather Evidence

관측 가능한 사실만 모은다.

항상 확인할 것:

- 에러 메시지와 스택트레이스 전문
- 실패 입력값
- 최근 변경 파일 또는 커밋
- 환경/설정 차이
- 호출 경로와 데이터 흐름

멀티 컴포넌트 문제에서는 경계마다 확인한다.

예시:

- controller -> application -> service -> repository
- client -> API -> external service
- scheduler -> batch service -> database

각 경계에서 확인할 것:

- 무엇이 들어왔는가
- 무엇이 나갔는가
- 어떤 값이 변형되었는가
- 어떤 조건에서만 깨지는가

문제 위치를 특정하기 전에는 고치지 않는다.

### Phase 4. Isolate Root Cause

원인 후보를 하나만 세운다.

형식:

```text
Hypothesis: <root cause> because <evidence>
```

좋은 가설의 조건:

- 단일 원인을 가리킨다
- 관측 증거와 연결된다
- 작은 실험으로 반증 가능하다

나쁜 가설의 예:

- "어딘가 비동기 문제가 있는 것 같다"
- "직렬화 쪽 전체가 불안정한 듯하다"

원인을 소스까지 거슬러 올라간다. 오류가 깊은 스택에서 보이면 증상이 아니라 입력의 출처를 추적한다.

### Phase 5. Lock The Failure

수정 전에 실패를 고정한다.

우선순위:

1. 자동화된 failing test
2. 기존 테스트에 회귀 케이스 추가
3. 최소 재현 스크립트
4. 로그/어설션 기반 임시 검증 장치

규칙:

- 가능하면 자동화 테스트를 만든다.
- 수정 전에는 실패해야 한다.
- 수정 후에는 같은 경로에서 통과해야 한다.
- 테스트 이름은 무엇이 깨졌는지 드러내야 한다.

자동화 테스트를 쓸 수 있으면 `test-driven-development` 스킬을 함께 사용한다.

### Phase 6. Implement A Single Fix

수정은 하나의 가설만 다룬다.

허용:

- 원인에 직접 대응하는 최소 코드 변경
- 검증에 필요한 최소한의 보조 수정

금지:

- 관련 있어 보이는 여러 수정 묶기
- 리팩터링 겸 수정
- 포맷/정리/이름 변경 끼워넣기
- 근거 없는 null-guard 추가
- 예외 삼키기

실패하면 즉시 다시 Phase 1 또는 Phase 3으로 돌아간다. 이전 가설이 틀렸다는 뜻이다.

### Phase 7. Verify And Close

아래를 모두 만족해야 종료한다.

1. 원래 재현 경로가 더 이상 실패하지 않는다.
2. 새 failing guard가 통과한다.
3. 관련 테스트가 깨지지 않는다.
4. 수정이 증상이 아니라 원인을 막는다는 설명이 가능하다.

간헐 버그라면 한 번 통과로 끝내지 않는다. 반복 실행 또는 조건 변화 하 검증이 필요하다.

## Stop Conditions

다음 상황이면 멈추고 프레임을 다시 잡는다.

### 1. Reproduction Failed

여러 번 시도해도 재현이 안 되면:

- 관측 수단이 부족한지 본다.
- 환경 차이가 있는지 본다.
- 문제 정의가 잘못되었는지 본다.

재현이 안 되는데 코드를 바꾸는 것은 금지다.

### 2. Three Failed Fixes

세 번 연속으로 수정이 빗나가면 이렇게 판단한다.

- 현재 이해가 틀렸거나
- 문제가 공유 상태, 경계 설계, 책임 분리 같은 구조 문제일 가능성이 크다

이 시점부터는 "네 번째 땜질"이 아니라 구조 논의가 필요하다.

### 3. No Failing Guard

실패 테스트나 동등한 재현 장치를 만들 수 없으면, 완료로 선언하지 않는다. 최소한 재현 명령과 관측 결과를 남긴다.

## Red Flags

아래 생각이 들면 즉시 멈추고 앞 단계로 돌아간다.

- "이 줄만 바꿔보면 될 것 같다"
- "로그는 나중에 보고 일단 수정해보자"
- "테스트는 나중에 추가하지 뭐"
- "한 번에 이것도 저것도 같이 고치자"
- "에러는 사라졌으니 원인은 몰라도 됐다"

## Minimal Checklist

실행 중에는 아래 체크리스트를 기준으로 스스로 검증한다.

- [ ] 문제를 한 문장으로 정의했다
- [ ] 실패를 재현하거나 관측 가능하게 만들었다
- [ ] 증거를 수집했다
- [ ] 단일 원인 가설을 만들었다
- [ ] 수정 전 실패 guard를 만들었다
- [ ] 단일 수정만 적용했다
- [ ] 같은 경로로 수정 후 검증했다

## Completion Standard

이 스킬의 완료 기준은 "코드가 바뀌었다"가 아니다.

완료 기준:

- 문제 정의가 명확하다
- 실패가 수정 전에 고정되었다
- 수정이 원인과 연결된다
- 검증 결과가 남아 있다

이 네 가지가 없으면 디버깅은 끝난 것이 아니다.

## Reference Materials

This skill includes reference documents for specific debugging techniques:

- `root-cause-tracing.md` — Tracing bugs back through call chains to the original trigger
- `defense-in-depth.md` — Adding validation at every layer to make bugs structurally impossible
- `condition-based-waiting.md` — Replacing arbitrary delays with condition-based polling
- `find-polluter.sh` — Bisection script for finding test pollution sources
- `condition-based-waiting-example.ts` — Complete implementation of condition-based waiting utilities

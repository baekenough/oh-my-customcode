# Amplification Detection

retry storm 및 에러 cascading 시그널을 탐지하는 절차다.

## 목적

단일 장애가 retry/timeout 연쇄로 증폭되면 원인과 증상이 분리된다.
원인은 한 곳이지만 에러는 시스템 전체에서 나타난다.
증폭을 먼저 탐지하지 않으면 증상을 원인으로 착각하고 엉뚱한 곳을 고친다.

## 증폭의 3가지 유형

### 1. Retry Storm

단일 실패가 재시도로 인해 N배 트래픽으로 증폭되는 패턴.

시그널:
- 업스트림 에러율이 급상승하는 동시에 요청 수도 급상승
- 동일 에러가 짧은 시간(1~5초) 안에 burst 발생
- 업스트림 서비스 로그에 동일 request_id가 N회 기록됨

```bash
# 동일 에러의 burst 패턴 확인
grep "ERROR" application.log \
  | awk '{print $1, $2}' \
  | uniq -c \
  | sort -rn \
  | head -20

# 초당 에러 수 추이
grep "ERROR" application.log \
  | awk '{print $1"T"substr($2,1,5)}' \
  | sort | uniq -c
```

### 2. Error Cascading

한 서비스의 실패가 의존 서비스로 전파되는 패턴.

시그널:
- 여러 서비스에서 에러가 동시에 또는 순차적으로 발생
- 에러 발생 순서가 dependency graph 방향과 일치
- 하나의 서비스가 회복되자 연쇄적으로 다른 서비스도 회복

```
Dependency graph 예:
  Service A → Service B → Service C
  
  Cascading 시그널:
  14:47:00  Service C ERROR (DB timeout)
  14:47:03  Service B ERROR (C call failed)
  14:47:05  Service A ERROR (B call failed)
```

### 3. Connection Pool Exhaustion

retry/cascading으로 커넥션이 소진되어 새 요청이 큐에 쌓이는 패턴.

시그널:
- 응답 시간이 급격히 증가 (정상 50ms → 10s)
- `connection pool exhausted` 또는 `too many connections` 에러
- 이전에는 없던 timeout이 급증

```bash
# PostgreSQL 커넥션 수 확인
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# MySQL 커넥션 상태
mysql -e "SHOW STATUS LIKE 'Threads_connected';"

# Redis 커넥션
redis-cli INFO clients | grep connected_clients
```

## 탐지 절차

### Step 1. Rate 변화 추적

```bash
# 에러 발생 전후 1분 단위 에러 수 추이
grep "ERROR" app.log \
  | awk '{print substr($2,1,5)}' \
  | sort | uniq -c

# 정상: 에러 수가 점진적으로 증가
# 증폭: 에러 수가 특정 시점에서 급격히 증가(3배 이상)
```

### Step 2. Dependency Graph 분석

```bash
# 서비스 A의 에러 시작 시각
grep "ERROR" service-a.log | head -1

# 서비스 B의 에러 시작 시각
grep "ERROR" service-b.log | head -1

# 시각 차이가 dependency latency와 일치하면 cascading
```

### Step 3. 증폭 여부 판정

| 관측 | 판정 |
|------|------|
| 요청 수 증가 없이 에러율만 증가 | 단순 장애 (증폭 아님) |
| 요청 수와 에러율이 동시 급증 | Retry storm 의심 |
| 에러가 여러 서비스로 순차 전파 | Cascading 의심 |
| 응답 시간이 커넥션 한계 시점에서 급증 | Pool exhaustion 의심 |

## 증폭 확인 후 대응

증폭이 확인되면 원인과 증폭을 분리해서 처리한다.

1. **증폭 차단 먼저** (circuit breaker, retry 일시 비활성화, rate limit)
2. **원인 격리** (증폭이 차단된 상태에서 Phase 4 진행)
3. **원인 수정 후 증폭 방어 보강** (backoff 설정, circuit breaker 임계값)

```python
# Circuit breaker 예시 (빠른 장애 격리)
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30)
def call_external_service():
    ...
```

## 출력 형식

```
[Amplification Detection]
├── Pattern: retry storm | cascading | pool exhaustion | none
├── Evidence:
│   ├── Rate change: <normal_rate> → <burst_rate> at <timestamp>
│   └── Dependency: <service_a> → <service_b> at +<Ns>
├── Root cause candidate: <upstream service or resource>
└── Immediate action: <circuit break | retry off | pool increase>
```

## 연관

- `retry-cache-timeout-audit.md` — retry storm의 구조적 원인 감사
- `timeline-correlation.md` — 증폭 시작 시각과 배포/변경 상관관계 확인
- Phase 4 (Isolate Root Cause) — 증폭 차단 후 원인 격리

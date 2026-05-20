# Retry / Cache / Timeout Audit

retry, cache, timeout 변경이 실제 원인을 숨기는 false-fix 안티패턴을 식별하는 체크리스트다.

## 배경

retry/cache/timeout은 빠른 증상 억제 수단처럼 보이지만, 대부분의 경우 근본 원인을 가리는 밴드에이드다.

- **retry** → 실패율을 낮추는 것처럼 보이지만 실패 원인은 그대로다
- **cache** → 잘못된 응답을 잠시 숨기지만 TTL 이후 다시 드러난다
- **timeout** → 늘리면 에러가 줄지만 지연의 원인은 해소되지 않는다

이 세 가지를 바꾸기 전에 아래 체크리스트를 통과해야 한다.

## 안티패턴 목록

### 1. try-catch swallow (예외 삼키기)

```python
# 안티패턴
try:
    result = call_external_api()
except Exception:
    return default_value  # 원인 불명, 로그도 없음

# 올바른 방향
try:
    result = call_external_api()
except SpecificError as e:
    logger.error("API call failed: %s", e, exc_info=True)
    raise  # 또는 명시적 fallback with 로깅
```

체크: 예외를 삼키는 지점에서 실제 에러율이 측정되고 있는가?

### 2. Retry storm (재시도 폭풍)

```yaml
# 안티패턴 — 모든 요청이 3배로 증폭
retries: 3
retry_on: [500, 503]
backoff: 0  # 지수 백오프 없음

# 올바른 방향
retries: 3
retry_on: [429, 503]  # 재시도 가능한 코드만
backoff_multiplier: 2
max_backoff: 30s
jitter: true
```

체크: 업스트림 서비스가 이미 과부하 상태에서 retry가 부하를 더 키우고 있지 않은가?

### 3. Cache mask (캐시로 가리기)

```python
# 안티패턴 — 버그가 있는 응답이 캐시에 고정됨
@cache(ttl=3600)
def get_user_permissions(user_id):
    return fetch_permissions(user_id)  # 버그 있음

# 체크 포인트
# - 잘못된 데이터가 캐시에 들어갔을 때 무효화 수단이 있는가?
# - 캐시 히트율이 올라가면서 버그 재현율이 낮아진 것처럼 보이지 않는가?
```

체크: 에러율 감소가 캐시 히트율 증가와 시간적으로 일치하는가?

### 4. Timeout shift (타임아웃 연장)

```yaml
# 안티패턴 — 근본 원인 없이 타임아웃만 늘림
timeout: 30s  # 기존 10s → 30s로 변경

# 올바른 방향: 먼저 확인할 것
# - 왜 10s 안에 응답하지 못하는가?
# - DB 쿼리 slow query log 확인
# - 외부 API 응답 시간 추이
# - N+1 쿼리 여부
```

체크: 타임아웃 연장 후 p99 응답 시간이 어떻게 변했는가?

## 호출 경로 감사 체크리스트

수정 전에 실제 호출 경로에서 아래 항목을 모두 확인한다.

```
[ ] 1. 현재 retry 설정 위치를 모두 찾았다
        - HTTP client config
        - Message queue consumer
        - Background job 설정
        - SDK 내부 기본값 (라이브러리 문서 확인)

[ ] 2. 각 retry 지점의 부작용을 평가했다
        - 멱등성(idempotency)이 보장되는가?
        - 부분 성공 후 재시도 시 중복 처리가 발생하지 않는가?

[ ] 3. 현재 cache 레이어를 모두 식별했다
        - In-process cache (dict, lru_cache)
        - Distributed cache (Redis, Memcached)
        - CDN / Reverse proxy cache
        - DB query cache

[ ] 4. 각 cache의 일관성 위험을 평가했다
        - TTL 내 stale data가 얼마나 오래 노출되는가?
        - Cache invalidation 수단이 있는가?

[ ] 5. timeout 설정 전/후 레이턴시 분포를 확인했다
        - p50, p95, p99 변화
        - 타임아웃 에러 vs 실제 slow 응답 구분

[ ] 6. 변경 이후 실제 원인이 해소되었는지 확인했다
        - 에러율이 줄었는가, 아니면 에러가 숨겨졌는가?
        - 메트릭(retry count, cache hit rate, timeout rate)이 정상 범위로 돌아왔는가?
```

## 판정 기준

| 상황 | 판정 |
|------|------|
| retry 줄이면 에러율이 올라간다 | 원인 미해소 — false-fix |
| cache 끄면 에러가 다시 나타난다 | 원인 미해소 — false-fix |
| timeout 줄이면 에러가 돌아온다 | 원인 미해소 — false-fix |
| 위 변경 후에도 에러율 정상 | 원인 해소 — valid fix |

## 연관

- `amplification-detection.md` — retry storm 시그널 탐지
- Phase 4 (Isolate Root Cause) — false-fix 판정 후 실제 원인 가설 수립
- Hard Gate #6 (SKILL.md) — retry/cache/timeout 변경 전 false-fix 가능성 점검

# Fault Injection

가설 검증을 위해 의도적으로 장애를 주입하는 절차다.

## 목적

가설이 맞는지 확인하는 가장 확실한 방법은 직접 그 조건을 만드는 것이다.
재현이 어려운 간헐 버그, 네트워크 장애, 의존 서비스 실패를 시뮬레이션해 가설을 검증한다.

## 전제 조건

다음 조건을 모두 만족해야 fault injection을 시작한다.

```
[ ] 1. Phase 4에서 단일 원인 가설이 수립되어 있다
[ ] 2. Rollback 수단이 준비되어 있다 (코드, 설정, 인프라)
[ ] 3. 주입 대상이 격리 가능한 환경이다 (dev/staging 우선)
[ ] 4. 주입 범위와 기간이 명시되어 있다
[ ] 5. 관측 수단이 준비되어 있다 (로그, 메트릭, 알림)
```

**prod 직접 주입은 금지한다.** 예외: prod에서만 재현되고 안전하게 격리할 수 있는 경우에만, 명시적 승인 후 진행한다.

## 절차

### Step 1. 가설 명시

```
Hypothesis: <root cause> because <evidence>
Prediction: If I inject <fault>, then I expect to see <symptom>
```

예시:
```
Hypothesis: DB connection pool exhaustion causes 503 because pool_size=5 under load
Prediction: If I set pool_size=1 and send 10 concurrent requests,
            I expect to see connection timeout errors matching production pattern
```

### Step 2. 최소 주입 설계

가설을 검증하는 데 필요한 최소한의 주입만 설계한다.

| 유형 | 도구/방법 |
|------|---------|
| 네트워크 지연/단절 | `tc netem`, Toxiproxy, Chaos Monkey |
| 서비스 응답 오류 | Mock 서버, WireMock, 환경변수 override |
| 리소스 고갈 | `ulimit`, 설정 변경 (pool_size, max_connections) |
| 디스크 오류 | `dd if=/dev/full`, 디스크 용량 제한 |
| CPU/Memory 부하 | `stress-ng`, `yes > /dev/null` |
| 의존 서비스 다운 | 프로세스 종료, 포트 차단 |

```bash
# 네트워크 지연 주입 예시 (Linux tc)
sudo tc qdisc add dev eth0 root netem delay 500ms 100ms

# 제거
sudo tc qdisc del dev eth0 root

# Toxiproxy (더 안전한 방법)
toxiproxy-cli toxic add -t latency -a latency=500 proxy_name
toxiproxy-cli toxic remove proxy_name
```

### Step 3. 주입 실행 및 관측

```bash
# 1. 기준 메트릭 기록 (주입 전)
# 2. 주입
# 3. 동일 조건으로 트래픽/요청 실행
# 4. 관측 (로그, 메트릭, 에러 패턴)
# 5. 즉시 rollback
```

관측 체크리스트:
```
[ ] 예측한 증상이 나타났는가?
[ ] 증상의 형태가 실제 장애와 동일한가?
[ ] 예측하지 못한 부작용이 있는가?
```

### Step 4. 검증 및 결론

| 관측 결과 | 결론 |
|---------|------|
| 예측한 증상이 정확히 재현됨 | 가설 확인 → Phase 6으로 진행 |
| 증상은 나타나지만 형태가 다름 | 가설 부분 확인 → 가설 수정 후 재시도 |
| 증상이 전혀 나타나지 않음 | 가설 기각 → Phase 4로 돌아가 새 가설 수립 |
| 예측 외 부작용 발생 | 즉시 rollback → 영향 평가 후 재설계 |

### Step 5. Rollback 확인

```bash
# 주입 해제 확인
# 설정 원복 확인
# 메트릭 정상 복귀 확인 (주입 전과 동일한 기준값)
```

rollback 후 5분 이상 메트릭을 관찰한다. 즉시 정상화되지 않는 경우 지속 모니터링.

## 빠른 참조 — 주입 유형별

### DB 커넥션 풀 고갈 검증

```python
# 설정 임시 변경
DATABASE_POOL_SIZE = 1  # 실제 설정값보다 극단적으로 낮게

# 동시 요청 실행
import concurrent.futures
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    futures = [ex.submit(make_request) for _ in range(20)]
```

### 외부 API 응답 지연 검증

```python
# WireMock 또는 httpretty로 mock
import responses

@responses.activate
def test_timeout_handling():
    responses.add(responses.GET, 'http://api.example.com',
                  body=Exception('Connection timeout'))
    result = call_external_api()
    assert result == expected_fallback
```

### 디스크 고갈 검증

```bash
# 임시 파일로 공간 채우기 (주의: 복구 가능)
fallocate -l 10G /tmp/test_fill.img
# 검증 후
rm /tmp/test_fill.img
```

## 출력 형식

```
[Fault Injection]
├── Hypothesis: <원인 가설>
├── Prediction: <예상 증상>
├── Injection: <주입 유형 및 방법>
├── Environment: dev | staging | prod (승인 필요)
├── Observation: <실제 관측 결과>
├── Match: yes | partial | no
├── Rollback: completed at <timestamp>
└── Conclusion: confirmed | revised | rejected
```

## 주의

- 주입은 항상 가설 확인 후 즉시 rollback한다. "조금 더 두어보자"는 금지다.
- 의존 서비스가 있는 환경에서 주입 시 파급 범위를 미리 파악한다.
- prod 주입은 incident 대응 중 재현이 불가피할 때만, 팀 승인 후 진행한다.
- 주입 기록(시각, 방법, rollback 시각)을 incident 타임라인에 남긴다.

## 연관

- Phase 4 (Isolate Root Cause) — 가설이 수립된 이후에만 fault injection 시작
- `amplification-detection.md` — retry storm 가설 검증 시 주입 방법
- `timeline-correlation.md` — 주입 이벤트를 타임라인에 기록

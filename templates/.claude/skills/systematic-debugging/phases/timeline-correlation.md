# Timeline Correlation

장애 시점과 코드 변경/배포/설정 변경의 상관관계를 추적하는 절차다.

## 목적

"언제부터 깨졌는가"를 정확히 특정하면 원인 후보 범위가 90% 이상 줄어든다.
타임라인 없이 수정에 들어가는 것은 Phase 4(원인 격리) 없이 Phase 6(수정)으로 뛰는 것과 같다.

## 절차

### Step 1. 장애 발생 시각 고정

```bash
# 모니터링/로그에서 최초 에러 타임스탬프 확인
grep -E "ERROR|FATAL|Exception" application.log | head -5

# 알림 기록, on-call 채널, Sentry/Datadog alert 시각 메모
```

출력 형식:
```
Incident start: YYYY-MM-DD HH:MM:SS UTC
First observed: <source> (log | alert | user report)
```

### Step 2. 코드 변경 이력 수집

```bash
# 장애 시점 전 72시간 커밋 목록
git log --since="72 hours ago" --until="<incident_time>" \
  --format="%h %ad %an %s" --date=short

# 특정 서비스 경로만
git log --since="72 hours ago" --format="%h %ad %s" --date=iso \
  -- src/service/ config/
```

### Step 3. 배포 이력 수집

```bash
# GitHub Actions / CI 배포 로그에서 타임스탬프 확인
gh run list --limit 20 --json createdAt,status,name \
  | jq '.[] | select(.status=="completed") | {name,createdAt}'

# 쿠버네티스 배포 이력
kubectl rollout history deployment/<name>
kubectl describe deployment/<name> | grep "Updated:"

# Docker 이미지 태그 변경 시각
docker image inspect <image>:<tag> | jq '.[0].Created'
```

### Step 4. 설정 변경 이력 수집

```bash
# 환경 변수/시크릿 변경 (Vault, AWS SSM, k8s secret)
# 변경 이력이 있다면 해당 시스템의 audit log 확인

# 데이터베이스 스키마 마이그레이션 시각
# (Alembic, Flyway, Liquibase 등 migration 실행 로그)

# 인프라 변경 (Terraform state history, AWS CloudTrail)
```

### Step 5. 타임라인 정렬

수집한 이벤트를 시간 순으로 정렬한다.

```
Timeline:
  T-48h  2026-05-17 10:22  commit abc123 — "Update retry config"
  T-24h  2026-05-18 14:05  deploy v2.3.1 — production
  T-6h   2026-05-19 08:30  config change — DB_POOL_SIZE 10→5
  T-0    2026-05-19 14:47  INCIDENT — 500 error spike
```

### Step 6. 의심 후보 식별

타임라인에서 장애 직전 변경을 의심 후보로 분류한다.

| 우선도 | 기준 |
|--------|------|
| High   | 장애 시작 0~2시간 전 변경 |
| Medium | 장애 시작 2~24시간 전 변경 |
| Low    | 그 이전 변경 (간헐 버그 제외) |

간헐 버그는 시작 시각 특정이 어렵다 — 첫 관측 시각을 기준으로 삼되 Low 우선도 후보도 배제하지 않는다.

## 출력 형식

```
[Timeline Correlation]
├── Incident start: <timestamp>
├── Window: <N> hours searched
├── Events found: <count>
│   ├── Code changes: <N>
│   ├── Deploys: <N>
│   └── Config changes: <N>
├── Suspects (High): <commit/deploy/config>
└── Next: Phase 4 (Isolate Root Cause) with suspect list
```

## 주의

- 타임라인 자체가 가설이다. 상관관계가 인과관계를 보장하지 않는다.
- 변경이 없는 기간에 발생한 장애는 외부 의존성(DB, 서드파티 API, 인프라) 변화를 확인한다.
- 의심 후보가 없으면 관측 범위를 넓히거나 Phase 3(증거 수집)으로 돌아간다.

## 연관

- Phase 3 (Gather Evidence) — 타임라인은 증거 수집의 입력으로 사용
- Phase 4 (Isolate Root Cause) — 의심 후보가 가설 수립의 출발점
- `amplification-detection.md` — 배포 후 retry storm이 감지되면 타임라인과 교차 검증

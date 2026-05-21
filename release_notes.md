# Release v0.150.1

## Highlights
- **omcustom-init installer: tests/tsconfig.json 자동 설치** (#1213): v0.150.0에서 추가된 `templates/tests/tsconfig.json`을 신규 프로젝트 부트스트랩 시 `tests/tsconfig.json`으로 자동 복사

## :rocket: Features
- `src/core/installer.ts`: `installTestsConfig` 함수 추가 (`installStatusline` 패턴 동일) — copyFile로 src→dst 복사, dst 존재 시 skip (force 옵션 시 덮어쓰기), src 미존재 시 silent skip

## :test_tube: Tests
- `tests/unit/core/installer.test.ts`: 4 new cases — src+dst-empty→copy, dst-exists+no-force→skip, dst-exists+force→overwrite, src-missing→warn

## Resource Changes
| Resource | Before | After | Delta |
|----------|--------|-------|-------|
| Agents | 49 | 49 | 0 |
| Skills | 121 | 121 | 0 |
| Rules | 23 | 23 | 0 |
| Guides | 58 | 58 | 0 |
| Tests | 1984 | 1988 | +4 |

## Closed Issues
- #1213 — omcustom-init installer: tests/tsconfig.json 자동 설치 로직 추가 (#1211 follow-up)

---
_Patch release — installer logic for tests/tsconfig.json template_

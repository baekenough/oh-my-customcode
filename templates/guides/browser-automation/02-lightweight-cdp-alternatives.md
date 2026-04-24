# Browser Automation Part 2: Lightweight CDP Alternatives

> oh-my-customcode의 browser automation 패턴 시리즈 Part 2
> Part 1: 01-browser-automation-patterns.md (Playwright 기반 무거운 스택)

## 배경

Part 1의 Playwright 기반 스택은 강력하지만 런타임/의존성 비용이 큽니다. scout #970 (Browser Harness: LLM이 직접 helpers.py를 확장하는 자기치유형 Chrome 자동화 프레임워크)에서 제시된 패턴은 **CDP 직접 제어 + LLM 자기치유** 조합으로 경량 대안을 제공합니다.

## 핵심 패턴

### 1. CDP 직접 제어 (Chrome DevTools Protocol)

Playwright/Puppeteer 없이 raw CDP 세션을 열어 브라우저를 제어하는 방식입니다. Python의 `pychrome`, Node의 `chrome-remote-interface` 같은 경량 클라이언트를 사용합니다.

**이점:**
- **번들 크기**: Playwright(~100MB 이상)를 제거하고 CDP 클라이언트 단일 패키지로 대체
- **Latency**: Playwright의 추상화 레이어를 건너뛰어 브라우저 명령 왕복이 짧아짐
- **디버깅 용이성**: CDP 메시지가 raw JSON이므로 로그에서 프로토콜 수준 트레이스 확인 가능

```python
# CDP 직접 연결 예시 (pychrome)
import pychrome

browser = pychrome.Browser(url="http://127.0.0.1:9222")
tab = browser.new_tab()
tab.start()
tab.Network.enable()
tab.Page.navigate(url="https://example.com")
tab.wait(1)
```

**적합한 상황**: 커스텀 CDP 이벤트 리스닝(네트워크 인터셉트, 콘솔 스트리밍), 이미 Chrome이 `--remote-debugging-port`로 실행 중인 환경, Playwright 설치 불가 환경(컨테이너 크기 제한 등).

### 2. 자기치유 helpers.py 확장

Browser Harness 패턴의 핵심: LLM이 자동화 실패 시 `helpers.py` 파일에 새 헬퍼 함수를 직접 추가하거나 기존 함수를 수정하여 선택자 drift에 대응합니다.

**동작 원리:**
1. 에이전트가 특정 DOM 선택자(`#submit-btn`)로 클릭을 시도
2. 선택자 변경으로 실패 → CDP 에러 반환
3. LLM이 현재 페이지 DOM을 분석 → 새 선택자 추론
4. `helpers.py`에 `click_submit()` 함수를 수정/추가
5. 이후 같은 작업은 수정된 헬퍼를 재사용

이 패턴은 oh-my-customcode의 `harness-synthesizer`가 에이전트 액션을 사후 검증하고 verifier/filter/policy를 런타임 생성하는 개념과 **개념적 친화성**이 있습니다. harness-synthesizer가 에이전트 동작 제약을 합성하듯, Browser Harness는 브라우저 조작 함수를 합성합니다.

```python
# helpers.py — LLM이 실패 시 자동으로 추가하는 패턴
def click_submit(tab):
    # v1: 선택자 drift 전
    # tab.Runtime.evaluate(expression='document.querySelector("#submit-btn").click()')

    # v2: LLM이 DOM 분석 후 자동 수정
    tab.Runtime.evaluate(
        expression='document.querySelector("[data-testid=submit]").click()'
    )
```

### 3. 실패 복구 루프

CDP 에러 → LLM 분석 → helper 수정 → 재시도로 이어지는 자기치유 루프 구조입니다.

```
CDP 에러 수신
    ↓
LLM: 에러 분류 (선택자 drift / 타임아웃 / 네트워크)
    ↓
    ├─ 선택자 drift → DOM 스냅샷 요청 → 새 선택자 추론 → helpers.py 수정
    ├─ 타임아웃    → 대기 전략 조정 → helpers.py wait 함수 수정
    └─ 네트워크   → 재시도 backoff 조정 → helpers.py retry 정책 수정
    ↓
재시도 (최대 3회)
    ↓
성공 → helpers.py 변경 사항 커밋 (영구 학습)
실패 → 에러 보고 + 수동 개입 요청
```

**재시도 한도**: 무한 루프 방지를 위해 최대 3회. 3회 실패 시 에러 컨텍스트를 포함한 상세 보고서 반환.

## oh-my-customcode 적용 가능성

| 요소 | 현재 자산 | Browser Harness 패턴 보강 |
|------|----------|-------------------------|
| 브라우저 자동화 | claude-in-chrome MCP, playwright-compress | 경량 CDP 대안 (옵션) |
| 자기치유 | harness-synthesizer (verifier/filter/policy) | LLM-driven helper mutation |
| 관찰/디버깅 | claude-in-chrome MCP 도구 | CDP raw session 제어 |
| 출력 압축 | playwright-compress (Layer 4) PostToolUse hook | CDP 이벤트 스트림 직접 필터링 |

## 통합 권고

- **현상 유지**: Playwright 기반 스택이 claude-in-chrome MCP + playwright-compress로 이미 성숙. 즉시 교체 불필요
- **조건부 채택**: CDP 직접 제어가 필요한 경우 (커스텀 프로토콜 검사, 극도의 경량화, 컨테이너 크기 제한) 이 가이드를 참고하여 별도 에이전트 구성
- **학습 채택**: 자기치유 루프 아이디어를 harness-synthesizer에 반영 가능 — verifier 모드에서 실패 패턴 감지 시 policy YAML을 런타임 갱신하는 방향으로 확장

## Deferred

- 실제 CDP 클라이언트 스킬 구현 (관심 축적 시 별도 이슈)
- harness-synthesizer의 자기치유 루프 확장 사례 (`guides/harness-engineering/` 와 연계)
- helpers.py mutation 기록을 `.claude/outputs/harnesses/` 에 영구 저장하는 컨벤션 정의

## 참조

- Part 1: `guides/browser-automation/01-browser-automation-patterns.md`
- `guides/harness-engineering/` — 하네스 엔지니어링 통합 가이드
- `.claude/skills/harness-synthesizer/SKILL.md`
- `claude-in-chrome` MCP tool (settings.json `mcpServers` 참고)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — CDP 공식 레퍼런스
- 내재화 배경: issue #970

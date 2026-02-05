"""
GitHub Issue 자동 분석 스크립트
- Claude API를 사용하여 Issue를 분류하고 요약 및 해결 방향을 제안합니다.
- oh-my-customcode 프로젝트에 특화된 분석을 제공합니다.
"""

import os
import sys
import anthropic


PROJECT_CONTEXT = """
## 프로젝트 컨텍스트: oh-my-customcode

oh-my-customcode는 Claude Code를 커스터마이징하는 npm 패키지입니다.

### 주요 구성요소
- **Agents (34개)**: 전문화된 AI 에이전트 (lang-*, be-*, fe-*, mgr-*, qa-* 등)
- **Skills (42개)**: 슬래시 커맨드 및 기능 (/create-agent, /dev-review 등)
- **Rules (18개)**: MUST/SHOULD/MAY 규칙
- **Guides (13개)**: 참조 문서

### 주요 명령어
- `omcustom init`: 프로젝트 초기화
- `omcustom list`: 컴포넌트 목록
- `omcustom doctor`: 설치 상태 검사

### 기술 스택
- TypeScript/Bun
- GitHub Actions
- npm 배포

### 관련 프로젝트
- baekgom-agents: 템플릿 소스 저장소
"""


def build_prompt(title: str, body: str, author: str, labels: str) -> str:
    return f"""당신은 oh-my-customcode 프로젝트의 GitHub Issue를 분석하는 전문가입니다.
프로젝트 컨텍스트를 참고하여 Issue를 분석하고, **정해진 형식**으로만 응답하세요.

{PROJECT_CONTEXT}

---

## Issue 정보

- **제목**: {title}
- **작성자**: {author}
- **기존 라벨**: {labels or '없음'}
- **본문**:
{body or '(본문 없음)'}

---

## 분석 요청 항목

### 1. 분류
아래 셋 중 하나로 분류하세요:
- 🐛 **분류: Bug** — 기존 기능이 의도대로 동작하지 않는 경우
- ✨ **분류: Feature** — 새로운 기능 요청이나 개선 제안
- ❓ **분류: Question** — 사용법, 설계 의도 등에 대한 질문

### 2. 요약
Issue의 핵심 내용을 2~3문장으로 요약하세요.

### 3. 관련 컴포넌트
이 Issue와 관련된 컴포넌트를 식별하세요 (해당하는 것만):
- CLI 명령어 (init, list, doctor, update)
- Agents
- Skills
- Rules
- Guides
- Templates
- CI/CD (GitHub Actions)
- 문서화 (README, CONTRIBUTING)

### 4. 해결 방향 제안
구체적이고 실행 가능한 해결 방향을 제안하세요.
- Bug라면: 원인 추정, 재현 조건 확인 포인트, 수정 접근 방향
- Feature라면: 구현 접근 방식, 관련 파일, 고려할 점
- Question이라면: 답변 방향, 참고할 문서나 코드 영역

---

## 응답 형식 (Markdown)

> 🤖 **Claude Issue Analyzer**

### 분류
(이모지 + 분류명)

### 요약
(2~3문장)

### 관련 컴포넌트
- (컴포넌트 목록)

### 해결 방향 제안
(구체적 제안)

---
_이 분석은 Claude API에 의해 자동 생성되었습니다. 정확하지 않을 수 있으니 참고용으로 활용해 주세요._
"""


def analyze_issue() -> str:
    title = os.environ.get("ISSUE_TITLE", "")
    body = os.environ.get("ISSUE_BODY", "")
    author = os.environ.get("ISSUE_AUTHOR", "")
    labels = os.environ.get("ISSUE_LABELS", "")

    if not title:
        return "⚠️ Issue 제목이 비어 있어 분석을 수행할 수 없습니다."

    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수 자동 참조

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": build_prompt(title, body, author, labels),
            }
        ],
    )

    # text 블록만 추출
    result_parts = []
    for block in message.content:
        if block.type == "text":
            result_parts.append(block.text)

    return "\n".join(result_parts)


if __name__ == "__main__":
    try:
        result = analyze_issue()
        print(result)
    except anthropic.APIError as e:
        print(f"⚠️ Claude API 호출 중 오류가 발생했습니다: {e}", file=sys.stderr)
        print("⚠️ Issue 분석에 실패했습니다. API 키와 설정을 확인해 주세요.")
        sys.exit(1)
    except Exception as e:
        print(f"⚠️ 예기치 않은 오류: {e}", file=sys.stderr)
        print("⚠️ Issue 분석 중 오류가 발생했습니다.")
        sys.exit(1)

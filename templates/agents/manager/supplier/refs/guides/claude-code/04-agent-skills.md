# Agent Skills

Agent Skills는 Claude의 기능을 확장하는 모듈식 기능입니다. 각 Skill은 지침, 메타데이터 및 선택적 리소스(스크립트, 템플릿)를 패키징하며, Claude는 관련이 있을 때 자동으로 이를 사용합니다.

## Skills를 사용하는 이유

Skills는 Claude에 도메인 특화 전문성을 제공하는 재사용 가능한 파일시스템 기반 리소스입니다.

**주요 이점**:
- **Claude 전문화**: 도메인 특화 작업을 위한 기능 맞춤화
- **반복 감소**: 한 번 생성하고 자동으로 사용
- **기능 구성**: Skills를 결합하여 복잡한 워크플로우 구축

## Skills 작동 방식

Skills는 Claude의 VM 환경을 활용하여 프롬프트만으로는 불가능한 기능을 제공합니다. 파일시스템 기반 아키텍처는 **점진적 공개**를 가능하게 합니다.

### 세 가지 로딩 수준

| 수준 | 로드 시기 | 토큰 비용 | 콘텐츠 |
|------|-----------|-----------|--------|
| **메타데이터** | 항상 (시작 시) | Skill당 약 100 토큰 | YAML 프론트매터의 `name` 및 `description` |
| **지침** | Skill이 트리거될 때 | 5k 토큰 미만 | SKILL.md 본문 |
| **리소스** | 필요에 따라 | 사실상 무제한 | bash를 통해 실행되는 번들 파일 |

## Skill 구조

모든 Skill에는 YAML 프론트매터가 있는 `SKILL.md` 파일이 필요합니다:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
[Clear, step-by-step guidance for Claude to follow]

## Examples
[Concrete examples of using this Skill]
```

### 필드 요구 사항

**`name`**:
- 최대 64자
- 소문자, 숫자 및 하이픈만 포함해야 함
- "anthropic", "claude" 예약어를 포함할 수 없음

**`description`**:
- 비어 있지 않아야 함
- 최대 1024자

## 사용 가능한 Skills

### 사전 구축된 Agent Skills

- **PowerPoint (pptx)**: 프레젠테이션 만들기, 슬라이드 편집, 프레젠테이션 콘텐츠 분석
- **Excel (xlsx)**: 스프레드시트 만들기, 데이터 분석, 차트가 있는 보고서 생성
- **Word (docx)**: 문서 만들기, 콘텐츠 편집, 텍스트 서식 지정
- **PDF (pdf)**: 형식이 지정된 PDF 문서 및 보고서 생성

## Skills가 작동하는 위치

| 플랫폼 | 사전 구축된 Skills | 사용자 정의 Skills |
|--------|-------------------|-------------------|
| Claude API | ✓ | ✓ |
| Claude Code | - | ✓ |
| Claude Agent SDK | - | ✓ |
| Claude.ai | ✓ | ✓ |

## 보안 고려 사항

Skills는 신뢰할 수 있는 출처(자신이 만들었거나 Anthropic에서 얻은 것)에서만 사용할 것을 강력히 권장합니다.

**주요 보안 고려 사항**:
- **철저히 감사**: Skill에 번들된 모든 파일을 검토
- **외부 출처는 위험함**: 외부 URL에서 데이터를 가져오는 Skills는 특히 위험
- **도구 오용**: 악의적인 Skills는 도구를 해로운 방식으로 호출할 수 있음
- **데이터 노출**: 민감한 데이터에 액세스할 수 있는 Skills는 정보를 유출하도록 설계될 수 있음

## 제한 사항 및 제약

### 런타임 환경 제약

- **네트워크 액세스 없음**: Skills는 외부 API 호출을 하거나 인터넷에 액세스할 수 없음
- **런타임 패키지 설치 없음**: 미리 설치된 패키지만 사용 가능
- **사전 구성된 종속성만**: 사용 가능한 패키지 목록은 코드 실행 도구 문서 참조

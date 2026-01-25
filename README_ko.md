# oh-my-customcode

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)

**Claude Code를 위한 올인원 에이전트 시스템**

사전 구성된 에이전트, 스킬, 규칙으로 Claude Code 경험을 한 단계 업그레이드하세요.

## 주요 기능

- **28개 에이전트** - 개발, 테스트, 문서화 등 전문 에이전트 제공
- **체계화된 스킬** - 개발, 백엔드, 인프라, 오케스트레이션 스킬
- **우선순위 규칙** - MUST/SHOULD/MAY 등급별 일관된 동작 보장
- **다국어 지원** - 영어, 한국어 기본 지원
- **간편한 설정** - 한 줄 명령어로 초기화
- **상태 점검** - doctor 명령으로 설치 상태 확인

## 빠른 시작

### 설치

```bash
npm install -g oh-my-customcode
```

### 프로젝트 초기화

```bash
cd your-project
omcc init --lang ko
```

현재 디렉토리에 `.claude/` 폴더와 함께 모든 에이전트, 스킬, 규칙이 설정됩니다.

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `omcc init` | 에이전트 시스템 초기화 |
| `omcc init --lang ko` | 한국어로 초기화 |
| `omcc update` | 최신 에이전트/스킬로 업데이트 |
| `omcc list` | 설치된 컴포넌트 목록 |
| `omcc list agents` | 에이전트 목록 |
| `omcc list skills` | 스킬 목록 |
| `omcc doctor` | 설치 상태 점검 |
| `omcc doctor --fix` | 문제 자동 수정 |

## 포함 내용

### 에이전트 (28개)

| 분류 | 에이전트 |
|------|----------|
| Master | planner |
| Orchestrator | secretary, dev-lead |
| Manager | creator, updater, supplier, naggy, git-expert, sync-checker |
| System | memory-keeper |
| SW Engineer | golang, python, rust, kotlin, typescript, java21, vercel-frontend |
| SW Architect | documenter, speckit-agent |
| Backend Engineer | fastapi, springboot, go-backend, express, nestjs |
| Infra Engineer | docker, aws |
| QA Engineer | qa-lead |
| Tutor | go-tutor |

### 스킬

- **Development** - 언어별 모범 사례 (Go, Python, TypeScript 등)
- **Backend** - 프레임워크 스킬 (FastAPI, Spring Boot, Express, NestJS)
- **Infrastructure** - Docker, AWS 배포 스킬
- **System** - 메모리 관리, 결과 집계
- **Orchestration** - 파이프라인 실행, 의도 감지

### 규칙

- **MUST** - 안전, 권한, 에이전트 설계, 식별 (필수)
- **SHOULD** - 상호작용, 에러 처리, 메모리 통합 (권장)
- **MAY** - 최적화 가이드라인 (선택)

## 설정

초기화 후 `.omccrc.json`으로 동작을 커스터마이즈할 수 있습니다:

```json
{
  "language": "ko",
  "agents": {
    "enabled": ["*"],
    "disabled": []
  },
  "rules": {
    "strict": true
  }
}
```

## 프로젝트 구조

`omcc init` 실행 후 프로젝트 구조:

```
your-project/
├── CLAUDE.md              # 메인 설정 파일
├── .claude/
│   ├── rules/             # MUST/SHOULD/MAY 규칙
│   ├── hooks/             # 라이프사이클 훅
│   └── contexts/          # 컨텍스트 설정
├── agents/                # 에이전트 정의
├── skills/                # 스킬 정의
├── guides/                # 참고 문서
└── commands/              # 명령어 정의
```

## 요구사항

- Node.js >= 18.0.0
- Claude Code CLI

## 기여하기

기여를 환영합니다! 자세한 내용은 [기여 가이드](CONTRIBUTING.md)를 참고해주세요.

## 라이선스

[MIT](LICENSE) - 자세한 내용은 LICENSE 파일을 참고하세요.

---

Made with care by [baekenough](https://github.com/baekenough)

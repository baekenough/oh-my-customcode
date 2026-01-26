# Agent SDK 개요

Claude Code를 라이브러리로 사용하여 프로덕션 AI 에이전트 구축

## 소개

파일을 자동으로 읽고, 명령을 실행하고, 웹을 검색하고, 코드를 편집하는 등의 작업을 수행하는 AI 에이전트를 구축하세요. Agent SDK는 Claude Code를 강화하는 동일한 도구, 에이전트 루프 및 컨텍스트 관리를 Python과 TypeScript로 프로그래밍할 수 있게 제공합니다.

## 빠른 시작 예제

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"])
    ):
        print(message)

asyncio.run(main())
```

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

## 기능

### 기본 제공 도구

| 도구 | 기능 |
|------|------|
| **Read** | 작업 디렉토리의 모든 파일 읽기 |
| **Write** | 새 파일 생성 |
| **Edit** | 기존 파일에 정확한 편집 수행 |
| **Bash** | 터미널 명령, 스크립트, git 작업 실행 |
| **Glob** | 패턴으로 파일 찾기 |
| **Grep** | 정규식으로 파일 내용 검색 |
| **WebSearch** | 현재 정보를 위해 웹 검색 |
| **WebFetch** | 웹 페이지 내용 가져오기 및 파싱 |

### 훅 (Hooks)

에이전트 라이프사이클의 주요 지점에서 사용자 정의 코드를 실행합니다.

**사용 가능한 훅**: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit` 등

### 서브에이전트

특화된 에이전트를 생성하여 집중된 부작업을 처리합니다. `Task` 도구를 활성화하여 Claude가 위임의 이점을 얻을 수 있을 정도로 복잡한 작업이라고 판단할 때 서브에이전트를 생성하도록 합니다.

### MCP (Model Context Protocol)

외부 시스템에 연결: 데이터베이스, 브라우저, API 등

### 권한

에이전트가 사용할 수 있는 도구를 정확히 제어합니다. 안전한 작업을 허용하고, 위험한 작업을 차단하거나, 민감한 작업에 대해 승인을 요구합니다.

### 세션

여러 교환 간에 컨텍스트를 유지합니다. Claude는 읽은 파일, 수행한 분석 및 대화 기록을 기억합니다.

## Claude Code 기능 지원

| 기능 | 설명 | 위치 |
|------|------|------|
| Skills | Markdown에 정의된 특화된 기능 | `.claude/skills/SKILL.md` |
| Slash commands | 일반적인 작업을 위한 사용자 정의 명령 | `.claude/commands/*.md` |
| Memory | 프로젝트 컨텍스트 및 지침 | `CLAUDE.md` 또는 `.claude/CLAUDE.md` |
| Plugins | 사용자 정의 명령, 에이전트 및 MCP 서버로 확장 | `plugins` 옵션을 통한 프로그래밍 방식 |

## 설치

### Claude Code 설치

```bash
# macOS/Linux/WSL
curl -fsSL https://claude.ai/install.sh | bash

# Homebrew
brew install --cask claude-code

# npm
npm install -g @anthropic-ai/claude-code
```

### SDK 설치

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

### API 키 설정

```bash
export ANTHROPIC_API_KEY=your-api-key
```

## Agent SDK vs Client SDK

| 구분 | Client SDK | Agent SDK |
|------|-----------|-----------|
| 도구 실행 | 직접 구현 | Claude가 처리 |
| 복잡도 | 도구 루프 구현 필요 | 자동화됨 |
| 유연성 | 완전한 제어 | 추상화된 편의성 |

## Agent SDK vs Claude Code CLI

| 사용 사례 | 최적의 선택 |
|----------|-----------|
| 대화형 개발 | CLI |
| CI/CD 파이프라인 | SDK |
| 사용자 정의 애플리케이션 | SDK |
| 일회성 작업 | CLI |
| 프로덕션 자동화 | SDK |

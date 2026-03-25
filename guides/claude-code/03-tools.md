# 도구 사용 (Tool Use)

Claude는 도구 및 함수와 상호작용할 수 있으므로 Claude의 기능을 확장하여 더 다양한 작업을 수행할 수 있습니다.

## 도구 유형

Claude는 두 가지 유형의 도구를 지원합니다:

### 1. 클라이언트 도구
사용자의 시스템에서 실행되는 도구:
- 사용자가 만들고 구현하는 사용자 정의 도구
- 컴퓨터 사용 및 텍스트 편집기와 같이 클라이언트 구현이 필요한 Anthropic 정의 도구

### 2. 서버 도구
Anthropic의 서버에서 실행되는 도구:
- 웹 검색 및 웹 가져오기 도구
- API 요청에서 지정해야 하지만 사용자 측에서 구현할 필요 없음

## 클라이언트 도구 통합 단계

1. **Claude에 도구 및 사용자 프롬프트 제공**
   - API 요청에서 이름, 설명 및 입력 스키마를 사용하여 클라이언트 도구를 정의
   - 이러한 도구가 필요할 수 있는 사용자 프롬프트를 포함

2. **Claude가 도구 사용을 결정**
   - Claude는 사용자의 쿼리에 도움이 될 수 있는 도구가 있는지 평가
   - 올바르게 형식화된 도구 사용 요청을 구성

3. **도구를 실행하고 결과 반환**
   - Claude의 요청에서 도구 이름 및 입력을 추출
   - 사용자의 시스템에서 도구 코드를 실행
   - `tool_result` 콘텐츠 블록을 포함하는 새로운 `user` 메시지에서 결과를 반환

4. **Claude가 도구 결과를 사용하여 응답을 작성**
   - Claude는 도구 결과를 분석하여 원래 사용자 프롬프트에 대한 최종 응답을 작성

## 기본 예제

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=[
        {
            "name": "get_weather",
            "description": "Get the current weather in a given location",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"],
            },
        }
    ],
    messages=[{"role": "user", "content": "What's the weather like in San Francisco?"}],
)
```

## MCP 도구 사용

Model Context Protocol (MCP)을 사용하는 애플리케이션을 구축하는 경우 MCP 서버의 도구를 Claude의 Messages API와 함께 직접 사용할 수 있습니다.

### MCP 도구를 Claude 형식으로 변환

```python
from mcp import ClientSession

async def get_claude_tools(mcp_session: ClientSession):
    """Convert MCP tools to Claude's tool format."""
    mcp_tools = await mcp_session.list_tools()

    claude_tools = []
    for tool in mcp_tools.tools:
        claude_tools.append({
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.inputSchema  # Rename inputSchema to input_schema
        })

    return claude_tools
```

## 도구 사용 패턴

### 병렬 도구 사용
Claude는 단일 응답 내에서 여러 도구를 병렬로 호출할 수 있습니다. 모든 `tool_use` 블록은 단일 어시스턴트 메시지에 포함되며, 모든 해당 `tool_result` 블록은 후속 사용자 메시지에서 제공되어야 합니다.

### 순차적 도구
일부 작업은 여러 도구를 순차적으로 호출해야 할 수 있으며, 한 도구의 출력을 다른 도구의 입력으로 사용합니다.

### 사고의 연쇄 도구 사용
Claude Opus는 도구 사용 쿼리에 답하기 전에 생각하도록 프롬프트되어 도구가 필요한지 여부, 어떤 도구를 사용할지, 적절한 매개변수를 최선으로 결정합니다.

## 가격 책정

도구 사용 요청은 다음을 기반으로 가격이 책정됩니다:
1. 모델에 보내는 총 입력 토큰 수 (`tools` 매개변수 포함)
2. 생성된 출력 토큰 수
3. 서버 측 도구의 경우, 추가 사용량 기반 가격 책정

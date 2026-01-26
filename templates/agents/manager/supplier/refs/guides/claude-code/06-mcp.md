# MCP 커넥터

Claude의 Model Context Protocol (MCP) 커넥터 기능을 사용하여 Messages API에서 별도의 MCP 클라이언트 없이 원격 MCP 서버에 직접 연결할 수 있습니다.

## 주요 기능

- **직접 API 통합**: MCP 클라이언트를 구현하지 않고도 MCP 서버에 연결
- **도구 호출 지원**: Messages API를 통해 MCP 도구에 액세스
- **유연한 도구 구성**: 모든 도구 활성화, 특정 도구 허용 목록 작성 또는 원하지 않는 도구 거부 목록 작성
- **도구별 구성**: 사용자 정의 설정으로 개별 도구 구성
- **OAuth 인증**: 인증된 서버를 위한 OAuth Bearer 토큰 지원
- **여러 서버**: 단일 요청에서 여러 MCP 서버에 연결

## 제한 사항

- MCP 사양의 기능 집합 중 도구 호출만 현재 지원
- 서버는 HTTP를 통해 공개적으로 노출되어야 함 (Streamable HTTP 및 SSE 전송 모두 지원)
- 로컬 STDIO 서버는 직접 연결할 수 없음
- Amazon Bedrock 및 Google Vertex에서 현재 지원되지 않음

## 기본 예제

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": "What tools do you have available?"
    }],
    mcp_servers=[{
        "type": "url",
        "url": "https://mcp.example.com/sse",
        "name": "example-mcp",
        "authorization_token": "YOUR_TOKEN"
    }],
    tools=[{
        "type": "mcp_toolset",
        "mcp_server_name": "example-mcp"
    }],
    betas=["mcp-client-2025-11-20"]
)
```

## MCP 서버 구성

| 속성 | 유형 | 필수 | 설명 |
|------|------|------|------|
| `type` | string | 예 | 현재 "url"만 지원 |
| `url` | string | 예 | MCP 서버의 URL (https://로 시작) |
| `name` | string | 예 | 이 MCP 서버의 고유 식별자 |
| `authorization_token` | string | 아니오 | OAuth 인증 토큰 |

## MCP 도구 집합 구성

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "example-mcp",
  "default_config": {
    "enabled": true,
    "defer_loading": false
  },
  "configs": {
    "specific_tool_name": {
      "enabled": true,
      "defer_loading": true
    }
  }
}
```

## 일반적인 구성 패턴

### 모든 도구 활성화

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-calendar-mcp"
}
```

### 허용 목록 - 특정 도구만 활성화

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-calendar-mcp",
  "default_config": {
    "enabled": false
  },
  "configs": {
    "search_events": { "enabled": true },
    "create_event": { "enabled": true }
  }
}
```

### 거부 목록 - 특정 도구 비활성화

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-calendar-mcp",
  "configs": {
    "delete_all_events": { "enabled": false },
    "share_calendar_publicly": { "enabled": false }
  }
}
```

## 응답 콘텐츠 유형

### MCP 도구 사용 블록

```json
{
  "type": "mcp_tool_use",
  "id": "mcptoolu_014Q35RayjACSWkSj4X2yov1",
  "name": "echo",
  "server_name": "example-mcp",
  "input": { "param1": "value1" }
}
```

### MCP 도구 결과 블록

```json
{
  "type": "mcp_tool_result",
  "tool_use_id": "mcptoolu_014Q35RayjACSWkSj4X2yov1",
  "is_error": false,
  "content": [{ "type": "text", "text": "Hello" }]
}
```

## 여러 MCP 서버 연결

```json
{
  "mcp_servers": [
    {
      "type": "url",
      "url": "https://mcp.example1.com/sse",
      "name": "mcp-server-1",
      "authorization_token": "TOKEN1"
    },
    {
      "type": "url",
      "url": "https://mcp.example2.com/sse",
      "name": "mcp-server-2",
      "authorization_token": "TOKEN2"
    }
  ],
  "tools": [
    { "type": "mcp_toolset", "mcp_server_name": "mcp-server-1" },
    { "type": "mcp_toolset", "mcp_server_name": "mcp-server-2" }
  ]
}
```

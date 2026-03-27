---
name: peer-messaging
description: Cross-session Claude Code instance messaging via claude-peers-mcp broker
scope: core
user-invocable: false
---

# Peer Messaging Skill

## Purpose

Enables cross-session coordination between multiple Claude Code instances through the claude-peers-mcp broker. Complements Agent Teams (R018, intra-session) with inter-session messaging.

## Scope Clarification

| Scope | Mechanism | Tools | Use Case |
|-------|-----------|-------|----------|
| Intra-session agents | Agent Teams (R018) | TeamCreate, SendMessage | Single session multi-agent collaboration |
| Cross-session instances | claude-peers-mcp | list_peers, send_message | Multi-terminal/project real-time coordination |
| Cross-session memory | claude-mem | save_memory, search | Async memory persistence |

> **Important**: R018's `SendMessage` and claude-peers-mcp's `send_message` are different tools with different scopes. Do not confuse them.

## MCP Tool Mapping

| Tool | Purpose | oh-my-customcode Scenario |
|------|---------|---------------------------|
| `list_peers` | Discover active Claude instances | `omcustom:status` system overview |
| `send_message` | Send message to peer | Cross-project workflow coordination |
| `set_summary` | Broadcast current task summary | DAG cross-project step sync |
| `check_messages` | Read incoming messages | Receive coordination signals |

## Use Cases

### Multi-Project Workflow
Terminal A runs `auto-dev` on project-1; Terminal B works on dependent project-2. Peers coordinate via messages when blocking dependencies are resolved.

### Cross-Project QA
Share test infrastructure state between projects running concurrent test suites.

### DAG Bridge
`dag-orchestration` cross-project steps can use peer messaging for synchronization (currently impossible without this tool).

## Setup

```bash
# Install broker (optional MCP server)
npm install -g claude-peers-mcp

# Add to MCP config
claude mcp add claude-peers-mcp -- npx claude-peers-mcp
```

## Integration

- Works with R018 Agent Teams (different scope, complementary)
- Works with claude-mem (async vs sync messaging)
- Works with `omcustom:status` (peer discovery)
- Broker runs on localhost:7899 (SQLite-backed)

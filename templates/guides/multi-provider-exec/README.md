# Multi-Provider Exec

## Overview

Unified reference for executing prompts through external LLM providers via exec skills. Complements the [Multi-Model Routing](../multi-model-routing/README.md) guide (Claude model selection) with cross-provider execution capabilities.

Inspired by OpenHarness's provider profile switching pattern, adapted for oh-my-customcode's skill-based architecture.

## Provider Matrix

v1.1.107에서는 사용자 결정에 따라 프로젝트 RTK 통합과 공개 `rtk-exec` 스킬을 퇴역합니다. 이 가이드의 RTK 실행 예시·추천을 사용하지 마십시오. 머신에 별도로 설치한 RTK 바이너리는 이 변경으로 제거하지 않습니다.

## Availability Detection

The `session-env-check.sh` hook (SessionStart) auto-detects available providers:

RTK availability 점검과 상태 출력은 퇴역합니다. Codex·Gemini 등 나머지 CLI availability 점검은 기존 session hook 계약을 유지합니다.

Providers are opt-in — missing CLIs are silently skipped.

## Usage Patterns

### Direct Invocation

공개 `/rtk-exec` 명령은 제거됩니다. 이 문서에서 다른 provider의 실행 스킬이나 자동 대체 명령을 새로 지정하지 않습니다.

### Provider Selection Guide

기존 RTK 추천 항목은 제거됩니다. provider를 선택할 때는 사용 가능한 스킬의 실제 계약과 CLI 설정을 확인하십시오.

### Integration with Existing Skills

| Skill | Uses Provider | How |
|-------|--------------|-----|
| `reasoning-sandwich` | Any exec skill | Pre/post reasoning with different models |
| `model-escalation` | Claude models only | Internal escalation (haiku→sonnet→opus, Agent-tool Tier 3 enum), not cross-provider |

## Relationship to Multi-Model Routing

| Aspect | Multi-Model Routing | Multi-Provider Exec |
|--------|--------------------|--------------------|
| Scope | Claude model selection | Cross-provider execution |
| Models | haiku / sonnet / opus | 명시적으로 선택한 외부 provider의 모델 |
| Mechanism | `model` frontmatter field | Exec skill invocation |
| Use case | Cost/quality optimization within Claude | 명시적으로 선택한 외부 provider 실행 |
| Guide | `guides/multi-model-routing/` | `guides/multi-provider-exec/` |

## Configuration

No global configuration required. Each exec skill reads its own CLI configuration:

RTK 전용 설정 연결은 제거됩니다. 이 변경은 다른 CLI의 사용자 설정을 삭제하지 않습니다.

## Limitations

- Provider availability depends on user's CLI installations
- Cross-provider results are advisory — Claude remains the primary execution engine
- No automatic fallback between providers (by design — explicit selection preferred)
- Rate limits and costs are provider-specific and not tracked by oh-my-customcode

---
title: Diagram Design
type: skill
updated: 2026-04-24
sources:
  - .claude/skills/diagram-design/SKILL.md
related:
  - [[fe-design-expert]]
  - [[arch-documenter]]
  - [[guides/impeccable-design]]
  - [[skills/design-shotgun]]
---

# Diagram Design

브랜드 일치 에디토리얼 다이어그램 생성 스킬 — SVG 다이어그램 13종을 3가지 변형으로 제공.

## Overview

릴리즈 노트, ARCHITECTURE.md, 슬라이드, 마케팅 자료 등을 위한 브랜드 일치 SVG 다이어그램을 생성한다. 웹사이트 디자인 시스템(팔레트·타이포그래피)을 자동 추출해 브랜드 정합성을 유지하며, 빌드 단계·외부 의존성·Mermaid 없이 자립 동작한다.

각 다이어그램 유형은 minimal light / minimal dark / full editorial 3가지 변형으로 제공된다.

## Key Details

- **Scope**: package — 코어 스킬이 아닌 선택 등록 스킬 (기본 `init`에서 제외)
- **User-invocable**: yes (`/diagram-design <description>`)
- **Source**: external — `github.com/cathrynlavery/diagram-design` (main)
- **Tracked by**: mgr-updater (업스트림 버전 추적)
- **Positioning**: `mcp__eraser__` MCP 도구의 오프라인 대안
- **Background**: issue #963 내재화

## Usage

```
/diagram-design <description>
```

## Relationships

- **Related agents**: [[fe-design-expert]] (브랜드 디자인 토큰 정합성 검토), [[arch-documenter]] (Mermaid/PlantUML 기반 시스템 아키텍처 다이어그램)
- **Related skills**: [[skills/design-shotgun]] (병렬 디자인 목업 생성)
- **Guides**: [[guides/impeccable-design]] (관련 디자인 가이드)

## Sources

- `.claude/skills/diagram-design/SKILL.md` — skill definition

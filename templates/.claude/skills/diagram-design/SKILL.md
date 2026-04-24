---
name: diagram-design
description: Brand-consistent editorial diagrams — SVG generation for release notes, architecture docs, and marketing materials
scope: package
version: 0.1.0
source:
  type: external
  origin: github
  url: https://github.com/cathrynlavery/diagram-design
  version: main
user-invocable: true
allowed-tools: [Read, Write, Edit, Bash]
---

# diagram-design

## 목적

브랜드 일치 에디토리얼 다이어그램 생성. 릴리즈 노트, ARCHITECTURE.md, 슬라이드 인포그래픽 등 마케팅/문서용 SVG 다이어그램에 특화.

웹사이트의 디자인 시스템(팔레트·타이포그래피)을 자동 추출해 브랜드 일치 SVG 다이어그램 13종을 생성한다. 각 다이어그램은 3가지 변형(minimal light / minimal dark / full editorial)으로 제공된다. 빌드 단계·외부 의존성·Mermaid 없이 자립 동작한다.

## 담당 에이전트

- `arch-documenter` — 시스템 아키텍처 다이어그램 (Mermaid/PlantUML)과 경계 구분
- `fe-design-expert` — 브랜드 디자인 토큰 정합성 검토

## 사용

```
/diagram-design <description>
```

## 제약

- `scope: package` — 코어 스킬이 아닌 선택 등록 스킬 (기본 `init`에서 제외)
- 외부 업스트림 버전에 의존 — `mgr-updater`가 추적
- `mcp__eraser__`의 오프라인 대안으로 포지셔닝

## 참조

- `.claude/agents/fe-design-expert.md`
- `.claude/agents/arch-documenter.md`
- `guides/impeccable-design/` (관련 디자인 가이드)
- 내재화 배경: issue #963

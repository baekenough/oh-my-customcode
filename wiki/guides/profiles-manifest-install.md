---
title: Profiles — Manifest Install Guide
type: guide
updated: 2026-05-18
sources:
  - guides/profiles/manifest-install.md
  - .claude/skills/profile/SKILL.md
related:
  - [[profile]]
  - [[r006]]
  - [[adaptive-harness]]
---

# Profiles — Manifest Install Guide

`omcustom install --profile <name>` 플래그를 사용한 설치 시 자산 범위 지정 가이드. Plugin profile 전환(`/profile load`)과 별개의 독립 시스템. (#1177, ECC manifest-install 패턴 흡수)

## Overview

`templates/manifest.json#profiles`의 **Manifest profiles**는 설치 시 포함할 에이전트·스킬·가이드 범위를 정의한다. 기존 `.claude/profiles/*.json`의 **Plugin profiles**(플러그인 on/off)와 개념이 분리되어 있으며, 동일 이름(`web-app` 등)으로 두 시스템을 함께 사용할 수 있다.

## 두 프로필 시스템 비교

| 구분 | 경로 | 역할 | 적용 시점 |
|------|------|------|-----------|
| Plugin profiles | `.claude/profiles/*.json` | `~/.claude/settings.json` plugin on/off | 세션 재시작 후 |
| **Manifest profiles** | `templates/manifest.json#profiles` | 설치 시 에이전트·스킬·가이드 범위 | `omcustom install --profile` |

## 프로필 목록

| 프로필 | 대상 | 특이사항 |
|--------|------|----------|
| `minimal` | 학습·실험·경량 환경 | mgr-*, lang-*-expert + core/harness 스킬 |
| `full` | 프로덕션 전체 자산 | 에이전트 49개, 스킬 전체 (기본값) |
| `web-app` | TypeScript/Python 풀스택 | FE/BE/DB 관련 자산, DE 배제 |
| `data-eng` | 데이터 파이프라인 팀 | de-*, Airflow/dbt/Spark, FE 배제 |
| `harness-dev` | 하네스 개발·유지보수 | mgr-*, arch-*, sys-*, harness 스킬 |

## include 패턴

| 표현식 | 의미 |
|--------|------|
| `"*"` | 카테고리 전체 |
| `"mgr-*"` | 접두사 glob |
| `{"scope": "core"}` | SKILL.md scope 필드 기준 |
| `"react-best-practices"` | 정확한 이름 매칭 |

## 사용 예시

```bash
omcustom install --profile minimal    # 최소 자산 (학습/실험)
omcustom install --profile web-app    # 풀스택 웹 앱
omcustom install --profile data-eng   # 데이터 엔지니어링
omcustom install                      # 전체 (= --profile full)
```

## [[profile]] 스킬과의 연동

```bash
# 1. Manifest profile: 설치 자산 범위
omcustom install --profile web-app
# 2. Plugin profile: 플러그인 전환
/profile load web-app
```

## Sources

- `guides/profiles/manifest-install.md` — 전체 가이드 및 프로필별 자산 표
- `.claude/skills/profile/SKILL.md` — Plugin profile 전환 스킬
- `templates/manifest.json` — 프로필 정의 소스

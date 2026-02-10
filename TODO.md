# oh-my-customcode TODO

> Last updated: 2026-02-10
> Session context: Issues analyzed and prioritized for implementation

## Open Issues (4)

### Priority Order

| # | Priority | Size | Issue | Category |
|---|----------|------|-------|----------|
| 1 | P1-High | L | #52 - `omcc update` command | CLI |
| 2 | P2-Medium | M | #54 - Pre-flight CLI version check | CLI |
| 3 | P3-Low | M | #55 - GitHub Projects setup (spec) | Project Mgmt |
| 4 | P3-Low | S | #56 - Automate Projects setup (impl) | Project Mgmt |

### Recommended Execution Order

1. **#54 (Pre-flight check)** → 독립적, 중간 크기, #52의 선행 조건
2. **#52 (omcc update)** → 핵심 기능, #54 완료 후 착수
3. **#55 + #56 (GitHub Projects)** → 함께 처리, 개발 작업 아닌 인프라 셋업

---

## Issue Details

### #52 - `omcc update` command (P1-High, L)

**Goal:** 초기화된 프로젝트의 템플릿을 최신 버전으로 안전하게 업데이트

**Key Files to Create:**
- `src/commands/update.ts` - CLI 명령어
- `src/version-tracker.ts` - `.claude/.omcc-version` 관리
- `src/diff-engine.ts` - 템플릿 diff 비교
- `src/merge-strategy.ts` - 3-way merge 로직

**Flags:** `--dry-run`, `--agents`, `--skills`, `--rules`, `--guides`, `--rollback`

**Test Scenarios:**
- New files added → auto-install
- Modified templates → interactive confirm
- User-customized files → preserve (skip or 3-way merge)
- `--dry-run` → preview without changes
- Version tracking file maintained

---

### #54 - Pre-flight CLI version check (P2-Medium, M)

**Goal:** `omcc` 실행 전 claude-code/codex CLI 버전 확인

**Key Files to Create:**
- `src/preflight/version-check.ts` - 버전 감지 + 비교
- `src/preflight/index.ts` - pre-flight 실행기

**Detection Methods:**
1. Homebrew: `brew list --versions claude-code`
2. npm global: `npm list -g claude-code`
3. Direct: `claude --version`

**Edge Cases:** Homebrew 미설치, 오프라인, CI 환경 (자동 skip)

---

### #55 + #56 - GitHub Projects setup (P3-Low, M+S)

**Goal:** 프로젝트 보드로 로드맵 가시성 확보

**CLI Tasks (from #56):**
```
gh project create --title "oh-my-customcode Roadmap" --owner baekenough
gh project field-create ... (Priority, Category, Size, Sprint)
gh label create cli templates ci/cd breaking priority:high
gh api repos/.../milestones (v0.4.0)
gh project item-add ... (기존 이슈 추가)
```

**Manual Tasks:**
- Board/Table/Roadmap view 설정 (Web UI)
- Workflow automations 활성화

---

## Session Notes

### 2026-02-10 (current)
- v0.9.0 릴리즈: Codex dual-mode + README 수정
- v0.9.1 릴리즈: secretary-routing 템플릿 누락 수정 (#57)
- v0.9.2 릴리즈: release workflow 충돌 수정 (#59)
- Sauron Phase 2.5 문서 정확성 검증 추가
- 4개 이슈 분석 완료 + 댓글 작성

### Next Session Checklist
- [ ] Start with #54 (pre-flight CLI version check)
- [ ] Then proceed to #52 (omcc update command)
- [ ] If time permits, execute #55/#56 (GitHub Projects setup)

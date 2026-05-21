# Release v0.149.0

## Highlights
- **세션 피드백 내재화** (#1206): R018/R011/R016 룰 강화 — 사용자 명시적 subagent 선호 우선, omcustom-feedback 세션 종료 권유, calibration 억제 anti-pattern 추가
- **claude-mem plugin cache advisory hook** (#1207): SessionStart에서 `~/.claude/shared-plugins/cache/**` `node_modules` 누락 자동 감지, stderr advisory 출력 (비차단)
- **Claude Code v2.1.146 호환성** (#1205): `/code-review` 리네임, AskUserQuestion auto-mode normalization, `CLAUDE_CODE_SUBAGENT_MODEL` 전파 fix 등 문서화

## :books: Documentation
- **CC v2.1.146 호환성 문서** (#1205): `guides/claude-code/15-version-compatibility.md` — 16개 변경 사항 분석 및 oh-my-customcode 영향 평가, 후속 follow-up 후보 명시

## :wrench: Rules
- **R018 (MUST-agent-teams)** (#1206 item 1): Self-Check `#0 — 사용자가 명시적으로 일반 subagent 선호?` prepend, R000 user instructions > R018 명시
- **R011 (SHOULD-memory-integration)** (#1206 item 3): Session-End Self-Check에 `omcustom-feedback` skill 활성 시 사용자 권유 단계 추가 (visible + HTML detail + COEXIST 확장 3곳)
- **R016 (MUST-continuous-improvement)** (#1206 item 4): Anti-Patterns에 "Calibration/humility during action-oriented tone" 5번째 row 추가

## :bug: Bug Fixes
- **plugin-cache-check.sh advisory hook** (#1207): SessionStart에서 plugin cache `node_modules` 미설치 감지. v0.132.0 zod/v3 동일 재발 패턴 방지. 비차단(exit 0), stderr advisory only

## :recycle: Other Changes
- **Memory: R010 root metafile exception rejected** (#1206 item 6): R010 약화 제안 거부 근거 기록. orchestrator 직접 작성 금지 일관 유지

## Resource Changes
| Resource | Before (v0.148.0) | After (v0.149.0) | Delta |
|----------|-------------------|-------------------|-------|
| Agents | 49 | 50 | +1 |
| Skills | 121 | 121 | 0 |
| Rules | 23 | 23 | 0 |
| Guides | 57 | 57 | 0 |

## Closed Issues
- #1205 — Claude Code v2.1.146
- #1206 — 세션 찐빠 보고 (items 1/3/4/6 internalized; items 2/5/7 별도 issue로 분리 예정)
- #1207 — claude-mem v13.3.0 plugin node_modules 미설치

---
_Release notes generated with Claude Code (oh-my-customcode auto-dev pipeline v2.1.0)_

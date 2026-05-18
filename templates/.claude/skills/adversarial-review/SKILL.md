---
name: adversarial-review
description: Adversarial code review using attacker mindset — trust boundary, attack surface, business logic, and defense evaluation
scope: core
argument-hint: "<file-or-directory> [--depth quick|thorough]"
user-invocable: true
---

# Adversarial Code Review

Review code from an attacker's perspective using STRIDE + OWASP frameworks.

## 4-Phase Review Process

### Phase 1: Trust Boundary Analysis
Identify where trust transitions occur:
- External input reaching internal logic without validation → **Tampering**
- Implicit trust between services → **Elevation of Privilege**
- Shared storage without isolation → **Information Disclosure**
- Authentication boundaries not clearly marked → **Spoofing**

Output: `[TRUST-BOUNDARY]` findings with location, threat type, and current validation level.

### Phase 2: Attack Surface Mapping
Map all entry points and exposure:
- Public API endpoints and auth requirements
- File upload/download paths → Path traversal risk
- External system calls (URLs, queries) → SSRF/Injection
- Event handlers and callbacks → Race conditions
- Error message verbosity → Information Disclosure

Output: `[ATTACK-SURFACE]` table with endpoint, exposure level, and mitigation status.

### Phase 3: Business Logic Review
Analyze logic flaws that static analysis misses:
- State machine violations (skip steps, replay)
- Authorization != authentication (authn ok but authz missing)
- Race conditions in multi-step operations
- Numeric overflow/underflow in financial calculations
- Default-allow vs default-deny patterns

Output: `[LOGIC-FLAW]` findings with exploitation scenario and impact.

### Phase 4: Defense Evaluation
Assess existing defense mechanisms:
- Input validation completeness (allowlist vs blocklist)
- Output encoding consistency
- Rate limiting and abuse prevention
- Logging coverage for security events
- Secret management (hardcoded credentials, env leaks)

Output: `[DEFENSE-GAP]` findings with recommendation.

## Output Format

For each finding:
```
[CATEGORY] Severity: HIGH|MEDIUM|LOW
Location: file:line
Finding: Description
Attack: How an attacker would exploit this
Fix: Recommended remediation
```

## Depth Modes
- **quick**: Phase 1 + 2 only (trust boundaries + attack surface)
- **thorough**: All 4 phases with detailed exploitation scenarios

## Integration
- Complements `dev-review` (best practices) with attacker perspective
- Works with `sec-codeql-expert` for pattern-based + logic-based coverage
- Can be chained: `dev-review` → `adversarial-review` for complete coverage
- Works with `action-validator` for action-space legality checking

### Action-Space Legality (AutoHarness Pattern)

- [ ] Do agents only call tools within their declared `tools` frontmatter?
- [ ] Do file operations stay within R002-declared access scope?
- [ ] Are domain boundaries respected (backend agent not editing frontend files)?
- [ ] Could an agent's task contract be tightened without losing functionality?

## CRG Integration (Optional Token-Efficiency)

공격 표면 분석에 `crg-integration` 스킬을 우선 호출하여 트러스트 boundary를 빠르게 매핑한다:

| Phase | CRG Tool | Purpose |
|-------|----------|---------|
| Attack surface | `get_impact_radius` | 보안 변경의 영향 추적 (recall-우선) |
| Caller analysis | `query_graph` | 신뢰 boundary 함수의 모든 caller 추적 |
| Diff focus | `get_minimal_context` | 보안 변경의 최소 review unit |
| Regression detect | `detect_changes` | 보안 의미 변경 감지 |

### Fallback (CRG 미설치 시)

CRG MCP 미연결 시 sec-codeql-expert + grep 조합으로 fallback. CRG의 recall-우선 특성 보완 위해 sec-codeql-expert (precision-우선)와 병행 권장.

### R013 Ecomode 정합

대규모 변경 PR (>50 lines) 또는 context >= 60% 시 CRG 호출 권장.

Refs: #1171 (CRG 통합), #1180 (본 cross-ref 추가)

## Permission Mode

When spawning agents via the Agent tool during this skill's execution, always pass `mode: "bypassPermissions"`. The Agent tool default (`acceptEdits`) overrides agent frontmatter `permissionMode`, causing permission prompts during unattended execution.

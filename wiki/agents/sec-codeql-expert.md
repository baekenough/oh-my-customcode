---
title: sec-codeql-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/sec-codeql-expert.md
related:
  - [[mgr-gitnerd]]
  - [[qa-engineer]]
---

# sec-codeql-expert

Security-focused code analyst using CodeQL for vulnerability detection, call graph analysis, SARIF output, CVE triage, and attack surface identification with OWASP/CWE-aligned findings.

## Overview

`sec-codeql-expert` performs static analysis using CodeQL against multi-language codebases (C/C++, JavaScript, Python, Java, Go). It prefers the CodeQL MCP server when available, falling back to the CLI (`codeql database create` → `codeql database analyze`). All findings reference CWE IDs, are assigned CVSS-informed severity levels, and include file:line locations with concrete remediation guidance. Output is SARIF-compatible for GitHub Advanced Security integration.

Runs in a **sandbox** isolation mode for safety.

## Key Details

- **Model**: sonnet
- **Domain**: devops
- **Tools**: Read, Write, Grep, Bash
- **Skills**: `cve-triage`, `adversarial-review`
- **Memory**: project
- **Effort**: high
- **Isolation**: sandbox

## Report Format

```
[Finding] CWE-{id}: {title}
Severity: Critical | High | Medium | Low
Location: {file}:{line}
Remediation: {concrete fix guidance}
```

## Relationships

- **Depends on**: `cve-triage` skill, `adversarial-review` skill, CodeQL MCP server or CodeQL CLI
- **Used by**: `secretary-routing` (security audit requests), `/adversarial-review` command
- **See also**: [[qa-engineer]] (functional testing), [[mgr-gitnerd]] (CI/CD security gates)

## Sources

- `.claude/agents/sec-codeql-expert.md` — agent definition

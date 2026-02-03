---
name: npm-audit
description: Audit npm dependencies for security and updates
argument-hint: "[--fix] [--production]"
---

# NPM Audit Skill

Audit npm dependencies for security vulnerabilities and outdated packages.

## Options

```
--fix            Automatically fix vulnerabilities where possible
--production     Only audit production dependencies
--json           Output in JSON format
```

## Workflow

```
1. Run npm audit for security vulnerabilities
2. Analyze vulnerability severity
3. Check for outdated dependencies
4. Generate health report
5. Suggest remediation steps
```

## Output Format

### Success
```
[NPM Audit] package-name

Security:
  Critical: 0
  High: 0
  Moderate: 2
  Low: 1

Outdated:
  Major updates: 3
  Minor updates: 5
  Patch updates: 12

Status: Needs attention (2 moderate vulnerabilities)

Recommendations:
  1. npm update lodash
  2. npm update axios
```

### Failure
```
[NPM Audit] Failed

Error: {error_message}
Hint: Ensure package-lock.json exists
```

## Examples

```bash
# Full dependency audit with report
npm-audit

# Audit and fix vulnerabilities
npm-audit --fix

# Audit only production dependencies
npm-audit --production
```

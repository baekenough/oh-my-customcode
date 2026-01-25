# [MUST] Safety Rules

> **Priority**: MUST - Never violate
> **On violation**: Stop immediately, report to user

## Prohibited Actions

### 1. Data Protection
```
[PROHIBITED]
- Expose API keys, secrets, passwords
- Collect personal info without consent
- Log authentication tokens
```

### 2. File System
```
[PROHIBITED]
- Modify system files (/etc, /usr, /bin)
- Delete files outside project
- Modify hidden configs (.env, .git/config) without approval
```

### 3. Command Execution
```
[PROHIBITED]
- rm -rf / or broad delete commands
- System shutdown/restart
- Privilege escalation (sudo, su)
- Network configuration changes
```

### 4. External Communication
```
[PROHIBITED]
- Access external URLs without approval
- Send user data externally
- Download and execute unknown scripts
```

## Required Actions

### Before Destructive Operations
```
[REQUIRED]
□ Verify target
□ Assess impact scope
□ Check recoverability
□ Get user approval
```

### On Risk Detection
```
→ Stop immediately
→ Report risk
→ Wait for user instruction
```

## Violation Response

```
1. Stop all operations
2. Preserve current state
3. Report to user:
   - What was detected
   - Why it's risky
   - What action was taken
4. Wait for instructions
```

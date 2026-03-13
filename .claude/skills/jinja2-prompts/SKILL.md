---
name: jinja2-prompts
description: Parameterized prompt templates using Jinja2 patterns for reusable, dynamic agent prompts
scope: core
user-invocable: false
---

# Jinja2 Prompt Templates

## Purpose

Define reusable, parameterized prompt templates for agent tasks. Templates enable consistent prompt formatting across workflows while allowing dynamic content injection.

## Template Syntax

Use Jinja2-style variable interpolation in prompt strings:

```
{{ variable }}                        — Variable substitution
{% if condition %}...{% endif %}      — Conditional sections
{% for item in list %}...{% endfor %} — Iteration
{{ variable | default("fallback") }}  — Default values
```

## Security Rules

- Templates MUST be author-written (stored in skill files), never user-supplied
- Use `SandboxedEnvironment` (NOT `Environment` or `from_string()` directly)
- No access to `env()`, `os`, `subprocess`, or any system functions
- Variable allowlist: only explicitly provided context variables are accessible
- NEVER render user-controlled strings as templates — treat them as plain data

## Template Locations

```
.claude/skills/<skill-name>/templates/
  ├── analysis.md.j2
  ├── report.md.j2
  └── triage.md.j2
```

## Usage Pattern

```yaml
# In skill or workflow definition
template: analysis.md.j2
variables:
  target: "{{ repository_url }}"
  scope: "security"
  depth: "comprehensive"
```

Rendered by orchestrator before passing to agent as prompt.

## Common Templates

### Research Team Prompt

```
Role: {{ domain }} {{ role }} analyst
Scope: {{ topic }}

Tasks:
{% for task in tasks %}
{{ loop.index }}. {{ task }}
{% endfor %}

Output format:
{{ output_format }}
```

### CVE Triage Prompt

```
Analyze {{ cve_id }} ({{ cwe_classification }})
Affected component: {{ component }} {{ version_range }}
{% if existing_mitigations %}
Known mitigations: {{ existing_mitigations }}
{% endif %}
```

## Integration

- Used by `/research` skill for team prompt generation
- Used by `cve-triage` skill for standardized analysis prompts
- Compatible with DAG orchestration node prompts

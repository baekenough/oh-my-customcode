---
layout: home

hero:
  name: oh-my-customcode
  text: Batteries-included agent harness for Claude Code
  tagline: Transform your coding agent workflow with a pre-configured agent system, skills, and rules designed for maximum productivity.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/baekenough/oh-my-customcode

features:
  - icon: "🤖"
    title: 50 Pre-built Agents
    details: Specialized agents for development, testing, documentation, infrastructure, and more. Each agent has a clear role and expertise.
  - icon: "⚡"
    title: 114 Skills
    details: Development best practices, orchestration patterns, and system utilities. Skills encapsulate knowledge that agents can use.
  - icon: "📜"
    title: 23 Rules
    details: Enforced coding standards and workflow patterns. MUST, SHOULD, and MAY priority levels for clear guidance.
  - icon: "🎨"
    title: Full Customization
    details: Create, modify, and extend agents, skills, and rules. The system is designed to grow with your needs.
  - icon: "🌐"
    title: Multi-language Support
    details: English and Korean language support out of the box. Initialize with your preferred language.
  - icon: "🔧"
    title: Health Checks
    details: Built-in doctor command to verify installation and auto-fix common issues.
---

## Quick Start

```bash
# Install globally
npm install -g oh-my-customcode

# Initialize in your project
cd your-project
omcustom init
```

That's it! Your project now has a full agent system ready to use with Claude Code.

## What's Included

| Category | Count | Examples |
|----------|-------|----------|
| SW Engineer / Language | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert |
| SW Engineer / Backend | 6 | be-fastapi-expert, be-springboot-expert, be-django-expert |
| SW Engineer / Frontend | 5 | fe-vercel-agent, fe-vuejs-agent, fe-flutter-agent |
| SW Engineer / Tooling | 4 | tool-npm-expert, tool-bun-expert, slack-cli-expert |
| Data Engineering | 6 | de-airflow-expert, de-dbt-expert, de-kafka-expert |
| Database | 4 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| Security | 1 | sec-codeql-expert |
| Architecture | 2 | arch-documenter, arch-speckit-agent |
| Agora | 1 | agora-runner |
| Infrastructure | 2 | infra-docker-expert, infra-aws-expert |
| QA | 3 | qa-planner, qa-writer, qa-engineer |
| Manager | 6 | mgr-creator, mgr-updater, mgr-gitnerd, mgr-sauron |
| System | 4 | sys-memory-keeper, sys-naggy, wiki-curator, tracker-checkpoint |

## Why oh-my-customcode?

Claude Code is powerful, but setting up an effective agent system takes time. oh-my-customcode provides:

- **Instant Productivity** - Start using specialized agents immediately
- **Best Practices** - Built-in rules enforce good patterns
- **Scalability** - From solo projects to team environments
- **Flexibility** - Customize everything to fit your workflow

## Further Reading

- [Getting Started](/guide/getting-started) · [Commands](/guide/commands) · [Customization](/guide/customization)
- [Agents Reference](/reference/agents) · [Skills Reference](/reference/skills) · [Rules Reference](/reference/rules)

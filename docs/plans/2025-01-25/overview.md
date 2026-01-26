# oh-my-customcode Overview

## Project Info

| Item | Value |
|------|-------|
| Name | oh-my-customcode |
| Description | Batteries-included agent harness for Claude Code |
| License | MIT |
| Repository | github.com/baekenough/oh-my-customcode |
| npm Package | oh-my-customcode |
| CLI Command | omcustom |

## Core Values

| Feature | Description |
|---------|-------------|
| **Multilingual** | English default, Korean supported (i18n) |
| **Rule-based System** | 17 MUST/SHOULD rules for consistent behavior |
| **QA-focused Development** | Test plan → Document → Execute pipeline |
| **Batteries Included** | All agents/skills available immediately after install |

## Installation

```bash
npm install -g oh-my-customcode
omcustom init           # Initialize .claude/ structure in project
omcustom init --lang ko # Initialize with Korean
omcustom update         # Update to latest version
omcustom doctor         # Verify installation
```

## Target Users

- Developers using Claude Code
- Teams wanting systematic agent workflows
- Projects requiring QA/test documentation

## Reference

- Based on: [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- Agent system: [baekgom-agents](https://github.com/baekenough/baekgom-agents)

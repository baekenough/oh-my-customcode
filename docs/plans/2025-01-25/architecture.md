# Architecture

## Project Structure

```
oh-my-customcode/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml              # PR tests (unit, integration, e2e)
│       ├── deploy-test.yml     # Deploy + install tests
│       ├── release.yml         # npm publish
│       └── coverage.yml        # Coverage report
├── src/
│   ├── cli/
│   │   ├── index.ts            # Entry point
│   │   ├── init.ts             # omcc init
│   │   ├── update.ts           # omcc update
│   │   ├── list.ts             # omcc list
│   │   └── doctor.ts           # omcc doctor
│   ├── core/
│   │   ├── installer.ts        # Install logic
│   │   ├── updater.ts          # Update logic
│   │   └── config.ts           # Config management
│   ├── i18n/
│   │   ├── index.ts            # i18n initialization
│   │   ├── types.ts            # Type definitions
│   │   └── locales/
│   │       ├── en.json         # English messages
│   │       └── ko.json         # Korean messages
│   └── utils/
│       ├── fs.ts               # Filesystem helpers
│       └── logger.ts           # Logging
├── templates/                   # Installed templates (from baekgom-agents)
│   ├── .claude/
│   │   ├── rules/              # 17 rules
│   │   ├── hooks/              # Hook scripts
│   │   └── contexts/           # Context files
│   ├── agents/                 # 37 agents
│   ├── skills/                 # Skills
│   ├── guides/                 # Guides
│   ├── pipelines/              # Pipelines
│   ├── commands/               # Commands
│   ├── CLAUDE.md.en            # English version
│   └── CLAUDE.md.ko            # Korean version
├── tests/
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # E2E tests
├── docs/
│   ├── specs/                  # Speckit specs
│   ├── plans/                  # Design documents
│   └── guides/                 # User guides
├── package.json
├── tsconfig.json
├── bunfig.toml
├── biome.json                  # Rust-based linter/formatter
├── LICENSE                     # MIT
├── README.md                   # English
└── README_ko.md                # Korean
```

## Tech Stack

| Area | Technology |
|------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Linter/Formatter | Biome (Rust-based) |
| Test | Bun test |
| i18n | i18next |
| CLI | Commander.js |

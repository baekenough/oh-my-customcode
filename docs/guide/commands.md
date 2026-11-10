# CLI Commands

oh-my-customcode provides a CLI tool (`omcustom`) for managing Claude agent system templates.

The option tables below follow `omcustom <command> --help`. Run it for the text in your installed version.

## Overview

| Command | Description |
|---------|-------------|
| `omcustom init` | Initialize agent system |
| `omcustom update` | Update managed components to latest templates |
| `omcustom list` | List installed components |
| `omcustom sync` | Check `.claude/` configuration drift or export a snapshot |
| `omcustom doctor` | Verify installation health |
| `omcustom security` | Scan hooks, settings, and templates for security issues |
| `omcustom web` | Manage the Web UI server (`start`, `stop`, `status`, `open`) |
| `omcustom projects` | List projects on this machine where oh-my-customcode is installed |
| `omcustom unregister` | Remove a project from the local registry |
| `omcustom serve` | Deprecated alias for `omcustom web start` |
| `omcustom serve-stop` | Deprecated alias for `omcustom web stop` |

## Self-update

`init` and `update` update the CLI itself to the latest published version before doing any work:

- There is no prompt, in a terminal or not. npm is queried fresh on every run.
- After installing, the new version is started with `--version`. The CLI re-runs the same command on it only if it reports the expected version; otherwise it prints one notice and continues with the current version.
- Under `npx`, the re-run is pinned to the resolved version (`npx -y oh-my-customcode@<version>`).
- If the running CLI is not under `npm root -g` (for example a pnpm, bun, or volta global, or `bunx`/`pnpm dlx`), nothing is installed and one line says to update it with the package manager that installed it.
- Every failure prints one line and the command continues with the current version:
  - A failed version lookup, install, `--version` probe, or re-run names `npm install -g oh-my-customcode@latest` and `--skip-self`.
  - A version mismatch between the installed package and the running `omcustom` binary (or an undeterminable binary version) names only `npm install -g oh-my-customcode@latest`, to be run with the npm that owns the binary.
  - A CLI outside `npm root -g` prints its own line with the CLI path and the npm global root. It says to update with the tool that installed it (or to re-link a linked checkout) and mentions `--skip-self`, but does not name the `npm install -g` command.

Self-update is skipped when any of these applies:

- CI: any non-empty `CI`, `GITHUB_ACTIONS`, or `TF_BUILD` value other than `false` or `0` (case-insensitive)
- `OMCUSTOM_SKIP_SELF_UPDATE=true`
- the global `--skip-version-check` option
- `--skip-self` (available on both `init` and `update`)
- `update --dry-run` (prints one line saying self-update was skipped)

If an old global CLI cannot update itself, install the latest once with `npm install -g oh-my-customcode@latest` (see the README troubleshooting section).

## init

Initialize the agent system in your current project.

```bash
omcustom init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-l, --lang <language>` | Language for templates (`en` or `ko`) |
| `--domain <domain>` | Install only agents/skills for a specific domain (`backend`, `frontend`, `data-engineering`, `devops`) |
| `--yes` | Skip the interactive wizard and use defaults |
| `--from-snapshot <path>` | Install from a pre-configured team snapshot directory |
| `--no-agent-teams` | Do not enable Claude Code Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) in `.claude/settings.json` |
| `--skip-self` | Skip self-update of the oh-my-customcode package |

By default `init` writes `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` into the `env` block of `.claude/settings.json` (merged with existing settings). `--no-agent-teams` leaves it out.

### Examples

```bash
# Initialize with default settings
omcustom init

# Initialize with Korean templates
omcustom init --lang ko

# Non-interactive, backend agents only
omcustom init --yes --domain backend

# Install from a team snapshot
omcustom init --from-snapshot ./team-snapshot
```

## update

Update managed components in the current project.

```bash
omcustom update [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would change without writing files |
| `--force` | Force update even if already at latest version |
| `--force-overwrite-all` | Bypass preservation logic (manifest/config preserve rules) |
| `--hard` | Sync the namespace (`name:` field) of unmodified files from upstream |
| `--backup` | Create backup before updating |
| `--agents` | Update only agents |
| `--skills` | Update only skills |
| `--rules` | Update only rules |
| `--guides` | Update only guides |
| `--hooks` | Update only hooks |
| `--contexts` | Update only contexts |
| `--all` | Update all outdated projects found by project discovery in one batch |
| `--yes` | Move files that oh-my-customcode no longer ships (identical to the shipped copy) to a backup without asking |
| `--skip-self` | Skip self-update of the oh-my-customcode package |

### Retired files

Files an older version shipped and the current package no longer ships are handled as follows:

- In an interactive terminal, `update` lists them and asks `y/N` (default `N`) before moving them. Only `y` or `yes` accepts. Declining keeps the files.
- No prompt is shown with `--all`, `--dry-run`, or `--yes`, without a TTY, or in CI (see Self-update for how CI is detected). `--yes` confirms the move in advance.
- Moved files go to `.omcustom-backup-<timestamp>/retired/` in the project root. The move never overwrites an existing file and keeps the original on any failure.
- To restore a file, move it back to the same path and add the path to `preserveFiles` in `.omcustomrc.json`; `update` then keeps it without a warning.
- In a backup, `claude/` stands for `.claude/`. `CLAUDE.md`, `CLAUDE.local.md`, and `AGENTS.md` (any case) are stored with a `.backup` suffix so they are not loaded as instructions; drop the suffix when restoring. In `--backup` copies, a file whose `.backup` name is already taken is stored as `.backup-1`, `.backup-2`, …; drop that whole suffix.
- Modified or preserved files are never moved. `omcustom doctor` reports them (see the `Orphans` check).

RTK-related leftovers: see the README.

### Examples

```bash
# Update everything
omcustom update

# Preview changes only
omcustom update --dry-run

# Update only agents and skills
omcustom update --agents --skills

# Non-interactive update that also moves retired files to a backup
omcustom update --yes
```

## list

List installed components.

```bash
omcustom list [options] [type]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `type` | One of `agents`, `skills`, `guides`, `rules`, or `all` (default: `all`) |

### Options

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `table`, `json`, or `simple` (default: `table`) |
| `--verbose` | Show detailed information |

### Examples

```bash
# List all components
omcustom list

# List only agents
omcustom list agents

# List skills as JSON
omcustom list skills --format json
```

## sync

Check `.claude/` configuration drift or export a snapshot.

```bash
omcustom sync [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--check` | Compare current state against the lockfile (default behavior) |
| `--reference <path>` | Compare against an external snapshot instead of the lockfile |
| `--export <path>` | Export the current `.claude/` state as a reusable snapshot |

### Examples

```bash
# Check drift against the lockfile
omcustom sync

# Export a snapshot for teammates (use with init --from-snapshot)
omcustom sync --export ./team-snapshot
```

## doctor

Check installation health.

```bash
omcustom doctor [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--fix` | Automatically fix issues that can be repaired |
| `--updates` | Check for oh-my-customcode updates |

### Orphans check

The `Orphans` check finds files on disk that an older version shipped and the current package no longer ships. Each one is reported as `update` would treat it: moved to a backup, kept (not owned by the lockfile, or preserved by your settings), or modified (review and delete manually). Your own custom files are never flagged. The check is never auto-fixable: removal belongs to `omcustom update`.

### Examples

```bash
# Run health checks
omcustom doctor

# Auto-fix repairable issues
omcustom doctor --fix

# Also check for CLI updates
omcustom doctor --updates
```

## security

Scan hooks, settings, and templates for security issues.

```bash
omcustom security [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed scan results |

The exit code is `1` when the scan fails.

## web

Manage the Web UI server. `omcustom web` without a subcommand shows the status.

```bash
omcustom web [command]
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `web start` | Start the Web UI server |
| `web stop` | Stop the Web UI server |
| `web status` | Show the Web UI server status |
| `web open` | Open the Web UI in the default browser |

### Options for `web start`

| Option | Description |
|--------|-------------|
| `-p, --port <port>` | Port number (default: `4321`) |
| `--foreground` | Run in the foreground (do not detach) |

### Options for `web open`

| Option | Description |
|--------|-------------|
| `-p, --port <port>` | Port number (default: `4321`) |

## serve and serve-stop (deprecated)

`omcustom serve` is a deprecated alias for `omcustom web start`, and `omcustom serve-stop` for `omcustom web stop`. Use the `web` subcommands instead.

| Option | Description |
|--------|-------------|
| `-p, --port <port>` | `serve` only. Port number (default: `4321`) |
| `--foreground` | `serve` only. Run in the foreground (do not detach) |

## projects

List all projects on this machine where oh-my-customcode is installed.

```bash
omcustom projects [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `table`, `json`, or `simple` (default: `table`) |
| `--path <dir>` | Additional search directory (can be specified multiple times) |
| `--migrate` | Scan for existing projects with lock files and import them into the registry |
| `--clean` | Remove registry entries whose project paths no longer exist on disk |

## unregister

Remove a project from the local registry.

```bash
omcustom unregister [path]
```

`path` defaults to the current directory.

## Global Options

| Option | Description |
|--------|-------------|
| `--skip-version-check` | Skip CLI tool pre-flight version checks (also skips self-update) |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (including invalid arguments or unknown options, which Commander reports with exit code 1) |

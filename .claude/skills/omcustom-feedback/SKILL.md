---
name: omcustom-feedback
description: Submit feedback about oh-my-customcode as a GitHub issue
scope: harness
user-invocable: true
disable-model-invocation: true
argument-hint: "[description or leave empty for interactive]"
---

# Feedback Submitter

Submit feedback about oh-my-customcode (bugs, features, improvements, questions) directly as a GitHub issue from the CLI session.

## Purpose

Lowers the barrier for submitting feedback by allowing users to create GitHub issues without leaving their terminal session. All feedback is filed to the `baekenough/oh-my-customcode` repository.

## Usage

```
# Inline feedback
/omcustom-feedback HUD display is missing during parallel agent spawn

# Interactive (no arguments)
/omcustom-feedback
```

## Workflow

### Phase 1: Input Parsing

If arguments are provided:
1. Analyze the content to auto-detect category (`bug`, `feature`, `improvement`, `question`)
2. Use the content as the issue title (truncate to 80 chars if needed)
3. Use the full content as the description body

If no arguments:
1. Ask the user for category using AskUserQuestion: `[bug / feature / improvement / question]`
2. Ask for title and optional detailed description (combine into a single prompt when possible)

### Phase 2: Preflight Check

```bash
# Verify gh CLI is installed
command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI not installed. Install from https://cli.github.com/"; exit 1; }

# Verify authentication
gh auth status 2>&1 | grep -q "Logged in" || { echo "Error: Not authenticated. Run 'gh auth login' first."; exit 1; }
```

### Phase 3: Environment Collection

Collect environment info via Bash:

```bash
# omcustom version
OMCUSTOM_VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")

# Claude Code version
CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")

# OS
OS_INFO=$(uname -s 2>/dev/null || echo "unknown")

# Project name
PROJECT_NAME=$(basename "$(pwd)")
```

### Phase 4: Confirmation and Create

1. Show the user a preview of the issue to be created:
   ```
   [Preview]
   ├── Title: {title}
   ├── Category: {category}
   ├── Labels: feedback, {category-label}
   └── Repo: baekenough/oh-my-customcode
   ```
2. Ask for confirmation before creating

3. Ensure labels exist (defensive):
   ```bash
   gh label create feedback --description "User feedback via /omcustom-feedback" --color 0E8A16 --repo baekenough/oh-my-customcode 2>/dev/null || true
   ```

4. Create the issue using `--body-file` for safe markdown handling:
   ```bash
   # Write body to temp file to avoid shell escaping issues
   cat > /tmp/omcustom-feedback-body.md << 'FEEDBACK_EOF'
   ## Feedback

   **Category**: {category}
   **Source**: omcustom CLI v{version}

   ### Description
   {user description}

   ### Environment
   - omcustom version: {omcustom_version}
   - Claude Code version: {claude_version}
   - OS: {os_info}
   - Project: {project_name}

   ---
   *Submitted via `/omcustom-feedback`*
   FEEDBACK_EOF

   # Create issue
   gh issue create \
     --repo baekenough/oh-my-customcode \
     --title "{title}" \
     --label "feedback,{category_label}" \
     --body-file /tmp/omcustom-feedback-body.md

   # Clean up
   rm -f /tmp/omcustom-feedback-body.md
   ```

5. If label creation fails AND issue creation fails due to labels, retry without labels as fallback

6. Return the issue URL to the user

### Category-to-Label Mapping

| Category | GitHub Label |
|----------|-------------|
| bug | bug |
| feature | enhancement |
| improvement | enhancement |
| question | question |

## Notes

- Target repo is hardcoded to `baekenough/oh-my-customcode` — feedback is always about omcustom itself
- Requires `gh` CLI with authentication
- Uses `--body-file` instead of `--body` to safely handle markdown with special characters
- `disable-model-invocation: true` ensures this skill only runs when explicitly invoked by the user

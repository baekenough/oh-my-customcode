---
name: omcustom-feedback
description: Submit feedback about oh-my-customcode (supports anonymous submission)
scope: harness
user-invocable: true
disable-model-invocation: true
argument-hint: "[description or leave empty for interactive] [--anonymous]"
---

# Feedback Submitter

Submit feedback about oh-my-customcode (bugs, features, improvements, questions) directly from the CLI session. Supports anonymous submission with `[Anonymous Feedback]` title prefix when `--anonymous` flag is used.

## Purpose

Lowers the barrier for submitting feedback by allowing users to create GitHub issues — without leaving their terminal session. All feedback is filed to the `baekenough/oh-my-customcode` repository.

## Usage

```
# Inline feedback
/omcustom-feedback HUD display is missing during parallel agent spawn

# Anonymous submission
/omcustom:feedback --anonymous Something feels off with the routing

# Interactive (no arguments)
/omcustom-feedback
```

## Workflow

### Phase 1: Input Parsing

Check for `--anonymous` flag in the arguments:
- If `--anonymous` is present, set `ANONYMOUS=true` and strip the flag from the content
- Otherwise, set `ANONYMOUS=false`

If remaining arguments are provided:
1. Analyze the content to auto-detect category (`bug`, `feature`, `improvement`, `question`)
2. Use the content as the issue title (truncate to 80 chars if needed)
3. Use the full content as the description body

If no arguments (or only `--anonymous`):
1. Ask the user for category using AskUserQuestion: `[bug / feature / improvement / question]`
2. Ask for title and optional detailed description (combine into a single prompt when possible)

### Phase 2: Route Decision

Check environment and user intent:

```bash
# Check gh CLI availability
command -v gh >/dev/null 2>&1 && GH_AVAILABLE=true || GH_AVAILABLE=false

# Check gh authentication (only if gh is available)
if [ "$GH_AVAILABLE" = "true" ]; then
  gh auth status >/dev/null 2>&1 && GH_AUTHED=true || GH_AUTHED=false
else
  GH_AUTHED=false
fi
```

**Route A**: `gh` available + authenticated
- Use GitHub Issue creation (see Phase 4A)
- If `--anonymous`: adds `[Anonymous Feedback]` prefix and `anonymous` label

**Fallback**: `gh` NOT available or not authenticated
- Save feedback locally and inform the user (see Phase 4D)

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

# Build project context string
PROJECT_CONTEXT="omcustom v${OMCUSTOM_VERSION}, Claude Code ${CLAUDE_VERSION}, ${OS_INFO}"
```

For anonymous submissions, do NOT include the project name. Offer to include project context as opt-in:
- Ask: "Include environment info (version, OS) in the anonymous report? [Y/n]"
- If declined, set `PROJECT_CONTEXT=""`

### Phase 4A: GitHub Issue Creation (Route A — gh + authenticated)

1. If `ANONYMOUS=true`, prepend `[Anonymous Feedback] ` to the title and add `anonymous` to the label list.

2. Show the user a preview of the issue to be created:
   ```
   [Preview]
   ├── Title: {title}
   ├── Category: {category}
   ├── Labels: feedback, {category-label}[, anonymous]
   └── Repo: baekenough/oh-my-customcode
   ```
3. Ask for confirmation before creating

4. Ensure labels exist (defensive):
   ```bash
   gh label create feedback --description "User feedback via /omcustom-feedback" --color 0E8A16 --repo baekenough/oh-my-customcode 2>/dev/null || true
   # If anonymous, ensure the anonymous label exists
   if [ "$ANONYMOUS" = "true" ]; then
     gh label create anonymous --description "Anonymous feedback submission" --color C5DEF5 --repo baekenough/oh-my-customcode 2>/dev/null || true
   fi
   ```

5. Create the issue using `--body-file` for safe markdown handling:
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

   # Build label string
   LABELS="feedback,${CATEGORY_LABEL}"
   if [ "$ANONYMOUS" = "true" ]; then
     LABELS="${LABELS},anonymous"
   fi

   # Create issue
   gh issue create \
     --repo baekenough/oh-my-customcode \
     --title "{title}" \
     --label "$LABELS" \
     --body-file /tmp/omcustom-feedback-body.md

   # Clean up
   rm -f /tmp/omcustom-feedback-body.md
   ```

6. If label creation fails AND issue creation fails due to labels, retry without labels as fallback

7. Return the issue URL to the user

### Phase 4D: Local Fallback (gh not available, not authenticated, or issue creation failed)

```bash
mkdir -p ~/.omcustom/feedback
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
FEEDBACK_FILE=~/.omcustom/feedback/${TIMESTAMP}.json

cat > "$FEEDBACK_FILE" << EOF
{
  "title": "$TITLE",
  "body": "$BODY",
  "feedback_type": "$TYPE",
  "anonymous": $ANONYMOUS,
  "project_context": "$PROJECT_CONTEXT",
  "saved_at": "$TIMESTAMP"
}
EOF
```

Inform the user:
```
[Saved] Feedback saved locally to ~/.omcustom/feedback/{timestamp}.json
Submit manually when connectivity is available:
  - GitHub Issues: https://github.com/baekenough/oh-my-customcode/issues/new
  - Or run /omcustom:feedback again when gh is available
```

### Category-to-Label Mapping

| Category | GitHub Label |
|----------|--------------|
| bug | bug |
| feature | enhancement |
| improvement | enhancement |
| question | question |
| (auto-detect fails) | (none) |

## Notes

- Route A creates a visible GitHub issue attributed to the user's gh account
- When `--anonymous` is used, the title is prefixed with `[Anonymous Feedback]` and the `anonymous` label is added
- Fallback ensures no feedback is silently lost even in offline environments
- `disable-model-invocation: true` ensures this skill only runs when explicitly invoked by the user
- Target repo is hardcoded to `baekenough/oh-my-customcode` — feedback is always about omcustom itself

---
name: omcustom-feedback
description: Submit feedback about oh-my-customcode (supports anonymous submission)
scope: harness
user-invocable: true
disable-model-invocation: true
argument-hint: "[description or leave empty for interactive] [--anonymous]"
---

# Feedback Submitter

Submit feedback about oh-my-customcode (bugs, features, improvements, questions) directly from the CLI session. Supports anonymous submission via Airflow DAG when gh CLI is unavailable or when anonymity is requested.

## Purpose

Lowers the barrier for submitting feedback by allowing users to create GitHub issues or submit anonymously — without leaving their terminal session. All feedback is filed to the `baekenough/oh-my-customcode` repository.

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

# Check curl availability
command -v curl >/dev/null 2>&1 && CURL_AVAILABLE=true || CURL_AVAILABLE=false
```

**Route A**: `gh` available + authenticated + NOT anonymous
- Use GitHub Issue creation (see Phase 4A)

**Route B**: `gh` available + (anonymous OR not authenticated)
- Use `gh workflow run` to submit via GitHub Actions (see Phase 4B)

**Route C**: `gh` NOT available
- Use `curl` to Airflow REST API (see Phase 4C)

**Fallback**: Neither `gh` nor `curl` available
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

### Phase 4A: GitHub Issue Creation (Route A — gh + authenticated + not anonymous)

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

### Phase 4B: Anonymous via GitHub Actions (Route B — gh available, anonymous or not authenticated)

```bash
gh workflow run feedback-submission.yml \
  --repo baekenough/oh-my-customcode \
  -f title="$TITLE" \
  -f body="$BODY" \
  -f feedback_type="$TYPE" \
  -f anonymous=true \
  -f project_context="$PROJECT_CONTEXT"
```

On success, inform the user:
```
[Done] Anonymous feedback submitted via GitHub Actions workflow.
```

If `gh workflow run` fails (e.g., permissions), fall through to Route C.

### Phase 4C: Anonymous via Airflow REST API (Route C — no gh)

```bash
# Build JSON payload (use printf for safe escaping)
PAYLOAD=$(printf '{"conf":{"title":"%s","body":"%s","feedback_type":"%s","anonymous":true,"submitter":"","project_context":"%s"}}' \
  "$TITLE" "$BODY" "$TYPE" "$PROJECT_CONTEXT")

curl -X POST "https://airflow.baekenough.com/api/v1/dags/omc_feedback_collector/dagRuns" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --silent --show-error \
  --max-time 15
```

On HTTP 200/201, inform the user:
```
[Done] Anonymous feedback submitted via Airflow.
```

On failure (non-2xx or network error), fall through to Fallback.

### Phase 4D: Local Fallback (no gh, no curl, or all routes failed)

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
  - Or run /omcustom:feedback again when gh or curl is available
```

### Category-to-Label Mapping

| Category | GitHub Label | Airflow feedback_type |
|----------|--------------|-----------------------|
| bug | bug | bug |
| feature | enhancement | feature |
| improvement | enhancement | improvement |
| question | question | question |
| (auto-detect fails) | (none) | general |

## Notes

- Route A creates a visible GitHub issue attributed to the user's gh account
- Routes B and C submit anonymously — submitter identity is not recorded
- Route B requires `gh` but NOT authentication to the repo (public workflow)
- Route C requires `curl` (available on macOS/Linux by default)
- Fallback ensures no feedback is silently lost even in offline environments
- `disable-model-invocation: true` ensures this skill only runs when explicitly invoked by the user
- Target repo is hardcoded to `baekenough/oh-my-customcode` — feedback is always about omcustom itself

#!/bin/bash
#
# verify-sync.sh - Verify oh-my-customcode templates are in sync with baekgom-agents
#
# Usage:
#   ./scripts/verify-sync.sh /path/to/baekgom-agents
#   BAEKGOM_AGENTS_PATH=/path/to/baekgom-agents ./scripts/verify-sync.sh
#
# Exit codes:
#   0 - All synced
#   1 - Drift detected
#   2 - Invalid arguments or missing paths
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$PROJECT_DIR/templates"

# Get baekgom-agents path from argument or environment variable
BAEKGOM_PATH="${1:-${BAEKGOM_AGENTS_PATH:-}}"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
declare -a FAILURES=()

#######################################
# Print colored output
#######################################
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_pass() {
    echo -e "  ${GREEN}✓ PASS${NC} $1"
}

print_fail() {
    echo -e "  ${RED}✗ FAIL${NC} $1"
}

print_info() {
    echo -e "  ${YELLOW}ℹ${NC} $1"
}

#######################################
# Usage
#######################################
usage() {
    echo "Usage: $0 [BAEKGOM_AGENTS_PATH]"
    echo ""
    echo "Verify oh-my-customcode templates are in sync with baekgom-agents source."
    echo ""
    echo "Arguments:"
    echo "  BAEKGOM_AGENTS_PATH  Path to baekgom-agents repository"
    echo ""
    echo "Environment variables:"
    echo "  BAEKGOM_AGENTS_PATH  Can be set instead of passing as argument"
    echo ""
    echo "Examples:"
    echo "  $0 ../baekgom-agents"
    echo "  BAEKGOM_AGENTS_PATH=../baekgom-agents $0"
    exit 2
}

#######################################
# Validate paths
#######################################
validate_paths() {
    if [[ -z "$BAEKGOM_PATH" ]]; then
        echo -e "${RED}Error: baekgom-agents path not provided${NC}"
        usage
    fi

    if [[ ! -d "$BAEKGOM_PATH" ]]; then
        echo -e "${RED}Error: baekgom-agents path does not exist: $BAEKGOM_PATH${NC}"
        exit 2
    fi

    if [[ ! -d "$BAEKGOM_PATH/.claude" ]]; then
        echo -e "${RED}Error: Not a valid baekgom-agents repository (missing .claude/): $BAEKGOM_PATH${NC}"
        exit 2
    fi

    if [[ ! -d "$TEMPLATES_DIR" ]]; then
        echo -e "${RED}Error: Templates directory not found: $TEMPLATES_DIR${NC}"
        exit 2
    fi

    # Resolve to absolute path
    BAEKGOM_PATH="$(cd "$BAEKGOM_PATH" && pwd)"
}

#######################################
# Count files in directory
#######################################
count_files() {
    local dir="$1"
    local pattern="${2:-*}"

    if [[ -d "$dir" ]]; then
        find "$dir" -maxdepth 1 -type f -name "$pattern" 2>/dev/null | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

#######################################
# Count directories
#######################################
count_dirs() {
    local dir="$1"

    if [[ -d "$dir" ]]; then
        find "$dir" -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '
        # Subtract 1 for the directory itself
    else
        echo "0"
    fi
}

#######################################
# Compare directories
#######################################
compare_directory() {
    local name="$1"
    local source_dir="$2"
    local template_dir="$3"
    local count_type="${4:-files}"  # "files" or "dirs"

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Check if source exists
    if [[ ! -d "$source_dir" ]]; then
        print_fail "$name - Source directory not found: $source_dir"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        FAILURES+=("$name: Source directory not found")
        return 1
    fi

    # Check if template exists
    if [[ ! -d "$template_dir" ]]; then
        print_fail "$name - Template directory not found: $template_dir"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        FAILURES+=("$name: Template directory not found")
        return 1
    fi

    # Count items
    local source_count template_count
    if [[ "$count_type" == "dirs" ]]; then
        source_count=$(($(count_dirs "$source_dir") - 1))
        template_count=$(($(count_dirs "$template_dir") - 1))
    else
        source_count=$(count_files "$source_dir" "*.md")
        template_count=$(count_files "$template_dir" "*.md")
    fi

    # Run diff
    local diff_output
    diff_output=$(diff -rq "$source_dir" "$template_dir" 2>&1 || true)

    if [[ -z "$diff_output" ]]; then
        print_pass "$name (source: $source_count, template: $template_count)"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        print_fail "$name (source: $source_count, template: $template_count)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))

        # Show diff details (limited)
        local diff_count
        diff_count=$(echo "$diff_output" | wc -l | tr -d ' ')
        print_info "Found $diff_count differences:"
        echo "$diff_output" | head -10 | while read -r line; do
            echo "      $line"
        done
        if [[ $diff_count -gt 10 ]]; then
            echo "      ... and $((diff_count - 10)) more"
        fi

        FAILURES+=("$name: $diff_count differences found")
        return 1
    fi
}

#######################################
# Main verification
#######################################
main() {
    validate_paths

    print_header "baekgom-agents Sync Verification"
    echo ""
    echo "  Source:    $BAEKGOM_PATH"
    echo "  Templates: $TEMPLATES_DIR"

    # ─────────────────────────────────────────────────────────────
    # Check 1: .claude/agents/
    # ─────────────────────────────────────────────────────────────
    print_header "1. Agents (.claude/agents/)"
    compare_directory "agents" \
        "$BAEKGOM_PATH/.claude/agents" \
        "$TEMPLATES_DIR/.claude/agents" \
        "files"

    # ─────────────────────────────────────────────────────────────
    # Check 2: .claude/skills/
    # ─────────────────────────────────────────────────────────────
    print_header "2. Skills (.claude/skills/)"
    compare_directory "skills" \
        "$BAEKGOM_PATH/.claude/skills" \
        "$TEMPLATES_DIR/.claude/skills" \
        "dirs"

    # ─────────────────────────────────────────────────────────────
    # Check 3: .claude/rules/
    # ─────────────────────────────────────────────────────────────
    print_header "3. Rules (.claude/rules/)"
    compare_directory "rules" \
        "$BAEKGOM_PATH/.claude/rules" \
        "$TEMPLATES_DIR/.claude/rules" \
        "files"

    # ─────────────────────────────────────────────────────────────
    # Check 4: .claude/hooks/
    # ─────────────────────────────────────────────────────────────
    print_header "4. Hooks (.claude/hooks/)"
    compare_directory "hooks" \
        "$BAEKGOM_PATH/.claude/hooks" \
        "$TEMPLATES_DIR/.claude/hooks" \
        "dirs"

    # ─────────────────────────────────────────────────────────────
    # Check 5: .claude/contexts/
    # ─────────────────────────────────────────────────────────────
    print_header "5. Contexts (.claude/contexts/)"
    compare_directory "contexts" \
        "$BAEKGOM_PATH/.claude/contexts" \
        "$TEMPLATES_DIR/.claude/contexts" \
        "files"

    # ─────────────────────────────────────────────────────────────
    # Check 6: guides/
    # ─────────────────────────────────────────────────────────────
    print_header "6. Guides (guides/)"
    compare_directory "guides" \
        "$BAEKGOM_PATH/guides" \
        "$TEMPLATES_DIR/guides" \
        "dirs"

    # ─────────────────────────────────────────────────────────────
    # Check 7: pipelines/
    # ─────────────────────────────────────────────────────────────
    print_header "7. Pipelines (pipelines/)"
    compare_directory "pipelines" \
        "$BAEKGOM_PATH/pipelines" \
        "$TEMPLATES_DIR/pipelines" \
        "dirs"

    # ─────────────────────────────────────────────────────────────
    # Summary
    # ─────────────────────────────────────────────────────────────
    print_header "Summary"
    echo ""
    echo "  Total checks: $TOTAL_CHECKS"
    echo -e "  ${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "  ${RED}Failed: $FAILED_CHECKS${NC}"
    echo ""

    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  ✓ ALL CHECKS PASSED - Templates are in sync!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 0
    else
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  ✗ DRIFT DETECTED - Templates need to be synchronized${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "  Failed checks:"
        for failure in "${FAILURES[@]}"; do
            echo "    - $failure"
        done
        echo ""
        echo "  To sync, run: ./sync.sh (with BAEKGOM_PATH configured)"
        exit 1
    fi
}

# Run main
main

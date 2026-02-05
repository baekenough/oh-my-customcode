#!/bin/bash
#
# sync-wiki.sh - Sync wiki pages to GitHub Wiki repository
#
# Usage:
#   ./scripts/sync-wiki.sh [WIKI_REPO_PATH]
#
# Arguments:
#   WIKI_REPO_PATH  Path to cloned wiki repository (default: ./wiki-repo)
#
# This script copies wiki pages from ./wiki/ to the GitHub wiki repository.
# The wiki pages in ./wiki/ are the source of truth.
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WIKI_SOURCE="$PROJECT_DIR/wiki"
WIKI_REPO="${1:-$PROJECT_DIR/wiki-repo}"

#######################################
# Print functions
#######################################
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

#######################################
# Validate
#######################################
validate() {
    if [[ ! -d "$WIKI_SOURCE" ]]; then
        echo -e "${RED}Error: Wiki source directory not found: $WIKI_SOURCE${NC}"
        echo "Run this script from the project root."
        exit 1
    fi
}

#######################################
# List wiki pages
#######################################
list_pages() {
    print_header "Wiki Pages"
    echo ""
    echo "  Source: $WIKI_SOURCE"
    echo ""

    local count=0
    for file in "$WIKI_SOURCE"/*.md; do
        if [[ -f "$file" ]]; then
            local name
            name=$(basename "$file" .md)
            echo -e "  ${GREEN}•${NC} $name"
            count=$((count + 1))
        fi
    done

    echo ""
    echo -e "  Total: ${GREEN}$count${NC} pages"
}

#######################################
# Sync to wiki repo
#######################################
sync_to_repo() {
    if [[ ! -d "$WIKI_REPO" ]]; then
        echo -e "${YELLOW}Wiki repository not found at: $WIKI_REPO${NC}"
        echo ""
        echo "To sync to GitHub Wiki:"
        echo "  1. Clone the wiki repo:"
        echo "     git clone https://github.com/baekenough/oh-my-customcode.wiki.git wiki-repo"
        echo "  2. Run this script again:"
        echo "     ./scripts/sync-wiki.sh"
        return
    fi

    print_header "Syncing to Wiki Repository"

    # Copy all wiki pages
    cp "$WIKI_SOURCE"/*.md "$WIKI_REPO/"

    echo ""
    echo -e "  ${GREEN}✓${NC} Copied wiki pages to $WIKI_REPO"
    echo ""
    echo "  Next steps:"
    echo "    cd $WIKI_REPO"
    echo "    git add ."
    echo "    git commit -m 'Update wiki pages'"
    echo "    git push"
}

#######################################
# Main
#######################################
main() {
    validate
    list_pages
    sync_to_repo

    print_header "Done"
    echo ""
    echo -e "${GREEN}  Wiki sync complete!${NC}"
    echo ""
}

main

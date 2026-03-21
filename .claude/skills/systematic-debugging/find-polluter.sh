#!/usr/bin/env bash
# find-polluter.sh — Binary search for test pollution source
# Source: https://github.com/tmdgusya/engineering-disciplines (MIT License)
#
# Usage: ./find-polluter.sh <test-runner-cmd> <failing-test-pattern>
# Example: ./find-polluter.sh "bun test" "should not have side effects"
#
# How it works:
# 1. Runs all tests to confirm the failure exists
# 2. Binary searches through the test list to find which test causes pollution
# 3. Reports the polluter and its position in the test order
#
# Requirements: Test runner must support running specific test files
# Works with: jest, vitest, bun test, mocha

set -euo pipefail

# Configuration
TEST_CMD="${1:-bun test}"
FAILING_TEST="${2:-}"
TIMEOUT="${3:-60}"  # seconds per test run

if [[ -z "$FAILING_TEST" ]]; then
  echo "Usage: $0 <test-runner-cmd> <failing-test-pattern> [timeout-seconds]"
  echo "Example: $0 'bun test' 'should not have side effects' 60"
  exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Step 1: Collect all test files
log_info "Collecting test files..."
mapfile -t ALL_TEST_FILES < <(find . -name "*.test.ts" -o -name "*.test.js" -o -name "*.spec.ts" -o -name "*.spec.js" | grep -v node_modules | sort)

if [[ ${#ALL_TEST_FILES[@]} -eq 0 ]]; then
  log_error "No test files found"
  exit 1
fi

log_info "Found ${#ALL_TEST_FILES[@]} test files"

# Step 2: Confirm the failure exists when running all tests
log_info "Confirming failure exists with full test suite..."
if timeout "$TIMEOUT" bash -c "$TEST_CMD 2>&1" | grep -q "$FAILING_TEST"; then
  if timeout "$TIMEOUT" bash -c "$TEST_CMD 2>&1" | grep -q "FAIL\|✗\|× "; then
    log_info "Failure confirmed in full suite"
  else
    log_warn "Test pattern found but no failures detected - check pattern matches failing test"
  fi
else
  log_error "Failing test pattern '$FAILING_TEST' not found in test output"
  log_error "Check that the test exists and the pattern is correct"
  exit 1
fi

# Step 3: Confirm the test passes in isolation
FAILING_TEST_FILE=""
for f in "${ALL_TEST_FILES[@]}"; do
  if grep -l "$FAILING_TEST" "$f" &>/dev/null; then
    FAILING_TEST_FILE="$f"
    break
  fi
done

if [[ -z "$FAILING_TEST_FILE" ]]; then
  log_error "Could not find file containing test: $FAILING_TEST"
  exit 1
fi

log_info "Failing test is in: $FAILING_TEST_FILE"
log_info "Testing in isolation..."

if timeout "$TIMEOUT" bash -c "$TEST_CMD $FAILING_TEST_FILE 2>&1" | grep -q "FAIL\|✗\|× "; then
  log_warn "Test fails even in isolation - this is not a pollution issue"
  log_warn "The test itself has a bug, not pollution from another test"
  exit 0
else
  log_info "Test passes in isolation - pollution confirmed"
fi

# Step 4: Binary search for the polluter
# Remove the failing test file from the list of candidates
CANDIDATE_FILES=()
for f in "${ALL_TEST_FILES[@]}"; do
  if [[ "$f" != "$FAILING_TEST_FILE" ]]; then
    CANDIDATE_FILES+=("$f")
  fi
done

log_info "Binary searching through ${#CANDIDATE_FILES[@]} candidate files..."

low=0
high=$((${#CANDIDATE_FILES[@]} - 1))
found_polluter=""

while [[ $low -le $high ]]; do
  mid=$(( (low + high) / 2 ))

  # Test with files from 0 to mid, plus the failing test
  SUBSET=("${CANDIDATE_FILES[@]:0:$((mid + 1))}" "$FAILING_TEST_FILE")

  log_info "Testing subset of $((mid + 1)) files (indices 0-$mid) + failing test..."

  # Build file list for the test command
  FILE_LIST="${SUBSET[*]}"

  if timeout "$TIMEOUT" bash -c "$TEST_CMD $FILE_LIST 2>&1" | grep -q "FAIL\|✗\|× "; then
    log_info "Failure reproduced with subset 0-$mid"
    high=$((mid - 1))
    found_polluter="${CANDIDATE_FILES[$mid]}"
  else
    log_info "No failure with subset 0-$mid, polluter is in higher range"
    low=$((mid + 1))
  fi
done

# Step 5: Report results
echo ""
echo "=========================================="
if [[ -n "$found_polluter" ]]; then
  log_info "POLLUTER FOUND: $found_polluter"
  echo ""
  echo "This test file causes '$FAILING_TEST' to fail when run before it."
  echo ""
  echo "To verify:"
  echo "  $TEST_CMD $found_polluter $FAILING_TEST_FILE"
  echo ""
  echo "Next steps:"
  echo "  1. Open $found_polluter"
  echo "  2. Look for: global state mutations, missing afterEach/afterAll cleanup"
  echo "  3. Check for: database records not deleted, files not cleaned up"
  echo "  4. Check for: environment variables set but not restored"
  echo "  5. Add proper cleanup in afterEach/afterAll"
else
  log_warn "Polluter not found via binary search"
  log_warn "This may happen if multiple tests together cause the pollution"
  log_warn "Try running subsets manually to narrow down"
fi
echo "=========================================="

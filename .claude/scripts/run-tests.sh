#!/bin/bash
# run-tests.sh - ONDC UCP Seller Portal
#
# Purpose: Run Vitest tests with coverage
#
# CUSTOMIZED FOR:
# - Vitest + jsdom
# - React Testing Library
# - TypeScript
#
# Usage: ./run-tests.sh [--coverage|--watch]

set -e

COVERAGE=false
WATCH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --coverage)
      COVERAGE=true
      shift
      ;;
    --watch)
      WATCH=true
      shift
      ;;
    *)
      echo "Usage: $0 [--coverage] [--watch]"
      exit 1
      ;;
  esac
done

echo "=== Running Tests ==="

if [ "$COVERAGE" = true ]; then
  echo "Running tests with coverage..."
  npm run test:coverage
  TEST_EXIT=$?
elif [ "$WATCH" = true ]; then
  echo "Running tests in watch mode..."
  npm run test:watch
  TEST_EXIT=$?
else
  echo "Running tests..."
  npm run test
  TEST_EXIT=$?
fi

# Coverage summary
if [ "$COVERAGE" = true ] && [ $TEST_EXIT -eq 0 ]; then
  echo ""
  echo "Coverage report generated in coverage/ directory"
fi

exit $TEST_EXIT

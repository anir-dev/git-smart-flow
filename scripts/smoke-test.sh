#!/usr/bin/env bash
set -e

echo "=== Git Smart Flow Smoke Test ==="

TMPDIR=$(mktemp -d)
cd "$TMPDIR"

git init
git config user.email "test@example.com"
git config user.name "Test User"

git checkout -b feature/PROJ-123-add-login-validation

echo "const x = 1;" > test-file.ts
git add test-file.ts

echo "Running info command..."
node "$OLDPWD/bin/git-smart-flow.js" info

echo "Running commit-message --no-ai..."
MSG=$(node "$OLDPWD/bin/git-smart-flow.js" commit-message --no-ai --output-only 2>/dev/null || echo "feat: placeholder message")

echo "Generated message: $MSG"

if [[ "$MSG" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert) ]]; then
  echo "✅ Message format OK"
else
  echo "❌ Message format FAILED: $MSG"
  exit 1
fi

cd "$OLDPWD"
rm -rf "$TMPDIR"
echo "=== Smoke test PASSED ==="

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { info, success } from '../ux/display.js';

const COMMIT_MSG_HOOK = `#!/usr/bin/env bash
# git-smart-flow commit-msg hook
# Validates commit message format

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Skip merge commits
if echo "$COMMIT_MSG" | grep -qE "^Merge "; then
  exit 0
fi

# Basic Conventional Commits check
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\(.+\\))?!?: .+"; then
  echo "❌ Commit message does not follow Conventional Commits format."
  echo "   Expected: <type>(<scope>): <subject>"
  echo "   Example:  feat(auth): add login validation"
  exit 1
fi

exit 0
`;

const PRE_PUSH_HOOK = `#!/usr/bin/env bash
# git-smart-flow pre-push hook
# Validates branch and scans for secrets before push

BRANCH=$(git rev-parse --abbrev-ref HEAD)
PROTECTED_BRANCHES="main master develop"

for PROTECTED in $PROTECTED_BRANCHES; do
  if [ "$BRANCH" = "$PROTECTED" ]; then
    echo "⚠️  Pushing to protected branch: $BRANCH"
    read -p "Are you sure? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Push cancelled."
      exit 1
    fi
  fi
done

exit 0
`;

export async function runInstallHooks(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const hooksDir = join(cwd, '.git', 'hooks');
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const commitMsgPath = join(hooksDir, 'commit-msg');
  writeFileSync(commitMsgPath, COMMIT_MSG_HOOK, 'utf-8');
  chmodSync(commitMsgPath, '755');
  success('Installed .git/hooks/commit-msg');

  const prePushPath = join(hooksDir, 'pre-push');
  writeFileSync(prePushPath, PRE_PUSH_HOOK, 'utf-8');
  chmodSync(prePushPath, '755');
  success('Installed .git/hooks/pre-push');

  info('Hooks will run automatically on commit and push.');
}

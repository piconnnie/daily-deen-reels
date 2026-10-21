#!/usr/bin/env bash
# Commits the given paths to the default branch with rebase-and-retry, so
# approval/publish/insight updates from parallel workflows don't clobber each other.
#   scripts/daily/commit-to-main.sh "message" path [path...]
set -euo pipefail
MSG="$1"; shift
BRANCH="${DEFAULT_BRANCH:-main}"
git config user.name "deen-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add "$@"
if git diff --cached --quiet; then echo "Nothing to commit"; exit 0; fi
git commit -m "$MSG" --quiet
for i in 1 2 3 4 5; do
  if git pull --rebase --quiet origin "$BRANCH" && git push --quiet origin "HEAD:$BRANCH"; then
    echo "Committed to $BRANCH: $MSG"; exit 0
  fi
  echo "Push race; retrying ($i)"; sleep $((i * 3))
done
echo "Could not push to $BRANCH"; exit 1

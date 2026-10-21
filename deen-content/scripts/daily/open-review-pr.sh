#!/usr/bin/env bash
# Commits a reel's content + archive to branch reel/<id> and opens (or updates)
# the review PR. Merging the PR is the approval.
#   scripts/daily/open-review-pr.sh <reelId>
set -euo pipefail
ID="$1"
BRANCH="reel/$ID"
BODY="output/daily/$ID.pr.md"
HOOK=$(node -e "const r=require('./src/content/reels/$ID.json');process.stdout.write(r.hooks[r.selectedHook].text)")
ATTN=$(node -e "const s=require('./archive/$ID/state.json');process.stdout.write(s.needsAttention?'yes':'no')")

git config user.name "deen-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "$BRANCH" ]; then
  git checkout -b "$BRANCH"
fi
git add "src/content/reels/$ID.json" "archive/$ID"
git commit -m "reel: $ID — $HOOK" --quiet || echo "Nothing new to commit"
git push origin "$BRANCH" --quiet

gh label create daily-reel --color 5B5CF0 --description "Daily reel awaiting review" --force > /dev/null
gh label create needs-attention --color FFC66D --description "Editor pass flagged issues" --force > /dev/null
EXISTING=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [ -n "$EXISTING" ]; then
  gh pr edit "$EXISTING" --body-file "$BODY"
  echo "Updated PR #$EXISTING"
else
  LABELS="daily-reel"
  [ "$ATTN" = "yes" ] && LABELS="daily-reel,needs-attention"
  gh pr create --head "$BRANCH" --title "🎬 $HOOK" --body-file "$BODY" --label "$LABELS"
fi

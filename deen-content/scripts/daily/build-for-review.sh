#!/usr/bin/env bash
# Render → package → full QA → archive → upload preview assets to a GitHub
# pre-release. Used by the daily workflow and by the re-render-on-edit workflow.
#   scripts/daily/build-for-review.sh <reelId>
# Needs: GH_TOKEN, GITHUB_REPOSITORY. Run from deen-content/.
set -euo pipefail
ID="$1"

# Run a step; on failure, surface its last lines (and any QA FAIL lines) as
# GitHub annotations so the cause is visible on the run page without logs.
step() {
  local name="$1"; shift
  local log; log=$(mktemp)
  if "$@" 2>&1 | tee "$log"; then rm -f "$log"; return 0; fi
  local fails; fails=$(grep -E '^FAIL' "$log" | head -8 || true)
  local tail; tail=$(grep -vE '^\s*$' "$log" | tail -12)
  local msg="${fails:-$tail}"
  msg="${msg//'%'/'%25'}"; msg="${msg//$'\r'/}"; msg="${msg//$'\n'/'%0A'}"
  echo "::error title=${name} failed for ${ID}::${msg}"
  rm -f "$log"
  return 1
}

step "Sources" node scripts/sources/cli.mjs apply "$ID"   # quotes re-pulled from the pinned datasets
step "Render" node scripts/render-content.mjs "$ID"
step "Package" node scripts/build-package.mjs "$ID"
step "QA" node scripts/validate-content.mjs "$ID"
step "Archive" node scripts/daily/archive.mjs "$ID" --repo "$GITHUB_REPOSITORY"

TAG="reel-$ID"
cp "output/qa/$ID/contact-sheet.png" "output/qa/$ID/$ID-contact-sheet.png"
ASSETS=("output/reels/$ID.mp4" "output/covers/$ID.jpg" "output/qa/$ID/$ID-contact-sheet.png")
if gh release view "$TAG" > /dev/null 2>&1; then
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
else
  gh release create "$TAG" "${ASSETS[@]}" --prerelease \
    --title "Reel $ID (awaiting review)" \
    --notes "Preview assets for review. Not posted yet. Approve by merging the review PR."
fi

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
  mkdir -p output/daily && echo "$name" > "output/daily/$ID.failed-step"
  rm -f "$log"
  return 1
}

step "Sources" node scripts/sources/cli.mjs apply "$ID"   # quotes re-pulled from the pinned datasets
step "Render" node scripts/render-content.mjs "$ID"
step "Package" node scripts/build-package.mjs "$ID"
step "QA" node scripts/validate-content.mjs "$ID"
step "Archive" node scripts/daily/archive.mjs "$ID" --repo "$GITHUB_REPOSITORY"

TAG="reel-$ID"
# Asset list written by archive.mjs (reel: MP4 + cover + contact sheet;
# carousel/story: every slide JPEG + cover + contact sheet).
mapfile -t ASSETS < "output/daily/$ID.assets.txt"
upload() {
  if gh release view "$TAG" > /dev/null 2>&1; then
    gh release upload "$TAG" "${ASSETS[@]}" --clobber
  else
    gh release create "$TAG" "${ASSETS[@]}" --prerelease \
      --title "$ID (awaiting review)" \
      --notes "Preview assets for review. Not posted yet. Approve by merging the review PR."
  fi
}
for i in 1 2 3; do
  upload && exit 0
  echo "::warning::Release upload attempt $i failed, retrying"; sleep $((i * 15))
done
mkdir -p output/daily && echo "Upload" > "output/daily/$ID.failed-step"
exit 1

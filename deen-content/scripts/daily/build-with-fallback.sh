#!/usr/bin/env bash
# Builds today's post and, if it can't be posted automatically, falls back to
# the next queue draft so one bad draft never stalls the page.
#   scripts/daily/build-with-fallback.sh <reelId> <writerMode>
# A draft "can't be posted automatically" when render/QA/archive fails or when
# QA holds it for a person (needs-attention). Such a queue draft is moved to
# data/queue/held/ on main (so later runs and the refill planner skip it) and an
# issue explains why. Writes id=<reelId> to $GITHUB_OUTPUT on success.
# Needs: GH_TOKEN, GITHUB_REPOSITORY. Run from deen-content/.
set -uo pipefail
ID="$1"
MODE="${2:-queue}"
TRIES="${DEEN_BUILD_TRIES:-3}"
HELD=()

queue_id() { node -e "try{process.stdout.write(require('./src/content/reels/$1.json').brief?.queueId||'')}catch{}"; }
needs_attention() { node -e "try{process.exit(require('./archive/$1/state.json').needsAttention?0:1)}catch{process.exit(1)}"; }

# Undo everything a failed attempt left behind, so the next draft gets the same number.
discard() {
  local id="$1"
  rm -rf "src/content/reels/$id.json" "archive/$id" "output/daily/$id".* "output/qa/$id" "public/audio/$id-bed.wav"
  gh release delete "reel-$id" --yes --cleanup-tag > /dev/null 2>&1 || true
}

# Move a failed queue draft to data/queue/held/ on main (separate worktree, so
# today's review branch is untouched). Retries if main moved meanwhile.
hold_on_main() {
  local qid="$1" reason="$2" wt rc=1
  wt=$(mktemp -d)
  for i in 1 2 3 4 5; do
    git fetch --quiet --depth 1 origin main || { sleep $((i * 5)); continue; }
    if [ -d "$wt/.git" ] || [ -f "$wt/.git" ]; then git -C "$wt" checkout --quiet --detach --force FETCH_HEAD
    else git worktree add --quiet --detach "$wt" FETCH_HEAD || break; fi
    if [ ! -f "$wt/deen-content/data/queue/$qid.json" ]; then rc=0; break; fi
    mkdir -p "$wt/deen-content/data/queue/held"
    git -C "$wt" mv "deen-content/data/queue/$qid.json" "deen-content/data/queue/held/$qid.json"
    git -C "$wt" -c user.name=deen-bot -c user.email=41898282+github-actions[bot]@users.noreply.github.com \
      commit --quiet -m "queue: hold $qid (could not be posted automatically)" -m "$reason"
    if git -C "$wt" push --quiet origin HEAD:main; then rc=0; break; fi
    sleep $((i * 5))
  done
  git worktree remove --force "$wt" > /dev/null 2>&1 || true
  return $rc
}

report_hold() {
  local qid="$1" reason="$2"
  gh label create queue-held --color D93F0B --description "A queue draft was skipped automatically" --force > /dev/null 2>&1 || true
  gh issue create --label queue-held --title "Queue draft $qid was skipped automatically" \
    --body "The daily build could not post \`$qid\` without a person, so it moved the draft to \`deen-content/data/queue/held/\` and used the next draft instead. Nothing needs doing for today's post.

Reason: $reason

Run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}

To use it later, fix the draft and move it back to \`data/queue/\`." > /dev/null 2>&1 || true
}

for attempt in $(seq 1 "$TRIES"); do
  echo "::group::Attempt $attempt: $ID"
  reason=""
  rm -f "output/daily/$ID.failed-step"
  ok=no
  if scripts/daily/build-for-review.sh "$ID"; then ok=yes
  elif [ "$(cat "output/daily/$ID.failed-step" 2>/dev/null)" != QA ]; then
    # Not a content problem (network, runner, browser): try the same draft once more.
    echo "::warning::Build step '$(cat "output/daily/$ID.failed-step" 2>/dev/null || echo unknown)' failed for $ID; retrying it once."
    sleep 30
    rm -f "output/daily/$ID.failed-step"
    scripts/daily/build-for-review.sh "$ID" && ok=yes
  fi
  if [ "$ok" = yes ]; then
    if needs_attention "$ID"; then
      reason="QA held it for a person: $(node -e "process.stdout.write((require('./archive/$ID/state.json').attentionReasons||[]).join('; '))")"
    fi
  else
    reason="the '$(cat "output/daily/$ID.failed-step" 2>/dev/null || echo build)' step failed (see the run's annotations)"
  fi
  echo "::endgroup::"
  if [ -z "$reason" ]; then
    echo "id=$ID" >> "${GITHUB_OUTPUT:-/dev/null}"
    echo "Built $ID on attempt $attempt."
    exit 0
  fi

  echo "::warning title=Falling back::$ID — $reason"
  if [ "$MODE" = existing ]; then echo "::error::A manually chosen reel failed; not falling back."; exit 1; fi
  QID=$(queue_id "$ID")
  FAILED_STEP=$(cat "output/daily/$ID.failed-step" 2>/dev/null || true)
  discard "$ID"
  if [ -n "$QID" ]; then
    HELD+=("$QID")
    case "$FAILED_STEP" in
      Archive|Upload)
        # Infrastructure, not the draft: skip it for this run only; it stays queued.
        echo "::warning::$QID skipped for this run only (step $FAILED_STEP failed)." ;;
      *)
        if hold_on_main "$QID" "$reason"; then report_hold "$QID" "$reason"
        else echo "::warning::Could not move $QID to held/ on main; it is only skipped for this run."; fi ;;
    esac
  fi
  [ "$attempt" -lt "$TRIES" ] || break
  SKIP=$(IFS=,; echo "${HELD[*]}")
  ID=$(node scripts/daily/dequeue.mjs --skip "$SKIP" | tail -n1) || { echo "::error::No other queue draft to fall back to."; exit 1; }
  [ -n "$ID" ] || { echo "::error::Dequeue returned no reel."; exit 1; }
  echo "Next draft: $ID"
done
echo "::error::No draft could be built after $TRIES attempts; the next scheduled run will try again."
exit 1

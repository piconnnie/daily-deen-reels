#!/usr/bin/env bash
# End-to-end test of the DEEN GitHub workflows, run locally:
#   - a bare git repo plays "GitHub" (seeded from the current working tree)
#   - fake-gh.mjs plays the gh CLI (PRs, labels, releases, comments)
#   - mock-instagram.mjs plays the Instagram Graph API
#   - run-workflow.mjs executes the real workflow YAML step by step
# Writers are mocked (DEEN_MOCK_DRAFT for the API writer, mock-claude-code.sh
# for the Claude Code action); the queue writer and everything after the
# writer run the real code path.
#
#   scripts/test/harness/e2e.sh [mock-draft.json]   (default: scripts/test/fixtures/mock-draft.json)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../../../.." && pwd)"          # repo root (contains .github/)
DRAFT_ARG="${1:-$HERE/../fixtures/mock-draft.json}"
DRAFT="$(cd "$(dirname "$DRAFT_ARG")" && pwd)/$(basename "$DRAFT_ARG")"
# Verified-source datasets: use the local cache (run `npm run sources:fetch` once); never download in tests.
export DEEN_SOURCES_DIR="${DEEN_SOURCES_DIR:-$SRC/deen-content/.cache/sources}" DEEN_SOURCES_OFFLINE=1
E2E="${E2E_DIR:-$(mktemp -d)}"
# Recitation audio: stand-in tones (test only), generated per referenced ayah.
export DEEN_RECITATION_DIR="$E2E/recitations"
rm -rf "$E2E" && mkdir -p "$E2E"/{bin,releases}
node "$SRC/deen-content/scripts/test/make-recitation-fixtures.mjs" "$E2E/recitations" > /dev/null
export GH_FAKE_STATE="$E2E/gh-state.json" GH_FAKE_RELEASES="$E2E/releases"
# PRs opened by the test look like they were opened on an earlier day, so the
# one-build-per-day guard lets each scheduled build under test run (3g tests the guard).
export GH_FAKE_NOW="2026-01-01T06:00:00Z"
# Each workflow run starts from a clean checkout of main, like a fresh GitHub runner.
fresh() { git -C "$W" reset -q --hard 2>/dev/null; git -C "$W" clean -qfdx 2>/dev/null; git -C "$W" checkout -q main 2>/dev/null; git -C "$W" pull -q origin main 2>/dev/null; true; }
run_wf() { fresh; node "$HERE/run-workflow.mjs" "$@"; }
RUN="run_wf"
WF="$SRC/.github/workflows"
PASS=0; FAIL=0
check() { if eval "$2"; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1"; FAIL=$((FAIL+1)); fi; }
ghq() { node -e "const s=require('$GH_FAKE_STATE'); console.log(String($1))"; }

# --- fake gh on PATH
printf '#!/usr/bin/env bash\nexec node %s "$@"\n' "$HERE/fake-gh.mjs" > "$E2E/bin/gh"; chmod +x "$E2E/bin/gh"
export PATH="$E2E/bin:$PATH"

# --- "GitHub": bare remote seeded from the working tree (tracked + new files)
mkdir "$E2E/seed"
( cd "$SRC" && git ls-files -co --exclude-standard -z | grep -zv '^deen-content/output/' | xargs -0 -I{} cp --parents "{}" "$E2E/seed/" )
# Tests use the three fixture drafts q001–q003 (reel, carousel, reel) so numbering stays deterministic.
find "$E2E/seed/deen-content/data/queue" -name '*.json' ! -name 'q00[1-3]-*' -delete
# ...and start from the sample reel, not whatever the live repo has published since.
find "$E2E/seed/deen-content/src/content/reels" -name 'deen-*.json' ! -name 'deen-001-*' -delete
rm -rf "$E2E/seed/deen-content/archive" "$E2E/seed/deen-content/data/performance/index.json"
# The sample reel on main carries the real recitation's file hashes from its live
# post; the test uses stand-in audio, so let the pipeline re-fit it (a writer-chosen
# recitation ref is kept). Without this the hash guard rightly refuses the audio.
for f in "$E2E"/seed/deen-content/src/content/reels/*.json; do
  node -e 'const fs=require("fs"),f=process.argv[1],r=JSON.parse(fs.readFileSync(f));if(r.recitation&&r.recitation.files){r.recitation=r.recitation.chosen==="writer"?{ref:r.recitation.ref,...(r.recitation.reciter?{reciter:r.recitation.reciter}:{})}:undefined;fs.writeFileSync(f,JSON.stringify(r,null,2)+"\n")}' "$f"
done
( cd "$E2E/seed" && git init -q -b main && git add -A && git -c user.name=seed -c user.email=s@x commit -qm seed )
git clone -q --bare "$E2E/seed" "$E2E/remote.git"
git clone -q "$E2E/remote.git" "$E2E/work"
git clone -q "$E2E/remote.git" "$E2E/user"   # Faraz's clone, for edits and merges
for d in work user; do git -C "$E2E/$d" config user.name "faraz"; git -C "$E2E/$d" config user.email "f@x"; done
W="$E2E/work"

# --- mock Instagram
node "$HERE/mock-instagram.mjs" "$E2E/ig-port" "$E2E/ig-log.jsonl" & IGPID=$!
trap 'kill $IGPID 2>/dev/null' EXIT
for _ in $(seq 1 50); do [ -s "$E2E/ig-port" ] && break; sleep 0.1; done
IG="http://127.0.0.1:$(cat "$E2E/ig-port")"
export IG_GRAPH_HOST="$IG" DEEN_IG_POLL_MS=20
IGSECRETS='{"IG_ACCESS_TOKEN":"SECRET_TEST_TOKEN","IG_USER_ID":"IGID"}'

echo "== 1. Review an existing reel (workflow_dispatch reel_id)"
$RUN "$WF/deen-daily-reel.yml" --repo "$W" --event workflow_dispatch --inputs '{"reel_id":"deen-001-hardship-is-never-alone"}'
check "PR #1 opened for reel 001 with daily-reel label" "[ \"\$(ghq 's.prs[0]?.headRefName')\" = reel/deen-001-hardship-is-never-alone ] && [ \"\$(ghq 's.prs[0].labels.includes(\"daily-reel\")')\" = true ]"
check "Pre-release with MP4, JPEG cover and contact sheet" "[ \"\$(ghq 's.releases[\"reel-deen-001-hardship-is-never-alone\"].files.length')\" = 3 ] && [ \"\$(ghq 's.releases[\"reel-deen-001-hardship-is-never-alone\"].prerelease')\" = true ]"
check "Review branch pushed with archive/state.json" "git -C '$W' ls-remote --exit-code origin reel/deen-001-hardship-is-never-alone >/dev/null && git -C '$W' show origin/reel/deen-001-hardship-is-never-alone:deen-content/archive/deen-001-hardship-is-never-alone/state.json >/dev/null 2>&1 || (git -C '$W' fetch -q origin && git -C '$W' show origin/reel/deen-001-hardship-is-never-alone:deen-content/archive/deen-001-hardship-is-never-alone/state.json >/dev/null)"
check "PR body has preview images, MP4 link and QA" "ghq 's.prs[0].body' | grep -q 'Watch and listen to the reel' && ghq 's.prs[0].body' | grep -q 'Automated QA'"
git -C "$W" checkout -q main

echo "== 2. Scheduled daily run writes a NEW reel (API writer opted in, mock model)"
DEEN_MOCK_DRAFT="$DRAFT" $RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --secrets '{"ANTHROPIC_API_KEY":"test"}' --vars '{"DEEN_WRITER":"api"}'
NEWID=$(ghq 's.prs[1]?.headRefName?.replace("reel/","") ?? ""')
check "PR #2 opened for a new reel ($NEWID)" "[ -n '$NEWID' ] && [[ '$NEWID' == deen-002-* ]]"
check "Planner picked the neediest pillar's first topic (t001)" "git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q '\"backlogId\": \"t001\"'"
check "Quote pulled from the verified dataset (Qur'an 2:186, quran.com link)" "git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q 'https://quran.com/2/186' && git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q 'indeed I am near'"
check "Recitation of the quoted ayah recorded with reciter and SHA-256" "git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | node -e 'const r=JSON.parse(require(\"fs\").readFileSync(0)).recitation; process.exit(r.ref===\"quran:2:186\" && r.mode===\"scene\" && /^[0-9a-f]{64}$/.test(r.files[0].sha256) ? 0 : 1)'"
check "PR names the recitation and the caption credits the reciter" "ghq 's.prs[1].body' | grep -q 'Recitation: \[Qur.an 2:186' && ghq 's.prs[1].body' | grep -q '• Recitation: Qur.an 2:186'"
check "PR asks the reviewer to check each source" "ghq 's.prs[1].body' | grep -q 'Check the sources before approving' && ghq 's.prs[1].body' | grep -q 'quran.com/2/186'"
check "Only the new reel's files are on its branch" "[ \"\$(git -C '$W' diff --name-only origin/main origin/reel/$NEWID | grep -c '/src/content/reels/')\" = 1 ]"
git -C "$W" checkout -q main

echo "== 3. Review backlog gate"
$RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --secrets '{"ANTHROPIC_API_KEY":"test"}' --vars '{"DEEN_MAX_OPEN_REVIEWS":"2","DEEN_WRITER":"api"}'
check "No third PR when 2 reviews are open and the limit is 2" "[ \"\$(ghq 's.prs.length')\" = 2 ]"

MOCKCC="$HERE/mock-claude-code.sh"
Q="$W/deen-content/data/queue"
OPEN10='{"DEEN_MAX_OPEN_REVIEWS":"10"}'
SUB10='{"DEEN_MAX_OPEN_REVIEWS":"10","DEEN_WRITER":"subscription"}'
reel_of_pr() { ghq "s.prs[$1]?.headRefName?.replace('reel/','') ?? ''"; }
reel_json() { git -C "$W" show "origin/reel/$1:deen-content/src/content/reels/$1.json"; }

echo "== 3b. Writer = Claude subscription (opted in via DEEN_WRITER) (Claude Code action), draft passes"
git -C "$W" checkout -q main
HARNESS_CLAUDE_ACTION="$MOCKCC" HARNESS_DRAFT="$Q/q003-dua-against-useless-knowledge.json" \
  $RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --secrets '{"CLAUDE_CODE_OAUTH_TOKEN":"oauth-test"}' --vars "$SUB10" | tee "$E2E/s3b.log" > /dev/null
git -C "$W" fetch -q origin; SUBID=$(reel_of_pr 2)
check "Subscription mode chosen when DEEN_WRITER=subscription and the token is set" "grep -q 'Writer: subscription' '$E2E/s3b.log' || grep -q \"Claude Code writes today's reel\" '$E2E/s3b.log'"
check "PR #3 opened for the Claude Code reel ($SUBID)" "[[ '$SUBID' == deen-003-* ]]"
check "Reel records writer = claude-code and the planner's topic" "reel_json '$SUBID' | grep -q '\"writer\": \"claude-code:' && reel_json '$SUBID' | grep -q '\"backlogId\": \"t'"
check "Editor verdict from review.json shown in the PR" "ghq 's.prs[2].body' | grep -q 'Verdict: \*\*pass\*\*'"
git -C "$W" checkout -q main

echo "== 3c. Claude Code fails (e.g. plan limit) → falls back to the queue"
HARNESS_CLAUDE_ACTION="$MOCKCC" HARNESS_CLAUDE_FAIL=1 \
  $RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --secrets '{"CLAUDE_CODE_OAUTH_TOKEN":"oauth-test"}' --vars "$SUB10" | tee "$E2E/s3c.log" > /dev/null
git -C "$W" fetch -q origin; FBID=$(reel_of_pr 3)
check "Fallback produced PR #4 ($FBID)" "[[ '$FBID' == deen-004-* ]]"
check "Queue used the first draft, q001" "reel_json '$FBID' | grep -q '\"queueId\": \"q001-when-life-feels-uncertain\"'"
check "Reel records writer = queue" "reel_json '$FBID' | grep -q '\"writer\": \"queue\"'"
git -C "$W" checkout -q main

echo "== 3d. Default (no DEEN_WRITER) → free queue, even with paid secrets present"
$RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --secrets '{"ANTHROPIC_API_KEY":"test","CLAUDE_CODE_OAUTH_TOKEN":"oauth-test"}' --vars "$OPEN10" | tee "$E2E/s3d.log" > /dev/null
git -C "$W" fetch -q origin; QID=$(reel_of_pr 4)
check "Queue mode produced PR #5 ($QID) without any secrets" "[[ '$QID' == deen-005-* ]]"
check "Used q002, a carousel" "reel_json '$QID' | grep -q '\"queueId\": \"q002-one-ayah-ash-sharh\"' && reel_json '$QID' | grep -q '\"kind\": \"carousel\"'"
check "Carousel PR shows every slide and its release holds the slide JPEGs" "[ \"\$(ghq 's.prs[4].body.split(\"-slide-\").length - 1')\" -ge 12 ] && [ \"\$(ghq 's.releases[\"reel-$QID\"].files.filter(f=>f.includes(\"-slide-\")).length')\" = 6 ]"
check "Carousel PR title marks the kind" "ghq 's.prs[4].title' | grep -q '🖼️'"
check "Paid writers stayed off without the opt-in" "reel_json '$QID' | grep -q '\"writer\": \"queue\"' && ! grep -q 'mock: wrote draft.json' '$E2E/s3d.log'"
check "One open queue-low issue, updated by later runs" "[ \"\$(ghq 's.issues.filter(i=>i.labels?.includes(\"queue-low\")).length')\" = 1 ] && [ \"\$(ghq 's.issues.find(i=>i.labels?.includes(\"queue-low\")).comments.length')\" -ge 1 ]"
git -C "$W" checkout -q main

echo "== 3e. Queue empty and no writer → clear failure, no PR"
$RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --vars "$OPEN10" | tee "$E2E/s3e.log" > /dev/null
check "Run fails with a clear 'queue exhausted' message and opens no PR" "grep -qE 'content queue is empty|No queued draft passed' '$E2E/s3e.log' && [ \"\$(ghq 's.prs.length')\" = 5 ]"
git -C "$W" checkout -q main

echo "== 3f. Post timer: starts publishing at the slot without relying on GitHub's cron"
TIMERVARS='{"DEEN_MAX_PER_DAY":"10"}'
ndisp() { ghq "(s.dispatches ?? []).length"; }
lastdisp() { ghq "(s.dispatches ?? []).at(-1)?.workflow ?? ''"; }
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event workflow_run --event-json '{"workflow_run":{"name":"DEEN · Daily reel"}}' --vars '{"DEEN_MAX_PER_DAY":"10","DEEN_POST_TIME":"23:59","DEEN_TIMER_MAX_WAIT_MIN":"0"}' | tee "$E2E/s3f1.log" > /dev/null
check "Slot far away: the timer hands over to a fresh timer (jobs can't sleep past 6h)" "grep -q '\"action\":\"wait-then-rearm\"' '$E2E/s3f1.log' && [ \"\$(lastdisp)\" = deen-post-timer.yml ]"
SOON=$(TZ=Asia/Kolkata date -d '+1 min' +%H:%M)
T0=$(date +%s); before=$(ndisp)
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event workflow_dispatch --vars "{\"DEEN_MAX_PER_DAY\":\"10\",\"DEEN_POST_TIME\":\"$SOON\"}" | tee "$E2E/s3f2.log" > /dev/null
T1=$(date +%s)
check "Slot within reach: the timer sleeps until $SOON IST, then starts DEEN · Approve & publish" "grep -q '\"action\":\"wait-then-publish\"' '$E2E/s3f2.log' && [ \$((T1 - T0)) -ge 25 ] && [ \"\$(ndisp)\" = \$((before + 1)) ] && [ \"\$(lastdisp)\" = deen-publish.yml ]"
before=$(ndisp)
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event schedule --vars '{"DEEN_MAX_PER_DAY":"10","DEEN_POST_TIME":"00:00"}' | tee "$E2E/s3f3.log" > /dev/null
check "Slot already passed with a post waiting (the 23 Oct case): publish starts right away" "grep -q '\"action\":\"publish-now\"' '$E2E/s3f3.log' && [ \"\$(ndisp)\" = \$((before + 1)) ] && [ \"\$(lastdisp)\" = deen-publish.yml ]"
before=$(ndisp)
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event workflow_run --event-json '{"workflow_run":{"name":"DEEN · Approve & publish"}}' --vars '{"DEEN_MAX_PER_DAY":"10","DEEN_POST_TIME":"00:00"}' | tee "$E2E/s3f4.log" > /dev/null
check "Right after a publish run past the slot: idle (no retry loop)" "grep -q '\"action\":\"idle\"' '$E2E/s3f4.log' && [ \"\$(ndisp)\" = \$before ]"
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event schedule --vars '{"DEEN_MAX_PER_DAY":"10","DEEN_POST_TIME":"00:00","DEEN_AUTO_APPROVE":"false"}' | tee "$E2E/s3f5.log" > /dev/null
check "Auto-approve off and nothing approved: idle" "grep -q '\"action\":\"idle\",\"wait_seconds\":\"0\",\"reason\":\"auto-approve is off' '$E2E/s3f5.log' && [ \"\$(ndisp)\" = \$before ]"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.disabledWorkflows=['deen-publish.yml'];fs.writeFileSync(f,JSON.stringify(s,null,2))"
before=$(ndisp)
$RUN "$WF/deen-post-timer.yml" --repo "$W" --event schedule --vars '{"DEEN_MAX_PER_DAY":"10","DEEN_POST_TIME":"00:00"}' | tee "$E2E/s3f6.log" > /dev/null
check "Posting paused (publish workflow disabled): the timer tries, nothing starts, the run doesn't fail" "grep -q '\"action\":\"publish-now\"' '$E2E/s3f6.log' && grep -q '\[job timer\] success' '$E2E/s3f6.log' && [ \"\$(ndisp)\" = \$before ]"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.disabledWorkflows=[];fs.writeFileSync(f,JSON.stringify(s,null,2))"
git -C "$W" checkout -q main

echo "== 3g. Several backstop build schedules → still one build per day"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[4].createdAt=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(s,null,2))"
$RUN "$WF/deen-daily-reel.yml" --repo "$W" --event schedule --vars "$OPEN10" | tee "$E2E/s3g.log" > /dev/null
check "A later scheduled build the same day skips (today's post already built)" "grep -q '\"built\":\"true\",\"skip\":\"true\"' '$E2E/s3g.log' && [ \"\$(ghq 's.prs.length')\" = 5 ]"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[4].createdAt='2026-01-01T06:00:00Z';fs.writeFileSync(f,JSON.stringify(s,null,2))"
git -C "$W" checkout -q main

echo "== 4. Edit copy inside the PR → automatic re-render"
U="$E2E/user"; git -C "$U" fetch -q origin
git -C "$U" checkout -q -b "reel/$NEWID" "origin/reel/$NEWID"
sed -i 's/Ask Him first\./Call on Him./' "$U/deen-content/src/content/reels/$NEWID.json"
git -C "$U" commit -qam "Tweak takeaway wording" && git -C "$U" push -q origin "reel/$NEWID"
git -C "$W" fetch -q origin
$RUN "$WF/deen-reel-edit.yml" --repo "$W" --event pull_request --event-json "{\"actor\":\"faraz\",\"pull_request\":{\"number\":2,\"head\":{\"ref\":\"reel/$NEWID\",\"repo\":{\"full_name\":\"fake/AI-projects\"}}}}"
check "Release assets replaced after the edit" "[ \"\$(ghq 's.releases[\"reel-$NEWID\"].uploads ?? 0')\" -ge 1 ]"
check "PR description refreshed and comment posted" "[ \"\$(ghq 's.prs[1].edits ?? 0')\" -ge 1 ] && ghq 's.prs[1].comments.join(\"|\")' | grep -q 'Re-rendered'"
check "Edited copy re-rendered (takeaway line updated on the branch)" "git -C '$W' fetch -q origin && git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q 'Call on Him.'"
git -C "$W" checkout -q main

echo "== 4b. An edit that breaks a layout limit is rejected with a PR comment"
git -C "$U" pull -q origin "reel/$NEWID"
sed -i 's/Call on Him\./Call on Him for everything./' "$U/deen-content/src/content/reels/$NEWID.json"
git -C "$U" commit -qam "Too-long line" && git -C "$U" push -q origin "reel/$NEWID"
git -C "$W" fetch -q origin
$RUN "$WF/deen-reel-edit.yml" --repo "$W" --event pull_request --event-json "{\"actor\":\"faraz\",\"pull_request\":{\"number\":2,\"head\":{\"ref\":\"reel/$NEWID\",\"repo\":{\"full_name\":\"fake/AI-projects\"}}}}"
check "Over-long copy fails QA and the PR is told why" "ghq 's.prs[1].comments.join(\"|\")' | grep -q 'failed QA'"
# fix it again
sed -i 's/Call on Him for everything\./Call on Him./' "$U/deen-content/src/content/reels/$NEWID.json"
git -C "$U" commit -qam "Fix length" && git -C "$U" push -q origin "reel/$NEWID"
git -C "$W" fetch -q origin
$RUN "$WF/deen-reel-edit.yml" --repo "$W" --event pull_request --event-json "{\"actor\":\"faraz\",\"pull_request\":{\"number\":2,\"head\":{\"ref\":\"reel/$NEWID\",\"repo\":{\"full_name\":\"fake/AI-projects\"}}}}" > /dev/null
git -C "$W" checkout -q main

echo "== 4c. Edits to sources: unapproved collection rejected; hand-typed quote text overwritten"
git -C "$U" pull -q origin "reel/$NEWID"
sed -i 's/"ref": "quran:2:186"/"ref": "tirmidhi:3479"/' "$U/deen-content/src/content/reels/$NEWID.json"
git -C "$U" commit -qam "Use a Tirmidhi hadith" && git -C "$U" push -q origin "reel/$NEWID"
git -C "$W" fetch -q origin
$RUN "$WF/deen-reel-edit.yml" --repo "$W" --event pull_request --event-json "{\"actor\":\"faraz\",\"pull_request\":{\"number\":2,\"head\":{\"ref\":\"reel/$NEWID\",\"repo\":{\"full_name\":\"fake/AI-projects\"}}}}" | tee "$E2E/s4c.log" > /dev/null
check "A ref outside the approved collections fails before rendering" "grep -q 'not an approved collection' '$E2E/s4c.log' && [ \"\$(ghq 's.prs[1].comments.filter(c=>c.includes(\"failed QA\")).length')\" = 2 ]"
sed -i 's/"ref": "tirmidhi:3479"/"ref": "quran:2:186"/; s/indeed I am near/indeed I am always near/' "$U/deen-content/src/content/reels/$NEWID.json"
git -C "$U" commit -qam "Restore ref, tamper with quote text" && git -C "$U" push -q origin "reel/$NEWID"
git -C "$W" fetch -q origin
$RUN "$WF/deen-reel-edit.yml" --repo "$W" --event pull_request --event-json "{\"actor\":\"faraz\",\"pull_request\":{\"number\":2,\"head\":{\"ref\":\"reel/$NEWID\",\"repo\":{\"full_name\":\"fake/AI-projects\"}}}}" > /dev/null
git -C "$W" fetch -q origin
check "Hand-typed quote text replaced by the dataset text" "! git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q 'always near' && git -C '$W' show origin/reel/$NEWID:deen-content/src/content/reels/$NEWID.json | grep -q 'indeed I am near'"
git -C "$W" checkout -q main

echo "== 5. Merge PR #2 → approval recorded, not yet posted (before slot)"
git -C "$U" fetch -q origin && git -C "$U" checkout -q main && git -C "$U" pull -q origin main
git -C "$U" merge -q --no-ff "origin/reel/$NEWID" -m "Merge reel $NEWID" && git -C "$U" push -q origin main
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[1].state='merged';s.prs[1].mergedBy={login:'faraz'};s.prs[1].mergedAt=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(s,null,2))"
MERGE_EVENT="{\"pull_request\":{\"number\":2,\"merged\":true,\"merged_at\":\"$(date -u +%FT%TZ)\",\"merged_by\":{\"login\":\"faraz\"},\"labels\":[{\"name\":\"daily-reel\"}],\"head\":{\"ref\":\"reel/$NEWID\"}}}"
$RUN "$WF/deen-publish.yml" --repo "$W" --event pull_request --event-json "$MERGE_EVENT" --secrets "$IGSECRETS" --vars '{"DEEN_POST_TIME":"23:59"}'
git -C "$W" fetch -q origin
check "Approval (by faraz) committed to main" "git -C '$W' show origin/main:deen-content/archive/$NEWID/state.json | grep -q '\"approvedBy\": \"faraz\"'"
check "Not posted before the slot" "[ ! -s '$E2E/ig-log.jsonl' ] || ! grep -q media_publish '$E2E/ig-log.jsonl'"
check "PR told when it will post" "ghq 's.prs[1].comments.join(\"|\")' | grep -q 'Approved by @faraz'"

echo "== 6. Scheduled publish after the slot → posted to Instagram"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "{\"DEEN_POST_TIME\":\"00:00\",\"DEEN_PUBLIC_BASE_URL\":\"$IG/assets\"}"
git -C "$W" fetch -q origin
check "media_publish called exactly once" "[ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = 1 ]"
check "Container had REELS, caption, cover_url and video_url" "grep '/IGID/media\"' '$E2E/ig-log.jsonl' | grep -q '\"media_type\":\"REELS\"' && grep '/IGID/media\"' '$E2E/ig-log.jsonl' | grep -q 'cover_url' && grep '/IGID/media\"' '$E2E/ig-log.jsonl' | grep -q 'video_url'"
check "Published state + permalink committed to main" "git -C '$W' show origin/main:deen-content/archive/$NEWID/state.json | grep -q '\"status\": \"published\"'"
check "Release promoted from pre-release" "[ \"\$(ghq 's.releases[\"reel-$NEWID\"].prerelease')\" = false ]"
check "Permalink commented on the PR" "ghq 's.prs[1].comments.join(\"|\")' | grep -q 'instagram.com/p/'"
check "Token never in workflow output or git" "! git -C '$W' log -p origin/main | grep -q SECRET_TEST_TOKEN"

echo "== 7. Second publish run the same day → nothing more is posted"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars '{"DEEN_POST_TIME":"00:00"}'
check "Still exactly one post" "[ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = 1 ]"

echo "== 7b. A merge whose own run was cancelled is still recorded by the next hourly run"
SUBREEL=$(reel_of_pr 2)
git -C "$U" fetch -q origin && git -C "$U" checkout -q main && git -C "$U" pull -q origin main
git -C "$U" merge -q --no-ff "origin/reel/$SUBREEL" -m "Merge reel $SUBREEL" && git -C "$U" push -q origin main
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));Object.assign(s.prs[2],{state:'merged',mergedBy:{login:'faraz'},mergedAt:new Date().toISOString()});fs.writeFileSync(f,JSON.stringify(s,null,2))"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars '{"DEEN_POST_TIME":"23:59"}' > /dev/null
git -C "$W" fetch -q origin
check "Approval for $SUBREEL recorded without its merge run" "git -C '$W' show origin/main:deen-content/archive/$SUBREEL/state.json | grep -q '\"approvedBy\": \"faraz\"'"
check "PR #3 told it is scheduled" "ghq 's.prs[2].comments.join(\"|\")' | grep -q 'Approved by @faraz'"
check "Already-recorded approvals are not re-commented" "[ \"\$(ghq 's.prs[1].comments.filter(c=>c.includes(\"Approved by\")).length')\" = 1 ]"

echo "== 7c. DEEN_AUTO_APPROVE=false → nothing is merged by the workflow"
AUTOVARS="{\"DEEN_POST_TIME\":\"00:00\",\"DEEN_MAX_PER_DAY\":\"5\",\"DEEN_PUBLIC_BASE_URL\":\"$IG/assets\"}"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "{\"DEEN_AUTO_APPROVE\":\"false\",\"DEEN_POST_TIME\":\"00:00\",\"DEEN_MAX_PER_DAY\":\"5\",\"DEEN_PUBLIC_BASE_URL\":\"$IG/assets\"}" > /dev/null
check "With auto-approve off, waiting PRs stay open; only the merged reel posts" "[ \"\$(ghq 's.prs[0].state')\" = open ] && [ \"\$(ghq 's.prs[3].state')\" = open ] && [ \"\$(ghq 's.prs[4].state')\" = open ] && [ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = 2 ]"

echo "== 7d. Fully automated (default): veto window, hold and needs-attention respected"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars '{"DEEN_POST_TIME":"23:59","DEEN_MAX_PER_DAY":"5"}' > /dev/null
check "Nothing auto-approved before the posting time (veto window)" "[ \"\$(ghq 's.prs[0].state')\" = open ] && [ \"\$(ghq 's.prs[3].state')\" = open ]"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[0].labels.push('hold');s.prs[4].labels.push('needs-attention');fs.writeFileSync(f,JSON.stringify(s,null,2))"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "$AUTOVARS" > /dev/null
git -C "$W" fetch -q origin
check "Oldest eligible PR (#4) auto-approved and posted; held PR #1 skipped" "[ \"\$(ghq 's.prs[3].state')\" = merged ] && [ \"\$(ghq 's.prs[0].state')\" = open ] && git -C '$W' show origin/main:deen-content/archive/$FBID/state.json | grep -q '\"status\": \"published\"'"
check "PR told it was auto-approved" "ghq 's.prs[3].comments.join(\"|\")' | grep -q 'Auto-approved'"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "$AUTOVARS" > /dev/null
check "A needs-attention post is never auto-approved" "[ \"\$(ghq 's.prs[4].state')\" = open ] && [ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = 3 ]"
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[4].labels=s.prs[4].labels.filter(l=>l!=='needs-attention');fs.writeFileSync(f,JSON.stringify(s,null,2))"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "$AUTOVARS" > /dev/null
git -C "$W" fetch -q origin
check "Carousel auto-approved and posted: 6 item containers + a CAROUSEL container" "[ \"\$(ghq 's.prs[4].state')\" = merged ] && [ \"\$(grep -c is_carousel_item '$E2E/ig-log.jsonl')\" = 6 ] && grep -q '\"media_type\":\"CAROUSEL\"' '$E2E/ig-log.jsonl' && git -C '$W' show origin/main:deen-content/archive/$QID/state.json | grep -q '\"status\": \"published\"'"
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "$AUTOVARS" > /dev/null
check "A PR on hold is never auto-approved" "[ \"\$(ghq 's.prs[0].state')\" = open ] && [ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = 4 ]"

echo "== 7e. A seasonal post whose day has passed is flagged, not posted late"
git -C "$U" fetch -q origin && git -C "$U" checkout -q -B occ "origin/reel/deen-001-hardship-is-never-alone"
node -e "const f='$U/deen-content/src/content/reels/deen-001-hardship-is-never-alone.json',fs=require('fs');const r=JSON.parse(fs.readFileSync(f));r.publish={...(r.publish??{}),occasion:'ramadan'};fs.writeFileSync(f,JSON.stringify(r,null,2)+'\n')"
git -C "$U" commit -qam "Mark as a Ramadan post" && git -C "$U" push -q origin occ:reel/deen-001-hardship-is-never-alone
node -e "const f='$GH_FAKE_STATE',fs=require('fs');const s=JSON.parse(fs.readFileSync(f));s.prs[0].labels=s.prs[0].labels.filter(l=>l!=='hold');fs.writeFileSync(f,JSON.stringify(s,null,2))"
posts=$(grep -c media_publish "$E2E/ig-log.jsonl")
$RUN "$WF/deen-publish.yml" --repo "$W" --event schedule --secrets "$IGSECRETS" --vars "$AUTOVARS" | tee "$E2E/s7e.log" > /dev/null
check "Ramadan post outside Ramadan: not merged, labelled needs-attention, told why" "[ \"\$(ghq 's.prs[0].state')\" = open ] && [ \"\$(ghq 's.prs[0].labels.includes(\"needs-attention\")')\" = true ] && ghq 's.prs[0].comments.join(\"|\")' | grep -q 'ramadan' && [ \"\$(grep -c media_publish '$E2E/ig-log.jsonl')\" = \$posts ]"
git -C "$W" checkout -q main

echo "== 8. A merged PR without the daily-reel label is ignored"
$RUN "$WF/deen-publish.yml" --repo "$W" --event pull_request --event-json '{"pull_request":{"number":9,"merged":true,"labels":[{"name":"docs"}],"head":{"ref":"feature/x"}}}' --secrets "$IGSECRETS" | tee "$E2E/s8.log" > /dev/null
check "Publish job skipped" "grep -q 'skipped by if' '$E2E/s8.log'"

echo "== 9. Weekly: insights import + report (no web topic scan)"
HARNESS_CLAUDE_ACTION="$MOCKCC" $RUN "$WF/deen-weekly.yml" --repo "$W" --event schedule --secrets "{\"IG_ACCESS_TOKEN\":\"SECRET_TEST_TOKEN\",\"IG_USER_ID\":\"IGID\",\"CLAUDE_CODE_OAUTH_TOKEN\":\"oauth-test\"}" --vars '{"DEEN_WRITER":"subscription"}' | tee "$E2E/s9.log" > /dev/null
git -C "$W" fetch -q origin
check "Insights row written for the posted reel" "git -C '$W' show origin/main:deen-content/data/performance/performance.csv | grep -q '^$NEWID,'"
check "Unsupported metrics skipped, not invented" "git -C '$W' show origin/main:deen-content/data/performance/performance.csv | grep '^$NEWID,' | grep -q ',1840,'"
check "Planner index file committed" "git -C '$W' show origin/main:deen-content/data/performance/index.json | grep -q '$NEWID'"
check "No topic scan ran, even with a paid writer opted in" "! grep -q 'mock: wrote scan.json' '$E2E/s9.log'"

echo "== 10. Setup check and token refresh"
$RUN "$WF/deen-check-instagram.yml" --repo "$W" --event workflow_dispatch --secrets "{\"ANTHROPIC_API_KEY\":\"x\",\"IG_ACCESS_TOKEN\":\"SECRET_TEST_TOKEN\",\"IG_USER_ID\":\"IGID\"}" | tee "$E2E/s10.log" > /dev/null
check "Instagram check passes against the mock" "grep -q '\[job check\] success' '$E2E/s10.log'"
$RUN "$WF/deen-token-refresh.yml" --repo "$W" --event schedule --secrets '{"IG_ACCESS_TOKEN":"SECRET_TEST_TOKEN","GH_SECRETS_PAT":"pat"}' > /dev/null
check "Refreshed token stored via gh secret set" "[ \"\$(ghq 's.secrets.IG_ACCESS_TOKEN ?? 0')\" -gt 0 ]"
$RUN "$WF/deen-token-refresh.yml" --repo "$W" --event schedule --secrets '{"IG_ACCESS_TOKEN":"SECRET_TEST_TOKEN"}' > /dev/null
check "Without a PAT a reminder issue is opened" "ghq 's.issues.map(i=>i.title).join(\"|\")' | grep -q 'Instagram token needs renewing'"

echo
echo "E2E: $PASS passed, $FAIL failed  (workspace: $E2E)"
[ "$FAIL" -eq 0 ]

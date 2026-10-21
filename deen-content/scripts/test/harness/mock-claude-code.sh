#!/usr/bin/env bash
# Plays the Claude Code GitHub Action in workflow tests. Behaves like the real
# agent would when following the brief: writes draft.json, runs the checker,
# writes review.json (or scan.json for the weekly topic scan).
#   HARNESS_DRAFT=<draft.json>   draft to "write"
#   HARNESS_CLAUDE_FAIL=1        simulate a failed run (quota, auth, timeout…)
set -euo pipefail
P=deen-content
[ "${HARNESS_CLAUDE_FAIL:-}" = 1 ] && { echo "mock: simulated Claude Code failure"; exit 1; }
[ -f "$P/output/daily/brief.md" ] || [ -f "$P/output/daily/scan-brief.md" ] || { echo "mock: no brief prepared"; exit 1; }
if [[ "${INPUT_PROMPT:-}" == *scan-brief* ]]; then
  cat > "$P/output/daily/scan.json" <<'EOF'
{"topics":[{"topic":"Eval sets go stale: when to refresh the questions you test on","angle":"An eval set frozen at launch stops reflecting what users ask; schedule refreshes from recent logs","pillar":"B","format":"framework","whyNow":"Mock topic from the test harness","sources":[{"url":"https://example.com/eval-refresh","title":"Example source","published":null}]},{"topic":"No source topic","angle":"x","pillar":"B","format":"framework","whyNow":"x","sources":[]}]}
EOF
  echo "mock: wrote scan.json"; exit 0
fi
[[ "${INPUT_PROMPT:-}" == *brief.md* ]] || { echo "mock: unexpected prompt"; exit 1; }
cp "$HARNESS_DRAFT" "$P/output/daily/draft.json"
node "$P/scripts/daily/finalize-draft.mjs" "$P/output/daily/draft.json" --check
cat > "$P/output/daily/review.json" <<'EOF'
{"scores":{"hook":5,"insight":4,"accuracy":5,"intrigue":4,"clarity":5,"brandFit":5},"verdict":"pass","mustFix":[],"niceToHave":["(mock editor) consider a sharper cover kicker"]}
EOF
echo "mock: wrote draft.json + review.json"

# Performance data (manual import)

Add one row per reel to `performance.csv`, copying numbers from Instagram Insights.
Record them at a fixed age (e.g. 7 days after posting) so posts are comparable.

- Only enter metrics Instagram actually shows you. Leave a cell empty if it isn't available; don't estimate.
- `comments_meaningful`: count comments that add experience or a question, not emoji-only replies.
- `production_time_min`: your own time, so cost per result can be tracked.
- `pillar`, `format`, `hook_angle`, `cta_type` should match the reel's content file (the analyzer fills them in if blank).

Then run `npm run metrics`. API-based import can be added later only if your account type,
Meta app permissions and the relevant Insights endpoints are confirmed available.

# Refilling the content queue

The daily pipeline posts one pre-written draft from this folder per day, with no AI model at run time. A scheduled Claude task (or you, in a chat) keeps the folder topped up to about three weeks of drafts. This file is the brief for that job. Read `../../CONTENT_SYSTEM.md` first: the source rule there is non-negotiable.

## Steps

1. From `deen-content/`, run `node scripts/sources/cli.mjs fetch` (downloads and hash-checks the verified datasets), then `node scripts/daily/refill-plan.mjs`. It prints how many drafts to write (`write N`), the next draft number, which pillars to favour, which formats are queued, and the unclaimed backlog topics. If it says `write 0`, stop.
2. For each draft, choose the source first. Use `node scripts/sources/cli.mjs search "<words>" [--in quran|bukhari|muslim]` and read candidates in full with `node scripts/sources/cli.mjs show <ref>`. Only the Qur'an, Sahih al-Bukhari and Sahih Muslim are allowed. Don't reuse a source quoted in the last 30 reels or drafts.
3. Write N drafts as `data/queue/qNNN-<short-slug>.json`, numbered from the number the planner gives. Source scenes contain only `ref` (plus optional verbatim `excerpt` / `arabicExcerpt`) — never type the verse or hadith text.
4. Validate each draft. From `deen-content/`: `rm -f output/daily/plan.json; node scripts/daily/finalize-draft.mjs data/queue/<file>.json --check --source queue`. It must print `OK —`. Fix and re-check until it does; drop any draft you can't fix.
5. Commit only `data/queue/*.json` (and `data/topics/backlog.json` if you added topics) to `main` with a message like `queue: add q014–q023 (scheduled refill)`, then push. If the push is rejected, `git pull --rebase` and push again.

## What a draft looks like

Follow the planner's mix: kinds (reel 50% · carousel 35% · story 15%), the six pillars, the five series (keep One Ayah. One Lesson., A Reminder Your Heart Needs and Dua of the Day the most frequent), and one Friday reminder per week (`"publish": {"occasion": "friday"}`). Add Ramadan / Dhul Hijjah drafts ahead of the season; they wait for their dates.

Copy the structure of the existing drafts exactly: `q001`–`q014` cover every kind and series (reels, carousels with 5–7 slides, stories with one scene and a `replyPrompt`). Set `"kind"` and `brief.series`. Required: `brief` (`pillar` like `"F: Hope, Patience and Trust"`, `format`, `objective`, `technicalDepth: "beginner"`, `voiceover: false`, `research: "not-required"`), `coreInsight`, three scored `hooks` with `selectedHook` and `selectionRationale`, `scenes` (hook first, at least one `source` scene, takeaway last), `cover`, `caption` (opening, body, cta, 3–6 hashtags — no sources block, it's generated), `primaryCta` matching the takeaway's `cta`, `claims` (`source` with its `ref` for each quote, `reflection` for our suggestions), `publish`, `repurposing`. Optional: `"recitation": {"ref": "quran:<s>:<a>"}` — required in practice for reels without an ayah on screen (pick a short ayah that genuinely relates). Leave out `id`, `fps`, `audio`, `style`, `resolved`, `sources` and every other recitation field; the pipeline sets those.

## Quality bar

- One reminder per reel, actionable today. The source genuinely says what the reel is about; read it in full, and the surrounding ayat for the Qur'an.
- Our own words never attribute speech to Allah or the Prophet ﷺ; quotation marks only around verbatim source text. ﷺ after the Prophet's name.
- Reminders, not rulings: no halal/haram verdicts, fiqh positions, sectarian or political content.
- No bait: no "share or…", "type Ameen", fear or guilt hooks.
- Vary pillars, formats and openings across the batch.

## Never

- Never quote anything that didn't come from the source tools. Never edit `sources/sources.json`, workflows, settings or other files; merge or close PRs; post anything; or touch secrets.

# Daily automation

**It runs completely free by default:** a public GitHub repo (free Actions minutes), reels from a pre-written content queue (no AI model at run time), public verified-source datasets, and Instagram's free Graph API. Paid writers are off unless you opt in.

Every morning a GitHub Actions workflow takes the next post from the queue — a **reel**, a **carousel** or a **story**, following the content strategy in [`../docs/CONTENT_STRATEGY.md`](../docs/CONTENT_STRATEGY.md) — **pulls every verse and hadith word for word from the pinned datasets** (Qur'an, Sahih al-Bukhari, Sahih Muslim — see [sources/README.md](sources/README.md)), renders it, runs every quality gate, and opens a **review pull request** with previews (the MP4 for reels, every slide for carousels and stories) and a checklist of source links. **It runs fully automated by default:** at the daily slot (default 19:00 IST) the oldest waiting post approves itself and is posted to Instagram. The time between the PR opening (06:00) and the slot is your veto window: **close** the PR to reject a post, add the **`hold`** label to keep it waiting, or merge it yourself to approve early. Posts where QA was unsure (ruling-type words, a missing ﷺ in our own words, or an editor flag) are labelled **needs-attention** and always wait for a person. To approve every post by hand instead, set the repo variable `DEEN_AUTO_APPROVE` to `false`.

## Auto-approve (on by default)

Every post has already passed the source gate before its PR exists: verbatim text from the pinned datasets, approved collections only, no words attributed to Allah or the Prophet ﷺ outside a quote, verified recitation that is never cut. With auto-approve on, the publish run that the post timer starts at `DEEN_POST_TIME` merges the oldest open review PR that isn't on `hold` or `needs-attention`, records the approval and posts it — one at a time, within `DEEN_MAX_PER_DAY`. Each auto-approved PR gets a comment saying so.

| Kind | Posted as | Notes |
|---|---|---|
| Reel | Instagram reel (REELS) | Qur'an recitation as the only sound |
| Carousel | Instagram carousel (2–10 images, 4:5) | caption + sources block as usual |
| Story | Instagram story (one 9:16 image) | posted without a caption (Instagram stories have none); the reply prompt is in the image; polls/quiz stickers can't be added through the API — add them by hand in the app if you want them; gone after 24 h, and their insights aren't imported |

**Occasions:** drafts marked `friday`, `ramadan`, `dhul-hijjah-10`, `eid-al-adha`… wait in the queue and jump ahead on their day (Umm al-Qura calendar; check `node scripts/daily/occasions.mjs`). Local moon sightings can differ by a day — you review every occasion post anyway. `node scripts/daily/dequeue.mjs --status` shows what's waiting.

```
morning    DEEN · Daily reel   (makes reels, carousels and stories; backstop schedules 05:47–11:23 IST, one build per day)
           plan topic (pillar mix, format rotation, no repeats, performance-weighted; used by opt-in writers)
           → writer:
               default   content queue: next draft for today (occasion drafts first on their day)  (data/queue, no model, free)
               opt-in    Claude Code on a Claude subscription   (DEEN_WRITER=subscription)
               opt-in    Claude API, pay per token               (DEEN_WRITER=api)
             quotes resolved from the pinned datasets (refs only, never typed text);
             every draft is checked: sources, attributions, copy limits, safe-zone layout;
             if an opt-in writer fails, that day falls back to the queue
           → when 5 or fewer drafts are left: a "queue-low" issue reminds you to refill
           → render (Remotion) → Instagram spec conform → full QA → previews to a pre-release
           → review PR  [daily-reel]  (+ [needs-attention] if the editor wasn't satisfied)

you        open each source link · merge = approve · edit the JSON in the PR = auto re-render · close = reject

after the  DEEN · Post timer   (starts when the build finishes; doesn't depend on GitHub's cron)
build      sleeps until DEEN_POST_TIME (in ≤5h40m steps, handing over to a fresh timer),
           then starts DEEN · Approve & publish

19:00 IST  DEEN · Approve & publish   (started by the post timer; also runs the moment you merge,
           with hourly schedules as a backstop)
           records approval for every merged reel PR (so none is lost)
           oldest approved reel, max 1/day, once the local time passes DEEN_POST_TIME
           → verifies the file hashes match what passed QA and what you approved
           → Instagram Graph API: REELS container, or one image container per slide + CAROUSEL,
             or a STORIES image → wait FINISHED → publish
           → comments the permalink on the PR

Sunday     DEEN · Weekly insights
           Instagram insights → data/performance → planner weighting
           (no web topic scan on this page: topics never come from trending web content)
```

**Control panel:** everything below can also be done from the web control panel (see "Control panel" further down): review and approve, make a reel, post now, pause, change the posting time, manage the queue.

Nothing is ever posted without a merged PR. If 3 reels are already waiting for review, the daily run skips generation instead of piling up drafts.

---

## One-time setup (≈30 minutes, plus Meta's app setup)

### 1. Put the code in the repo

This repository already has the right layout (`deen-content/` + `.github/`). If you move it elsewhere, keep both folders at the repository root.

### 2. Allow Actions to open PRs

Repo → **Settings → Actions → General → Workflow permissions**:
- select **Read and write permissions**
- tick **Allow GitHub Actions to create and approve pull requests**

### 3. How reels get written (free by default)

**Default — the content queue, free.** Each day takes the next pre-written draft from `data/queue/`. Drafts are written ahead of time and pass the same copy, layout and claim checks as any reel. Nothing to set up.

- `node scripts/daily/dequeue.mjs --status` lists what's left (`--count` prints just the number).
- When 5 or fewer drafts remain, the daily run opens (or comments on) an issue labelled **queue-low**. Turn on GitHub notifications to see it.
- **Automatic refill (on):** a scheduled Claude task, **"Daily Deen queue refill"** (Mondays 10:38 IST), runs `scripts/daily/refill-plan.mjs` and tops the queue back up to ~21 drafts following [`data/queue/REFILL.md`](data/queue/REFILL.md) and the content strategy, validates every draft and pushes them to `main`. It runs on your Claude plan; there's no API bill. Manage it from your Claude scheduled tasks.
- **To refill by hand:** in a Claude chat, ask: *"write the next batch of queue drafts for daily-deen-reels"* (Claude follows [`data/queue/REFILL.md`](data/queue/REFILL.md) and uses only the source tools). Claude writes and validates them; commit them to `data/queue/` or let Claude push them. Ten drafts = ten days.
- Drafts are never deleted; a draft counts as used once a reel carries its `queueId`. A draft that has become too similar to a newer reel is skipped automatically.

**Optional, paid — a model writes each reel at run time.** Off unless you set the repo variable `DEEN_WRITER`. Adding a secret alone never turns these on.

- `DEEN_WRITER=subscription` + secret `CLAUDE_CODE_OAUTH_TOKEN`: Claude Code on a Claude Pro, Max, Team or Enterprise plan (no API bill; counts toward the plan's usage limits). Create the token with `claude setup-token` on your computer; the Claude GitHub App must be installed on the repo.
- `DEEN_WRITER=api` + secret `ANTHROPIC_API_KEY`: Claude API, pay per token (see Costs).

Paid writers find references with the same source tools (no web search) and their drafts pass the same gates. If the run fails (plan limit, auth error), that day's reel comes from the queue. If the variable is set but the secret is missing, the run warns and uses the queue.

### 4. Try it

Actions → **DEEN · Daily reel** → **Run workflow**.
- Leave everything blank to make today's reel (it takes the next queue draft, or uses the writer you opted into), or
- put `deen-001-hardship-is-never-alone` in **reel_id** to send an existing reel through review.

A PR appears in ~10–15 minutes. Turn on GitHub mobile notifications for the repo to get it on your phone.

Until Instagram is connected, merging a PR still works: the publish run comments that the reel needs manual posting and links the files.

### 5. Connect Instagram

Requirements: a **separate** Instagram account for this page (not the AI Product Manager one), switched to a **professional account** (Creator or Business) — Instagram app → Settings → Account type and tools.

Choose one login type. Meta's dashboards change often, so follow the current screens using the names below.

**Option A — Instagram API with Instagram Login (simplest; no Facebook Page needed)**
1. developers.facebook.com → **Create app** → choose the Instagram use case (Instagram API with Instagram Login).
2. Permissions: `instagram_business_basic` and `instagram_business_content_publish`.
3. Under the app's **Roles**, add your Instagram account as an Instagram tester and accept the invite in Instagram (Settings → Website permissions / Apps and websites → Tester invites). An account with a role on the app can use it without App Review; check the App Dashboard if Meta asks for more.
4. In the API setup screen, **generate an access token** for your account. It is a long-lived token (~60 days).
5. Add the secret `IG_ACCESS_TOKEN`. That's all the publisher needs: the account id is looked up from the token (`IG_USER_ID` is optional with this login type). `IG_LOGIN` defaults to `instagram`.
6. Token renewal: add a `GH_SECRETS_PAT` secret (fine-grained GitHub token for this repo with **Secrets: read and write**) and **DEEN · Refresh Instagram token** renews it twice a week. Without it, the workflow opens a reminder issue instead.

**Option B — Instagram API with Facebook Login (needs a Facebook Page linked to the account)**
1. Create a Business app with Facebook Login for Business; permissions `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`.
2. Use a Page access token derived from a long-lived user token (these don't expire on the 60-day cycle).
3. Secrets `IG_ACCESS_TOKEN`, `IG_USER_ID`; variable `IG_LOGIN` = `facebook`.
4. This option uploads the MP4 bytes directly to Meta (`IG_UPLOAD_MODE` defaults to `resumable`), so no public video URL is involved. Carousel and story images are always fetched by Meta from the public release URL (or `DEEN_PUBLIC_BASE_URL`), with either login type.

Then run **DEEN · Check Instagram setup**. It lists anything missing (token, permissions, account type, publishing quota) without printing secrets.

**About video URLs (Option A).** In URL mode Meta downloads the video from a public link. The publisher resolves the GitHub release download link to its direct file URL just before creating the container. This has not been verified against Meta's downloader. If a post fails with a media download/format error, either switch to Option B, or host files yourself (S3/R2/any CDN), upload `<id>.mp4` and `<id>.jpg` there, and set the variable `DEEN_PUBLIC_BASE_URL` to that folder's URL.

---

## Control panel (GitHub Pages)

A Streamlit app that runs entirely in your browser and controls the pipeline through the GitHub API. Nothing to host or pay for.

**Turn it on (once):** repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then Actions → **DEEN · Control panel (GitHub Pages)** → Run workflow (it also runs on every change to `control-panel/`). The page is at `https://<your-user>.github.io/daily-deen-reels/`.

**Sign in:** paste a fine-grained GitHub token limited to this repo, with Actions, Contents, Pull requests and Variables set to *Read and write*, plus Issues *Read* (and optionally Secrets *Read*, which only shows whether Instagram is connected). The panel shows these steps too. The token stays in the browser tab's memory and is sent only to `api.github.com`; closing the tab forgets it. Use **Explore with sample data** to look around without a token.

| Tab | What you can do |
|---|---|
| Overview | Drafts left, reels waiting, approved, posted; recent posts with links; failures; status of each workflow |
| Review | Cover + video for each reel waiting, QA and editor notes; **Approve** (merges the PR) or **Reject** (closes it, with an optional reason) |
| Make a reel | Make one now; send an existing reel to review; **post an approved reel now** (or dry-run); check Instagram setup; import insights; refresh the token |
| Queue | Every draft and whether it's been used; upload new drafts (they're renumbered automatically) |
| Settings | Pause/resume the daily reel, posting and weekly import; posting time, time zone, posts per day, review limit, queue warning level, writer, Instagram login type |

Every irreversible button asks for confirmation. The first load takes ~20 seconds while Python starts in the browser.

## Look (variety) and sound

Every reel gets a `style`, chosen automatically so consecutive reels look different (the full combination repeats only every 60 reels):

| Part | Options |
|---|---|
| `theme` | dark: `night`, `emerald`, `dusk`, `teal`, `ink`, `olive` · light: `ivory`, `mist`, `sand`, `rose` |
| `layout` | `framed` (quote in a quiet panel), `minimal` (centred, no panel), `editorial` (left-aligned, large quote mark) |
| `backdrop` | `plain`, `gradient`, `motif` (one faint eight-pointed star), `border` (thin inset frame) |
| `type` | `sans` or `serif` headlines |
| `motion` | `fade`, `rise`, `slide` (all short and calm) |

To choose yourself, edit e.g. `"style": {"theme": "ivory", "layout": "minimal"}` in the reel's JSON in its review PR; it re-renders automatically.

**Sound: Qur'an recitation only** — no music or effects. The ayah on screen is recited by one of six approved reciters (rotating); hadith reels recite a related ayah named in the draft, labelled on screen. Recitations are never cut: scenes stretch to fit. Details: [sources/README.md → Recitation](sources/README.md). To change it in a PR: `"recitation": {"ref": "quran:3:134", "reciter": "alafasy"}` (or `false` for a silent reel).

## Day to day

- **Morning:** open the PR. Tick through **Check the sources before approving** (each link opens quran.com / sunnah.com), watch and listen to the MP4 (the "Watch the reel" link), and skim the script table.
- **Approve:** merge. It posts at the next slot (or right away if the slot has passed and nothing was posted today).
- **Fix a word:** edit `src/content/reels/<id>.json` in the PR (GitHub web or mobile). The reel re-renders, QA re-runs and the preview updates. If the edit breaks a layout limit, the PR gets a comment explaining which check failed.
- **Swap a quote:** change the scene's `ref` (e.g. `quran:2:153`). The text is re-pulled from the datasets; hand-edited quote text is always overwritten.
- **Reject:** close the PR. Its topic becomes available again.
- **Post a specific idea:** Actions → DEEN · Daily reel → Run workflow with a **topic** (and optional format/pillar).
- **Add ideas:** append to `data/topics/backlog.json` with `"status": "open"`.
- **Pause:** Actions → DEEN · Daily reel → ⋯ → Disable workflow.

## Settings (repo variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `DEEN_POST_TIME` | `19:00` | Local posting time. The post timer starts publishing at this time; a change applies from the next timer run |
| `DEEN_TIMER_MAX_WAIT_MIN` | `340` | Longest the post timer sleeps in one run before handing over to a fresh one (GitHub jobs can run at most 6 hours) |
| `DEEN_TZ` | `Asia/Kolkata` | Time zone for the slot and the daily cap |
| `DEEN_MAX_PER_DAY` | `1` | Posts per day |
| `DEEN_MAX_OPEN_REVIEWS` | `3` | Skip generation when this many PRs await review |
| `DEEN_AUTO_APPROVE` | `true` | Fully automated: each post approves itself at the posting time unless closed, on `hold` or `needs-attention`. `false` = merge every PR yourself |
| `DEEN_WRITER` | `queue` | `queue` (free), or opt into a paid writer: `subscription` or `api` |
| `DEEN_QUEUE_LOW` | `5` | Open a queue-low issue when this many drafts or fewer are left |
| `DEEN_MODEL` | `claude-opus-5-5` | Paid writers only: writer/editor model (`claude-sonnet-5-5` is cheaper; `claude-fable-5-1` is stronger and pricier) |
| `IG_LOGIN` | `instagram` | `instagram` or `facebook` |
| `IG_API_VERSION` | `v26.0` | Graph API version |
| `IG_UPLOAD_MODE` | `url` (IG login) / `resumable` (FB login) | How the video reaches Meta |
| `DEEN_PUBLIC_BASE_URL` | — | Your own public folder for MP4/JPEG files (URL mode) |
| `DEEN_INSIGHT_METRICS` | `reach,saved,shares,views,…` | Insight metric names to request (Meta renames these between versions) |

**Why there's a post timer.** GitHub's scheduled (cron) runs are best-effort: they start late or are skipped at busy times. On this repo the "hourly" publish schedule ran only every 4–6 hours, and the 06:00 build started around 10:40. On 23 Oct 2026 the last publish run before the slot was at 18:49, so the post waited until it was merged by hand. Now the build has several backstop schedules (the first to run builds today's post; the others skip), and posting is driven by **DEEN · Post timer**, which starts when the build finishes and sleeps until the slot. Its own backstop schedules (15:07, 16:41, 18:13, 19:49 IST) restart it if a chain is ever broken. The publish run re-checks everything (approval, hold, needs-attention, daily cap, time), so a late or duplicate timer can't post twice or early. In the Actions tab a sleeping timer shows as "in progress" for hours; that's expected.

## Costs

**Default setup: $0.**

- **GitHub Actions:** free for public repositories. (Private repos get a monthly free allowance; a daily render fits in it, but keep the repo public to stay at $0 with headroom.)
- **Content queue (default):** free. Refilling it happens in a normal Claude chat, with no API key or GitHub secret involved.
- **Verified sources and recitation:** free (public datasets via jsDelivr, recitation files from EveryAyah).
- **Instagram Graph API:** free.
- **Claude subscription (opt-in):** no extra charge on a paid plan; runs count toward its usage limits.
- **Claude API (opt-in):** each PR shows the estimated cost of writing that reel. With `claude-opus-5-5` ($4 / $20 per million input/output tokens) expect very roughly **$0.40–$1.20 per reel**, depending on revision rounds. 
- **Remotion:** free for individuals and very small companies; larger companies need a Remotion company license (see remotion.dev/license).

## What the automation can't do

- It can't judge whether a source fits the point the way a person can. QA guarantees the quote is real, exact and from an approved collection, and that our own words don't put speech in anyone's mouth; **your merge is the real quality gate** for meaning and context.
- GitHub Models' free tier isn't used: its per-request limits (about 8k tokens in, 4k out) are too small for the brand brief plus a full reel.
- It has no voiceover. The only audio is the recitation; listen to it in the PR's MP4 before approving.
- Instagram insight metric names change between Graph API versions. Unsupported metrics are skipped, never estimated; the CSV can always be filled in by hand.

## Troubleshooting

| Symptom | Fix |
|---|---|
| A run fails at "Fetch + hash-check verified sources" | jsDelivr and GitHub were both unreachable, or an upstream file changed (SHA-256 mismatch). Re-run later; for a mismatch, review the upstream change before updating `sources/sources.json`. |
| A run fails with "could not download recitation" | EveryAyah and its mirror were both unreachable. Re-run later. |
| A draft fails with "recitation … is NN s (max 45 s)" | The chosen ayah is too long to recite in a reel. Pick a shorter related ayah in `recitation.ref`. |
| A draft fails with "not an approved collection" or "excerpt is not a word-for-word part" | Expected: only the Qur'an, Bukhari and Muslim are allowed, and excerpts must be verbatim. Fix the `ref` / `excerpt` in the draft. |
| Daily run fails at "Finalize today's reel" with "queue is empty" | The queue ran out. Ask Claude in chat for the next batch of queue drafts and commit them to `data/queue/`. Nothing is posted on days without a reel. |
| A paid secret is set but reels still come from the queue | Expected: paid writers need the `DEEN_WRITER` variable too. |
| The Claude Code step fails with an "actor is a bot" or permission message | Scheduled runs are attributed to whoever last edited the cron line. Edit that line once yourself (e.g. change the minute) and commit, or run the workflow manually. Make sure the Claude GitHub App is installed on the repo. |
| Claude Code step fails with an authentication error | Re-run `claude setup-token` and update the `CLAUDE_CODE_OAUTH_TOKEN` secret. That day's reel still comes from the queue. |
| `gh pr create` fails with a permissions error | Step 2 above (allow Actions to create PRs). |
| Publish says "not approved" | The PR must be merged (not closed) and carry the `daily-reel` label. |
| Container status `ERROR` | Usually the video URL couldn't be fetched. See "About video URLs". |
| "hash mismatch" | The release files changed after approval. Re-run review for that reel (Daily reel → reel_id) and merge the new PR. |
| A post didn't go out at the slot | Open Actions → **DEEN · Post timer**: the latest run's summary says what it decided (e.g. waiting, already posted today, every PR on hold / needs-attention, or posting paused). Run it by hand to re-evaluate; it posts right away if the slot has passed and a post is waiting. |
| A Friday / seasonal PR is labelled needs-attention with "its day has passed" | Its slot was missed, so it wasn't posted on the wrong day. Close it, or merge it yourself if you still want it out. |
| Scheduled workflows stopped | GitHub disables schedules after 60 days without repo activity; the daily commits normally prevent this. Re-enable in the Actions tab. |

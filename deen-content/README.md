# Daily Deen Reminders — content engine

A Remotion + React system for the **Daily Deen Reminders** Instagram page: it turns a structured content file into a 1080×1920 reel, a cover, a caption, a storyboard and machine-readable publishing metadata, then runs quality gates and requires a human approval before anything can be posted. Every verse and hadith is pulled word for word from pinned datasets ([sources/README.md](sources/README.md)); editorial rules are in [CONTENT_SYSTEM.md](CONTENT_SYSTEM.md).

> **Daily automation:** see [AUTOMATION.md](AUTOMATION.md) — a reel is taken from the queue every morning, GitHub Actions pulls its sources, renders and checks it, you approve by merging a PR, and it posts to Instagram at a set time.

> Core rule: every post delivers one useful insight. The pipeline enforces structure; the judgement — topic, hook, the actual lesson — stays with you (or with Claude Code, working from the brief in `CONTENT_SYSTEM.md`).

---

## What's in the box

```
deen-content/
  src/
    brand/          tokens.ts (colours, type scale, safe zones), fonts.ts (local font loading)
    components/     BrandBackground, BrandSignature + Monogram, ProgressIndicator,
                    KineticHeadline, Cards (PromptCard, MetricCard, StatusIcon),
                    AudioTracks (SoundDesignTrack, VoiceoverTrack, SubtitleTrack), EndCard, motion helpers
    scenes/         HookScene, CardsScene, TableScene, ComparisonScene, ChecklistScene,
                    DiagramScene, TerminalScene, TakeawayScene, SourceScene (verse / hadith)
    templates/      ReelTemplate (scene sequencing, transitions, audio), formats.json (5 formats)
    compositions/   Cover (1080×1920 still, text inside the 1080×1350 feed crop)
    content/        schema.ts (content contract), reels/*.json (one file per reel, auto-registered)
    Root.tsx, index.ts   Remotion entry: one Reel + one Cover composition per content file
  scripts/
    generate-content.mjs   scaffold a new reel from a brief + format
    build-package.mjs      caption, storyboard (.md), narration timing (.srt), metadata (.json)
    synth-audio.py         silent audio track (music/SFX synthesisers kept but unused)
    sources/               verified-source resolver + CLI (fetch, search, show, apply)
    render-content.mjs     render MP4 + cover (Remotion CLI, or local fallback engine)
    validate-content.mjs   content, visual-layout and technical QA gates + review frames
    approve.mjs            human approval gate (requires watched + sources-checked confirmation)
    publish.mjs            refuses unapproved assets; prints manual posting checklist
    analyze-performance.mjs  baseline-relative analysis of imported Insights data
    sync-registry.mjs      auto-registers every reels/*.json for Remotion
    content-limits.mjs     copy-length/structure limits shared by validator and writer
    daily/                 automation: plan, queue/writers, archive, publish (Instagram), insights
    test/                  offline publish-flow test against a mock Graph API
    local-render/          fallback renderer: Remotion-API shim + headless Chromium + ffmpeg
  public/            fonts/, audio/, brand/deen-monogram.svg   (Remotion's static folder)
  sources/           sources.json (the only allowed datasets, pinned + hashed)
  data/queue/        pre-written drafts (refs only), REFILL.md
  data/topics/       backlog.json (topic ideas with suggested source refs, for paid writers)
  data/performance/  performance.csv, report.md, index.json (feeds the planner)
  archive/<id>/      committed review package + state.json (approval, publish status)
  output/            reels/, covers/, captions/, metadata/, storyboards/, qa/
```

`public/` replaces the `assets/` folder from the original spec because it is Remotion's static-file directory (`staticFile()` reads from it).

## Install

Requirements: Node 18+ (tested on 22), Python 3 with `numpy` and `scipy` (audio), `ffmpeg`/`ffprobe` on PATH.

```bash
npm install            # remotion, @remotion/cli, react 19
pip install numpy scipy
```

Keep `remotion` and `@remotion/cli` on the **same** version (`npm ls remotion @remotion/cli`).

## Workflow for one reel

```bash
# 1. Scaffold (pick a format; pillar defaults to the most under-served vs the target mix)
npm run new -- --topic "RAG vs fine-tuning" --format a-vs-b --objective saves

# 2. Write the copy: replace every TODO in src/content/reels/<id>.json
#    (3 hooks with scores → pick one → script → caption → claims + sources),
npm run validate -- <id> --content-only       # content gates before spending render time

# 3. Preview and iterate
npm run studio                                # Remotion Studio with live reload

# 4. Package, render, check
npm run package  -- <id>
npm run render   -- <id>                      # synthesises audio, renders MP4 + cover
npm run validate -- <id>                      # all gates, review frames, contact sheet

# 5. Human review → approval → manual post
npm run approve  -- <id> --by "Your Name" --watched --sources-checked
npm run publish  -- <id>                      # prints the posting checklist; never auto-posts

# 6. A week later: add a row to data/performance/performance.csv
npm run metrics
```

### Render engines

`render-content.mjs` uses the **Remotion CLI** when `node_modules/@remotion/cli` exists (`npx remotion render src/index.ts Reel-<id>` and `npx remotion still … Cover-<id>`). Otherwise, or with `--engine local`, it uses `scripts/local-render/`: the same scene components bundled with a small stand-in for the Remotion APIs this project uses (`Sequence`, `useCurrentFrame`, `interpolate`, `spring`, `Easing`, …), stepped frame-by-frame in headless Chromium and encoded with ffmpeg (H.264 High, yuv420p, CRF 18, AAC 192k, faststart). The local engine needs `esbuild` and `playwright` with Chromium; it also powers the layout checker in `validate`.

The sample reel in `output/` was rendered with the **local engine**, because this build environment had no npm registry access. Run `npm install && npm run sources:fetch && npm run render -- deen-001-hardship-is-never-alone` once on your machine to confirm the Remotion path; small differences in spring easing between the shim and Remotion are possible.

## Content model

Each reel is one JSON file conforming to `src/content/schema.ts`: the brief, three scored hook options and the selection rationale, scenes (type, duration, copy, storyboard notes, voiceover line, SFX cues), cover, caption, single primary CTA, audio, a claims register and repurposing ideas. Rendering code never contains copy.

**Scene types → typical use**

| Scene | Use for |
|---|---|
| `source` | A verse or hadith: `ref` only (+ optional verbatim `excerpt` / `arabicExcerpt`); Arabic in the King Fahd Hafs font, translation, citation pill |
| `hook` | Opening line, fully legible on frame 0 |
| `checklist` | "Try this today" / reflection steps + a rule line |
| `cards` | Moments to say a du'a, small examples |
| `takeaway` | One line to remember, one CTA, subtle end card |
| `table`, `comparison`, `diagram`, `terminal` | Kept from the engine; rarely right for this page |

The five formats (Ayah Reflection, Hadith in Practice, A Du'a for…, Small Habit Big Reward, Heart Check) live in `src/templates/formats.json` as default scene sequences.

## Brand system

Palettes, type scale and safe zones are in `src/brand/tokens.ts`: six themes (night, emerald, sand, dusk, teal, ink) with eight-pointed-star, arch or dot textures, rotating by reel number.

**Fonts** (all in `public/fonts`, no network at render time): **KFGQPC HAFS Uthmanic Script** (King Fahd Complex) for Qur'anic Arabic, **Amiri** (SIL OFL) for hadith Arabic, ﷺ and the serif translation text, **Inter Display / Inter** for headlines and body, **DejaVu Sans Mono** for labels.

**Monogram.** `public/brand/deen-monogram.svg` (eight-pointed star framing a "D") is a *proposed* mark, not a registered logo.

**Safe zone.** Essential content sits within x 96–930, y 250–1500. The validator checks every visible text element against this box on sampled frames, and the cover against the centred 1080×1350 feed crop.

## Sound

Reels are **silent**: no music and no sound effects (`styles.json` ships only `music: "none"`). A silent stereo AAC track is muxed so the file is standard for every player and the Instagram API. No voiceover or recitation is generated.

## Quality gates

`npm run validate -- <id>` writes `output/qa/<id>/report.md` and updates the metadata:

- **Source:** at least one quote; every `ref` in an approved collection and present in the pinned dataset; on-screen text, citation and link identical to the dataset; excerpts verbatim; caption sources block complete; claims are `source` (with a quoted ref) or `reflection`; our own words never attribute speech to Allah or the Prophet ﷺ and never put non-verbatim text in quotes; hadith only from Sahih collections. Warnings for ruling-type words and a missing ﷺ.
- **Content:** three hooks, hook ≤10 words, one-sentence insight, 15–50s, enough frames to read each quote, exactly one CTA (on-screen = caption), no hype or chain-message bait, 3–8 hashtags, caption ≤2,200 chars, cover headline 3–7 words.
- **Visual:** all visible text inside the safe zone and not truncated (DOM measurement on sampled frames); cover inside the feed crop.
- **Technical:** 1080×1920, 30/1 fps, H.264 yuv420p, exact frame count and duration, AAC 48 kHz stereo (silent track), full decode with zero errors, no black frames, review frames (first, last, every scene mid-point, both sides of every cut) and a contact sheet.

Automated gates can't judge whether a source fits the point. The source and viewing checks stay **pending** until a person approves; `publish` refuses anything unapproved or modified after approval.

## Publishing and analytics

Publishing is intentionally manual. `publish.mjs` contains no API client; adding one requires an Instagram professional account, a Meta app with the relevant content-publishing permissions, and a publicly reachable video URL. Analytics start as a manual CSV import; the analyzer compares every post with the account's own median, marks groups with fewer than 3 posts as insufficient, and proposes a one-variable next test.

## Secrets

Copy `.env.example` to `.env` for any optional integration. Nothing in the default workflow needs a key; never commit `.env`.

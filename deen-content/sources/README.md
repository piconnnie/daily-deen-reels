# Verified sources

Every verse and hadith on the page comes from the datasets pinned in `sources.json`, and nowhere else.

## How quotes get into a reel

1. A draft's `source` scene names a reference only: `quran:94:5-6`, `bukhari:6114`, `muslim:2564c`.
2. `scripts/sources/sources.mjs` downloads each dataset once per commit (jsDelivr, falling back to raw.githubusercontent.com), checks its SHA-256 against `sources.json`, and pulls the exact text, citation and link into the scene's `resolved` block.
3. QA (`scripts/validate-content.mjs`, gate "source") re-resolves every reference and fails the build if:
   - the collection isn't listed here, or the reference doesn't exist;
   - any on-screen text, citation or link differs from the dataset;
   - an excerpt isn't a word-for-word part of the source;
   - the caption's sources block misses a quote;
   - our own words attribute speech to Allah or the Prophet ﷺ, or put non-verbatim text in quotation marks;
   - a hadith isn't from a collection graded Sahih.
   It also warns on ruling-type words and a missing ﷺ.
4. The review pull request lists every source with its link as a checklist; a person checks them before merging.

Editing a reference in a review PR re-pulls the text automatically; editing the quoted text by hand is overwritten.

## The datasets

| Key | Content | Upstream |
|---|---|---|
| `quran-ar` | Qur'an, Uthmani script (Hafs), King Fahd Glorious Qur'an Printing Complex | qurancomplex.gov.sa |
| `quran-en` | Saheeh International translation | tanzil.net |
| `bukhari-en` / `bukhari-ar` | Sahih al-Bukhari (English: Muhsin Khan) | sunnah.com numbering |
| `muslim-en` / `muslim-ar` | Sahih Muslim (English: Abdul Hamid Siddiqui) | sunnah.com numbering (`2564c` = variant c) |

All six files come from the public-domain [fawazahmed0/quran-api](https://github.com/fawazahmed0/quran-api) and [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) repositories, pinned to a commit. The translations remain the work of their translators and publishers; every reel credits the translation by name and links to quran.com / sunnah.com.

Display-only adjustments (the compared text is never changed): ayah numbers are inserted between ayat in multi-ayah English quotes because the dataset drops end-of-ayah punctuation, and the Arabic is mapped to the King Fahd font's original code points for open tanween (see `src/scenes/SourceScene.tsx`).

## Tools

```bash
npm run sources:fetch                          # download + hash-check all datasets
npm run sources:search -- "patience" --in quran
npm run sources:show -- quran:2:153 bukhari:6116
npm run sources:apply -- <reelId|draft.json>   # (re)fill resolved text
```

## Changing the allowed sources

Adding a collection or a dataset is a deliberate editorial decision. Edit `sources.json` (new commit + SHA-256), run `npm run sources:fetch`, spot-check a few references against the upstream site, and commit. Collections other than Bukhari and Muslim need per-hadith grades; the validator only accepts hadith whose collection is marked `"grade": "Sahih"`.

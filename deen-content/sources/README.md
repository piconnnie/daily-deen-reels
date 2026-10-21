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

## Recitation (the reels' audio)

The only sound in a reel is Qur'an recitation from EveryAyah.com (per-ayah files; the same recordings quran.com uses), by one of six approved reciters listed in `sources.json` → `recitations`: Mishary Rashid Alafasy, Abdul Basit Abdus Samad (Murattal), Mahmoud Khalil Al-Husary, Maher Al-Muaiqly, Mohamed Siddiq Al-Minshawi (Murattal), Abdur-Rahman As-Sudais. Reciters rotate by reel number.

- **What is recited:** the first ayah quoted on screen (scene mode), or a related ayah the writer names with `"recitation": {"ref": "quran:…"}` (background mode, labelled on screen with ayah and reciter). Only the Qur'an is recited, at most 3 consecutive ayat and 45 s.
- **Never cut:** the quote scene (or, in background mode, the later scenes) is lengthened so the last ayah ends before the scene/reel does. If the default ayah is too long for the rotating reciter, quicker reciters are tried; if none fits, the reel is silent and QA warns.
- **Verified files:** each file's SHA-256 and duration are recorded in the reel; QA and every re-render refuse a file that changed. The audio is placed unchanged (one overall gain, click-free edges, no effects, nothing mixed under it).
- **Credit:** the caption's sources block names the recited ayah, the reciter and EveryAyah; the quote scene shows "Recited by …".

## Tools

```bash
npm run sources:fetch                          # download + hash-check all datasets
npm run sources:search -- "patience" --in quran
npm run sources:show -- quran:2:153 bukhari:6116
npm run sources:apply -- <reelId|draft.json>   # (re)fill resolved text + recitation
```

## Changing the allowed sources

Adding a collection or a dataset is a deliberate editorial decision. Edit `sources.json` (new commit + SHA-256), run `npm run sources:fetch`, spot-check a few references against the upstream site, and commit. Collections other than Bukhari and Muslim need per-hadith grades; the validator only accepts hadith whose collection is marked `"grade": "Sahih"`.

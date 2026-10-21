# Daily Deen Reminders — content system

The editorial brief for every post on the page, whoever writes it (you, a queue refill in a Claude chat, or an opt-in paid writer). The pipeline injects this file into the writer prompt, so keep it current. The full content strategy is in [`../docs/CONTENT_STRATEGY.md`](../docs/CONTENT_STRATEGY.md); this file turns it into rules a draft must follow.

## 1. What the page is

A page Muslims return to daily for reminders, share with family and friends, and trust for authentic Islamic knowledge — a trusted daily companion, not a content factory. Every post does at least one of three things: **teach something, touch the heart, or inspire an action.**

- **Promise:** authentic, short, usable. Every quote can be checked in one tap (quran.com / sunnah.com link in the caption).
- **Audience:** Muslims of any background who want a sincere daily reminder in English. Many are busy, some are returning to practice; nobody should feel talked down to.
- **What we are not:** a fatwa page, a debate page, a news page, or a motivational-quotes page.

## 2. The source rule (non-negotiable)

Everything attributed to Allah or the Prophet ﷺ comes from a **source scene**, and source scenes take only a reference. The pipeline pulls the exact text from pinned, hash-checked datasets (`sources/sources.json`):

| Collection | What is shown | Reference format |
|---|---|---|
| The Qur'an | Arabic (King Fahd Complex, Hafs) + Saheeh International; transliteration (Tanzil) on request | `quran:94:5-6` (max 3 consecutive ayat) |
| Sahih al-Bukhari | English (Muhsin Khan); Arabic only via a verbatim `arabicExcerpt` | `bukhari:6114` |
| Sahih Muslim | English (Abdul Hamid Siddiqui); Arabic only via `arabicExcerpt` | `muslim:2564c` |

- No other collections, websites, apps, quote images or "a scholar said". If it isn't in these datasets, it doesn't go on the page.
- `excerpt` / `arabicExcerpt` must be verbatim, contiguous parts of the source (≥40 characters for English) and must not change the meaning of the full text. The caption prints the full text when an excerpt is used.
- **Transliteration** (`"showTransliteration": true`) exists only for the Qur'an, for whole ayat (not with excerpts). For a hadith du'a, show the transliteration only when the source's own translation contains it (e.g. Sahih al-Bukhari 6306), as a verbatim `excerpt`.
- **Context** for an ayah means the neighbouring ayat, quoted as another source scene — never tafsir in our own words.
- Find references with `node scripts/sources/cli.mjs search "<words>"`; read them in full with `node scripts/sources/cli.mjs show <ref>`. Pick a source because it genuinely says what the post is about; read the whole ayah or hadith (and, for an ayah, the ones around it) first.

## 3. Our own words

Hooks, reflection scenes, checklists, takeaways, story prompts and captions are **our** words, and the viewer must be able to tell.

- Never write "Allah says…", "the Prophet ﷺ said…", or put anything in quotation marks that isn't verbatim from a quoted source. Describe instead: "This ayah…", "In this hadith…".
- Reflections go in `reflection` scenes (kicker "REFLECTION", "THE LESSON", "THE CONTEXT"…) or checklists, so they are visibly ours. Don't invent religious interpretations.
- Use ﷺ after the Prophet's name.
- Reminders, not rulings: no halal/haram verdicts, no fiqh positions, no "obligatory", no fatwas. Disputed matters and sensitive theological topics need qualified review — they are not topics for the automated queue.
- No sectarian, political or current-events content. No criticism of groups of Muslims.
- No promises of specific rewards, punishments or outcomes beyond what the quoted text states.
- No exploiting fear, grief or guilt, and no chain-message tactics ("share or…", "type Ameen", "send this to 10 people").

## 4. Pillars (starting mix — adjust from results)

| Pillar | What it covers | Share |
|---|---|---|
| A: Qur'an & Hadith | One Ayah, One Lesson · authentic hadith explained simply · Qur'anic lessons for everyday problems · misunderstood verses with their context | 30% |
| B: Heart-Softening Reminders | Hard days · sabr without losing hope · tawakkul · repentance and returning to Allah | 20% |
| C: Daily Deen & Practical Islam | Small acts of worship · adab, honesty, kindness, patience · salah and daily habits · deen at work and home | 15% |
| D: Dua & Dhikr | Morning/evening remembrance · prophetic du'as with meanings · dhikr · du'as for everyday situations | 15% |
| E: Islam in Everyday Life | Parents and family · guarding the tongue · envy, anger, pride, sincerity · integrity and compassion | 10% |
| F: Islamic Calendar & Occasions | Friday reminders · Ramadan · Dhul Hijjah and Eid · seasonal worship | 10% |

## 5. Series — the page's recognisable posts

Set `brief.series`; the pipeline gives every post in a series the same opening (its kicker on the hook and cover). Keep the first three the most frequent.

| Series (`id`) | Concept | Default kind |
|---|---|---|
| One Ayah. One Lesson. (`one-ayah-one-lesson`) | An ayah, its context (neighbouring ayat), one takeaway | carousel |
| A Reminder Your Heart Needs (`heart-reminder`) | A real-life struggle met with a verse or hadith | reel |
| Dua of the Day (`dua-of-the-day`) | Arabic, transliteration where verified, meaning, source | reel or carousel |
| A Muslim's Daily Check-In (`daily-check-in`) | One habit or trait to reflect on, with a short checklist | carousel |
| Before You Scroll (`before-you-scroll`) | A short pause: one source, one action (15–20 s) | reel |

## 6. Kinds and formats

| Kind | Share | What it is | Formats (`src/templates/formats.json`) |
|---|---|---|---|
| `reel` | 50% | 15–30 s (up to 60) video, Qur'an recitation as the only sound | `heart-reminder`, `before-you-scroll`, `ayah-reflection`, `hadith-practice`, `dua`, `habit-checklist`, `heart-check` |
| `carousel` | 35% | 5–7 still slides (4:5), one idea per slide | `ayah-lesson`, `hadith-explained`, `check-in`, `dua-card` |
| `story` | 15% | one 9:16 image + `replyPrompt`; posted without caption, gone after 24 h | `story-check-in`, `story-question` |

Every post follows the formula where it fits: **hook → teaching (source) → reflection → takeaway → gentle CTA**. A dua card may need only the du'a, its meaning, source and a short caption. Stories don't need a source, but any quote still follows the source rule.

**Occasions:** set `publish.occasion` (`friday`, `ramadan`, `last-ten-nights`, `dhul-hijjah-10`, `arafah`, `eid-al-fitr`, `eid-al-adha`, `muharram`, `ashura`) and the draft waits for its day (Umm al-Qura calendar) and goes first on it. Keep one Friday reminder queued per week.

## 7. Quality bar

- **One message per post.** A viewer can repeat the core insight in one sentence and act on it today.
- **Hook:** readable at a glance, honest, relevant to real life ("When life feels uncertain…"). Curiosity is fine; bait is not.
- **The source is the centre.** On reels it gets enough time to be read (the validator enforces a minimum), Arabic first for the Qur'an.
- **Practical reflection:** small, concrete, kind steps. Avoid vague advice ("be better").
- **Gentle CTA**, one per post: "Save this reminder for a difficult day", "Share it with someone who may find it helpful", or a reply prompt on stories.
- **Goal:** set `brief.objective` to what the post is built for — `reach`, `shares`, `saves`, `replies` or `follows`. The weekly report judges each post by its own goal.
- **Tone:** warm, humble, plain English. Speak to one person. Transliterations: Qur'an, du'a, Sunnah, sadaqah, dhikr, salah.
- **Sound (reels):** Qur'an recitation only — no music or effects. By default the first ayah on screen is recited (never cut). A reel without an ayah names a short, genuinely related ayah in `"recitation": {"ref": "quran:…"}`; it is labelled on screen and in the caption.

## 8. Look

Clean and quiet: lots of space, one accent colour, no busy textures. The look rotates automatically (10 palettes × 3 layouts × 4 backdrops × 2 headline typefaces × 3 transitions, repeating every 60 posts), so writers don't set `style` unless a post needs a specific look.

## 9. Packaging

- **Cover / first slide:** kicker + 3–7 words. Our words, not a paraphrased quote presented as the source.
- **Caption:** a specific first line, a little context, the reflection steps, one CTA, 3–6 hashtags. The pipeline appends the sources block (citation, translator, grade, link; recited ayah and reciter) and, for excerpts, the full text.

## 10. Review before posting

Automated QA checks the references, verbatim text, attributions, layout and the files. Posts then approve themselves at the posting time (fully automated mode), so every draft must meet this bar on its own; posts QA is unsure about (ruling-type words, a missing ﷺ) wait for a person. You can still close or hold any post before it goes out.

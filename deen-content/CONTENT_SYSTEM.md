# Daily Deen Reminders — content system

The brand brief for every reel on the page, whoever writes it (you, a queue refill in a Claude chat, or an opt-in paid writer). The pipeline injects this file into the writer prompt, so keep it current.

## 1. What the page is

**Daily Deen Reminders** posts one short Instagram reel a day: a verse of the Qur'an or an authentic hadith, shown word for word with its reference, and one small thing to do or reflect on today.

- **Promise:** authentic, short, usable. Every reel can be checked in one tap (quran.com / sunnah.com link in the caption).
- **Audience:** Muslims of any background who want a sincere daily reminder, in English, without arguments or noise. Many are busy, some are returning to practice; nobody should feel talked down to.
- **What we are not:** a fatwa page, a debate page, a news page, or a motivational-quotes page.

## 2. The source rule (non-negotiable)

Everything the reel attributes to Allah or the Prophet ﷺ comes from a **source scene**, and source scenes take only a reference. The pipeline pulls the exact text from pinned, hash-checked datasets (`sources/sources.json`):

| Collection | What is shown | Reference format |
|---|---|---|
| The Qur'an | Arabic (King Fahd Complex, Hafs) + Saheeh International | `quran:94:5-6` (max 3 consecutive ayat) |
| Sahih al-Bukhari | English (Muhsin Khan); Arabic only via a verbatim `arabicExcerpt` | `bukhari:6114` |
| Sahih Muslim | English (Abdul Hamid Siddiqui); Arabic only via `arabicExcerpt` | `muslim:2564c` |

- No other collections, websites, apps, quote images or "a scholar said". If it isn't in these datasets, it doesn't go on the page.
- `excerpt` / `arabicExcerpt` must be verbatim, contiguous parts of the source (≥40 characters for English) and must not change the meaning of the full text. The caption prints the full text when an excerpt is used.
- Find references with `node scripts/sources/cli.mjs search "<words>"` and read them in full with `node scripts/sources/cli.mjs show <ref>`.
- Pick a source because it genuinely says what the reel is about. Read the whole ayah or hadith (and, for an ayah, the ones around it) before building a reel on it.

## 3. Our own words

Hooks, reflection scenes, checklists, takeaways and captions are **our** words, and the viewer must be able to tell.

- Never write "Allah says…", "the Prophet ﷺ said…", or put anything in quotation marks that isn't verbatim from a quoted source. Describe instead: "This ayah…", "In this hadith…".
- Use ﷺ after the Prophet's name.
- Reflections are suggestions ("Try this today"), not rulings. No halal/haram verdicts, no fiqh positions, no "obligatory", no fatwas. If a topic needs a scholar, it isn't a topic for this page.
- No sectarian, political or current-events content. No criticism of groups of Muslims.
- No promises of specific rewards, punishments or outcomes beyond what the quoted text states.
- No chain-message tactics: "share or…", "type Ameen", "send this to 10 people", "Satan doesn't want you to read this", fear or guilt hooks.

## 4. Pillars

| Pillar | What it covers | Target share |
|---|---|---|
| A: Qur'an Reflections | One ayah, what it asks of us today | 22% |
| B: Prophetic Guidance | A hadith on how to live | 22% |
| C: Character and Manners | Anger, speech, honesty, humility | 18% |
| D: Worship and Daily Habits | Dhikr, du'a, small consistent deeds | 16% |
| E: Family and Community | Parents, neighbours, friends, mercy | 10% |
| F: Hope, Patience and Trust | Hard days, tawakkul, gratitude | 12% |

## 5. Formats

Defined in `src/templates/formats.json`:

- **Ayah Reflection** — hook → the ayah → reflection checklist → takeaway.
- **Hadith in Practice** — hook → the hadith → "try this today" → takeaway.
- **A Du'a for…** — hook → the du'a as it appears in the Qur'an → moments to say it → takeaway.
- **Small Habit, Big Reward** — hook → source behind the habit → how to start → takeaway.
- **Heart Check** — hook naming a feeling → two sources in conversation → a question to sit with.

## 6. Quality bar

- **One reminder per reel.** A viewer can repeat the core insight in one sentence and act on it today.
- **Hook:** readable on frame 0, honest, relevant to real life ("Having a hard week?"). Curiosity is fine; bait is not.
- **The source is the centre.** Give it enough time to be read (the validator enforces a minimum), Arabic first for the Qur'an.
- **Practical reflection:** small, concrete, kind steps. Avoid vague advice ("be better").
- **Takeaway:** a short line worth remembering + one call to action (save or share).
- **Tone:** warm, humble, plain English. Speak to one person. Transliterations: Qur'an, du'a, Sunnah, sadaqah, dhikr, salah.
- **Reels are silent:** no music, no sound effects. Viewers can read at their own pace.

## 7. Packaging

- **Cover:** kicker + 3–7 words inside the 1080×1350 feed crop. Our words, not a paraphrased quote presented as the source.
- **Caption:** a specific first line, a little context, the reflection steps, one CTA, 3–6 hashtags. The pipeline appends the sources block (citation, translator, grade, link) and, for excerpts, the full text.
- **CTA:** "Save" for du'as, habits and checklists; "Send this to someone who needs it" for comfort reminders. One per reel.

## 8. Review before posting

Automated QA checks the references, the verbatim text, attributions, layout and the video file. A person still approves every reel by merging its pull request, after opening each source link and reading the reel once on a phone.

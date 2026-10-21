<!-- The page's content strategy, as provided by the page owner. The pipeline implements it as described in
"How the pipeline implements this" at the end. Edit this file when the strategy changes. -->

# Content Strategy: Islamic Deeni Reminders Instagram Page

The objective is to build a page that Muslims return to daily for reminders, share with family and friends, and trust for authentic Islamic knowledge.

Build the page around faith, reflection, and everyday Muslim life — not just Quranic quote cards. Every post should do at least one of three things: teach something, touch the heart, or inspire an action.

## 1. Content pillars

| # | Pillar | Share | Includes | Purpose |
|---|---|---|---|---|
| 1 | Quran & Hadith — The Foundation | 30% | One Ayah, One Lesson · authentic Hadith explained simply · Quranic lessons for everyday problems · commonly misunderstood verses, explained with context | Trust, saves and repeat readership |
| 2 | Heart-Softening Reminders | 20% | When life feels difficult · sabr without losing hope · tawakkul and letting go · repentance, forgiveness and returning to Allah | Emotional resonance, shares and meaningful engagement |
| 3 | Daily Deen & Practical Islam | 15% | Small acts of worship · adab, honesty, kindness and patience · improving salah and daily habits · applying Islamic teachings at work and home | Practical value and audience loyalty |
| 4 | Dua & Dhikr | 15% | Morning and evening adhkar · prophetic duas with meanings · dhikr and remembrance · supplications for everyday situations, with verified sources | Repeat viewing, saves and daily habits |
| 5 | Islam in Everyday Life | 10% | Rights of parents and family · guarding the tongue and avoiding backbiting · envy, anger, pride and sincerity · integrity at work, compassion and treating others well | Relatability, discussion and sharing |
| 6 | Islamic Calendar & Special Occasions | 10% | Friday reminders · Ramadan preparation and reflections · Dhul Hijjah, Eid and other relevant occasions · seasonal worship guidance and reflection | Timely discovery and community participation |

These percentages are starting allocations, not fixed rules. Adjust them after analysing which content earns sustained reach and genuine engagement.

## 2. Five recognisable content series

| Series | Concept | Best format |
|---|---|---|
| One Ayah. One Lesson. | A Quranic verse, its context, and one takeaway | Carousel |
| A Reminder Your Heart Needs | A reflective message about a real-life struggle | Reel |
| Dua of the Day | Arabic, transliteration, meaning and source | Reel or carousel |
| A Muslim's Daily Check-In | One habit or character trait to reflect on | Carousel |
| Before You Scroll | A short, thoughtful reminder that makes someone pause | Reel |

Each series has its own consistent opening style but shares the same overall visual identity.

## 3. Content formats

- **Reels — reach and discovery (50%).** 15–30-second videos with a compelling first line, one central message, readable text and a satisfying conclusion.
- **Carousels — saves and depth (35%).** 5–7 slides explaining one teaching, a short reflection, or a practical checklist. One idea per slide.
- **Stories — community (15%).** Reflection questions, daily reminders and resurfaced strong posts.

These percentages are an initial planning mix, not an Instagram algorithm rule.

## 4. The content formula

1. **Hook** — make the viewer pause ("When life doesn't go according to your plan, remember this.").
2. **Teaching** — a verified Quranic verse, authentic Hadith, or clearly labelled general reflection, with source and context.
3. **Reflection** — connect it to everyday life without inventing religious interpretations.
4. **Takeaway** — leave the viewer with one action.
5. **Gentle CTA** — "Save this reminder for a difficult day" or "Share it with someone who may find it helpful."

Not every post needs all five steps. A simple dua card may need only the supplication, meaning, source and a brief caption.

## 5. 14-day launch calendar

| Day | Type | Idea | Pillar · goal |
|---|---|---|---|
| 1 | Reel | When life feels uncertain: placing trust in Allah | Heart-softening · shares |
| 2 | Carousel | One Ayah, One Lesson: Ash-Sharh 94:5–6, ease alongside hardship | Quran · saves |
| 3 | Reel | A verified prophetic supplication about beneficial knowledge, Arabic and meaning | Dua & Dhikr · saves |
| 4 | Carousel | Five small ways to practise better adab in everyday conversations | Daily Deen · shares |
| 5 | Reel | A verified teaching on intentions in ordinary actions | Quran & Hadith · reach |
| 6 | Carousel | Backbiting, guarding speech and choosing a kinder response | Everyday Islam · shares |
| 7 | Story | Weekly self-check: gratitude, prayer, speech, kindness, intentions | Weekly reflection · replies |
| 8 | Reel | Repentance and returning to Allah after a mistake | Heart-softening · shares |
| 9 | Carousel | Al-Hujurat 49:12: suspicion, spying and backbiting, in context | Quran · saves |
| 10 | Carousel | A sourced morning remembrance with Arabic, transliteration and translation | Dua & Dhikr · saves |
| 11 | Reel | Practising gratitude through one specific action today | Daily Deen · shares |
| 12 | Carousel | A verified Hadith on kindness, with source, context and a practical example | Quran & Hadith · saves |
| 13 | Reel | Patience at work and home: pause before reacting in anger | Everyday Islam · reach |
| 14 | Story | Ask followers which topic they want next week | Community · replies |

## 6. Rules for Islamic content quality

- Never fabricate Quranic verses, Hadith, narrators, references, or religious quotations.
- Never attribute a viral quote to the Prophet Muhammad ﷺ without verifying its source and authenticity.
- Never invent a specific reward, punishment, or guaranteed outcome for an act of worship.
- Clearly distinguish sourced Islamic teachings from personal reflection or general motivational language.
- For disputed matters, fiqh questions and sensitive theological topics, obtain qualified review rather than publishing an AI-generated ruling.
- Use respectful, non-sensational language; never exploit fear, grief or guilt for engagement.

## 7. Deciding what to create more of

| Goal | Metrics |
|---|---|
| Discovery | Non-follower reach, Reel watch time, completion and shares |
| Educational value | Saves, carousel engagement and substantive questions |
| Community | Story replies, poll participation and thoughtful comments |
| Growth | Profile visits, follows attributed to posts and repeat reach |
| Trust | Source corrections, content quality and audience feedback |

Compare similar formats against the account's own history. A large view count alone doesn't mean a loyal audience.

Make the page feel like a trusted daily companion rather than a content factory: build recognition around the three core series — One Ayah, One Lesson · A Reminder Your Heart Needs · Dua of the Day — and use the other pillars for variety.

---

## How the pipeline implements this

| Strategy | In the pipeline |
|---|---|
| Six pillars and starting mix | `brief.pillar` A–F; `TARGET_MIX` in `deen-content/scripts/daily/plan.mjs`; used by the refill planner and the performance report |
| Five series, each with its own opening | `deen-content/src/templates/series.json`; `brief.series` sets the opening kicker on the hook and cover automatically |
| Reels 50% · carousels 35% · stories 15% | `"kind": "reel" / "carousel" / "story"`; `KIND_MIX` steers refills. Carousels: 4:5 slides posted as an Instagram carousel. Stories: one 9:16 image, posted automatically |
| Hook → teaching → reflection → takeaway → CTA | Formats in `deen-content/src/templates/formats.json`; teaching = `source` scenes (verified text only), reflection = `reflection` scenes (always labelled as our words) |
| Dua of the Day: Arabic, transliteration, meaning, source | Arabic and meaning from the verified datasets; transliteration only where a verified one exists (Qur'an, Tanzil) or where the source's own translation gives it (e.g. Sahih al-Bukhari 6306) |
| Context for an ayah | The neighbouring ayat, quoted verbatim — no AI-written tafsir |
| Friday, Ramadan, Dhul Hijjah… | `publish.occasion`; drafts wait for their day (Umm al-Qura calendar, `scripts/daily/occasions.mjs`) and go first on it |
| Story polls, quizzes, question stickers | Not available through Instagram's API: stories post as images with a reply prompt; add stickers by hand in the app if wanted |
| Quality rules (§6) | QA: approved collections only, verbatim quotes, no attribution in our own words, ruling-word and honorific warnings, no bait; fiqh/disputed topics stay off the page; a person approves every post |
| Judge by intended purpose (§7) | `brief.objective` (reach, shares, saves, replies, follows); the weekly report has a "By goal" table and breakdowns by kind and series |
| 14-day launch calendar | `deen-content/data/queue/q001`–`q014`, then occasion drafts and further reminders |

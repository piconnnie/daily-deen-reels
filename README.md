# Daily Deen Reels

Daily Instagram posts for the **Daily Deen Reminders** page — reels, carousels and stories — following the page's content strategy ([`docs/CONTENT_STRATEGY.md`](docs/CONTENT_STRATEGY.md)): six pillars, five recurring series (One Ayah. One Lesson. · A Reminder Your Heart Needs · Dua of the Day · A Muslim's Daily Check-In · Before You Scroll), Friday and seasonal reminders on their dates, and every verse or hadith shown word for word with its reference.

**Verified sources only.** Reels quote only the Qur'an (King Fahd Complex Hafs text + Saheeh International), Sahih al-Bukhari and Sahih Muslim. Drafts contain references, never typed quotes: the pipeline pulls the exact text from pinned, hash-checked datasets, and QA blocks anything that doesn't match, isn't from an approved collection, or attributes words to Allah or the Prophet ﷺ outside a quoted source. See [`deen-content/sources/README.md`](deen-content/sources/README.md).

Runs **completely free by default**: each morning the next pre-written draft comes from a content queue (no AI model at run time), Remotion renders it on free GitHub Actions minutes, automated QA checks the sources, copy, layout and the Instagram video spec, and a review PR opens with previews and a source checklist. It runs **fully automated**: at the daily slot (default 19:00 IST) the post approves itself and goes out through Instagram's free API, unless you close the PR or put it on `hold` first; posts with QA warnings wait for you. A weekly scheduled Claude task refills the queue. The only audio is Qur'an recitation by approved reciters, never cut mid-ayah. The look rotates through 60 clean combinations. Paid writers (Claude subscription or API) are opt-in via the `DEEN_WRITER` variable and follow the same source rules.

- Setup and day-to-day use: [`deen-content/AUTOMATION.md`](deen-content/AUTOMATION.md)
- Editorial rules (the brief every writer follows): [`deen-content/CONTENT_SYSTEM.md`](deen-content/CONTENT_SYSTEM.md)
- Verified sources and the source tools: [`deen-content/sources/README.md`](deen-content/sources/README.md)
- Content engine, brand system and QA gates: [`deen-content/README.md`](deen-content/README.md)
- **Control panel** (review, approve, schedule, pause — in the browser): [`control-panel/`](control-panel), published to GitHub Pages
- Workflows: [`.github/workflows`](.github/workflows)
- Offline end-to-end test of the workflows: `deen-content/scripts/test/harness/e2e.sh` (after `npm run sources:fetch`)

Built from the same engine as the AI Product Manager reel pipeline (`piconnnie/aipm-reels`).

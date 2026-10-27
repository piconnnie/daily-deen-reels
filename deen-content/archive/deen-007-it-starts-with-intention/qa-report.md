# QA report — deen-007-it-starts-with-intention

Status: **automated-passed** · 49/49 passed · 0 error(s) · 0 warning(s)

| Gate | Check | Result | Detail |
|---|---|---|---|
| content | No TODO placeholders left | ✅ |  |
| content | Copy and structure fit the layout limits | ✅ |  |
| content | Three hook variants generated | ✅ | 3 variants |
| content | Selected hook is short enough to read in ~2s | ✅ | 4 words |
| content | First scene is the hook | ✅ |  |
| content | Core insight stated in one sentence | ✅ | The first hadith in Sahih al-Bukhari ties every deed to its intention, so an ordinary action can be done for Allah. |
| content | Duration within 15–60s | ✅ | 19.5s |
| content | No scene shorter than 1.5s | ✅ |  |
| content | Style names are valid | ✅ |  |
| content | Exactly one on-screen CTA, matching primaryCta | ✅ | Share it with a friend |
| content | Caption asks for one action only | ✅ | CTA verbs found: share |
| content | No hype or chain-message bait | ✅ |  |
| content | Hashtags: small relevant set (3–8) | ✅ | 4 |
| content | Caption under Instagram 2,200-char limit | ✅ | 722 chars |
| content | Cover headline 3–7 words | ✅ | 4 words |
| source | Quotes at least one verse or authentic hadith | ✅ | 1 source scene(s) |
| source | Every reference is in an approved collection and exists | ✅ |  |
| source | On-screen quotes match the source word for word | ✅ |  |
| source | Caption source list covers every quote (citation + link) | ✅ |  |
| source | Claims are 'source' (with a quoted ref) or 'reflection' | ✅ |  |
| source | Own words never attribute speech to Allah or the Prophet ﷺ (that is what source scenes are for) | ✅ |  |
| source | Quoted text in the caption is verbatim from a cited source | ✅ |  |
| source | Recitation (Qur'an 6:162, Mahmoud Khalil Al-Husary) is verified and plays in full | ✅ |  |
| source | Every hadith is from a Sahih collection | ✅ |  |
| source | No ruling-type language in our own words (reminders, not fatwas) | ✅ |  |
| source | Honorific ﷺ after the Prophet's name in our own words | ✅ |  |
| visual | All visible text inside Instagram safe zone | ✅ |  |
| visual | No truncated/clipped text | ✅ |  |
| visual | Cover text inside centred 1080×1350 feed crop | ✅ |  |
| technical | Resolution 1080×1920 | ✅ | 1080×1920 |
| technical | Frame rate 30 fps | ✅ | 30/1 |
| technical | Video codec H.264, yuv420p | ✅ | h264 yuv420p High |
| technical | Frame count matches composition | ✅ | 585 vs 585 |
| technical | Duration matches composition (±0.1s) | ✅ | 19.50s vs 19.50s |
| technical | Audio AAC 48 kHz stereo | ✅ | aac 48000 2ch |
| technical | Integrated loudness in −20…−12 LUFS | ✅ | -14.5 LUFS |
| technical | True peak ≤ −1.0 dBTP (no clipping) | ✅ | -2.4 dBTP |
| technical | IG: moov atom at front of file (faststart) | ✅ | moov@36 mdat@22746 |
| technical | IG: no MP4 edit lists | ✅ |  |
| technical | IG: video bitrate ≤ 25 Mbps | ✅ | 0.20 Mbps |
| technical | IG: audio bitrate ≤ 160 kbps (target 128) | ✅ | 122 kbps |
| technical | IG: file size ≤ 300 MB | ✅ | 0.8 MB |
| technical | IG: JPEG cover ≤ 8 MB | ✅ | 50 KB |
| technical | Full decode with zero errors (file plays) | ✅ |  |
| technical | No black frames/gaps | ✅ |  |
| technical | Review frames extracted from final MP4 | ✅ | 9 frames |
| technical | Contact sheet built | ✅ | output/qa/deen-007-it-starts-with-intention/contact-sheet.png |
| technical | Cover 1080×1920 PNG | ✅ | 1080×1920 |
| technical | All local asset dependencies present | ✅ |  |

## Manual checks still required before approval
- [ ] Open every source link (quran.com / sunnah.com) and confirm the quote, reference and translation match what is on screen.
- [ ] Read our own words (hook, reflection, caption) once more: nothing is attributed to Allah or the Prophet ﷺ that is not in the quoted source, and nothing reads as a ruling.
- [ ] Watch the full MP4 at normal speed on a phone (pacing, readability, transitions) and listen to the recitation: it starts cleanly and is never cut.
- [ ] Read the caption once more in Instagram's composer before posting.

#!/usr/bin/env node
// Quality gates for a reel. Runs automated content, visual-layout and
// technical checks, extracts review frames, and records results in metadata.
//   node scripts/validate-content.mjs <reelId> [--content-only]
// Automated checks cannot replace a human watching and listening; those two
// checks are recorded as pending until `npm run approve` confirms them.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, captionText, kindOf, slideFiles, ensureDir, loadReel, readJsonIfExists, reelIdArg, saveReel, sceneTimings, totalFrames} from './lib.mjs';
import {syncRegistry} from './sync-registry.mjs';
import {checkLimits, sourceDisplay} from './content-limits.mjs';
import {compareKey, isVerbatimExcerpt, resolveRef} from './sources/sources.mjs';
import {checkRecitation} from './sources/recitation.mjs';
import {STYLE_OPTIONS, pickStyle} from './style.mjs';

syncRegistry();

const id = reelIdArg();
const contentOnly = process.argv.includes('--content-only');
const preRender = process.argv.includes('--pre-render'); // content + layout, no MP4 checks
const jsonOut = process.argv.includes('--json');
const reel = loadReel(id);
const timings = sceneTimings(reel);
const frames = totalFrames(reel);
const expectedSec = frames / reel.fps;
const qaDir = path.join(OUT.qa, id);
ensureDir(path.join(qaDir, 'frames'));

const checks = [];
const add = (gate, name, pass, detail = '', severity = 'error') => checks.push({gate, name, pass: !!pass, severity, detail});

// ---------------------------------------------------------------- Content QA
const hook = reel.hooks[reel.selectedHook];
const hookWords = hook.text.split(/\s+/).length;
const todos = (JSON.stringify(reel).match(/TODO:/g) ?? []).length;
add('content', 'No TODO placeholders left', todos === 0, todos ? `${todos} placeholder(s)` : '');
const limitIssues = checkLimits(reel);
add('content', 'Copy and structure fit the layout limits', limitIssues.length === 0, limitIssues.join(' | '));
add('content', 'Three hook variants generated', reel.hooks.length >= 3, `${reel.hooks.length} variants`);
add('content', 'Selected hook is short enough to read in ~2s', hookWords <= 10, `${hookWords} words`);
const kind = kindOf(reel);
const isReel = kind === 'reel';
if (kind !== 'story') add('content', `First ${isReel ? 'scene' : 'slide'} is the hook`, reel.scenes[0]?.type === 'hook');
add('content', 'Core insight stated in one sentence', reel.coreInsight && reel.coreInsight.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length <= 1, reel.coreInsight);
if (isReel) {
  add('content', 'Duration within 15–60s', expectedSec >= 15 && expectedSec <= 60, `${expectedSec.toFixed(1)}s`, 'warning');
  const shortScenes = reel.scenes.filter((s) => s.durationInFrames < reel.fps * 1.5);
  add('content', 'No scene shorter than 1.5s', shortScenes.length === 0, shortScenes.map((s) => s.id).join(', '));
}
if (kind === 'carousel') {
  const n = reel.scenes.length;
  add('content', 'Carousel has 5–7 slides (strategy)', n >= 5 && n <= 7, `${n} slides`, 'warning');
}
if (kind === 'story') add('content', 'Story invites a reply (replyPrompt)', !!reel.replyPrompt, reel.replyPrompt ?? 'missing', 'warning');

const takeaway = reel.scenes.find((s) => s.type === 'takeaway');
{
  const st = reel.style ?? {};
  const bad = [
    st.theme && !STYLE_OPTIONS.themes.includes(st.theme) && `theme "${st.theme}" (use ${STYLE_OPTIONS.themes.join('/')})`,
    st.music && !STYLE_OPTIONS.music.includes(st.music) && `music "${st.music}" (use ${STYLE_OPTIONS.music.join('/')})`,
    st.motion && !STYLE_OPTIONS.motion.includes(st.motion) && `motion "${st.motion}" (use ${STYLE_OPTIONS.motion.join('/')})`,
    st.layout && !STYLE_OPTIONS.layouts.includes(st.layout) && `layout "${st.layout}" (use ${STYLE_OPTIONS.layouts.join('/')})`,
    st.backdrop && !STYLE_OPTIONS.backdrops.includes(st.backdrop) && `backdrop "${st.backdrop}" (use ${STYLE_OPTIONS.backdrops.join('/')})`,
    st.type && !STYLE_OPTIONS.type.includes(st.type) && `type "${st.type}" (use ${STYLE_OPTIONS.type.join('/')})`,
  ].filter(Boolean);
  add('content', 'Style names are valid', bad.length === 0, bad.join('; '));
}
if (kind !== 'story') add('content', 'Exactly one on-screen CTA, matching primaryCta', takeaway && takeaway.cta === reel.primaryCta.text, takeaway?.cta ?? 'no takeaway scene');
const ctaVerbs = ['save', 'share', 'follow', 'comment'];
const ctaHits = ctaVerbs.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(reel.caption.cta));
add('content', 'Caption asks for one action only', ctaHits.length <= 1, `CTA verbs found: ${ctaHits.join(', ') || 'none'}`);

// Hype and religious chain-message bait.
const banned = [/you won'?t believe/, /mind-?blowing/, /guaranteed/, /\bsecret\b/, /share (this|it) or\b/, /if you don'?t share/, /(send|share|forward) (this|it) to \d+/, /type ["“]?ameen/, /\bignore this\b/, /99% of/, /only 1%/, /will punish you/, /scroll(ing)? past/, /satan (will )?stop/];
const allCopy = JSON.stringify({s: reel.scenes.map((x) => ({...x, resolved: undefined})), c: reel.caption, h: hook.text}).toLowerCase();
const hype = banned.filter((b) => b.test(allCopy)).map((b) => b.source);
add('content', 'No hype or chain-message bait', hype.length === 0, hype.join(', '));
add('content', 'Hashtags: small relevant set (3–8)', reel.caption.hashtags.length >= 3 && reel.caption.hashtags.length <= 8, `${reel.caption.hashtags.length}`);
const capLen = captionText(reel).length;
add('content', 'Caption under Instagram 2,200-char limit', capLen <= 2200, `${capLen} chars`);
const coverWords = reel.cover.headline.map((l) => l.text).join(' ').split(/\s+/).length;
add('content', 'Cover headline 3–7 words', coverWords >= 3 && coverWords <= 7, `${coverWords} words`);

// ------------------------------------------------------- Source integrity
// Quotes must come from the pinned datasets, word for word. Our own words must
// never put speech in the mouth of Allah or the Prophet ﷺ.
{
  const sourceScenes = reel.scenes.filter((s) => s.type === 'source');
  if (kind !== 'story') add('source', 'Quotes at least one verse or authentic hadith', sourceScenes.length >= 1, `${sourceScenes.length} source scene(s)`);
  const refProblems = [];
  const textProblems = [];
  const fresh = new Map();
  for (const s of sourceScenes) {
    let r;
    try {
      r = resolveRef(s.ref);
      fresh.set(s.ref, r);
    } catch (e) {
      refProblems.push(`${s.id}: ${e.message}`);
      continue;
    }
    const got = s.resolved ?? {};
    for (const f of ['citation', 'url', 'arabic', 'english', 'translation', 'grade', 'transliteration']) {
      if ((got[f] ?? null) !== (r[f] ?? null)) textProblems.push(`${s.id}: ${f} differs from ${r.citation} in the dataset`);
    }
    if (s.excerpt && !isVerbatimExcerpt(s.excerpt, r.english)) textProblems.push(`${s.id}: excerpt is not a word-for-word part of ${r.citation}`);
    if (s.arabicExcerpt && !isVerbatimExcerpt(s.arabicExcerpt, r.arabic)) textProblems.push(`${s.id}: Arabic excerpt is not a word-for-word part of ${r.citation}`);
    if (r.kind === 'hadith' && s.showArabic && !s.arabicExcerpt) textProblems.push(`${s.id}: hadith Arabic includes the full chain of narration — give a verbatim arabicExcerpt instead of showArabic`);
  }
  add('source', 'Every reference is in an approved collection and exists', refProblems.length === 0, refProblems.join(' | '));
  add('source', 'On-screen quotes match the source word for word', textProblems.length === 0, textProblems.join(' | '));

  const listed = new Set((reel.sources ?? []).map((x) => `${x.ref}|${x.url}`));
  const missing = [...fresh.values()].filter((r) => !listed.has(`${r.ref}|${r.url}`)).map((r) => r.citation);
  add('source', 'Caption source list covers every quote (citation + link)', missing.length === 0, missing.join(', '));

  // Claims: 'source' claims must point at a quoted ref; nothing else is allowed.
  const quoted = new Set(sourceScenes.map((s) => s.ref));
  const badClaims = (reel.claims ?? []).filter((c) => !['source', 'reflection'].includes(c.kind) || (c.kind === 'source' && !quoted.has(c.ref)));
  add('source', "Claims are 'source' (with a quoted ref) or 'reflection'", badClaims.length === 0, badClaims.map((c) => c.text).join(' | '));

  // Our own copy (everything except the resolved quotes).
  const own = [];
  for (const s of reel.scenes) {
    // A source scene's kicker labels the quote right below it ("THE PROPHET ﷺ SAID").
    if (s.type === 'source') continue;
    own.push(JSON.stringify({...s, storyboard: undefined, purpose: undefined, sfx: undefined}));
  }
  own.push(reel.caption.opening, ...reel.caption.body, reel.caption.cta, reel.cover.kicker, ...reel.cover.headline.map((l) => l.text), ...reel.hooks.map((h) => h.text));
  const ownText = own.join(' \n ');
  const attribution = /\b(allah|god|the lord|prophet|messenger|rasul|rasool|muhammad)\b[^.\n]{0,40}\b(said|says|saying|stated|states|told|tells|commanded|commands|promised|promises|declared|declares)\b/i;
  const reverse = /\b(said|says|stated|states|told|tells)\b[^.\n]{0,12}\b(allah|prophet|messenger)\b/i;
  const hit = ownText.match(attribution) ?? ownText.match(reverse);
  add('source', 'Own words never attribute speech to Allah or the Prophet ﷺ (that is what source scenes are for)', !hit, hit ? `"${hit[0]}"` : '');

  // Quotation marks in our own copy must enclose a verbatim piece of a quoted source.
  const quoteRe = /[“"]([^”"]{12,})[”"]/g;
  const allSourceText = [...fresh.values()].map((r) => r.english).join(' ');
  const ownCaption = [reel.caption.opening, ...reel.caption.body].join(' ');
  const stray = [...ownCaption.matchAll(quoteRe)].map((m) => m[1]).filter((q) => !compareKey(allSourceText).includes(compareKey(q)));
  add('source', 'Quoted text in the caption is verbatim from a cited source', stray.length === 0, stray.map((q) => `"${q.slice(0, 60)}"`).join(' | '));

  // Recitation: approved reciter, recorded files unchanged, never cut mid-ayah.
  const rec = reel.recitation;
  if (!isReel) {
    // carousels and stories are images: no audio
  } else if (rec && !rec.off) {
    const rp = checkRecitation(reel);
    add('source', `Recitation (${rec.citation ?? rec.ref}, ${rec.reciterName ?? rec.reciter}) is verified and plays in full`, rp.length === 0, rp.join(' | '));
  } else {
    add('source', 'Recitation present', false, rec?.off ? 'turned off for this reel' : 'no Qur\'an reference to recite — add "recitation": {"ref": "quran:…"} for a related ayah', 'warning');
  }

  // Hadith grading: only collections marked Sahih in sources/sources.json.
  const ungraded = [...fresh.values()].filter((r) => r.kind === 'hadith' && r.grade !== 'Sahih');
  add('source', 'Every hadith is from a Sahih collection', ungraded.length === 0, ungraded.map((r) => r.citation).join(', '));

  // Review prompts (warnings): rulings and honorifics.
  const ruling = ownText.match(/\b(haram|halal|fard|wajib|makruh|bid'?ah|fatwa|kufr|kafir|forbidden|obligatory|sinful)\b/i);
  add('source', 'No ruling-type language in our own words (reminders, not fatwas)', !ruling, ruling ? `found "${ruling[0]}" — make sure this isn't issuing a ruling` : '', 'warning');
  const bareProphet = ownText.match(/\b(the Prophet|Prophet Muhammad|the Messenger(?: of Allah)?)\b(?!\s*\(?ﷺ)/);
  add('source', 'Honorific ﷺ after the Prophet\'s name in our own words', !bareProphet, bareProphet ? `"${bareProphet[0]}" without ﷺ` : '', 'warning');
  void sourceDisplay;
}

// ------------------------------------------------------- Visual layout QA
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts});

if (!contentOnly && !isReel) {
  // Each slide/story image at its settled state, against its canvas box.
  const issues = [];
  let ran = true;
  for (let i = 0; i < reel.scenes.length; i++) {
    const out = path.join(qaDir, `layout-slide-${i + 1}.json`);
    const r = run('node', ['scripts/local-render/render.mjs', 'layout-check', id, out, '--frames', '0', '--slide', String(i)]);
    if (r.status !== 0) {
      ran = false;
      add('visual', `Layout check ran (slide ${i + 1})`, false, (r.stderr || r.stdout).slice(-400));
      continue;
    }
    for (const x of JSON.parse(fs.readFileSync(out, 'utf8')).results[0].issues) issues.push({slide: i + 1, ...x});
  }
  if (ran) {
    add('visual', `All text inside the ${kind} safe area`, !issues.some((i) => i.type === 'outside-safe-zone'), issues.filter((i) => i.type === 'outside-safe-zone').map((i) => `slide ${i.slide} "${i.text}"`).join('; '));
    add('visual', 'No truncated/clipped text', !issues.some((i) => i.type === 'truncated-text'), issues.filter((i) => i.type === 'truncated-text').map((i) => `slide ${i.slide} "${i.text}"`).join('; '));
  }
}
if (!contentOnly && isReel) {
  // Frames where each scene is fully revealed (8 frames before its end) and mid-scene.
  const sample = [...new Set(timings.flatMap((t) => [Math.floor((t.startFrame + t.endFrame) / 2), t.endFrame - 8]))];
  const layoutOut = path.join(qaDir, 'layout.json');
  const r = run('node', ['scripts/local-render/render.mjs', 'layout-check', id, layoutOut, '--frames', sample.join(',')]);
  if (r.status === 0) {
    const res = JSON.parse(fs.readFileSync(layoutOut, 'utf8'));
    const issues = res.results.flatMap((x) => x.issues.map((i) => ({frame: x.frame, ...i})));
    add('visual', 'All visible text inside Instagram safe zone', !issues.some((i) => i.type === 'outside-safe-zone'), issues.filter((i) => i.type === 'outside-safe-zone').map((i) => `f${i.frame} "${i.text}"`).join('; '));
    add('visual', 'No truncated/clipped text', !issues.some((i) => i.type === 'truncated-text'), issues.filter((i) => i.type === 'truncated-text').map((i) => `f${i.frame} "${i.text}"`).join('; '));
  } else {
    add('visual', 'Layout check ran', false, (r.stderr || r.stdout).slice(-400));
  }
  const rc = run('node', ['scripts/local-render/render.mjs', 'layout-check', id, path.join(qaDir, 'layout-cover.json'), '--frames', '0', '--cover', '1']);
  if (rc.status === 0) {
    const res = JSON.parse(fs.readFileSync(path.join(qaDir, 'layout-cover.json'), 'utf8'));
    const n = res.results[0].issues.length;
    add('visual', 'Cover text inside centred 1080×1350 feed crop', n === 0, n ? JSON.stringify(res.results[0].issues) : '');
  }
}

// ---------------------------------------------------------- Technical QA
const mp4 = path.join(OUT.reels, `${id}.mp4`);
const cover = path.join(OUT.covers, `${id}.png`);
if (!contentOnly && !preRender && !isReel) {
  const jpgs = slideFiles(id, 'jpg');
  const want = kind === 'story' ? [1080, 1920] : [1080, 1350];
  add('technical', `${reel.scenes.length} ${kind === 'story' ? 'story image' : 'slide'}(s) rendered as JPEG`, jpgs.length === reel.scenes.length, `${jpgs.length} file(s)`);
  const bad = jpgs
    .map((f) => {
      const st = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', f]).stdout).streams[0];
      const size = fs.statSync(f).size;
      return st.width !== want[0] || st.height !== want[1] || size > 8 * 1024 * 1024 ? `${path.basename(f)} ${st.width}×${st.height} ${(size / 1024).toFixed(0)} KB` : null;
    })
    .filter(Boolean);
  add('technical', `IG: every image ${want[0]}×${want[1]} JPEG ≤ 8 MB`, bad.length === 0, bad.join('; '));
  add('technical', 'IG: carousel has 2–10 images', kind === 'story' || (jpgs.length >= 2 && jpgs.length <= 10), `${jpgs.length}`);
  if (jpgs.length) {
    const cols = Math.min(jpgs.length, 4);
    const sheet = run('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(OUT.slides, id, 'slide-*.png'), '-vf', `scale=${kind === 'story' ? '270:480' : '324:405'},tile=${cols}x${Math.ceil(jpgs.length / cols)}:padding=6:color=0x222222`, '-frames:v', '1', path.join(qaDir, 'contact-sheet.png')]);
    add('technical', 'Contact sheet built', sheet.status === 0, path.relative(ROOT, path.join(qaDir, 'contact-sheet.png')));
  }
}
if (!contentOnly && !preRender && isReel) {
  if (!fs.existsSync(mp4)) {
    add('technical', 'Reel MP4 exists', false, path.relative(ROOT, mp4));
  } else {
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', mp4]).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    const a = probe.streams.find((s) => s.codec_type === 'audio');
    // Picture length is what must match; audio may carry a few ms of AAC padding.
    const dur = Number(v.duration ?? probe.format.duration);
    add('technical', 'Resolution 1080×1920', v.width === 1080 && v.height === 1920, `${v.width}×${v.height}`);
    add('technical', 'Frame rate 30 fps', v.r_frame_rate === '30/1', v.r_frame_rate);
    add('technical', 'Video codec H.264, yuv420p', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p', `${v.codec_name} ${v.pix_fmt} ${v.profile}`);
    add('technical', 'Frame count matches composition', Number(v.nb_frames) === frames, `${v.nb_frames} vs ${frames}`);
    add('technical', 'Duration matches composition (±0.1s)', Math.abs(dur - expectedSec) <= 0.1, `${dur.toFixed(2)}s vs ${expectedSec.toFixed(2)}s`);
    const silent = !(reel.recitation && !reel.recitation.off) && !reel.audio.voiceover;
    if (silent) add('technical', 'Silent reel: AAC 48 kHz stereo track present', a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate} ${a.channels}ch` : 'no audio stream');
    if (!silent && (reel.audio.bed || reel.audio.voiceover)) {
      add('technical', 'Audio AAC 48 kHz stereo', a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate} ${a.channels}ch` : 'no audio stream');
      const eb = run('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
      const I = Number((eb.match(/I:\s+(-?[\d.]+) LUFS/g) ?? []).pop()?.match(/-?[\d.]+/)[0]);
      const tp = Number((eb.match(/Peak:\s+(-?[\d.]+) dBFS/g) ?? []).pop()?.match(/-?[\d.]+/)[0]);
      add('technical', 'Integrated loudness in −20…−12 LUFS', I >= -20 && I <= -12, `${I} LUFS`);
      add('technical', 'True peak ≤ −1.0 dBTP (no clipping)', tp <= -1.0, `${tp} dBTP`);
    }
    // Instagram Reels container/codec requirements.
    const head = Buffer.alloc(Math.min(fs.statSync(mp4).size, 4 * 1024 * 1024));
    const fd = fs.openSync(mp4, 'r');
    fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    const moovAt = head.indexOf('moov');
    const mdatAt = head.indexOf('mdat');
    add('technical', 'IG: moov atom at front of file (faststart)', moovAt >= 0 && (mdatAt < 0 || moovAt < mdatAt), `moov@${moovAt} mdat@${mdatAt}`);
    add('technical', 'IG: no MP4 edit lists', head.indexOf('elst') < 0 || head.indexOf('elst') > (mdatAt < 0 ? Infinity : mdatAt), head.indexOf('elst') >= 0 && head.indexOf('elst') < (mdatAt < 0 ? Infinity : mdatAt) ? 'edit list found' : '');
    const vbr = Number(v.bit_rate ?? 0);
    add('technical', 'IG: video bitrate ≤ 25 Mbps', vbr > 0 && vbr <= 25e6, `${(vbr / 1e6).toFixed(2)} Mbps`);
    // Encoded at 128k (IG's recommendation); the AAC encoder overshoots a little on
    // bright, dense music, which Instagram accepts (it re-encodes on upload).
    if (a) add('technical', 'IG: audio bitrate ≤ 160 kbps (target 128)', Number(a.bit_rate) <= 160000, `${Math.round(Number(a.bit_rate) / 1000)} kbps`);
    add('technical', 'IG: file size ≤ 300 MB', fs.statSync(mp4).size <= 300 * 1024 * 1024, `${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB`);
    const jpg = path.join(OUT.covers, `${id}.jpg`);
    add('technical', 'IG: JPEG cover ≤ 8 MB', fs.existsSync(jpg) && fs.statSync(jpg).size <= 8 * 1024 * 1024, fs.existsSync(jpg) ? `${(fs.statSync(jpg).size / 1024).toFixed(0)} KB` : 'missing');
    const dec = run('ffmpeg', ['-v', 'error', '-i', mp4, '-f', 'null', '-']);
    add('technical', 'Full decode with zero errors (file plays)', dec.status === 0 && !dec.stderr.trim(), dec.stderr.trim().slice(0, 300));
    const bd = run('ffmpeg', ['-hide_banner', '-i', mp4, '-vf', 'blackdetect=d=0.2:pix_th=0.02', '-an', '-f', 'null', '-']).stderr;
    add('technical', 'No black frames/gaps', !/black_start/.test(bd), (bd.match(/black_start:\S+ black_end:\S+/g) ?? []).join(', '));

    // Review frames: first, last, every scene mid, and both sides of every cut.
    const picks = new Map([[0, 'first'], [frames - 1, 'last']]);
    timings.forEach((t, i) => {
      picks.set(Math.floor((t.startFrame + t.endFrame) / 2), `s${i + 1}-mid`);
      if (i > 0) {
        picks.set(t.startFrame - 2, `s${i}-out`);
        picks.set(t.startFrame + 3, `s${i + 1}-in`);
      }
    });
    fs.readdirSync(path.join(qaDir, 'frames')).forEach((f) => fs.unlinkSync(path.join(qaDir, 'frames', f)));
    const sorted = [...picks.entries()].sort((x, y) => x[0] - y[0]);
    // Exact frame selection by index (seeking can miss the final frame).
    const tmpPattern = path.join(qaDir, 'frames', 'tmp-%03d.png');
    const select = sorted.map(([f]) => `eq(n\\,${f})`).join('+');
    run('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select='${select}'`, '-fps_mode', 'passthrough', tmpPattern]);
    sorted.forEach(([f, label], i) => {
      const tmp = path.join(qaDir, 'frames', `tmp-${String(i + 1).padStart(3, '0')}.png`);
      if (fs.existsSync(tmp)) fs.renameSync(tmp, path.join(qaDir, 'frames', `${String(f).padStart(4, '0')}-${label}.png`));
    });
    const files = fs.readdirSync(path.join(qaDir, 'frames')).filter((f) => f.endsWith('.png')).sort();
    add('technical', 'Review frames extracted from final MP4', files.length === sorted.length, `${files.length} frames`);
    const cols = 6;
    const sheet = run('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(qaDir, 'frames', '*.png'), '-vf', `scale=270:480,tile=${cols}x${Math.ceil(files.length / cols)}:padding=6:color=0x222222`, '-frames:v', '1', path.join(qaDir, 'contact-sheet.png')]);
    add('technical', 'Contact sheet built', sheet.status === 0, path.relative(ROOT, path.join(qaDir, 'contact-sheet.png')));
  }
  if (fs.existsSync(cover)) {
    const cp = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', cover]).stdout).streams[0];
    add('technical', 'Cover 1080×1920 PNG', cp.width === 1080 && cp.height === 1920, `${cp.width}×${cp.height}`);
  } else add('technical', 'Cover exists', false);
  const deps = ['public/fonts/InterDisplay-Bold.otf', 'public/fonts/Inter-Medium.otf', 'public/fonts/DejaVuSansMono-Bold.ttf', 'public/fonts/KFGQPC-Uthmanic-Hafs-v13.ttf', 'public/fonts/Amiri-Regular.ttf', reel.audio.bed && `public/${reel.audio.bed}`].filter(Boolean);
  const missing = deps.filter((d) => !fs.existsSync(path.join(ROOT, d)));
  add('technical', 'All local asset dependencies present', missing.length === 0, missing.join(', '));
}

// ----------------------------------------------------------------- Report
const errors = checks.filter((c) => !c.pass && c.severity === 'error');
const warnings = checks.filter((c) => !c.pass && c.severity === 'warning');
const manualPending = [
  'Open every source link (quran.com / sunnah.com) and confirm the quote, reference and translation match what is on screen.',
  'Read our own words (hook, reflection, caption) once more: nothing is attributed to Allah or the Prophet ﷺ that is not in the quoted source, and nothing reads as a ruling.',
  'Watch the full MP4 at normal speed on a phone (pacing, readability, transitions) and listen to the recitation: it starts cleanly and is never cut.',
  'Read the caption once more in Instagram\'s composer before posting.',
];
const status = errors.length ? 'failed' : contentOnly ? 'content-passed' : preRender ? 'pre-render-passed' : 'automated-passed';
const report = {contentId: id, ranAt: new Date().toISOString(), status, errors: errors.length, warnings: warnings.length, checks, manualChecksPending: manualPending};
fs.writeFileSync(path.join(qaDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const md = [
  `# QA report — ${id}`,
  '',
  `Status: **${status}** · ${checks.length - errors.length - warnings.length}/${checks.length} passed · ${errors.length} error(s) · ${warnings.length} warning(s)`,
  '',
  '| Gate | Check | Result | Detail |',
  '|---|---|---|---|',
  ...checks.map((c) => `| ${c.gate} | ${c.name} | ${c.pass ? '✅' : c.severity === 'warning' ? '⚠️' : '❌'} | ${String(c.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
  '',
  '## Manual checks still required before approval',
  ...manualPending.map((m) => `- [ ] ${m}`),
];
fs.writeFileSync(path.join(qaDir, 'report.md'), md.join('\n') + '\n');

const metaPath = path.join(OUT.metadata, `${id}.json`);
const meta = contentOnly || preRender ? null : readJsonIfExists(metaPath);
if (meta) {
  meta.qa = {status, ranAt: report.ranAt, errors: errors.length, warnings: warnings.length, report: `output/qa/${id}/report.md`, manualChecks: {status: 'pending', items: manualPending}};
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
} else if (!contentOnly && !preRender) {
  console.warn('No metadata yet — run `npm run package -- <id>` to create it.');
}
if (status === 'automated-passed' && reel.status === 'rendered') {
  reel.status = 'qa-passed';
  saveReel(reel);
}

if (jsonOut) {
  console.log(JSON.stringify(report));
  process.exit(errors.length ? 1 : 0);
}
for (const c of checks) console.log(`${c.pass ? 'PASS' : c.severity === 'warning' ? 'WARN' : 'FAIL'}  [${c.gate}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\n${status.toUpperCase()}: ${errors.length} error(s), ${warnings.length} warning(s). Report: output/qa/${id}/report.md`);
process.exit(errors.length ? 1 : 0);

#!/usr/bin/env node
// Builds the publishing package for a reel from its content file:
//   output/captions/<id>.txt          Instagram caption (ready to paste)
//   output/storyboards/<id>.md        Storyboard + script + voiceover edit plan
//   output/storyboards/<id>.srt       Subtitle/narration timing (for VO or accessibility)
//   output/metadata/<id>.json         Machine-readable publishing metadata
// Re-running preserves QA results and approval already recorded in metadata.
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, ensureDir, fmtTime, loadReel, readJsonIfExists, reelIdArg, sceneTimings, srtTime, totalFrames, captionText as buildCaption} from './lib.mjs';

const id = reelIdArg();
const reel = loadReel(id);
const timings = sceneTimings(reel);
const durationSec = +(totalFrames(reel) / reel.fps).toFixed(2);
Object.values(OUT).forEach(ensureDir);

// ---- Caption ---------------------------------------------------------------
const captionText = buildCaption(reel);
fs.writeFileSync(path.join(OUT.captions, `${id}.txt`), captionText + '\n');

// ---- Storyboard ------------------------------------------------------------
const hook = reel.hooks[reel.selectedHook];
const total = (s) => Object.values(s).reduce((a, b) => a + b, 0);
const sb = [];
sb.push(`# Storyboard — ${id}`, '');
sb.push(`**Topic:** ${reel.brief.topic}  `);
sb.push(`**Pillar:** ${reel.brief.pillar} · **Format:** ${reel.brief.format} · **Objective:** ${reel.brief.objective} · **Depth:** ${reel.brief.technicalDepth}  `);
sb.push(`**Audience:** ${reel.brief.audience}  `);
sb.push(`**Duration:** ${durationSec}s @ ${reel.fps}fps · ${reel.width}×${reel.height} · **Voiceover:** ${reel.brief.voiceover ? 'on' : 'off'}`, '');
sb.push(`**Core insight (one sentence):** ${reel.coreInsight}`, '');
sb.push('## Hook options', '', '| # | Hook | Angle | Spec | Rel | Cur | Cred | Comp | Total |', '|---|---|---|---|---|---|---|---|---|');
reel.hooks.forEach((h, i) => {
  const s = h.scores;
  sb.push(`| ${i + 1}${i === reel.selectedHook ? ' ✅' : ''} | ${h.text} | ${h.angle} | ${s.specificity} | ${s.relevance} | ${s.curiosity} | ${s.credibility} | ${s.comprehension} | **${total(s)}** |`);
});
sb.push('', `**Selected:** "${hook.text}" — ${reel.selectionRationale}`, '');
sb.push('## Scene-by-scene', '');
reel.scenes.forEach((s, i) => {
  const t = timings[i];
  sb.push(`### ${i + 1}. ${s.id} — ${fmtTime(t.startSec)} → ${fmtTime(t.endSec)} (${(s.durationInFrames / reel.fps).toFixed(1)}s, frames ${t.startFrame}–${t.endFrame - 1})`);
  sb.push('', `- **Purpose:** ${s.purpose}`);
  sb.push(`- **On-screen copy:** ${s.onScreen}`);
  sb.push(`- **Voiceover (if enabled):** ${s.voiceover ?? '—'}`);
  sb.push(`- **Visual composition:** ${s.storyboard.visual}`);
  sb.push(`- **Animation:** ${s.storyboard.animation}`);
  sb.push(`- **Transition in:** ${i === 0 ? 'none (first frame fully composed)' : s.transitionIn ?? 'fade-up'}`);
  const cues = (s.sfx ?? []).map((c) => `${c.kind} @ ${((t.startFrame + c.at) / reel.fps).toFixed(2)}s`);
  sb.push(`- **Sound cues:** ${cues.length ? cues.join(', ') : 'music bed only'}`, '');
});
sb.push('## Voiceover edit plan', '');
const words = reel.scenes.reduce((a, s) => a + (s.voiceover ?? '').split(/\s+/).filter(Boolean).length, 0);
const vSec = words / 2.6;
sb.push(
  `Full narration is ${words} words ≈ ${vSec.toFixed(1)}s at a conversational 2.6 words/sec, versus ${durationSec}s of picture.`,
  reel.brief.voiceover
    ? 'Voiceover is enabled: subtitle cues are generated per scene from the voiceover text.'
    : 'Voiceover is OFF for this cut (no TTS provider configured). To add it: generate or record one file per the SRT below, save to public/audio/<id>-vo.wav, set audio.voiceover and brief.voiceover=true, lower audio.bedVolume to ~0.25, and re-render. If any scene narration runs longer than its picture, extend that scene\'s durationInFrames rather than speeding up the read.',
  '',
);
sb.push('| Scene | Picture (s) | Narration est. (s) | Fits? |', '|---|---|---|---|');
reel.scenes.forEach((s) => {
  const w = (s.voiceover ?? '').split(/\s+/).filter(Boolean).length;
  const need = w / 2.6;
  const have = s.durationInFrames / reel.fps;
  sb.push(`| ${s.id} | ${have.toFixed(1)} | ${need.toFixed(1)} | ${need <= have - 0.3 ? 'yes' : `no — extend by ~${(need - have + 0.5).toFixed(1)}s`} |`);
});
sb.push('', '## Claims register', '');
const byRef = new Map((reel.sources ?? []).map((x) => [x.ref, x]));
reel.claims.forEach((c) => sb.push(`- **${c.kind}** — ${c.text}${c.ref ? ` (${byRef.get(c.ref)?.citation ?? c.ref}: ${byRef.get(c.ref)?.url ?? 'not quoted'})` : ''}`));
sb.push('', '## Sources quoted (pulled from the pinned datasets)', '');
(reel.sources ?? []).forEach((x) => sb.push(`- **${x.citation}** (${x.grade ? `${x.grade}, ` : ''}tr. ${x.translation}) — ${x.url}`, `  > ${x.english}`));
fs.writeFileSync(path.join(OUT.storyboards, `${id}.md`), sb.join('\n') + '\n');

// ---- SRT (narration timing per scene) -------------------------------------
const srt = reel.scenes
  .map((s, i) => ({s, t: timings[i]}))
  .filter(({s}) => s.voiceover)
  .map(({s, t}, i) => `${i + 1}\n${srtTime(t.startSec + 0.13)} --> ${srtTime(t.endSec - 0.07)}\n${s.voiceover}\n`)
  .join('\n');
fs.writeFileSync(path.join(OUT.storyboards, `${id}.srt`), srt);

// ---- Metadata --------------------------------------------------------------
const metaPath = path.join(OUT.metadata, `${id}.json`);
const prev = readJsonIfExists(metaPath);
const meta = {
  contentId: id,
  version: reel.version,
  generatedAt: new Date().toISOString(),
  pillar: reel.brief.pillar,
  format: reel.brief.format,
  objective: reel.brief.objective,
  targetAudience: reel.brief.audience,
  topic: reel.brief.topic,
  coreInsight: reel.coreInsight,
  hookVariants: reel.hooks.map((h) => ({text: h.text, angle: h.angle, scores: h.scores, total: total(h.scores)})),
  selectedHook: hook.text,
  selectionRationale: reel.selectionRationale,
  script: reel.scenes.map((s) => ({scene: s.id, onScreen: s.onScreen, voiceover: s.voiceover ?? null})),
  sceneTimings: timings,
  caption: captionText,
  hashtags: reel.caption.hashtags,
  primaryCta: reel.primaryCta,
  coverHeadline: reel.cover.headline.map((l) => l.text).join(' '),
  sources: reel.sources ?? [],
  sourcesNote: 'Quotes pulled verbatim from the pinned datasets in sources/sources.json; everything else is our own reflection.',
  claims: reel.claims,
  estimatedDurationSec: durationSec,
  dimensions: {width: reel.width, height: reel.height, fps: reel.fps},
  dependencies: {
    fonts: ['public/fonts/InterDisplay-Bold.otf', 'public/fonts/InterDisplay-SemiBold.otf', 'public/fonts/Inter-Regular.otf', 'public/fonts/Inter-Medium.otf', 'public/fonts/Inter-SemiBold.otf', 'public/fonts/DejaVuSansMono.ttf', 'public/fonts/DejaVuSansMono-Bold.ttf'],
    audio: [reel.audio.bed, reel.audio.voiceover].filter(Boolean).map((a) => `public/${a}`),
    externalServices: [],
  },
  files: {
    reel: `output/reels/${id}.mp4`,
    cover: `output/covers/${id}.png`,
    caption: `output/captions/${id}.txt`,
    storyboard: `output/storyboards/${id}.md`,
    subtitles: `output/storyboards/${id}.srt`,
  },
  qa: prev?.qa ?? {status: 'not-run'},
  approval: prev?.approval ?? {status: 'pending', approvedBy: null, approvedAt: null},
  suggestedPublicationDate: reel.publish.suggestedDate,
  publishNotes: reel.publish.notes,
  repurposing: reel.repurposing,
  metricsToCapture: [
    'reach',
    'non_follower_reach',
    'plays',
    'avg_watch_time_sec',
    'avg_watch_time_pct_of_duration',
    'skip_rate (if shown)',
    'shares',
    'saves',
    'comments_meaningful (manually counted)',
    'profile_visits',
    'follows',
    'production_time_min',
  ],
  performance: prev?.performance ?? null,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

console.log(`Package built for ${id}:`);
for (const f of Object.values(meta.files).slice(2)) console.log('  ' + f);
console.log(`  output/metadata/${id}.json`);
console.log(`Duration ${durationSec}s · ${reel.scenes.length} scenes · project ${path.basename(ROOT)}`);

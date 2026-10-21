#!/usr/bin/env node
// Prepares a rendered + validated reel for review:
//  - copies the small, human-readable package into archive/<id>/ (committed)
//  - writes archive/<id>/state.json with SHA-256 of the exact files QA passed
//    (the publisher refuses anything whose hash differs)
//  - writes output/daily/<id>.pr.md, the review PR body with previews
//   node scripts/daily/archive.mjs <reelId> --repo owner/name
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, ensureDir, kindOf, loadReel, readJsonIfExists, sceneTimings, slideFiles, totalFrames} from '../lib.mjs';
import {describeStyle, pickStyle, STYLE_OPTIONS} from '../style.mjs';
import {RECITE} from '../sources/recitation.mjs';
const RECITE_IDS = RECITE.reciters.map((r) => r.id).join(' | ');

const id = process.argv[2];
const repoArg = process.argv.indexOf('--repo');
const repo = repoArg > 0 ? process.argv[repoArg + 1] : process.env.GITHUB_REPOSITORY ?? 'OWNER/REPO';
if (!id) {
  console.error('Usage: archive.mjs <reelId> --repo owner/name');
  process.exit(2);
}
const reel = loadReel(id);
const meta = readJsonIfExists(path.join(OUT.metadata, `${id}.json`));
const qa = readJsonIfExists(path.join(OUT.qa, id, 'report.json'));
const writer = readJsonIfExists(path.join(ROOT, 'output', 'daily', `${id}.writer.json`));
if (!meta || !qa) throw new Error('Run build-package and validate first.');
if (qa.status !== 'automated-passed') throw new Error(`QA status is ${qa.status}; refusing to archive for review.`);

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const kind = kindOf(reel);
const isReel = kind === 'reel';
const files = {
  cover: path.join(OUT.covers, `${id}.jpg`),
  contactSheet: path.join(OUT.qa, id, 'contact-sheet.png'),
  ...(isReel ? {video: path.join(OUT.reels, `${id}.mp4`)} : {}),
};
for (const [k, p] of Object.entries(files)) if (!fs.existsSync(p)) throw new Error(`Missing ${k}: ${p}`);
const slides = isReel ? [] : slideFiles(id, 'jpg');
if (!isReel && slides.length !== reel.scenes.length) throw new Error(`Expected ${reel.scenes.length} slide image(s), found ${slides.length}`);
// Release assets carry the reel id so one release folder can hold them all.
const slideNames = slides.map((_, i) => `${id}-slide-${String(i + 1).padStart(2, '0')}.jpg`);
const namedSheet = path.join(OUT.qa, id, `${id}-contact-sheet.png`);
fs.copyFileSync(files.contactSheet, namedSheet);
const upload = [files.cover, namedSheet, ...(isReel ? [files.video] : [])];
slides.forEach((f, i) => {
  const named = path.join(OUT.qa, id, slideNames[i]);
  fs.copyFileSync(f, named);
  upload.push(named);
});

const dir = path.join(ROOT, 'archive', id);
ensureDir(dir);
const copy = (src, name) => fs.existsSync(src) && fs.copyFileSync(src, path.join(dir, name));
copy(path.join(OUT.captions, `${id}.txt`), 'caption.txt');
copy(path.join(OUT.storyboards, `${id}.md`), 'storyboard.md');
copy(path.join(OUT.storyboards, `${id}.srt`), 'narration.srt');
copy(path.join(OUT.metadata, `${id}.json`), 'metadata.json');
copy(path.join(OUT.qa, id, 'report.md'), 'qa-report.md');
if (writer) fs.writeFileSync(path.join(dir, 'writer.json'), JSON.stringify(writer, null, 2) + '\n');

const tag = `reel-${id}`;
const asset = (name) => `https://github.com/${repo}/releases/download/${tag}/${name}`;
// In fully automated mode, a person still sees anything QA was unsure about:
// ruling-type words or a missing ﷺ in our own words hold the post for review.
const HOLD_WARNINGS = [/ruling-type language/i, /Honorific ﷺ/];
const attentionReasons = [
  ...(writer?.needsAttention ? ['the editor pass did not fully approve this draft'] : []),
  ...qa.checks.filter((c) => !c.pass && c.severity === 'warning' && HOLD_WARNINGS.some((r) => r.test(c.name))).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`),
];
const state = {
  id,
  createdAt: new Date().toISOString(),
  kind,
  release: {
    tag,
    cover: `${id}.jpg`,
    contactSheet: `${id}-contact-sheet.png`,
    ...(isReel ? {video: `${id}.mp4`} : {slides: slideNames}),
  },
  sha256: isReel ? {video: sha(files.video), cover: sha(files.cover)} : {cover: sha(files.cover), slides: slides.map(sha)},
  durationSec: isReel ? +(totalFrames(reel) / reel.fps).toFixed(2) : null,
  qa: {status: qa.status, errors: qa.errors, warnings: qa.warnings, checks: qa.checks.length},
  critic: writer?.finalCritic ?? null,
  needsAttention: attentionReasons.length > 0,
  attentionReasons,
  approval: {status: 'pending', approvedBy: null, approvedAt: null},
  publish: {status: 'pending', mediaId: null, permalink: null, publishedAt: null, attempts: 0, lastError: null},
};
const statePath = path.join(dir, 'state.json');
const prev = readJsonIfExists(statePath);
if (prev?.publish?.status === 'published') throw new Error('This reel is already published; refusing to overwrite its state.');
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

// ---------------------------------------------------------------- PR body
const hook = reel.hooks[reel.selectedHook];
const t = sceneTimings(reel);
const critic = writer?.finalCritic;
const lines = [];
lines.push(`## ${hook.text}`);
lines.push('');
const KIND = {reel: '🎬 Reel', carousel: `🖼️ Carousel · ${slides.length} slides`, story: '📱 Story'}[kind];
const seriesName = reel.brief.series ? JSON.parse(fs.readFileSync(path.join(ROOT, 'src/templates/series.json'), 'utf8')).find((x) => x.id === reel.brief.series)?.name : null;
lines.push(`**${KIND}**${seriesName ? ` · series: **${seriesName}**` : ''} · ${reel.brief.pillar} · ${reel.brief.format}${isReel ? ` · ${state.durationSec}s` : ''} · goal: ${reel.brief.objective}${reel.publish?.occasion ? ` · occasion: **${reel.publish.occasion}**` : ''}`);
lines.push(`🎨 ${describeStyle(pickStyle(reel.id, reel.style))}`);
const recit = reel.recitation?.files ? reel.recitation : null;
if (isReel) lines.push(recit ? `🎧 Recitation: [${recit.citation}](${recit.url}) — ${recit.reciterName} (${recit.totalSec}s, ${recit.mode === 'scene' ? 'with the ayah on screen' : 'from after the hook, labelled on screen'})` : '🔇 No recitation (silent reel)');
lines.push('');
if (state.needsAttention) lines.push(`> ⚠️ **Needs attention — this post will not be auto-approved.** ${attentionReasons.join('; ')}. Merge it yourself if it's fine, or edit/close it.`, '');
if (isReel) {
  lines.push(`<img src="${asset(`${id}.jpg`)}" width="240" alt="cover"> <img src="${asset(`${id}-contact-sheet.png`)}" width="520" alt="frames">`);
  lines.push('');
  lines.push(`▶️ **[Watch and listen to the reel (MP4)](${asset(`${id}.mp4`)})**`);
} else {
  lines.push(slideNames.map((n, i) => `<a href="${asset(n)}"><img src="${asset(n)}" width="${kind === 'story' ? 220 : 180}" alt="slide ${i + 1}"></a>`).join(' '));
  if (kind === 'story') lines.push('', '_Stories post without a caption and disappear after 24 hours. Interactive stickers can be added by hand in the app._');
}
lines.push('');
lines.push(`**Core insight:** ${reel.coreInsight}`);
lines.push('');
lines.push('### Approve or reject');
lines.push(`- **Merge** this PR to approve. It posts to Instagram at the next scheduled slot (\`DEEN_POST_TIME\`, default 19:00 IST), or right away if that time has passed and nothing was posted today.`);
lines.push('- **Edit** `' + `deen-content/src/content/reels/${id}.json` + '` in this PR to fix copy — the reel re-renders and this preview updates automatically.');
lines.push('- **Close** the PR to reject. Nothing is posted.');
lines.push(`- **Change the look:** edit \`style\` in the reel's JSON — theme: ${STYLE_OPTIONS.themes.join(' / ')}; layout: ${STYLE_OPTIONS.layouts.join(' / ')}; backdrop: ${STYLE_OPTIONS.backdrops.join(' / ')}; type: ${STYLE_OPTIONS.type.join(' / ')}; motion: ${STYLE_OPTIONS.motion.join(' / ')}.`);
lines.push(`- **Change the reciter or recited ayah:** set \`"recitation": {"ref": "quran:…", "reciter": "${RECITE_IDS}"}\` (or \`false\` for silence); it re-downloads and re-fits automatically.`);
lines.push(`- **Swap a quote:** change a source scene's \`ref\`; the text is re-pulled from the verified datasets.`);
lines.push('');
lines.push('### ☑️ Check the sources before approving');
lines.push('Quotes were pulled word for word from the pinned datasets (sources/sources.json) and QA compared them again. Still, open each link and confirm the reference, wording and translation.');
lines.push('');
for (const sc of reel.scenes.filter((x) => x.type === 'source' && x.resolved)) {
  const r = sc.resolved;
  lines.push(`- [ ] **[${r.citation}](${r.url})** — ${r.grade ? `${r.grade}, ` : ''}tr. ${r.translation}${sc.excerpt ? ' · *excerpt shown on screen*' : ''}`);
  lines.push(`  > ${sc.excerpt ? sc.excerpt : r.english}`);
}
lines.push('');
lines.push('### Script');
lines.push(`| ${isReel ? 'Time' : 'Slide'} | Scene | On screen |`);
lines.push('|---|---|---|');
reel.scenes.forEach((s, i) => lines.push(`| ${isReel ? `${t[i].startSec}–${t[i].endSec}s` : `slide ${i + 1}`} | ${s.type} | ${String(s.onScreen).replace(/\|/g, '/').replace(/\n/g, ' ')} |`));
lines.push('');
lines.push('<details><summary>Hook options</summary>', '');
lines.push('| | Hook | Angle | Score |', '|---|---|---|---|');
reel.hooks.forEach((h, i) => lines.push(`| ${i === reel.selectedHook ? '✅' : ''} | ${h.text} | ${h.angle} | ${Object.values(h.scores).reduce((a, b) => a + b, 0)}/25 |`));
lines.push('', `Why: ${reel.selectionRationale}`, '', '</details>', '');
lines.push('<details><summary>Caption</summary>', '', '```', fs.readFileSync(path.join(OUT.captions, `${id}.txt`), 'utf8').trim(), '```', '', '</details>', '');
lines.push('<details><summary>Claims & sources</summary>', '');
const srcByRef = new Map((reel.sources ?? []).map((x) => [x.ref, x]));
for (const c of reel.claims) lines.push(`- **${c.kind}** — ${c.text}${c.ref && srcByRef.get(c.ref) ? ` — [${srcByRef.get(c.ref).citation}](${srcByRef.get(c.ref).url})` : ''}`);
lines.push('', '</details>', '');
if (critic) {
  lines.push('<details><summary>Editor pass</summary>', '');
  lines.push(`Verdict: **${critic.verdict}** · ${Object.entries(critic.scores ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (critic.mustFix?.length) lines.push('', 'Must fix:', ...critic.mustFix.map((m) => `- ${m}`));
  if (critic.niceToHave?.length) lines.push('', 'Could improve:', ...critic.niceToHave.map((m) => `- ${m}`));
  lines.push('', `Revision rounds: ${writer.rounds.length} · est. writing cost $${writer.estimatedCostUsd}`, '', '</details>', '');
}
lines.push(`<details><summary>Automated QA — ${qa.checks.length - qa.errors - qa.warnings}/${qa.checks.length} passed</summary>`, '');
for (const c of qa.checks) lines.push(`- ${c.pass ? '✅' : c.severity === 'warning' ? '⚠️' : '❌'} ${c.name}${c.detail ? ` — ${String(c.detail).slice(0, 140)}` : ''}`);
lines.push('', 'Automated checks can’t watch or listen. Merging records you as the reviewer.', '', '</details>');

ensureDir(path.join(ROOT, 'output', 'daily'));
fs.writeFileSync(path.join(ROOT, 'output', 'daily', `${id}.pr.md`), lines.join('\n') + '\n');
// Files to upload to the review release (read by build-for-review.sh).
fs.writeFileSync(path.join(ROOT, 'output', 'daily', `${id}.assets.txt`), upload.map((f) => path.relative(ROOT, f)).join('\n') + '\n');
console.log(`Archived ${id} → archive/${id}/ ; PR body → output/daily/${id}.pr.md`);

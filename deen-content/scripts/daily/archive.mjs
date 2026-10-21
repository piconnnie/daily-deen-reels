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
import {OUT, ROOT, ensureDir, loadReel, readJsonIfExists, sceneTimings, totalFrames} from '../lib.mjs';
import {describeStyle, pickStyle, STYLE_OPTIONS} from '../style.mjs';

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
const files = {
  video: path.join(OUT.reels, `${id}.mp4`),
  cover: path.join(OUT.covers, `${id}.jpg`),
  contactSheet: path.join(OUT.qa, id, 'contact-sheet.png'),
};
for (const [k, p] of Object.entries(files)) if (!fs.existsSync(p)) throw new Error(`Missing ${k}: ${p}`);

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
const state = {
  id,
  createdAt: new Date().toISOString(),
  release: {
    tag,
    video: `${id}.mp4`,
    cover: `${id}.jpg`,
    contactSheet: `${id}-contact-sheet.png`,
  },
  sha256: {video: sha(files.video), cover: sha(files.cover)},
  durationSec: +(totalFrames(reel) / reel.fps).toFixed(2),
  qa: {status: qa.status, errors: qa.errors, warnings: qa.warnings, checks: qa.checks.length},
  critic: writer?.finalCritic ?? null,
  needsAttention: !!writer?.needsAttention,
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
lines.push(`**${reel.brief.pillar}** · ${reel.brief.format} · ${state.durationSec}s · objective: ${reel.brief.objective}`);
lines.push(`🎨 ${describeStyle(pickStyle(reel.id, reel.style))}`);
lines.push('');
if (state.needsAttention) lines.push('> ⚠️ **Needs attention:** the editor pass did not fully approve this draft after the maximum revision rounds. Read the notes below before merging.', '');
lines.push(`<img src="${asset(`${id}.jpg`)}" width="240" alt="cover"> <img src="${asset(`${id}-contact-sheet.png`)}" width="520" alt="frames">`);
lines.push('');
lines.push(`▶️ **[Watch the reel (MP4)](${asset(`${id}.mp4`)})**`);
lines.push('');
lines.push(`**Core insight:** ${reel.coreInsight}`);
lines.push('');
lines.push('### Approve or reject');
lines.push(`- **Merge** this PR to approve. It posts to Instagram at the next scheduled slot (\`DEEN_POST_TIME\`, default 19:00 IST), or right away if that time has passed and nothing was posted today.`);
lines.push('- **Edit** `' + `deen-content/src/content/reels/${id}.json` + '` in this PR to fix copy — the reel re-renders and this preview updates automatically.');
lines.push('- **Close** the PR to reject. Nothing is posted.');
lines.push(`- **Change the look:** edit \`style\` in the reel's JSON — theme: ${STYLE_OPTIONS.themes.join(' / ')}; motion: ${STYLE_OPTIONS.motion.join(' / ')}. Reels are silent.`);
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
lines.push('| Time | Scene | On screen |');
lines.push('|---|---|---|');
reel.scenes.forEach((s, i) => lines.push(`| ${t[i].startSec}–${t[i].endSec}s | ${s.type} | ${String(s.onScreen).replace(/\|/g, '/').replace(/\n/g, ' ')} |`));
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
console.log(`Archived ${id} → archive/${id}/ ; PR body → output/daily/${id}.pr.md`);

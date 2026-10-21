#!/usr/bin/env node
// Plans a content-queue refill (used by the weekly scheduled refill task, or by
// hand). Prints how many drafts to write and which backlog topics are still
// unclaimed — by any reel on main, any open review branch, or any queue draft.
//   node scripts/daily/refill-plan.mjs [--target 21] [--max 14] [--json]
// Exit code 0 always; "write": 0 means the queue is already full enough.
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, listReels, loadReel} from '../lib.mjs';
import {KIND_MIX, PILLARS, TARGET_MIX, loadBacklog} from './plan.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const TARGET = arg('target', 21); // three weeks of daily posts
const MAX = arg('max', 14);

const qdir = path.join(ROOT, 'data', 'queue');
const drafts = fs.readdirSync(qdir).filter((f) => f.endsWith('.json')).sort();
const draftJson = Object.fromEntries(drafts.map((f) => [f, JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8'))]));

// Reels on main plus reels still on open review branches (reel/*), if git can see them.
const reels = listReels().map((id) => loadReel(id));
try {
  execSync('git fetch -q origin "+refs/heads/reel/*:refs/remotes/origin/reel/*"', {cwd: ROOT, stdio: 'ignore'});
  const branches = execSync('git branch -r --list "origin/reel/*"', {cwd: ROOT, encoding: 'utf8'}).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const b of branches) {
    const id = b.replace('origin/reel/', '');
    if (reels.some((r) => r.id === id)) continue;
    try {
      reels.push(JSON.parse(execSync(`git show "${b}:deen-content/src/content/reels/${id}.json"`, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})));
    } catch {}
  }
} catch {}

const usedQueue = new Set(reels.map((r) => r.brief?.queueId).filter(Boolean));
const unused = drafts.filter((f) => !usedQueue.has(f.replace(/\.json$/, '')));
const claimed = new Set([...reels.map((r) => r.brief?.backlogId), ...Object.values(draftJson).map((d) => d.brief?.backlogId)].filter(Boolean));
const backlog = loadBacklog().topics;
const open = backlog.filter((t) => !claimed.has(t.id) && t.status !== 'used');

// Balance: count pillars/formats across unused drafts, steer toward the target mix.
const pillarCount = {};
const formatCount = {};
const kindCount = {};
const seriesCount = {};
let fridayDrafts = 0;
for (const f of unused) {
  const b = draftJson[f].brief ?? {};
  const k = draftJson[f].kind ?? 'reel';
  kindCount[k] = (kindCount[k] ?? 0) + 1;
  if (b.series) seriesCount[b.series] = (seriesCount[b.series] ?? 0) + 1;
  if (draftJson[f].publish?.occasion === 'friday') fridayDrafts++;
  const p = String(b.pillar ?? '')[0];
  pillarCount[p] = (pillarCount[p] ?? 0) + 1;
  formatCount[b.format] = (formatCount[b.format] ?? 0) + 1;
}
const write = Math.max(0, Math.min(MAX, TARGET - unused.length));
const want = Object.fromEntries(Object.entries(TARGET_MIX).map(([p, share]) => [p, Math.max(0, Math.round(share * (unused.length + write)) - (pillarCount[p] ?? 0))]));
const kindsWanted = Object.fromEntries(Object.entries(KIND_MIX).map(([k, share]) => [k, Math.max(0, Math.round(share * (unused.length + write)) - (kindCount[k] ?? 0))]));
const fridaysWanted = Math.max(0, Math.ceil((unused.length + write) / 7) - fridayDrafts);
const nums = drafts.map((f) => Number(/^q(\d+)-/.exec(f)?.[1] ?? 0));
const plan = {
  unusedDrafts: unused.length,
  target: TARGET,
  write,
  nextDraftNumber: Math.max(0, ...nums) + 1,
  pillarsWanted: want,
  formatsInQueue: formatCount,
  kindsWanted,
  kindsInQueue: kindCount,
  seriesInQueue: seriesCount,
  fridayDraftsWanted: fridaysWanted,
  openTopics: open.map((t) => ({id: t.id, pillar: t.pillar, format: t.format, topic: t.topic, angle: t.angle})),
  needNewTopics: Math.max(0, write - open.length),
  pillars: PILLARS,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`Unused drafts: ${plan.unusedDrafts} (target ${TARGET}) → write ${write}, numbered from q${String(plan.nextDraftNumber).padStart(3, '0')}.`);
  console.log(`Pillars to favour: ${Object.entries(want).filter(([, n]) => n > 0).map(([p, n]) => `${p}×${n}`).join(', ') || 'balanced'}`);
  console.log(`Kinds to favour (reel 50% · carousel 35% · story 15%): ${Object.entries(kindsWanted).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(', ') || 'balanced'}`);
  console.log(`Friday drafts to add (one per week, "publish": {"occasion": "friday"}): ${fridaysWanted}`);
  console.log(`Series already queued: ${JSON.stringify(seriesCount)} — keep the three core series (one-ayah-one-lesson, heart-reminder, dua-of-the-day) the most frequent`);
  console.log(`Formats already queued: ${JSON.stringify(formatCount)}`);
  console.log(`Unclaimed backlog topics: ${open.length}${plan.needNewTopics ? ` — add at least ${plan.needNewTopics} new topic(s) to data/topics/backlog.json first` : ''}`);
  for (const t of open) console.log(`  ${t.id} [${t.pillar} · ${t.format}] ${t.topic}`);
}

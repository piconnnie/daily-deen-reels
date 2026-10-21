#!/usr/bin/env node
// Decides whether a reel should be posted now. Prints the reel id (or nothing)
// and writes `id=<reelId>` to $GITHUB_OUTPUT when running in Actions.
//   node scripts/daily/publish-due.mjs [--force <reelId>]
// Rules: only approved reels; at most DEEN_MAX_PER_DAY posts per local day
// (default 1); not before DEEN_POST_TIME (default 19:00) in DEEN_TZ
// (default Asia/Kolkata); oldest approval first; failed reels retried up to 3x.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';

const TZ = process.env.DEEN_TZ || 'Asia/Kolkata';
const POST_TIME = process.env.DEEN_POST_TIME || '19:00';
const MAX_PER_DAY = Number(process.env.DEEN_MAX_PER_DAY || 1);

export const localParts = (d) => {
  const f = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`};
};

export function loadStates() {
  const dir = path.join(ROOT, 'archive');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((id) => path.join(dir, id, 'state.json'))
    .filter((p) => fs.existsSync(p))
    .map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
}

export function dueReel({now = new Date(), force} = {}) {
  const states = loadStates();
  if (force) {
    const s = states.find((x) => x.id === force);
    if (!s) return {id: null, reason: `No archive/${force}/state.json`};
    if (s.approval?.status !== 'approved') return {id: null, reason: `${force} is not approved`};
    if (s.publish?.status === 'published') return {id: null, reason: `${force} is already published`};
    return {id: force, reason: 'forced'};
  }
  const nowL = localParts(now);
  const postedToday = states.filter((s) => s.publish?.status === 'published' && s.publish.publishedAt && localParts(new Date(s.publish.publishedAt)).date === nowL.date).length;
  if (postedToday >= MAX_PER_DAY) return {id: null, reason: `already posted ${postedToday} today (${TZ})`};
  if (nowL.time < POST_TIME) return {id: null, reason: `before post time ${POST_TIME} ${TZ} (now ${nowL.time})`};
  const candidates = states
    .filter((s) => {
      // 'manual-required' reels become eligible again once Instagram is connected.
      const ok = ['pending', 'failed', ...(process.env.IG_ACCESS_TOKEN ? ['manual-required'] : [])];
      return s.approval?.status === 'approved' && ok.includes(s.publish?.status ?? 'pending') && (s.publish?.attempts ?? 0) < 3;
    })
    .sort((a, b) => (a.approval.approvedAt ?? '').localeCompare(b.approval.approvedAt ?? ''));
  if (!candidates.length) return {id: null, reason: 'no approved reels waiting'};
  return {id: candidates[0].id, reason: `oldest approved of ${candidates.length}`};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fi = process.argv.indexOf('--force');
  const res = dueReel({force: fi > 0 ? process.argv[fi + 1] : undefined});
  console.error(`publish-due: ${res.id ?? 'none'} — ${res.reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `id=${res.id ?? ''}\n`);
  if (res.id) console.log(res.id);
}

#!/usr/bin/env node
// Best-effort import of Reel insights into data/performance/performance.csv,
// then the baseline-relative analysis feeds the topic planner.
//   node scripts/daily/fetch-insights.mjs
// Metric names change between Graph API versions, so each metric is requested
// separately and anything unsupported is skipped (never estimated).
// Override names with DEEN_INSIGHT_METRICS, e.g. "reach,saved,shares,views".
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, loadReel} from '../lib.mjs';
import {ensureUserId, graph, igConfig, missingConfig} from './instagram.mjs';
import {loadStates} from './publish-due.mjs';

const c = igConfig();
if (missingConfig(c).length) {
  console.log('Instagram not configured; skipping insights import (manual CSV still works).');
  process.exit(0);
}
await ensureUserId(c);
const metrics = (process.env.DEEN_INSIGHT_METRICS || 'reach,saved,shares,views,comments,ig_reels_avg_watch_time,follows,profile_visits').split(',').map((s) => s.trim());
const csvPath = path.join(ROOT, 'data', 'performance', 'performance.csv');
const header = 'content_id,posted_date,days_since_post,duration_sec,pillar,format,hook_angle,cta_type,reach,non_follower_reach,plays,avg_watch_time_sec,shares,saves,comments_meaningful,profile_visits,follows,production_time_min,notes,kind,series,goal';
const lines = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8').trim().split('\n') : [header];
// Older files gain the kind/series/goal columns automatically.
if (!lines[0].includes(',kind,series,goal')) lines[0] = header;
const cols = lines[0].split(',');
const rows = new Map(lines.slice(1).filter(Boolean).map((l) => [l.split(',')[0], l]));

// Story insights expire after 24 hours, before this weekly import runs, so stories are skipped.
const published = loadStates().filter((s) => s.publish?.status === 'published' && s.publish.mediaId && s.kind !== 'story');
let updated = 0;
for (const s of published) {
  const vals = {};
  for (const m of metrics) {
    try {
      const r = await graph('GET', `${s.publish.mediaId}/insights`, {metric: m}, c);
      const v = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value;
      if (typeof v === 'number') vals[m] = v;
    } catch (e) {
      if (!/does not support|invalid|not available/i.test(e.message)) console.warn(`  ${s.id} ${m}: ${e.message.slice(0, 120)}`);
    }
  }
  if (!Object.keys(vals).length) continue;
  const reel = loadReel(s.id);
  const posted = s.publish.publishedAt.slice(0, 10);
  const days = Math.floor((Date.now() - new Date(s.publish.publishedAt)) / 86400000);
  const record = {
    content_id: s.id,
    posted_date: posted,
    days_since_post: days,
    duration_sec: s.durationSec,
    pillar: reel.brief.pillar,
    format: reel.brief.format,
    hook_angle: reel.hooks[reel.selectedHook].angle,
    cta_type: reel.primaryCta.type,
    reach: vals.reach ?? '',
    non_follower_reach: '',
    plays: vals.views ?? vals.plays ?? '',
    avg_watch_time_sec: vals.ig_reels_avg_watch_time !== undefined ? (vals.ig_reels_avg_watch_time / 1000).toFixed(1) : '',
    shares: vals.shares ?? '',
    saves: vals.saved ?? '',
    comments_meaningful: '',
    profile_visits: vals.profile_visits ?? '',
    follows: vals.follows ?? '',
    production_time_min: '',
    kind: reel.kind ?? 'reel',
    series: reel.brief.series ?? '',
    goal: reel.brief.objective ?? '',
    notes: `auto-imported ${new Date().toISOString().slice(0, 10)}; comments total ${vals.comments ?? 'n/a'}`,
  };
  // Keep manually entered fields (meaningful comments, production time) if present.
  const prev = rows.get(s.id)?.split(',');
  if (prev) for (const k of ['comments_meaningful', 'production_time_min', 'non_follower_reach']) {
    const i = cols.indexOf(k);
    if (prev[i]) record[k] = prev[i];
  }
  rows.set(s.id, cols.map((k) => String(record[k] ?? '').replace(/,/g, ';')).join(','));
  updated++;
}
fs.writeFileSync(csvPath, [lines[0], ...rows.values()].join('\n') + '\n');
console.log(`Insights: updated ${updated} of ${published.length} published reel(s)/carousel(s) (stories skipped: their insights expire after 24 h).`);

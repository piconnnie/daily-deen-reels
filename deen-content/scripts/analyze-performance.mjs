#!/usr/bin/env node
// Reads data/performance/performance.csv (manual import from Instagram Insights),
// computes per-reach rates against the account's own baseline, compares
// pillars/formats/hook angles/CTAs/duration buckets, and suggests the next
// experiment. Writes output/performance-report.md and attaches each reel's
// numbers to its metadata file.
//   node scripts/analyze-performance.mjs
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, listReels, loadReel, readJsonIfExists} from './lib.mjs';

const csvPath = path.join(ROOT, 'data', 'performance', 'performance.csv');
const MIN_GROUP = 3; // below this, a group comparison is reported as "insufficient data"

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((c) => c !== '')) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
};

const num = (v) => (v === '' || v === undefined ? null : Number(v));
const median = (xs) => {
  const a = xs.filter((x) => x !== null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const pct = (x) => (x === null ? '—' : `${(x * 100).toFixed(2)}%`);
const ratio = (x) => (x === null ? '—' : `${x.toFixed(2)}×`);

if (!fs.existsSync(csvPath)) {
  console.error('No performance.csv found.');
  process.exit(1);
}
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
if (!rows.length) {
  console.log('performance.csv has no rows yet. Add one per posted reel (see data/performance/README.md), then rerun.');
  process.exit(0);
}

const known = new Set(listReels());
const posts = rows.map((r) => {
  const reel = known.has(r.content_id) ? loadReel(r.content_id) : null;
  const reach = num(r.reach);
  const per = (k) => (reach && num(r[k]) !== null ? num(r[k]) / reach : null);
  const dur = num(r.duration_sec) ?? (reel ? reel.scenes.reduce((a, s) => a + s.durationInFrames, 0) / reel.fps : null);
  return {
    id: r.content_id,
    pillar: r.pillar || reel?.brief.pillar || 'unknown',
    format: r.format || reel?.brief.format || 'unknown',
    hookAngle: r.hook_angle || (reel ? reel.hooks[reel.selectedHook].angle : 'unknown'),
    cta: r.cta_type || reel?.primaryCta.type || 'unknown',
    kind: r.kind || reel?.kind || 'reel',
    series: r.series || reel?.brief.series || '(none)',
    goal: r.goal || reel?.brief.objective || 'unknown',
    durationBucket: dur === null ? 'unknown' : dur < 20 ? '<20s' : dur <= 30 ? '20–30s' : '>30s',
    reach,
    nonFollowerShare: per('non_follower_reach'),
    watchPct: num(r.avg_watch_time_sec) !== null && dur ? num(r.avg_watch_time_sec) / dur : null,
    shareRate: per('shares'),
    saveRate: per('saves'),
    commentRate: per('comments_meaningful'),
    profileRate: per('profile_visits'),
    followRate: per('follows'),
    productionMin: num(r.production_time_min),
    days: num(r.days_since_post),
  };
});

const metrics = ['reach', 'watchPct', 'shareRate', 'saveRate', 'commentRate', 'profileRate', 'followRate'];
const baseline = Object.fromEntries(metrics.map((m) => [m, median(posts.map((p) => p[m]))]));
// Composite "useful content" index vs baseline: shares + saves weighted most.
const weights = {watchPct: 1, shareRate: 2, saveRate: 2, followRate: 1.5, profileRate: 0.5};
for (const p of posts) {
  let s = 0;
  let w = 0;
  for (const [m, wt] of Object.entries(weights)) {
    if (p[m] !== null && baseline[m]) {
      s += (p[m] / baseline[m]) * wt;
      w += wt;
    }
  }
  p.index = w ? s / w : null;
}

const group = (key) => {
  const g = {};
  for (const p of posts) (g[p[key]] ??= []).push(p);
  return Object.entries(g)
    .map(([k, ps]) => ({k, n: ps.length, index: median(ps.map((p) => p.index)), save: median(ps.map((p) => p.saveRate)), share: median(ps.map((p) => p.shareRate)), watch: median(ps.map((p) => p.watchPct))}))
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
};

const md = [];
md.push('# Performance report', '', `Generated ${new Date().toISOString().slice(0, 10)} from ${posts.length} post(s).`, '');
md.push('All comparisons are against **this account\'s own median**, not external "viral" benchmarks. Index 1.00× = typical post for this account.', '');
if (posts.length < 10) md.push(`> **Small sample (${posts.length} posts).** Treat every difference below as a hypothesis to test, not a finding.`, '');
md.push('## Baseline (median)', '', '| Reach | Watch % | Share rate | Save rate | Meaningful comments | Profile visits | Follows |', '|---|---|---|---|---|---|---|');
md.push(`| ${baseline.reach ?? '—'} | ${pct(baseline.watchPct)} | ${pct(baseline.shareRate)} | ${pct(baseline.saveRate)} | ${pct(baseline.commentRate)} | ${pct(baseline.profileRate)} | ${pct(baseline.followRate)} |`, '');
md.push('## Posts ranked by index', '', '| Content | Index | Reach | Watch % | Shares/reach | Saves/reach | Follows/reach | Format | Hook angle |', '|---|---|---|---|---|---|---|---|---|');
for (const p of [...posts].sort((a, b) => (b.index ?? 0) - (a.index ?? 0))) {
  md.push(`| ${p.id} | ${ratio(p.index)} | ${p.reach ?? '—'} | ${pct(p.watchPct)} | ${pct(p.shareRate)} | ${pct(p.saveRate)} | ${pct(p.followRate)} | ${p.format} | ${p.hookAngle} |`);
}
// Judge each post by its intended purpose (docs/CONTENT_STRATEGY.md §7).
const GOAL_METRIC = {reach: ['nonFollowerShare', 'Non-follower reach', 'watchPct', 'Watch %'], shares: ['shareRate', 'Shares/reach'], saves: ['saveRate', 'Saves/reach'], replies: ['commentRate', 'Meaningful comments/reach'], follows: ['followRate', 'Follows/reach', 'profileRate', 'Profile visits/reach']};
md.push('', '## By goal (each post judged by what it was made for)', '', '| Goal | Posts | Metric | Median | Account baseline |', '|---|---|---|---|---|');
for (const [goal, spec] of Object.entries(GOAL_METRIC)) {
  const ps = posts.filter((p) => p.goal === goal);
  if (!ps.length) continue;
  for (let i = 0; i < spec.length; i += 2) md.push(`| ${goal} | ${ps.length}${ps.length < MIN_GROUP ? ' (insufficient)' : ''} | ${spec[i + 1]} | ${pct(median(ps.map((p) => p[spec[i]])))} | ${pct(median(posts.map((p) => p[spec[i]])))} |`);
}
md.push('', 'Story replies and poll results are not available through the API after 24 hours; review them in the Instagram app.');
for (const [key, label] of [['kind', 'Kind'], ['series', 'Series'], ['pillar', 'Pillar'], ['format', 'Format'], ['hookAngle', 'Hook angle'], ['cta', 'CTA'], ['durationBucket', 'Duration']]) {
  md.push('', `## By ${label.toLowerCase()}`, '', `| ${label} | Posts | Median index | Save rate | Share rate | Watch % |`, '|---|---|---|---|---|---|');
  for (const g of group(key)) md.push(`| ${g.k} | ${g.n}${g.n < MIN_GROUP ? ' (insufficient)' : ''} | ${ratio(g.index)} | ${pct(g.save)} | ${pct(g.share)} | ${pct(g.watch)} |`);
}

// Next experiment: keep the best-supported element, test one variable.
const eligible = (key) => group(key).filter((g) => g.n >= MIN_GROUP);
const bestFormat = eligible('format')[0];
const angles = group('hookAngle');
md.push('', '## Suggested next experiment', '');
if (!bestFormat) {
  md.push(
    `Not enough posts per group yet (need ≥${MIN_GROUP} per variant). Keep rotating formats and pillars per the target mix, change only the hook angle between otherwise similar posts, and revisit after ~10–12 posts.`,
  );
} else {
  const weakestAngle = angles[angles.length - 1];
  md.push(
    `Keep **${bestFormat.k}** (median index ${ratio(bestFormat.index)} over ${bestFormat.n} posts) and vary only the hook angle — e.g. test "${angles[0].k}" against "${weakestAngle.k}" on comparable topics. Correlation only: topic, posting time and audience growth also move these numbers.`,
  );
}
fs.mkdirSync(path.join(ROOT, 'output'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'output', 'performance-report.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'performance', 'report.md'), md.join('\n') + '\n');
// Per-reel index vs account baseline, read by the daily topic planner.
fs.writeFileSync(
  path.join(ROOT, 'data', 'performance', 'index.json'),
  JSON.stringify(Object.fromEntries(posts.map((p) => [p.id, p.index === null ? null : +p.index.toFixed(3)])), null, 2) + '\n',
);

for (const p of posts) {
  const mp = path.join(OUT.metadata, `${p.id}.json`);
  const meta = readJsonIfExists(mp);
  if (meta) {
    meta.performance = {...p, recordedAt: new Date().toISOString()};
    fs.writeFileSync(mp, JSON.stringify(meta, null, 2) + '\n');
  }
}
console.log(`Analysed ${posts.length} post(s) → output/performance-report.md`);

// Chooses tomorrow's topic, pillar and format.
//  - Pillar: the most under-served vs the target mix over the last 20 reels,
//    nudged by measured performance once a pillar has >= 3 posts.
//  - Topic: the next open backlog topic in the neediest pillar.
//  - Format: the topic's own format (it matches the kind of source); without a
//    topic, the least recently used format.
// Run directly to preview: node scripts/daily/plan.mjs
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, listReels, loadReel, readJsonIfExists} from '../lib.mjs';

export const PILLARS = {
  A: "A: Qur'an & Hadith",
  B: 'B: Heart-Softening Reminders',
  C: 'C: Daily Deen & Practical Islam',
  D: 'D: Dua & Dhikr',
  E: 'E: Islam in Everyday Life',
  F: 'F: Islamic Calendar & Occasions',
};
// Content strategy (docs/CONTENT_STRATEGY.md): starting allocations, not fixed rules.
export const TARGET_MIX = {A: 0.3, B: 0.2, C: 0.15, D: 0.15, E: 0.1, F: 0.1};
export const KIND_MIX = {reel: 0.5, carousel: 0.35, story: 0.15};
export const BACKLOG_PATH = path.join(ROOT, 'data', 'topics', 'backlog.json');

const reelNumber = (id) => Number((id.match(/^deen-(\d+)/) ?? [])[1] ?? 0);

const perfIndex = () => readJsonIfExists(path.join(ROOT, 'data', 'performance', 'index.json')) ?? {};

export const history = () => {
  const idx = perfIndex();
  return listReels()
    .map((id) => {
      const r = loadReel(id);
      return {
        id,
        n: reelNumber(id),
        pillar: r.brief.pillar[0],
        format: r.brief.format,
        topic: r.brief.topic,
        hook: r.hooks[r.selectedHook]?.text ?? '',
        insight: r.coreInsight,
        index: idx[id] ?? null,
        backlogId: r.brief.backlogId ?? null,
      };
    })
    .sort((a, b) => a.n - b.n);
};

export const nextReelNumber = () => Math.max(0, ...listReels().map(reelNumber)) + 1;

export const loadBacklog = () => JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8'));
export const saveBacklog = (b) => fs.writeFileSync(BACKLOG_PATH, JSON.stringify(b, null, 2) + '\n');

const median = (xs) => {
  const a = xs.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export function planNext({today = new Date()} = {}) {
  const hist = history();
  const recent = hist.slice(-20);
  const n = recent.length || 1;

  // Performance-adjusted target mix (bounded so no pillar is starved).
  const mix = {...TARGET_MIX};
  for (const k of Object.keys(mix)) {
    const idx = hist.filter((h) => h.pillar === k && h.index !== null).map((h) => h.index);
    if (idx.length >= 3) mix[k] *= Math.min(1.3, Math.max(0.7, median(idx)));
  }
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(mix)) mix[k] /= total;

  const share = (k) => recent.filter((h) => h.pillar === k).length / n;
  const pillarOrder = Object.keys(mix).sort((a, b) => mix[b] - share(b) - (mix[a] - share(a)));

  const backlog = loadBacklog();
  // A topic is taken once any reel (merged or awaiting review) references it.
  const taken = new Set(hist.map((h) => h.backlogId).filter(Boolean));
  const open = backlog.topics.filter((t) => t.status === 'open' && !taken.has(t.id));
  const fresh = (t) => t.addedAt && (today - new Date(t.addedAt)) / 86400000 < 14;

  let pick = null;
  // A fresh trend topic may jump the queue if its pillar is not over-served.
  const trend = open.filter((t) => fresh(t) && share(t.pillar) <= mix[t.pillar] + 0.1).sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))[0];
  if (trend) pick = trend;
  for (const p of pillarOrder) {
    if (pick) break;
    pick = open.find((t) => t.pillar === p) ?? null;
  }

  const formats = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'templates', 'formats.json'), 'utf8')).map((f) => f.id);
  const lastTwo = hist.slice(-2).map((h) => h.format);
  const lastUse = (f) => {
    const i = [...hist].reverse().findIndex((h) => h.format === f);
    return i === -1 ? Infinity : i;
  };
  const chooseFormat = (preferred) => {
    // A topic's format follows its source (an ayah topic needs an ayah format), so it always wins.
    if (preferred && formats.includes(preferred)) return preferred;
    return formats.filter((f) => !lastTwo.includes(f)).sort((a, b) => lastUse(b) - lastUse(a))[0];
  };

  if (!pick) {
    // Backlog exhausted: the writer proposes a new topic in the neediest pillar.
    const pillar = pillarOrder[0];
    return {backlogId: null, pillar, pillarName: PILLARS[pillar], format: chooseFormat(null), topic: null, angle: null, research: false, sources: [], history: hist};
  }
  return {
    backlogId: pick.id,
    pillar: pick.pillar,
    pillarName: PILLARS[pick.pillar],
    format: chooseFormat(pick.format),
    topic: pick.topic,
    angle: pick.angle,
    research: !!pick.research,
    sources: pick.sources ?? [],
    history: hist,
  };
}

export function markUsed(backlogId, reelId) {
  if (!backlogId) return;
  const b = loadBacklog();
  const t = b.topics.find((x) => x.id === backlogId);
  if (t) {
    t.status = 'used';
    t.usedBy = reelId;
    saveBacklog(b);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {history: h, ...plan} = planNext();
  console.log(JSON.stringify({...plan, historyCount: h.length}, null, 2));
}

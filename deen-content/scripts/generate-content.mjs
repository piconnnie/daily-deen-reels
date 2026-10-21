#!/usr/bin/env node
// Scaffolds a new reel content file from a brief, using a format template.
// The scaffold enforces structure (scenes, timings, QA fields); the copy —
// hooks, script, caption — is then written in a Claude Code session or by hand,
// following the content quality bar in README.md.
//
//   node scripts/generate-content.mjs --topic "RAG vs fine-tuning" --format a-vs-b \
//     [--pillar B] [--objective saves] [--audience "..."] [--depth intermediate] \
//     [--voiceover off] [--research required] [--id deen-002-rag-vs-finetuning]
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, listReels, reelPath} from './lib.mjs';

const args = process.argv.slice(2);
const val = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const formats = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/templates/formats.json'), 'utf8'));
const PILLARS = {
  A: "A: Qur'an Reflections",
  B: 'B: Prophetic Guidance',
  C: 'C: Character and Manners',
  D: 'D: Worship and Daily Habits',
  E: 'E: Family and Community',
  F: 'F: Hope, Patience and Trust',
};
// Initial mix from the content strategy; used to suggest an under-served pillar.
const TARGET_MIX = {A: 0.25, B: 0.25, C: 0.2, D: 0.15, E: 0.1, F: 0.05};

const topic = val('topic');
if (!topic || args.includes('--help')) {
  console.log('Usage: node scripts/generate-content.mjs --topic "<topic>" [--format <id>] [--pillar A-F] ...');
  console.log('Formats:', formats.map((f) => f.id).join(', '));
  process.exit(topic ? 0 : 2);
}

const existing = listReels();
const pillarCounts = Object.fromEntries(Object.keys(PILLARS).map((k) => [k, 0]));
for (const r of existing) {
  const p = JSON.parse(fs.readFileSync(reelPath(r), 'utf8')).brief.pillar[0];
  pillarCounts[p] = (pillarCounts[p] ?? 0) + 1;
}
const n = existing.length || 1;
const deficit = (k) => TARGET_MIX[k] - (existing.length ? pillarCounts[k] / n : 0);
const suggested = Object.keys(TARGET_MIX).sort((a, b) => deficit(b) - deficit(a))[0];
const pillarKey = (val('pillar') ?? suggested).toUpperCase();
if (!PILLARS[pillarKey]) throw new Error(`Unknown pillar ${pillarKey}`);

const formatId = val('format', 'mistake');
const format = formats.find((f) => f.id === formatId);
if (!format) throw new Error(`Unknown format "${formatId}". Options: ${formats.map((f) => f.id).join(', ')}`);

const seq = String(existing.length + 1).padStart(3, '0');
const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const id = val('id', `deen-${seq}-${slug}`);
if (fs.existsSync(reelPath(id))) throw new Error(`${id} already exists`);

const fps = 30;
const TODO = (s) => `TODO: ${s}`;
const sceneStub = (s, i) => {
  const base = {
    id: `${s.type}-${i + 1}`,
    type: s.type,
    durationInFrames: Math.round(s.seconds * fps),
    purpose: s.purpose,
    onScreen: TODO('on-screen copy summary'),
    voiceover: TODO('narration for this scene'),
    storyboard: {visual: TODO('exact composition'), animation: TODO('animation + timing')},
    ...(i > 0 ? {transitionIn: 'fade-up'} : {}),
  };
  const H = [{text: TODO('headline line 1')}, {text: TODO('line 2'), highlight: true}];
  switch (s.type) {
    case 'source':
      // Only the reference: the text is pulled from the verified datasets.
      return {...base, kicker: TODO("THE QUR'AN / THE PROPHET ﷺ SAID"), ref: TODO('quran:94:5-6 | bukhari:6114 | muslim:2564c')};
    case 'hook':
      return {...base, kicker: 'DAILY REMINDER', lines: H, sub: TODO('supporting line')};
    case 'cards':
      return {...base, kicker: TODO('KICKER'), headline: H, enter: 'pop', popStart: 8, popStagger: 7, cards: [{text: TODO('card'), status: 'pass'}]};
    case 'table':
      return {...base, kicker: TODO('KICKER'), headline: H, columns: ['INPUT', 'EXPECTED', 'PASS IF'], rows: [{input: TODO('input'), expected: TODO('expected'), passIf: TODO('rule')}], rowStart: 30, rowStagger: 36, notes: [], notesStart: 150, notesStagger: 30};
    case 'comparison':
      return {...base, kicker: TODO('KICKER'), illustrativeLabel: 'ILLUSTRATIVE', left: {label: 'A', value: '0', ratio: 0.5, tone: 'neutral', caption: TODO('caption')}, right: {label: 'B', value: '0', ratio: 0.5, tone: 'accent', caption: TODO('caption')}, rightAt: 30, conclusion: H, conclusionAt: 84};
    case 'checklist':
      return {...base, kicker: TODO('KICKER'), headline: H, items: [TODO('item')], itemStart: 20, itemStagger: 18, rule: TODO('decision rule')};
    case 'diagram':
      return {...base, kicker: TODO('KICKER'), headline: H, nodes: [{label: TODO('node')}], nodeStart: 20, nodeStagger: 16};
    case 'terminal':
      return {...base, kicker: TODO('KICKER'), headline: H, title: 'terminal', lines: [{text: TODO('$ command'), at: 10}], charsPerFrame: 1.2};
    case 'takeaway':
      return {...base, lines: H, cta: TODO('one CTA'), ctaAt: 40, endCardAt: 70};
    default:
      return base;
  }
};

const reel = {
  id,
  version: 1,
  status: 'draft',
  brief: {
    topic,
    audience: val('audience', 'Muslims looking for a short, authentic reminder they can act on today'),
    pillar: PILLARS[pillarKey],
    objective: val('objective', 'saves'),
    format: formatId,
    targetDurationSec: Number(val('duration', format.scenes.reduce((a, s) => a + s.seconds, 0))),
    technicalDepth: val('depth', 'beginner'),
    voiceover: val('voiceover', 'off') === 'on',
    research: val('research', 'not-required'),
    constraints: [],
  },
  coreInsight: TODO('the one-sentence insight a viewer should be able to repeat'),
  hooks: [0, 1, 2].map(() => ({text: TODO('hook'), angle: TODO('angle'), scores: {specificity: 0, relevance: 0, curiosity: 0, credibility: 0, comprehension: 0}, notes: ''})),
  selectedHook: 0,
  selectionRationale: TODO('why this hook wins'),
  fps,
  width: 1080,
  height: 1920,
  scenes: format.scenes.map(sceneStub),
  cover: {kicker: TODO('KICKER'), headline: [{text: TODO('3–7 word')}, {text: TODO('headline'), highlight: true}]},
  caption: {opening: TODO('specific first line'), body: [TODO('context / takeaway')], cta: TODO('one CTA'), hashtags: ['#IslamicReminder', '#Quran', '#Sunnah']},
  primaryCta: {type: 'save', text: TODO('must equal takeaway cta')},
  audio: {bed: `audio/${id}-bed.wav`, bedVolume: 1, voiceover: null, voiceoverVolume: 1},
  claims: [],
  publish: {suggestedDate: TODO('YYYY-MM-DD'), notes: ''},
  repurposing: {carousel: [], followUpReel: '', linkedin: ''},
};

fs.writeFileSync(reelPath(id), JSON.stringify(reel, null, 2) + '\n');
console.log(`Created src/content/reels/${id}.json (${format.name}, pillar ${PILLARS[pillarKey]}${val('pillar') ? '' : ' — suggested by current mix'}).`);
console.log('Next:');
console.log('  1. Replace every TODO (hooks first, then script, caption, claims). Source scenes take only a ref.');
console.log(`     Find refs: node scripts/sources/cli.mjs search "patience"  ·  then: node scripts/sources/cli.mjs apply ${id}`);
console.log('  2. (It is registered automatically.)');
console.log(`  3. npm run validate -- ${id} --content-only   → npm run package -- ${id}   → npm run render -- ${id}`);

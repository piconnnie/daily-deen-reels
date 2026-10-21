#!/usr/bin/env node
// Source tools.
//   node scripts/sources/cli.mjs fetch                 download + hash-check every pinned dataset
//   node scripts/sources/cli.mjs show <ref> [<ref>…]   print the exact text, citation and link
//   node scripts/sources/cli.mjs search "<words>" [--in quran|bukhari|muslim] [--limit 10]
//   node scripts/sources/cli.mjs apply <reelId|draft.json>   fill resolved text into a reel or draft
import fs from 'node:fs';
import path from 'node:path';
import {loadReel, saveReel} from '../lib.mjs';
import {CONFIG, applySources, ensureDatasets, normalize, resolveRef} from './sources.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : d;
};

if (cmd === 'fetch') {
  const problems = await ensureDatasets({log: (m) => console.log(m)});
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log(`✓ ${Object.keys(CONFIG.datasets).length} datasets present and match their pinned SHA-256.`);
} else if (cmd === 'show') {
  await ensureDatasets();
  for (const ref of rest) {
    const r = resolveRef(ref);
    console.log(`\n${r.citation}${r.grade ? ` (${r.grade})` : ''} — ${r.url}\n${r.arabic}\n${r.english}\n[translation: ${r.translation}]`);
  }
} else if (cmd === 'search') {
  await ensureDatasets();
  const words = normalize(rest[0]).toLowerCase().split(' ').filter(Boolean);
  const only = opt('in');
  const limit = Number(opt('limit', 10));
  let n = 0;
  for (const [key, c] of Object.entries(CONFIG.collections)) {
    if (only && only !== key) continue;
    const d = CONFIG.datasets[c.english];
    const file = path.join(process.env.DEEN_SOURCES_DIR ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.cache', 'sources'), `${d.repo}@${d.commit}`, d.path);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = json.quran
      ? json.quran.map((v) => ({ref: `quran:${v.chapter}:${v.verse}`, text: v.text}))
      : json.hadiths.map((h) => {
          const m = /^(\d+)(?:\.(\d+))?$/.exec(String(h.arabicnumber ?? h.hadithnumber));
          const v = m?.[2] ? Number(m[2]) : 0;
          return m && v <= 26 ? {ref: `${key}:${Number(m[1])}${v ? String.fromCharCode(96 + v) : ''}`, text: h.text} : null;
        }).filter(Boolean);
    for (const it of items) {
      const t = it.text.toLowerCase();
      if (words.every((w) => t.includes(w))) {
        console.log(`${it.ref}\t${normalize(it.text).slice(0, 220)}`);
        if (++n >= limit) process.exit(0);
      }
    }
  }
  if (!n) console.log('(no matches)');
} else if (cmd === 'apply') {
  await ensureDatasets();
  const target = rest[0];
  if (target?.endsWith('.json')) {
    const draft = JSON.parse(fs.readFileSync(target, 'utf8'));
    fs.writeFileSync(target, JSON.stringify(applySources(draft), null, 2) + '\n');
  } else {
    saveReel(applySources(loadReel(target)));
  }
  console.log(`✓ sources resolved for ${target}`);
} else {
  console.log('Usage: cli.mjs fetch | show <ref…> | search "<words>" [--in quran|bukhari|muslim] | apply <reelId|draft.json>');
  process.exit(2);
}

#!/usr/bin/env node
// TEST ONLY: writes stand-in "recitation" MP3s (a soft tone, length scaled to the
// ayah's Arabic text) into a recitation cache, so the pipeline can be exercised
// offline. Never used for real reels: real builds download from EveryAyah.
//   node scripts/test/make-recitation-fixtures.mjs <dir> [quran:s:a[-b] …]   (default: every ayah referenced in data/queue + reels)
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';
import {RECITE} from '../sources/recitation.mjs';
import {parseRef, resolveRef} from '../sources/sources.mjs';

const [dir, ...refsArg] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: make-recitation-fixtures.mjs <dir> [refs…]');
  process.exit(2);
}
let refs = refsArg;
if (!refs.length) {
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'data/queue')).filter((f) => f.endsWith('.json')).map((f) => path.join(ROOT, 'data/queue', f)),
    ...fs.readdirSync(path.join(ROOT, 'src/content/reels')).filter((f) => f.endsWith('.json')).map((f) => path.join(ROOT, 'src/content/reels', f)),
    path.join(ROOT, 'scripts/test/fixtures/mock-draft.json'),
  ];
  const set = new Set();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const s of j.scenes ?? []) if (/^quran:/.test(s.ref ?? '')) set.add(s.ref);
    if (j.recitation?.ref) set.add(j.recitation.ref);
  }
  refs = [...set];
}
let n = 0;
for (const ref of refs) {
  const p = parseRef(ref);
  for (let a = p.from; a <= p.to; a++) {
    const len = [...resolveRef(`quran:${p.surah}:${a}`).arabic].length;
    const sec = Math.max(2.5, Math.min(30, len * 0.075)).toFixed(2);
    for (const r of RECITE.reciters) {
      const out = path.join(dir, r.folder, `${String(p.surah).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`);
      if (fs.existsSync(out)) continue;
      fs.mkdirSync(path.dirname(out), {recursive: true});
      const res = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=196:duration=${sec}`, '-af', 'volume=0.35,tremolo=f=3:d=0.5,afade=t=in:d=0.2,afade=t=out:st=' + (sec - 0.3) + ':d=0.3', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
      if (res.status !== 0) throw new Error(res.stderr?.toString());
      n++;
    }
  }
}
console.log(`fixtures: ${n} file(s) written to ${dir} for ${refs.length} ref(s)`);

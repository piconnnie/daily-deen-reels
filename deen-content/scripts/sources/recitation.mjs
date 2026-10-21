// Qur'an recitation as the reel's audio.
//
// The reel recites one Qur'an reference (≤ recitations.maxSeconds):
//   - by default the first ayah quoted on screen ("scene" mode: it plays inside
//     that source scene, which is lengthened so the recitation is never cut);
//   - or a writer-chosen related ayah via `recitation: {ref}` (e.g. for a hadith
//     reel) — "background" mode: it starts after the hook and is labelled on
//     screen and in the caption;
//   - `recitation: false` keeps the reel silent.
// Audio comes from the per-ayah files of an approved reciter (sources.json →
// recitations), downloaded once into .cache/recitations/. Each file's SHA-256 and
// duration are recorded in the reel; a later build refuses a file that changed.
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';
import {LIMITS} from '../content-limits.mjs';
import {CONFIG, parseRef} from './sources.mjs';

export const RECITE = CONFIG.recitations;
const DIR = process.env.DEEN_RECITATION_DIR ?? path.join(ROOT, '.cache', 'recitations');
const FPS = 30;
export const LEAD_FRAMES = 12; // recitation starts this long after its scene / the hook
export const TAIL_FRAMES = 21; // and must end at least this long before the scene / reel ends
export const GAP_SEC = 0.25; // pause between consecutive ayat

const pad3 = (n) => String(n).padStart(3, '0');
export const recitationFile = (folder, file) => path.join(DIR, folder, file);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export const reelNumberOf = (id) => Number((/^deen-(\d+)/.exec(id ?? '') ?? [])[1] ?? 0);
export const reciterFor = (reel, requested) =>
  RECITE.reciters.find((r) => r.id === requested) ?? RECITE.reciters[(reelNumberOf(reel.id) + 1) % RECITE.reciters.length];

export function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  const s = Number(r.stdout.trim());
  if (!(s > 0)) throw new Error(`could not read the duration of ${path.basename(file)}`);
  return Math.round(s * 1000) / 1000;
}

async function download(folder, file) {
  const dest = recitationFile(folder, file);
  if (fs.existsSync(dest)) return dest;
  if (process.env.DEEN_SOURCES_OFFLINE) throw new Error(`${folder}/${file} is not in the recitation cache and downloads are off`);
  const errors = [];
  for (const tpl of RECITE.urls) {
    const url = tpl.replace('{folder}', folder).replace('{file}', file);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('file too small');
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, buf);
      return dest;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e.message}`);
    }
  }
  throw new Error(`could not download recitation ${folder}/${file} (${errors.join('; ')})`);
}

const sceneStarts = (reel) => {
  let t = 0;
  return reel.scenes.map((s) => {
    const st = t;
    t += s.durationInFrames;
    return st;
  });
};

/**
 * Resolve and download the recitation, then lengthen scenes so it fits.
 * Mutates reel.recitation (and scene durations). Returns a list of problems.
 */
export async function applyRecitation(reel) {
  const req = reel.recitation;
  const quranScene0 = reel.scenes.find((s) => s.type === 'source' && /^quran:/.test(s.ref ?? ''));
  const explicit0 = !!req?.ref && req.chosen !== 'default';
  const durations = reel.scenes.map((s) => s.durationInFrames);
  const restore = () => reel.scenes.forEach((s, i) => (s.durationInFrames = durations[i]));
  const first = await applyWith(reel, req, null);
  if (first.tooLong) restore();
  if (!first.tooLong || explicit0 || req?.reciter && req.chosen === 'writer') return first.problems;
  // The default ayah is too long for the rotating reciter: try the others,
  // quickest first; if none fits, the reel stays silent (QA shows a warning).
  for (const id of RECITE.fallbackOrder ?? RECITE.reciters.map((r) => r.id)) {
    const r = await applyWith(reel, {ref: quranScene0?.ref, chosen: 'default'}, id);
    if (!r.tooLong) return r.problems;
    restore();
  }
  reel.recitation = {off: true, reason: `${quranScene0?.ref} is longer than ${RECITE.maxSeconds}s for every approved reciter`};
  return [];
}

async function applyWith(reel, req, forceReciter) {
  const wrap = (problems, tooLong = false) => ({problems, tooLong});
  if (req === false || (req?.off && !req?.reason)) {
    reel.recitation = {off: true};
    return wrap([]);
  }
  const quranScene = reel.scenes.find((s) => s.type === 'source' && /^quran:/.test(s.ref ?? ''));
  // A writer-chosen ref sticks; a default one follows the quoted ayah if it is edited.
  const explicit = !!req?.ref && req.chosen !== 'default';
  const ref = explicit ? req.ref : quranScene?.ref;
  if (!ref) {
    reel.recitation = null; // nothing to recite: the reel stays silent
    return wrap([]);
  }
  let p;
  try {
    p = parseRef(ref);
  } catch (e) {
    return wrap([`recitation: ${e.message}`]);
  }
  if (p.kind !== 'quran') return wrap([`recitation: "${ref}" is not a Qur'an reference — only the Qur'an is recited`]);
  const reciter = forceReciter ? RECITE.reciters.find((r) => r.id === forceReciter) : reciterFor(reel, req?.reciter);
  const previous = req?.files?.length && req.ref === ref && req.reciter === reciter.id ? new Map(req.files.map((f) => [f.file, f])) : new Map();

  const files = [];
  const problems = [];
  for (let a = p.from; a <= p.to; a++) {
    const file = `${pad3(p.surah)}${pad3(a)}.mp3`;
    try {
      const local = await download(reciter.folder, file);
      const hash = sha256(fs.readFileSync(local));
      const before = previous.get(file);
      if (before && before.sha256 !== hash) {
        problems.push(`recitation: ${reciter.folder}/${file} changed since this reel was approved for review (SHA-256 differs)`);
        continue;
      }
      files.push({file, url: RECITE.urls[0].replace('{folder}', reciter.folder).replace('{file}', file), sha256: hash, durationSec: probeSeconds(local)});
    } catch (e) {
      problems.push(`recitation: ${e.message}`);
    }
  }
  if (problems.length) return wrap(problems);
  const totalSec = Math.round((files.reduce((a, f) => a + f.durationSec, 0) + GAP_SEC * (files.length - 1)) * 1000) / 1000;
  if (totalSec > RECITE.maxSeconds) {
    return wrap([`recitation: ${ref} by ${reciter.name} is ${totalSec.toFixed(1)}s (max ${RECITE.maxSeconds}s). Set "recitation": {"ref": "<a shorter ayah>"} or "recitation": false.`], true);
  }

  // Fit: never cut an ayah. Scene mode lengthens the quote scene; background
  // mode lengthens the scenes after the hook (last first), within their limits.
  const audioFrames = Math.ceil(totalSec * FPS);
  const target = reel.scenes.find((s) => s.type === 'source' && s.ref === ref);
  let mode;
  let startFrame;
  if (target) {
    mode = 'scene';
    const need = LEAD_FRAMES + audioFrames + TAIL_FRAMES;
    if (target.durationInFrames < need) target.durationInFrames = need;
    startFrame = sceneStarts(reel)[reel.scenes.indexOf(target)] + LEAD_FRAMES;
  } else {
    mode = 'background';
    startFrame = (reel.scenes[0]?.durationInFrames ?? 90) > 30 ? 20 : LEAD_FRAMES;
    const total = reel.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    let deficit = startFrame + audioFrames + TAIL_FRAMES - total;
    for (let i = reel.scenes.length - 1; i > 0 && deficit > 0; i--) {
      const s = reel.scenes[i];
      const max = s.type === 'source' ? LIMITS.source.maxFrames : LIMITS.scene.maxFrames;
      const add = Math.min(deficit, Math.max(0, max - s.durationInFrames));
      s.durationInFrames += add;
      deficit -= add;
    }
    if (deficit > 0) return wrap([`recitation: ${ref} (${totalSec.toFixed(1)}s) doesn't fit this reel even with every scene at its maximum length; choose a shorter ayah`], true);
  }
  const label = `Qur'an ${p.surah}:${p.from === p.to ? p.from : `${p.from}-${p.to}`}`;
  reel.recitation = {
    ref,
    chosen: explicit ? 'writer' : 'default',
    citation: label,
    url: `https://quran.com/${p.surah}/${p.from === p.to ? p.from : `${p.from}-${p.to}`}`,
    reciter: reciter.id,
    reciterName: reciter.name,
    folder: reciter.folder,
    source: 'EveryAyah.com',
    mode,
    sceneId: target?.id ?? null,
    startFrame,
    gapSec: GAP_SEC,
    totalSec,
    files,
  };
  return wrap([]);
}

/** Synchronous re-check used by QA: same files, same hashes, still fits. */
export function checkRecitation(reel) {
  const r = reel.recitation;
  if (!r || r.off) return [];
  const out = [];
  let p;
  try {
    p = parseRef(r.ref);
  } catch (e) {
    return [e.message];
  }
  if (p.kind !== 'quran') out.push(`${r.ref} is not a Qur'an reference`);
  const reciter = RECITE.reciters.find((x) => x.id === r.reciter);
  if (!reciter || reciter.folder !== r.folder) out.push(`reciter "${r.reciter}" is not an approved reciter`);
  const expected = [];
  for (let a = p.from; a <= p.to; a++) expected.push(`${pad3(p.surah)}${pad3(a)}.mp3`);
  if (JSON.stringify(expected) !== JSON.stringify((r.files ?? []).map((f) => f.file))) out.push(`audio files don't match ${r.ref}`);
  for (const f of r.files ?? []) {
    const local = recitationFile(r.folder, f.file);
    if (!fs.existsSync(local)) {
      out.push(`${f.file} is missing from the recitation cache (run: node scripts/sources/cli.mjs apply ${reel.id})`);
      continue;
    }
    if (sha256(fs.readFileSync(local)) !== f.sha256) out.push(`${f.file} differs from the recorded SHA-256`);
  }
  if (r.totalSec > RECITE.maxSeconds) out.push(`recitation is ${r.totalSec}s (max ${RECITE.maxSeconds}s)`);
  const starts = sceneStarts(reel);
  const total = reel.scenes.reduce((a, s) => a + s.durationInFrames, 0);
  const end = r.startFrame + Math.ceil(r.totalSec * FPS);
  if (r.mode === 'scene') {
    const i = reel.scenes.findIndex((s) => s.id === r.sceneId && s.type === 'source' && s.ref === r.ref);
    if (i < 0) out.push(`recitation scene "${r.sceneId}" no longer quotes ${r.ref}`);
    else {
      if (r.startFrame !== starts[i] + LEAD_FRAMES) out.push('recitation start no longer lines up with its scene (re-run apply)');
      if (end + TAIL_FRAMES > starts[i] + reel.scenes[i].durationInFrames) out.push(`the ${r.citation} recitation would be cut: lengthen scene "${r.sceneId}" (re-run apply)`);
    }
  } else if (end + TAIL_FRAMES > total) out.push(`the ${r.citation} recitation would be cut by the end of the reel (re-run apply)`);
  return out;
}

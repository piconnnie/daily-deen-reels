// Verified-source layer. Reel quotes are never typed by a writer: a draft names
// a reference ("quran:94:5-6", "bukhari:6114", "muslim:2564c") and this module
// pulls the exact text from the pinned datasets in sources/sources.json.
//
// Datasets are downloaded once per commit into .cache/sources/ (jsDelivr first,
// raw.githubusercontent.com as fallback) and checked against their SHA-256.
// Set DEEN_SOURCES_OFFLINE=1 to forbid downloads (tests).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';

export const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'sources.json'), 'utf8'));
const CACHE = process.env.DEEN_SOURCES_DIR ?? path.join(ROOT, '.cache', 'sources');

const cachePath = (d) => path.join(CACHE, `${d.repo}@${d.commit}`, d.path);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Download (if needed) and hash-check every dataset. Returns problems as strings. */
export async function ensureDatasets({keys = Object.keys(CONFIG.datasets), log = () => {}} = {}) {
  const problems = [];
  for (const key of keys) {
    const d = CONFIG.datasets[key];
    const file = cachePath(d);
    if (!fs.existsSync(file)) {
      if (process.env.DEEN_SOURCES_OFFLINE) {
        problems.push(`${key}: not in the source cache and downloads are off`);
        continue;
      }
      const urls = [
        `https://cdn.jsdelivr.net/gh/${d.repo}@${d.commit}/${d.path}`,
        `https://raw.githubusercontent.com/${d.repo}/${d.commit}/${d.path}`,
      ];
      let ok = false;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.mkdirSync(path.dirname(file), {recursive: true});
          fs.writeFileSync(file, buf);
          log(`fetched ${key} from ${new URL(url).host}`);
          ok = true;
          break;
        } catch (e) {
          log(`${key}: ${url} failed (${e.message})`);
        }
      }
      if (!ok) {
        problems.push(`${key}: could not download ${d.repo}@${d.commit.slice(0, 7)}/${d.path}`);
        continue;
      }
    }
    const got = sha256(fs.readFileSync(file));
    if (got !== d.sha256) {
      problems.push(`${key}: SHA-256 mismatch (expected ${d.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…). The upstream file changed; review it before updating sources/sources.json.`);
    }
  }
  return problems;
}

const loaded = new Map();
function dataset(key) {
  if (loaded.has(key)) return loaded.get(key);
  const d = CONFIG.datasets[key];
  if (!d) throw new Error(`unknown dataset "${key}"`);
  const file = cachePath(d);
  if (!fs.existsSync(file)) throw new Error(`dataset "${key}" is not downloaded yet: run \`npm run sources:fetch\``);
  const buf = fs.readFileSync(file);
  if (sha256(buf) !== d.sha256) throw new Error(`dataset "${key}" does not match its pinned SHA-256`);
  const json = JSON.parse(buf.toString('utf8'));
  let index;
  if (json.quran) {
    index = new Map(json.quran.map((v) => [`${v.chapter}:${v.verse}`, v.text]));
  } else {
    // Hadith: index by sunnah.com-style number. Bukhari numbers are plain; Muslim
    // variants are "2564.03" in the data → "2564c" on sunnah.com.
    index = new Map();
    for (const h of json.hadiths) {
      const raw = String(h.arabicnumber ?? h.hadithnumber);
      const m = /^(\d+)(?:\.(\d+))?$/.exec(raw);
      if (!m) continue;
      const v = m[2] ? Number(m[2]) : 0;
      if (v > 26) continue;
      const key2 = v ? `${Number(m[1])}${String.fromCharCode(96 + v)}` : String(Number(m[1]));
      if (!index.has(key2)) index.set(key2, h.text);
    }
  }
  loaded.set(key, index);
  return index;
}

/** Whitespace-level normalisation only (never changes words or punctuation). */
export const normalize = (s) =>
  String(s ?? '')
    .replace(/[\u200e\u200f\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/:(?=[A-Za-z"“])/g, ': ')
    .trim();

/** Comparison key for "is this a verbatim excerpt": unify quote styles and spacing. */
export const compareKey = (s) =>
  normalize(s)
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, '$1');

export function parseRef(ref) {
  const m = /^([a-z]+):(.+)$/.exec(String(ref ?? '').trim());
  if (!m) throw new Error(`"${ref}" is not a source reference (expected e.g. quran:94:5-6, bukhari:6114, muslim:2564c)`);
  const [, collection, rest] = m;
  const c = CONFIG.collections[collection];
  if (!c) throw new Error(`"${collection}" is not an approved collection (allowed: ${Object.keys(CONFIG.collections).join(', ')})`);
  if (c.kind === 'quran') {
    const q = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(rest);
    if (!q) throw new Error(`"${ref}": use ${c.refFormat}`);
    const surah = Number(q[1]);
    const from = Number(q[2]);
    const to = Number(q[3] ?? q[2]);
    if (surah < 1 || surah > 114 || to < from) throw new Error(`"${ref}": invalid surah or ayah range`);
    if (to - from + 1 > c.maxAyat) throw new Error(`"${ref}": at most ${c.maxAyat} consecutive ayat per quote`);
    return {collection, kind: 'quran', surah, from, to};
  }
  const h = /^(\d{1,5})([a-z])?$/.exec(rest);
  if (!h) throw new Error(`"${ref}": use ${c.refFormat}`);
  return {collection, kind: 'hadith', number: `${Number(h[1])}${h[2] ?? ''}`};
}

/**
 * Resolve a reference to its exact text.
 * → {ref, collection, collectionName, kind, citation, url, arabic, english, translation, grade}
 */
export function resolveRef(ref) {
  const p = parseRef(ref);
  const c = CONFIG.collections[p.collection];
  const ar = dataset(c.arabic);
  const en = dataset(c.english);
  if (p.kind === 'quran') {
    const keys = [];
    for (let a = p.from; a <= p.to; a++) keys.push(`${p.surah}:${a}`);
    const missing = keys.filter((k) => !en.has(k) || !ar.has(k));
    if (missing.length) throw new Error(`"${ref}": no such ayah ${missing.join(', ')}`);
    const range = p.from === p.to ? `${p.from}` : `${p.from}-${p.to}`;
    const tr = c.transliteration ? dataset(c.transliteration) : null;
    return {
      ref,
      collection: p.collection,
      collectionName: c.name,
      kind: 'quran',
      citation: `Qur'an ${p.surah}:${range}`,
      url: `https://quran.com/${p.surah}/${range}`,
      arabic: keys.map((k) => normalize(ar.get(k)) + ` ${toArabicDigits(Number(k.split(':')[1]))}`).join(' '),
      // Ayah numbers are inserted between ayat (the dataset drops end-of-ayah
      // punctuation); the words themselves are untouched.
      english: keys.length === 1 ? normalize(en.get(keys[0])) : keys.map((k) => `${normalize(en.get(k))} (${k.split(':')[1]})`).join(' '),
      translation: c.translation,
      grade: null,
      transliteration: tr ? keys.map((k) => normalize(tr.get(k))).join(' … ') : null,
    };
  }
  const text = en.get(p.number);
  if (!text || !normalize(text)) throw new Error(`"${ref}": no English text for ${c.name} ${p.number} in the dataset`);
  return {
    ref,
    collection: p.collection,
    collectionName: c.name,
    kind: 'hadith',
    citation: `${c.name} ${p.number}`,
    url: `https://sunnah.com/${p.collection}:${p.number}`,
    arabic: normalize(ar.get(p.number) ?? ''),
    english: normalize(text),
    translation: c.translation,
    grade: c.grade,
    narrator: narratorOf(text),
  };
}

const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

/** "Narrated Abu Huraira: …" / "Abu Huraira reported …" → "Abu Huraira" (best effort, display only). */
function narratorOf(text) {
  const t = normalize(text);
  const a = /^Narrated ([^:]{3,60}):/.exec(t);
  if (a) return a[1].trim();
  const b = /^([A-Z][A-Za-z'.\- ]{2,50}?) (?:reported|narrated)\b/.exec(t);
  return b ? b[1].trim() : null;
}

/** True when `excerpt` appears verbatim (modulo spacing / quote style) in `full`. */
export const isVerbatimExcerpt = (excerpt, full) => {
  const e = compareKey(excerpt).replace(/^…|…$/g, '').trim();
  return e.length >= 12 && compareKey(full).includes(e);
};

/**
 * Fill every `source` scene's `resolved` block and the reel's `sources` list
 * from the datasets. Writers only provide `ref` (+ optional verbatim excerpts).
 * Throws with a list of problems if anything doesn't resolve.
 */
export function applySources(reel) {
  const problems = [];
  const sources = [];
  for (const s of reel.scenes ?? []) {
    if (s.type !== 'source') continue;
    try {
      const r = resolveRef(s.ref);
      s.resolved = r;
      if (!sources.some((x) => x.ref === r.ref)) sources.push({ref: r.ref, citation: r.citation, url: r.url, translation: r.translation, grade: r.grade, english: r.english});
    } catch (e) {
      problems.push(`scene ${s.id}: ${e.message}`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  reel.sources = sources;
  return reel;
}

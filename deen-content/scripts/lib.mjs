// Shared helpers for the pipeline scripts (plain Node, no dependencies).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REELS_DIR = path.join(ROOT, 'src', 'content', 'reels');
export const OUT = {
  reels: path.join(ROOT, 'output', 'reels'),
  covers: path.join(ROOT, 'output', 'covers'),
  captions: path.join(ROOT, 'output', 'captions'),
  metadata: path.join(ROOT, 'output', 'metadata'),
  storyboards: path.join(ROOT, 'output', 'storyboards'),
  qa: path.join(ROOT, 'output', 'qa'),
  slides: path.join(ROOT, 'output', 'slides'),
};

export const reelPath = (id) => path.join(REELS_DIR, `${id}.json`);
export const loadReel = (id) => {
  const p = reelPath(id);
  if (!fs.existsSync(p)) throw new Error(`No content file for "${id}" at ${path.relative(ROOT, p)}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};
export const saveReel = (reel) => fs.writeFileSync(reelPath(reel.id), JSON.stringify(reel, null, 2) + '\n');

export const listReels = () =>
  fs.readdirSync(REELS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

export const sceneTimings = (reel) => {
  let t = 0;
  return reel.scenes.map((s) => {
    const start = t;
    t += s.durationInFrames;
    return {id: s.id, type: s.type, startFrame: start, endFrame: t, startSec: +(start / reel.fps).toFixed(2), endSec: +(t / reel.fps).toFixed(2)};
  });
};

export const totalFrames = (reel) => reel.scenes.reduce((a, s) => a + s.durationInFrames, 0);

export const ensureDir = (d) => fs.mkdirSync(d, {recursive: true});

export const readJsonIfExists = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

export const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
};

export const srtTime = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

export const reelIdArg = () => {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node <script> <reelId>');
    console.error('Available:', listReels().join(', '));
    process.exit(2);
  }
  return id;
};

/**
 * The Instagram caption: our words, then a sources block generated from the
 * resolved quotes (citation, translation/grade, link), then hashtags. When a
 * scene shows only an excerpt, the full translated text is included so the
 * excerpt can be read in context.
 */
export const captionText = (reel) => {
  const sources = reel.sources ?? [];
  const excerpted = new Set((reel.scenes ?? []).filter((s) => s.type === 'source' && s.excerpt).map((s) => s.ref));
  const lines = sources.map((x) => {
    const tag = x.grade ? `${x.grade}, tr. ${x.translation}` : `tr. ${x.translation}`;
    const full = excerpted.has(x.ref) ? `\nFull text: ${x.english}` : '';
    return `• ${x.citation} (${tag}) — ${x.url.replace(/^https:\/\//, '')}${full}`;
  });
  const rec = reel.recitation?.files ? reel.recitation : null;
  if (rec) lines.push(`• Recitation: ${rec.citation} — ${rec.reciterName} (${rec.source}) — ${rec.url.replace(/^https:\/\//, '')}`);
  return [
    reel.caption.opening,
    ...reel.caption.body,
    reel.caption.cta,
    lines.length ? `📖 Sources\n${lines.join('\n')}` : '',
    reel.caption.hashtags.join(' '),
  ].filter(Boolean).join('\n\n');
};

export const kindOf = (reel) => reel.kind ?? 'reel';
/** Slide images of a carousel/story, in order (after render). */
export const slideFiles = (id, ext = 'jpg') => {
  const dir = path.join(OUT.slides, id);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('slide-') && f.endsWith(`.${ext}`)).sort().map((f) => path.join(dir, f)) : [];
};

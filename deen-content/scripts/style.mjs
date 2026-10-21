// Node twin of pickStyle() in src/brand/theme.tsx (same rotation rule).
//   import {pickStyle} from './style.mjs'
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const styles = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'brand', 'styles.json'), 'utf8'));

export const reelNumber = (id) => {
  const m = /^deen-(\d+)/.exec(id);
  if (m) return Number(m[1]);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

const pick = (ids, wanted, i) => (ids.includes(wanted) ? wanted : ids[i % ids.length]);

export function pickStyle(id, style = {}) {
  const n = reelNumber(id);
  return {
    theme: pick(styles.themes, style?.theme, n),
    layout: pick(styles.layouts, style?.layout, n),
    backdrop: pick(styles.backdrops, style?.backdrop, n + 1),
    type: pick(styles.type, style?.type, Math.floor(n / 2)),
    motion: pick(styles.motion, style?.motion, n + 1),
    music: pick(Object.keys(styles.music), style?.music, 0),
  };
}

export const describeStyle = (s) => `${s.theme} theme · ${s.layout} layout · ${s.backdrop} backdrop · ${s.type} headlines · ${s.motion} transitions`;
export const STYLE_OPTIONS = {themes: styles.themes, layouts: styles.layouts, backdrops: styles.backdrops, type: styles.type, motion: styles.motion, music: Object.keys(styles.music)};

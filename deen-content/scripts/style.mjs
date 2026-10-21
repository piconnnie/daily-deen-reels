// Node twin of pickStyle() in src/brand/theme.tsx (same rotation rule).
//   import {pickStyle} from './style.mjs'
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const styles = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'brand', 'styles.json'), 'utf8'));
const THEMES = styles.themes;
const MUSIC = Object.keys(styles.music);
const MOTION = styles.motion;

export const reelNumber = (id) => {
  const m = /^deen-(\d+)/.exec(id);
  if (m) return Number(m[1]);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

export function pickStyle(id, style = {}) {
  const n = reelNumber(id);
  return {
    theme: THEMES.includes(style?.theme) ? style.theme : THEMES[n % THEMES.length],
    music: MUSIC.includes(style?.music) ? style.music : MUSIC[(n + 2) % MUSIC.length],
    motion: MOTION.includes(style?.motion) ? style.motion : MOTION[n % MOTION.length],
  };
}

export const describeStyle = (s) => `${s.theme} theme · ${styles.music[s.music]?.label ?? s.music} · ${s.motion} transitions`;
export const STYLE_OPTIONS = {themes: THEMES, music: MUSIC, motion: MOTION};

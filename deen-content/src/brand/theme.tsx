import React, {createContext, useContext} from 'react';
import styles from './styles.json';
import {themes, toneColors, type Palette, type ThemeId, type Tone} from './tokens';

export type MusicId = keyof typeof styles.music;
export type MotionId = 'rise' | 'slide' | 'zoom';

export interface ReelStyle {
  theme: ThemeId;
  music: MusicId;
  motion: MotionId;
}

const THEME_IDS = styles.themes as ThemeId[];
const MUSIC_IDS = Object.keys(styles.music) as MusicId[];
const MOTION_IDS = styles.motion as MotionId[];

/** The reel number in "deen-012-…", or a stable hash of the id. */
export const reelNumber = (id: string) => {
  const m = /^deen-(\d+)/.exec(id);
  if (m) return Number(m[1]);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/**
 * The reel's style: its own `style` field where set (and valid), otherwise a
 * rotation by reel number so consecutive reels never look or sound the same.
 * Keep in sync with scripts/style.mjs and scripts/synth-audio.py.
 */
export const pickStyle = (id: string, style?: Partial<ReelStyle> | null): ReelStyle => {
  const n = reelNumber(id);
  return {
    theme: style?.theme && THEME_IDS.includes(style.theme) ? style.theme : THEME_IDS[n % THEME_IDS.length],
    music: style?.music && MUSIC_IDS.includes(style.music) ? style.music : MUSIC_IDS[(n + 2) % MUSIC_IDS.length],
    motion: style?.motion && MOTION_IDS.includes(style.motion) ? style.motion : MOTION_IDS[n % MOTION_IDS.length],
  };
};

export const musicBpm = (music: MusicId) => styles.music[music]?.bpm ?? 100;

type ThemeValue = {palette: Palette; style: ReelStyle};
const DEFAULT: ThemeValue = {palette: themes.night, style: {theme: 'night', music: 'none', motion: 'rise'}};
const ThemeContext = createContext<ThemeValue>(DEFAULT);

export const ThemeProvider: React.FC<{style: ReelStyle; children: React.ReactNode}> = ({style, children}) => (
  <ThemeContext.Provider value={{palette: themes[style.theme] ?? themes.night, style}}>{children}</ThemeContext.Provider>
);

export const useColors = (): Palette => useContext(ThemeContext).palette;
export const useToneColor = (): Record<Tone, string> => toneColors(useContext(ThemeContext).palette);
export const useReelStyle = (): ReelStyle => useContext(ThemeContext).style;

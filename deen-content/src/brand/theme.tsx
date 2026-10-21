import React, {createContext, useContext} from 'react';
import styles from './styles.json';
import {themes, toneColors, type Palette, type ThemeId, type Tone} from './tokens';

export type MusicId = keyof typeof styles.music;
export type MotionId = 'fade' | 'rise' | 'slide';
export type LayoutId = 'framed' | 'minimal' | 'editorial';
export type BackdropId = 'plain' | 'gradient' | 'motif' | 'border';
export type TypeId = 'sans' | 'serif';

export interface ReelStyle {
  theme: ThemeId;
  layout: LayoutId;
  backdrop: BackdropId;
  type: TypeId;
  motion: MotionId;
  music: MusicId;
}

const THEME_IDS = styles.themes as ThemeId[];
const LAYOUT_IDS = styles.layouts as LayoutId[];
const BACKDROP_IDS = styles.backdrops as BackdropId[];
const TYPE_IDS = styles.type as TypeId[];
const MOTION_IDS = styles.motion as MotionId[];
const MUSIC_IDS = Object.keys(styles.music) as MusicId[];

/** The reel number in "deen-012-…", or a stable hash of the id. */
export const reelNumber = (id: string) => {
  const m = /^deen-(\d+)/.exec(id);
  if (m) return Number(m[1]);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

const pick = <T extends string>(ids: T[], wanted: unknown, i: number): T => (ids.includes(wanted as T) ? (wanted as T) : ids[i % ids.length]);

/**
 * The reel's look: its own `style` field where set (and valid), otherwise a
 * rotation by reel number, so the full combination repeats only every 60 reels.
 * Keep in sync with scripts/style.mjs.
 */
export const pickStyle = (id: string, style?: Partial<ReelStyle> | null): ReelStyle => {
  const n = reelNumber(id);
  return {
    theme: pick(THEME_IDS, style?.theme, n),
    layout: pick(LAYOUT_IDS, style?.layout, n),
    backdrop: pick(BACKDROP_IDS, style?.backdrop, n + 1),
    type: pick(TYPE_IDS, style?.type, Math.floor(n / 2)),
    motion: pick(MOTION_IDS, style?.motion, n + 1),
    music: pick(MUSIC_IDS, style?.music, 0),
  };
};

export const musicBpm = (music: MusicId) => styles.music[music]?.bpm ?? 100;

type ThemeValue = {palette: Palette; style: ReelStyle};
const DEFAULT: ThemeValue = {palette: themes.night, style: {theme: 'night', layout: 'framed', backdrop: 'plain', type: 'sans', motion: 'fade', music: 'recitation'}};
const ThemeContext = createContext<ThemeValue>(DEFAULT);

export const ThemeProvider: React.FC<{style: ReelStyle; children: React.ReactNode}> = ({style, children}) => (
  <ThemeContext.Provider value={{palette: themes[style.theme] ?? themes.night, style}}>{children}</ThemeContext.Provider>
);

export const useColors = (): Palette => useContext(ThemeContext).palette;
export const useToneColor = (): Record<Tone, string> => toneColors(useContext(ThemeContext).palette);
export const useReelStyle = (): ReelStyle => useContext(ThemeContext).style;

// Single source of truth for the Daily Deen Reminders visual system.
// Change values here, never inline in scenes.
//
// Palettes share one set of role names (kept from the original navy theme):
//   navy        background          navyRaised  cards / panels
//   navyLine    borders, tracks     indigo      primary accent (bars, underline)
//   cyan        highlight (key words, icons)
//   offWhite    primary text        slate       secondary text
//   success / warning  status colours
//   deep        terminal / inset background
// Components read the active palette with useColors() (src/brand/theme.tsx).

export type Palette = {
  navy: string;
  navyRaised: string;
  navyLine: string;
  indigo: string;
  cyan: string;
  offWhite: string;
  slate: string;
  success: string;
  warning: string;
  deep: string;
  /** Background texture for this theme. */
  pattern: 'grid' | 'dots' | 'diagonal' | 'rings' | 'waves' | 'stars' | 'arches';
  /** Strength of the background glow (0–1). */
  glow: number;
  light?: boolean;
};

export const themes = {
  // Deep night blue with gold.
  night: {
    navy: '#0B1022', navyRaised: '#131B32', navyLine: '#25304F', indigo: '#C8A24A', cyan: '#F0D58A',
    offWhite: '#F7F4EC', slate: '#9AA2B2', success: '#8FD9B6', warning: '#F2B46B', deep: '#070B17',
    pattern: 'stars', glow: 0.12,
  },
  // Light: ivory paper, ink text, green + ochre.
  ivory: {
    navy: '#FAF7F0', navyRaised: '#FFFFFF', navyLine: '#E7E0D2', indigo: '#1F6F5C', cyan: '#A0701C',
    offWhite: '#1B1A17', slate: '#6B675E', success: '#13803F', warning: '#B45309', deep: '#FFFDF8',
    pattern: 'stars', glow: 0.08, light: true,
  },
  // Deep emerald with gold.
  emerald: {
    navy: '#07150F', navyRaised: '#0E2219', navyLine: '#1D3A2C', indigo: '#2A9B6A', cyan: '#E9C46A',
    offWhite: '#F2F8F3', slate: '#93AA9C', success: '#8FE3B8', warning: '#F2B46B', deep: '#030C08',
    pattern: 'arches', glow: 0.14,
  },
  // Light: cool mist, slate-blue + terracotta.
  mist: {
    navy: '#EEF2F5', navyRaised: '#FFFFFF', navyLine: '#D6DEE5', indigo: '#2F5D8A', cyan: '#B0563B',
    offWhite: '#14202B', slate: '#5B6773', success: '#13803F', warning: '#B45309', deep: '#F8FAFC',
    pattern: 'dots', glow: 0.08, light: true,
  },
  // Plum dusk with rose and apricot.
  dusk: {
    navy: '#160E1C', navyRaised: '#211629', navyLine: '#3A2944', indigo: '#B2607A', cyan: '#F0C38E',
    offWhite: '#FBF5F2', slate: '#AE9FAF', success: '#9EE6C3', warning: '#F2B46B', deep: '#0D0811',
    pattern: 'arches', glow: 0.14,
  },
  // Light: warm sand, teal + amber.
  sand: {
    navy: '#F4EDDF', navyRaised: '#FFFDF8', navyLine: '#E2D6BF', indigo: '#0F6B5C', cyan: '#9A6512',
    offWhite: '#1D1B16', slate: '#6B6455', success: '#13803F', warning: '#B45309', deep: '#FBF7EE',
    pattern: 'stars', glow: 0.08, light: true,
  },
  // Deep teal with mint.
  teal: {
    navy: '#04171A', navyRaised: '#0A2428', navyLine: '#17393F', indigo: '#1F9A94', cyan: '#A8EAD6',
    offWhite: '#EFFAF8', slate: '#8AA6A6', success: '#9EE6B0', warning: '#F2C37A', deep: '#020E10',
    pattern: 'stars', glow: 0.12,
  },
  // Light: blush, burgundy + amber.
  rose: {
    navy: '#F8F0EE', navyRaised: '#FFFFFF', navyLine: '#EAD9D4', indigo: '#8C3B4A', cyan: '#B0702A',
    offWhite: '#251618', slate: '#7A6366', success: '#13803F', warning: '#B45309', deep: '#FFFAF9',
    pattern: 'dots', glow: 0.08, light: true,
  },
  // Charcoal ink with brass.
  ink: {
    navy: '#121110', navyRaised: '#1C1B19', navyLine: '#33302B', indigo: '#B98A3C', cyan: '#F3E3B5',
    offWhite: '#F7F3EA', slate: '#A39C8F', success: '#9BD8B0', warning: '#F2B46B', deep: '#0A0908',
    pattern: 'dots', glow: 0.1,
  },
  // Dark olive with sage and cream.
  olive: {
    navy: '#12140D', navyRaised: '#1B1E14', navyLine: '#30351F', indigo: '#9AA554', cyan: '#EADBA8',
    offWhite: '#F5F3EA', slate: '#A3A48F', success: '#B5D98F', warning: '#F2B46B', deep: '#0B0C08',
    pattern: 'arches', glow: 0.12,
  },
} satisfies Record<string, Palette>;

export type ThemeId = keyof typeof themes;

/** Default palette (the original look). Prefer useColors() inside components. */
export const colors: Palette = themes.night;

/** '#RRGGBB' + alpha → 'rgba(r,g,b,a)'. */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export type Tone = 'neutral' | 'success' | 'warning' | 'accent';

export const toneColors = (p: Palette): Record<Tone, string> => ({
  neutral: p.slate,
  success: p.success,
  warning: p.warning,
  accent: p.cyan,
});

/** Tone colours of the default palette. Prefer useToneColor() inside components. */
export const toneColor = toneColors(colors);

// Font families are registered in fonts.ts from files in public/fonts.
// Display: Space Grotesk Bold is the target face; Inter Display Bold is the
// installed equivalent used until Space Grotesk files are added locally.
// 'DEEN Serif' (Amiri) is in every stack so ﷺ and any Arabic word render.
export const fonts = {
  display: "'DEEN Display', 'Inter Display', 'DEEN Serif', sans-serif",
  body: "'DEEN Body', 'Inter', 'DEEN Serif', sans-serif",
  mono: "'DEEN Mono', 'DejaVu Sans Mono', 'DEEN Serif', monospace",
  serif: "'DEEN Serif', 'Amiri', serif",
  quran: "'DEEN Quran', 'KFGQPC HAFS Uthmanic Script', 'DEEN Serif', serif",
  arabic: "'DEEN Serif', 'Amiri', serif",
} as const;

export const type = {
  hook: 112,
  headline: 76,
  body: 46,
  card: 40,
  label: 28,
  metric: 120,
} as const;

// Reel canvas and Instagram-safe zone (conservative).
// Top ~230px: Reels header/camera. Bottom ~420px: caption, audio, CTA chrome.
// Right ~150px: like/comment/share rail.
export const canvas = {
  width: 1080,
  height: 1920,
  fps: 30,
};

export const safe = {
  top: 250,
  bottom: 420,
  left: 96,
  right: 150,
};

export const safeBox = {
  x: safe.left,
  y: safe.top,
  width: canvas.width - safe.left - safe.right,
  height: canvas.height - safe.top - safe.bottom,
};

// Feed grid crop for covers (profile grid shows a centred 3:4 / 4:5 region).
export const coverSafe = {
  width: 1080,
  height: 1350,
  y: (1920 - 1350) / 2,
};

export const radius = {card: 22, pill: 999};

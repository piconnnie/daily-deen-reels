// Content configuration schema. Every reel is a JSON file in src/content/reels
// that conforms to ReelConfig. Rendering logic never hardcodes copy.

import type {Tone} from '../brand/tokens';

export type SfxKind = 'whoosh' | 'tick' | 'chime' | 'low' | 'impact';

export interface SfxCue {
  /** Frame relative to the start of the scene. */
  at: number;
  kind: SfxKind;
}

export interface Storyboard {
  visual: string;
  animation: string;
}

export interface HeadlineLine {
  text: string;
  highlight?: boolean;
}

interface SceneBase {
  id: string;
  durationInFrames: number;
  /** What this scene does for the viewer (information or emotional purpose). */
  purpose: string;
  /** On-screen copy summary used in the storyboard and subtitles file. */
  onScreen: string;
  /** Narration for this scene, if voiceover is enabled. */
  voiceover?: string;
  storyboard: Storyboard;
  transitionIn?: 'fade-up' | 'cut';
  sfx?: SfxCue[];
}

export interface HookScene extends SceneBase {
  type: 'hook';
  kicker?: string;
  lines: HeadlineLine[];
  sub?: string;
}

export interface CardItem {
  text: string;
  status: 'pass' | 'warn' | 'unknown';
  tag?: string;
  /** If set, the card flips to this content at swapStart + index * swapStagger. */
  swap?: {text: string; tag: string; status: 'pass' | 'warn' | 'unknown'};
}

export interface CardsScene extends SceneBase {
  type: 'cards';
  kicker: string;
  headline: HeadlineLine[];
  cards: CardItem[];
  enter: 'pop' | 'static';
  popStart?: number;
  popStagger?: number;
  swapStart?: number;
  swapStagger?: number;
  metric?: {
    label: string;
    value: string;
    tone: Tone;
    appearAt: number;
    swapTo?: {label: string; value: string; tone: Tone; at: number};
  };
}

export interface TableScene extends SceneBase {
  type: 'table';
  kicker: string;
  headline: HeadlineLine[];
  columns: [string, string, string];
  rows: {input: string; expected: string; passIf: string}[];
  rowStart: number;
  rowStagger: number;
  notes: string[];
  notesStart: number;
  notesStagger: number;
}

export interface ComparisonScene extends SceneBase {
  type: 'comparison';
  kicker: string;
  illustrativeLabel?: string;
  left: {label: string; value: string; ratio: number; tone: Tone; caption: string};
  right: {label: string; value: string; ratio: number; tone: Tone; caption: string};
  rightAt: number;
  conclusion: HeadlineLine[];
  conclusionAt: number;
}

export interface ChecklistScene extends SceneBase {
  type: 'checklist';
  kicker: string;
  headline: HeadlineLine[];
  items: string[];
  itemStart: number;
  itemStagger: number;
  rule?: string;
}

export interface DiagramScene extends SceneBase {
  type: 'diagram';
  kicker: string;
  headline: HeadlineLine[];
  nodes: {label: string; detail?: string; tone?: Tone}[];
  nodeStart: number;
  nodeStagger: number;
  callout?: {nodeIndex: number; text: string; at: number};
}

export interface TerminalScene extends SceneBase {
  type: 'terminal';
  kicker: string;
  headline: HeadlineLine[];
  title: string;
  lines: {text: string; tone?: Tone; at: number}[];
  charsPerFrame: number;
}

export interface TakeawayScene extends SceneBase {
  type: 'takeaway';
  lines: HeadlineLine[];
  cta: string;
  ctaAt: number;
  endCardAt: number;
}

/** Text pulled from a pinned dataset by scripts/sources (never hand-typed). */
export interface ResolvedSource {
  ref: string;
  collection: string;
  collectionName: string;
  kind: 'quran' | 'hadith';
  citation: string;
  url: string;
  arabic: string;
  english: string;
  translation: string;
  grade: string | null;
  narrator?: string | null;
}

/**
 * A verse or hadith. The writer gives only `ref` (and optionally a verbatim
 * `excerpt` / `arabicExcerpt`); the pipeline fills `resolved` from the
 * datasets in sources/sources.json and QA rejects any mismatch.
 */
export interface SourceScene extends SceneBase {
  type: 'source';
  kicker: string;
  /** quran:94:5-6 · bukhari:6114 · muslim:2564c */
  ref: string;
  /** Verbatim part of the English text to show instead of the whole text. */
  excerpt?: string;
  /** Verbatim part of the Arabic text (hadith Arabic is only shown via this). */
  arabicExcerpt?: string;
  /** Default: true for the Qur'an, false for hadith. */
  showArabic?: boolean;
  /** Frames at which the Arabic, the English and the citation appear. */
  arabicAt?: number;
  englishAt?: number;
  citationAt?: number;
  resolved?: ResolvedSource;
}

export type Scene =
  | SourceScene
  | HookScene
  | CardsScene
  | TableScene
  | ComparisonScene
  | ChecklistScene
  | DiagramScene
  | TerminalScene
  | TakeawayScene;

export type Pillar =
  | "A: Qur'an Reflections"
  | 'B: Prophetic Guidance'
  | 'C: Character and Manners'
  | 'D: Worship and Daily Habits'
  | 'E: Family and Community'
  | 'F: Hope, Patience and Trust';

export type FormatId = 'ayah-reflection' | 'hadith-practice' | 'dua' | 'habit-checklist' | 'heart-check';

export interface HookOption {
  text: string;
  angle: string;
  scores: {specificity: number; relevance: number; curiosity: number; credibility: number; comprehension: number};
  notes: string;
}

export interface ReelConfig {
  id: string;
  version: number;
  status: 'draft' | 'rendered' | 'qa-passed' | 'approved' | 'published';
  brief: {
    topic: string;
    audience: string;
    pillar: Pillar;
    objective: 'reach' | 'saves' | 'shares' | 'follows' | 'authority';
    format: FormatId;
    targetDurationSec: number;
    technicalDepth: 'beginner' | 'intermediate' | 'advanced';
    voiceover: boolean;
    research: 'required' | 'not-required';
    constraints: string[];
  };
  coreInsight: string;
  hooks: HookOption[];
  selectedHook: number;
  selectionRationale: string;
  fps: number;
  width: number;
  height: number;
  scenes: Scene[];
  cover: {kicker: string; headline: HeadlineLine[]};
  caption: {opening: string; body: string[]; cta: string; hashtags: string[]};
  primaryCta: {type: 'save' | 'share' | 'follow' | 'question'; text: string};
  /** Look and sound of this reel; omitted fields rotate by reel number (src/brand/theme.tsx). */
  style?: {theme?: import('../brand/tokens').ThemeId; music?: import('../brand/theme').MusicId; motion?: import('../brand/theme').MotionId};
  audio: {bed: string | null; bedVolume: number; voiceover: string | null; voiceoverVolume: number};
  /**
   * Every statement the reel makes. 'source' = what a verse/hadith says (must name
   * a ref quoted in a source scene); 'reflection' = our own words, never
   * attributed to Allah or the Prophet ﷺ.
   */
  claims: {text: string; kind: 'source' | 'reflection'; ref?: string}[];
  /** Filled by the pipeline from the source scenes (citation + link for the caption). */
  sources?: {ref: string; citation: string; url: string; translation: string; grade: string | null; english: string}[];
  publish: {suggestedDate: string; notes: string};
  repurposing: {carousel: string[]; followUpReel: string; linkedin: string};
}

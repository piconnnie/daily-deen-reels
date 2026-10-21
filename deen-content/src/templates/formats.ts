import type {FormatId, Scene} from '../content/schema';
import formats from './formats.json';

// The ten rotating reel formats, expressed as default scene sequences.
// Source of truth is formats.json (also read by scripts/generate-content.mjs).
// Formats are a starting point, not a cage: choose what explains the idea.

export interface FormatTemplate {
  id: FormatId;
  name: string;
  arc: string;
  scenes: {type: Scene['type']; purpose: string; seconds: number}[];
}

export const FORMATS = formats as FormatTemplate[];

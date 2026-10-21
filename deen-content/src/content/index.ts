import {GENERATED_REELS} from './reels.generated';
import type {ReelConfig} from './schema';

// Every JSON file in ./reels is registered automatically
// (scripts/sync-registry.mjs regenerates reels.generated.ts).
export const REELS: ReelConfig[] = GENERATED_REELS;

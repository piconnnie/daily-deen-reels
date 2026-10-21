import React, {createContext, useContext} from 'react';
import type {Kind} from '../content/schema';

// Where content may go, per output kind. Scenes lay out inside `content`; the
// brand row sits at `brandTop`. Kept in sync with the layout checker boxes in
// scripts/local-render/render.mjs (CANVAS there).
export interface CanvasSpec {
  kind: Kind;
  width: number;
  height: number;
  brandTop: number;
  brandLeft: number;
  brandRight: number;
  content: {left: number; top: number; width: number; height: number};
}

export const CANVASES: Record<Kind, CanvasSpec> = {
  // Reels: clear of the Reels header (top), action rail (right) and caption chrome (bottom).
  reel: {kind: 'reel', width: 1080, height: 1920, brandTop: 250, brandLeft: 96, brandRight: 930, content: {left: 96, top: 370, width: 834, height: 1130}},
  // Carousel slides (4:5 feed): nothing overlays them, so the margins are even.
  carousel: {kind: 'carousel', width: 1080, height: 1350, brandTop: 70, brandLeft: 90, brandRight: 990, content: {left: 90, top: 170, width: 900, height: 1080}},
  // Stories: profile row on top, reply bar at the bottom; no right rail.
  story: {kind: 'story', width: 1080, height: 1920, brandTop: 250, brandLeft: 96, brandRight: 984, content: {left: 96, top: 370, width: 888, height: 1070}},
};

const Ctx = createContext<CanvasSpec>(CANVASES.reel);
export const CanvasProvider: React.FC<{kind: Kind; children: React.ReactNode}> = ({kind, children}) => <Ctx.Provider value={CANVASES[kind]}>{children}</Ctx.Provider>;
export const useCanvas = () => useContext(Ctx);

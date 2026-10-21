import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {CanvasProvider, CANVASES, useCanvas} from '../brand/canvas';
import {loadBrandFonts} from '../brand/fonts';
import {pickStyle, ThemeProvider, useColors} from '../brand/theme';
import {alpha, fonts} from '../brand/tokens';
import {BrandBackground} from '../components/BrandBackground';
import {BrandSignature} from '../components/BrandSignature';
import type {ReelConfig} from '../content/schema';
import {renderScene} from './ReelTemplate';

loadBrandFonts();

// One still image: a carousel slide (1080×1350) or a story (1080×1920).
// The scene is shown at its last frame, i.e. with every reveal finished
// (a Sequence starting at a negative offset does that in Remotion and the shim).
export const StillTemplate: React.FC<{config: ReelConfig; index: number}> = ({config, index}) => {
  const kind = config.kind === 'story' ? 'story' : 'carousel';
  return (
    <ThemeProvider style={pickStyle(config.id, config.style)}>
      <CanvasProvider kind={kind}>
        <StillBody config={config} index={index} />
      </CanvasProvider>
    </ThemeProvider>
  );
};

const StillBody: React.FC<{config: ReelConfig; index: number}> = ({config, index}) => {
  const scene = config.scenes[index];
  const c = useColors();
  const canvas = useCanvas();
  const total = config.scenes.length;
  const d = Math.max(1, scene?.durationInFrames ?? 1);
  return (
    <AbsoluteFill style={{backgroundColor: c.navy, width: canvas.width, height: canvas.height}}>
      <BrandBackground />
      {scene ? (
        <Sequence from={-(d - 1)} durationInFrames={d} name={`slide-${index + 1}`}>
          {renderScene(scene, config)}
        </Sequence>
      ) : null}
      <BrandSignature />
      {canvas.kind === 'carousel' ? (
        <>
          <div style={{position: 'absolute', top: canvas.brandTop - 2, right: canvas.width - canvas.brandRight, fontFamily: fonts.mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: c.slate}}>
            {index + 1}/{total}
          </div>
          {index === 0 && total > 1 ? (
            <div style={{position: 'absolute', bottom: 34, right: canvas.width - canvas.brandRight, fontFamily: fonts.body, fontWeight: 600, fontSize: 28, color: c.indigo, display: 'flex', alignItems: 'center', gap: 10}}>
              Swipe
              <svg width="30" height="20" viewBox="0 0 30 20">
                <path d="M2 10 H26 M18 3 L26 10 L18 17" fill="none" stroke={c.indigo} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : null}
        </>
      ) : null}
      {canvas.kind === 'story' && config.replyPrompt ? (
        <div
          style={{
            position: 'absolute',
            left: canvas.content.left,
            width: canvas.content.width,
            top: canvas.content.top + canvas.content.height + 40,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 34, color: c.offWhite, background: alpha(c.indigo, 0.18), border: `2px solid ${c.indigo}`, borderRadius: 999, padding: '16px 34px', textAlign: 'center'}}>
            {config.replyPrompt}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const stillSize = (config: ReelConfig) => (config.kind === 'story' ? CANVASES.story : CANVASES.carousel);

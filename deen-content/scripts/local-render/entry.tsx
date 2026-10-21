// Browser entry for the local renderer. Exposes window.__setFrame so the
// Node driver can step through frames deterministically.
import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {ConfigContext, FrameContext} from 'remotion';
import {Cover} from '../../src/compositions/Cover';
import {REELS} from '../../src/content';
import type {ReelConfig} from '../../src/content/schema';
import {ReelTemplate, sceneStarts} from '../../src/templates/ReelTemplate';
import {GalleryStill} from './gallery';

const params = new URLSearchParams(window.location.search);
const reelId = params.get('reel');
const mode = params.get('mode') ?? 'reel';
const config = REELS.find((r) => r.id === reelId) as ReelConfig;
if (!config && mode !== 'gallery') throw new Error(`Unknown reel ${reelId}`);

const durationInFrames = config ? sceneStarts(config.scenes).total : 1;
const container = document.getElementById('root')!;
const root = createRoot(container);

const render = (frame: number) => {
  const videoConfig = {
    width: 1080,
    height: 1920,
    fps: config?.fps ?? 30,
    durationInFrames: mode === 'reel' ? durationInFrames : 1,
    id: mode,
  };
  flushSync(() => {
    root.render(
      <ConfigContext.Provider value={videoConfig}>
        <FrameContext.Provider value={frame}>
          {mode === 'reel' ? (
            <ReelTemplate config={config} />
          ) : mode === 'cover' ? (
            <Cover config={config} />
          ) : (
            <GalleryStill which={params.get('scene') ?? 'checklist'} />
          )}
        </FrameContext.Provider>
      </ConfigContext.Provider>,
    );
  });
};

const w = window as unknown as {__setFrame: (f: number) => void; __duration: number; __ready: boolean};
w.__setFrame = render;
w.__duration = mode === 'reel' ? durationInFrames : 1;
render(0);
w.__ready = true;

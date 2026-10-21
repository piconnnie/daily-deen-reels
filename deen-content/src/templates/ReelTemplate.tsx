import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {loadBrandFonts} from '../brand/fonts';
import {SoundDesignTrack, SubtitleTrack, VoiceoverTrack, type SubtitleCue} from '../components/AudioTracks';
import {BrandBackground} from '../components/BrandBackground';
import {RecitationLabel} from '../components/RecitationLabel';
import {pickStyle, ThemeProvider, useColors, useReelStyle} from '../brand/theme';
import {BrandSignature} from '../components/BrandSignature';
import {easeOut} from '../components/motion';
import {ProgressIndicator} from '../components/ProgressIndicator';
import type {ReelConfig, Scene} from '../content/schema';
import {CardsScene} from '../scenes/CardsScene';
import {ChecklistScene} from '../scenes/ChecklistScene';
import {ComparisonScene} from '../scenes/ComparisonScene';
import {DiagramScene} from '../scenes/DiagramScene';
import {HookScene} from '../scenes/HookScene';
import {TableScene} from '../scenes/TableScene';
import {TakeawayScene} from '../scenes/TakeawayScene';
import {TerminalScene} from '../scenes/TerminalScene';
import {SourceScene} from '../scenes/SourceScene';

loadBrandFonts();

const ENTER = 10;
const EXIT = 7;

export const sceneStarts = (scenes: Scene[]) => {
  const starts: number[] = [];
  let t = 0;
  for (const s of scenes) {
    starts.push(t);
    t += s.durationInFrames;
  }
  return {starts, total: t};
};

const renderScene = (scene: Scene, config: ReelConfig) => {
  switch (scene.type) {
    case 'source': {
      const r = config.recitation;
      const recitedBy = r && r !== false && !r.off && r.mode === 'scene' && r.sceneId === scene.id ? r.reciterName ?? null : null;
      return <SourceScene scene={scene} recitedBy={recitedBy} />;
    }
    case 'hook':
      return <HookScene scene={scene} />;
    case 'cards':
      return <CardsScene scene={scene} />;
    case 'table':
      return <TableScene scene={scene} />;
    case 'comparison':
      return <ComparisonScene scene={scene} />;
    case 'checklist':
      return <ChecklistScene scene={scene} />;
    case 'diagram':
      return <DiagramScene scene={scene} />;
    case 'terminal':
      return <TerminalScene scene={scene} />;
    case 'takeaway':
      return <TakeawayScene scene={scene} ctaType={config.primaryCta.type} />;
  }
};

// Scene transitions vary per reel (style.motion): "rise" (rise-and-fade),
// "slide" (swipe in from the right, out to the left) or "zoom" (scale punch).
// "cut" scenes enter instantly (used for visual continuity).
const SceneFrame: React.FC<{
  scene: Scene;
  next?: Scene;
  isFirst: boolean;
  isLast: boolean;
  children: React.ReactNode;
}> = ({scene, next, isFirst, isLast, children}) => {
  const frame = useCurrentFrame();
  const d = scene.durationInFrames;
  const cutIn = isFirst || scene.transitionIn === 'cut';
  const cutOut = isLast || next?.transitionIn === 'cut';
  const inP = cutIn ? 1 : interpolate(frame, [0, ENTER], [0, 1], {easing: easeOut, extrapolateRight: 'clamp'});
  const outP = cutOut ? 1 : interpolate(frame, [d - EXIT, d], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const {motion} = useReelStyle();
  // Calm transitions: a plain fade, a short rise, or a short slide.
  const transform =
    motion === 'slide'
      ? `translateX(${(1 - inP) * 40 - (1 - outP) * 30}px)`
      : motion === 'rise'
        ? `translateY(${(1 - inP) * 18}px)`
        : 'none';
  return (
    <AbsoluteFill style={{opacity: Math.min(inP, outP), transform}}>
      {children}
    </AbsoluteFill>
  );
};

export const buildSubtitleCues = (config: ReelConfig): SubtitleCue[] => {
  if (!config.brief.voiceover || !config.audio.voiceover) return [];
  const {starts} = sceneStarts(config.scenes);
  return config.scenes
    .map((s, i) => ({from: starts[i] + 4, to: starts[i] + s.durationInFrames - 2, text: s.voiceover ?? ''}))
    .filter((c) => c.text.length > 0);
};

export const ReelTemplate: React.FC<{config: ReelConfig}> = ({config}) => (
  <ThemeProvider style={pickStyle(config.id, config.style)}>
    <ReelBody config={config} />
  </ThemeProvider>
);

const ReelBody: React.FC<{config: ReelConfig}> = ({config}) => {
  const {starts} = sceneStarts(config.scenes);
  const durations = config.scenes.map((s) => s.durationInFrames);
  const colors = useColors();
  return (
    <AbsoluteFill style={{backgroundColor: colors.navy}}>
      <BrandBackground />
      {config.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={starts[i]} durationInFrames={scene.durationInFrames} name={`${i + 1}-${scene.id}`}>
          <SceneFrame scene={scene} next={config.scenes[i + 1]} isFirst={i === 0} isLast={i === config.scenes.length - 1}>
            {renderScene(scene, config)}
          </SceneFrame>
        </Sequence>
      ))}
      <BrandSignature />
      <ProgressIndicator sceneDurations={durations} />
      <SubtitleTrack cues={buildSubtitleCues(config)} />
      <RecitationLabel config={config} />
      <SoundDesignTrack src={config.audio.bed} volume={config.audio.bedVolume} />
      <VoiceoverTrack src={config.audio.voiceover} volume={config.audio.voiceoverVolume} />
    </AbsoluteFill>
  );
};

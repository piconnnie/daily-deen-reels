import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {loadBrandFonts} from '../brand/fonts';
import {SoundDesignTrack, SubtitleTrack, VoiceoverTrack, type SubtitleCue} from '../components/AudioTracks';
import {BrandBackground, SceneSweep} from '../components/BrandBackground';
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

const ENTER = 7;
const EXIT = 5;

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
    case 'source':
      return <SourceScene scene={scene} />;
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
  const transform =
    motion === 'slide'
      ? `translateX(${(1 - inP) * 90 - (1 - outP) * 70}px)`
      : motion === 'zoom'
        ? `scale(${(0.9 + 0.1 * inP) * (1 + 0.05 * (1 - outP))})`
        : `translateY(${(1 - inP) * 28}px)`;
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
      <SceneSweep starts={starts} />
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
      <SoundDesignTrack src={config.audio.bed} volume={config.audio.bedVolume} />
      <VoiceoverTrack src={config.audio.voiceover} volume={config.audio.voiceoverVolume} />
    </AbsoluteFill>
  );
};

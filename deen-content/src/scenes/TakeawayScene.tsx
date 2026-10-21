import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {alpha, fonts, radius, type} from '../brand/tokens';
import {useColors, useReelStyle} from '../brand/theme';
import {EndCard} from '../components/EndCard';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {TakeawayScene as TakeawaySceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Resolves the hook with one memorable line, one CTA, then a brief end card.
export const TakeawayScene: React.FC<{scene: TakeawaySceneConfig; ctaType?: 'save' | 'share' | 'follow' | 'question'}> = ({scene, ctaType = 'save'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colors = useColors();
  const cta = enter(frame, fps, scene.ctaAt);
  const centered = useReelStyle().layout === 'minimal';
  return (
    <SceneShell justify="space-between">
      <div style={{marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: centered ? 'center' : 'flex-start', textAlign: centered ? 'center' : 'left'}}>
        <Kicker text="TODAY'S REMINDER" />
        <KineticHeadline lines={scene.lines} size={type.hook - 8} start={2} stagger={6} align={centered ? 'center' : 'left'} />
        <div
          style={{
            ...riseStyle(cta, 24),
            marginTop: 64,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18,
            border: `2px solid ${colors.indigo}`,
            background: alpha(colors.indigo, 0.14),
            borderRadius: radius.pill,
            padding: '18px 32px',
          }}
        >
          {ctaType === 'save' ? <BookmarkIcon /> : <ArrowIcon />}
          <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 38, color: colors.offWhite}}>{scene.cta}</span>
        </div>
      </div>
      <div style={{marginBottom: 20, display: 'flex', justifyContent: centered ? 'center' : 'flex-start'}}>
        <EndCard start={scene.endCardAt} />
      </div>
    </SceneShell>
  );
};

const BookmarkIcon = () => {
  const colors = useColors();
  return (
    <svg width="34" height="40" viewBox="0 0 34 40">
      <path d="M4 3 H30 V37 L17 28 L4 37 Z" fill="none" stroke={colors.cyan} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
};

const ArrowIcon = () => {
  const colors = useColors();
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <path d="M6 18 H28 M19 9 L28 18 L19 27" fill="none" stroke={colors.cyan} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

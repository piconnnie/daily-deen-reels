import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, type} from '../brand/tokens';
import {useColors, useReelStyle} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {ReflectionScene as ReflectionSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Our own reflection — clearly labelled, never attributed. A headline and one
// to three short paragraphs.
export const ReflectionScene: React.FC<{scene: ReflectionSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = useColors();
  const centered = useReelStyle().layout === 'minimal';
  const start = scene.bodyStart ?? 18;
  const stagger = scene.bodyStagger ?? 22;
  return (
    <SceneShell justify="center" gap={36}>
      <div style={{...riseStyle(enter(frame, fps, 0), 16), textAlign: centered ? 'center' : 'left', display: 'flex', flexDirection: 'column', alignItems: centered ? 'center' : 'flex-start'}}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 4} start={2} align={centered ? 'center' : 'left'} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 26}}>
        {scene.body.map((p, i) => (
          <p
            key={i}
            style={{
              ...riseStyle(enter(frame, fps, start + i * stagger), 16),
              margin: 0,
              fontFamily: fonts.body,
              fontWeight: 400,
              fontSize: 42,
              lineHeight: 1.42,
              color: c.offWhite,
              textAlign: centered ? 'center' : 'left',
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            {p}
          </p>
        ))}
      </div>
    </SceneShell>
  );
};

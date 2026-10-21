import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, type} from '../brand/tokens';
import {useColors, useReelStyle} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {HookScene as HookSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Opening hook. Headline is fully visible on frame 0 so a paused or briefly
// seen first frame still communicates the subject; motion is the underline
// sweep and the supporting line.
export const HookScene: React.FC<{scene: HookSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const colors = useColors();
  const {fps} = useVideoConfig();
  const sub = enter(frame, fps, 18);
  const centered = useReelStyle().layout === 'minimal';
  return (
    <SceneShell justify="center">
      <div style={{textAlign: centered ? 'center' : 'left', display: 'flex', flexDirection: 'column', alignItems: centered ? 'center' : 'flex-start'}}>
      {scene.kicker ? <Kicker text={scene.kicker} /> : null}
      <KineticHeadline lines={scene.lines} size={type.hook} instant lineHeight={1.04} align={centered ? 'center' : 'left'} />
      {scene.sub ? (
        <div style={{...riseStyle(sub), marginTop: 44, fontFamily: fonts.body, fontSize: type.body, color: colors.slate, lineHeight: 1.3}}>
          {scene.sub}
        </div>
      ) : null}
      </div>
    </SceneShell>
  );
};

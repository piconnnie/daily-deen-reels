import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, radius, type} from '../brand/tokens';
import {useColors, useToneColor} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, progress, riseStyle} from '../components/motion';
import type {DiagramScene as DiagramSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Vertical pipeline diagram (e.g. a RAG flow). Nodes appear in order, a pulse
// travels the connectors to show data/control flow, and an optional callout
// marks the key limitation. Vertical layout keeps labels large on a phone.
export const DiagramScene: React.FC<{scene: DiagramSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colors = useColors();
  const toneColor = useToneColor();
  const n = scene.nodes.length;
  const flowStart = scene.nodeStart + n * scene.nodeStagger;
  const flowLen = 36;
  const pulse = ((frame - flowStart) % flowLen + flowLen) % flowLen / flowLen;
  const flowOn = frame >= flowStart;
  const callout = scene.callout;
  const c = callout ? enter(frame, fps, callout.at) : 0;

  return (
    <SceneShell>
      <div style={riseStyle(enter(frame, fps, 0), 24)}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 8} start={2} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'stretch', marginTop: 40}}>
        {scene.nodes.map((node, i) => {
          const p = enter(frame, fps, scene.nodeStart + i * scene.nodeStagger);
          const tone = toneColor[node.tone ?? 'accent'];
          const isCallout = callout && callout.nodeIndex === i;
          const link = progress(frame, scene.nodeStart + (i + 1) * scene.nodeStagger - 4, 8);
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  ...riseStyle(p, 20),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 28px',
                  background: colors.navyRaised,
                  border: `2px solid ${isCallout && c > 0.5 ? colors.warning : colors.navyLine}`,
                  borderRadius: radius.card,
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
                  <div style={{width: 16, height: 16, borderRadius: 8, background: tone}} />
                  <span style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 44, color: colors.offWhite}}>{node.label}</span>
                </div>
                {node.detail ? (
                  <span style={{fontFamily: fonts.mono, fontSize: 24, color: colors.slate}}>{node.detail}</span>
                ) : null}
              </div>
              {i < n - 1 ? (
                <div style={{height: 48, position: 'relative', marginLeft: 35}}>
                  <div style={{position: 'absolute', left: 0, top: 0, width: 4, height: `${link * 100}%`, background: colors.navyLine}} />
                  {flowOn ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: -4,
                        top: interpolate(pulse, [0, 1], [0, 36]),
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        background: colors.cyan,
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      {callout ? (
        <div
          style={{
            ...riseStyle(c, 20),
            marginTop: 36,
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 38,
            lineHeight: 1.25,
            color: colors.warning,
            textWrap: 'balance',
          } as React.CSSProperties}
        >
          {callout.text}
        </div>
      ) : null}
    </SceneShell>
  );
};

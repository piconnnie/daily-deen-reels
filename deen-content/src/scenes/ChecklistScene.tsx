import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, radius, type} from '../brand/tokens';
import {useColors} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, pop, riseStyle} from '../components/motion';
import type {ChecklistScene as ChecklistSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Numbered decision checklist with an optional decision rule. Built for the
// "Decision Checklist" and "Framework" formats; designed to be screenshot-worthy.
export const ChecklistScene: React.FC<{scene: ChecklistSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const colors = useColors();
  const {fps} = useVideoConfig();
  const ruleAt = scene.itemStart + scene.items.length * scene.itemStagger + 6;
  const rule = enter(frame, fps, ruleAt);
  return (
    <SceneShell>
      <div style={riseStyle(enter(frame, fps, 0), 24)}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 4} start={2} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18, marginTop: 44}}>
        {scene.items.map((item, i) => {
          const d = scene.itemStart + i * scene.itemStagger;
          const p = enter(frame, fps, d);
          const n = pop(frame, fps, d + 2);
          return (
            <div key={i} style={{...riseStyle(p, 24), display: 'flex', alignItems: 'center', gap: 24}}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: colors.indigo,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: fonts.mono,
                  fontWeight: 700,
                  fontSize: 30,
                  color: colors.offWhite,
                  transform: `scale(${interpolate(n, [0, 1], [0.6, 1])})`,
                  flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 42, lineHeight: 1.2, color: colors.offWhite, textWrap: 'balance'} as React.CSSProperties}>{item}</span>
            </div>
          );
        })}
      </div>
      {scene.rule ? (
        <div
          style={{
            ...riseStyle(rule, 24),
            marginTop: 44,
            padding: '24px 30px',
            borderRadius: radius.card,
            border: `2px solid ${colors.cyan}`,
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 38,
            lineHeight: 1.25,
            color: colors.cyan,
            textWrap: 'balance',
          } as React.CSSProperties}
        >
          {scene.rule}
        </div>
      ) : null}
    </SceneShell>
  );
};

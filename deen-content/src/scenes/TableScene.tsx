import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, radius, type} from '../brand/tokens';
import {useColors} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {TableScene as TableSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// A table rendered as stacked "test case" rows, which stays readable on a
// phone where a 3-column grid would not. Column names appear as a legend.
export const TableScene: React.FC<{scene: TableSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colors = useColors();
  const legend = enter(frame, fps, scene.rowStart - 6);
  return (
    <SceneShell>
      <div style={riseStyle(enter(frame, fps, 0), 24)}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 4} start={2} />
      </div>
      <div
        style={{
          ...riseStyle(legend, 16),
          display: 'flex',
          gap: 18,
          marginTop: 38,
          fontFamily: fonts.mono,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        <span style={{color: colors.offWhite}}>{scene.columns[0]}</span>
        <span style={{color: colors.slate}}>→</span>
        <span style={{color: colors.cyan}}>{scene.columns[1]}</span>
        <span style={{color: colors.slate}}>→</span>
        <span style={{color: colors.success}}>{scene.columns[2]}</span>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20}}>
        {scene.rows.map((row, i) => {
          const p = enter(frame, fps, scene.rowStart + i * scene.rowStagger);
          return (
            <div
              key={i}
              style={{
                ...riseStyle(p, 30),
                background: colors.navyRaised,
                border: `2px solid ${colors.navyLine}`,
                borderLeft: `6px solid ${colors.indigo}`,
                borderRadius: radius.card,
                padding: '22px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 38, color: colors.offWhite}}>“{row.input}”</span>
              <div style={{display: 'flex', gap: 14, flexWrap: 'wrap'}}>
                <Chip text={row.expected} color={colors.cyan} />
                <Chip text={row.passIf} color={colors.success} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34}}>
        {scene.notes.map((note, i) => {
          const p = enter(frame, fps, scene.notesStart + i * scene.notesStagger);
          return (
            <div key={i} style={{...riseStyle(p, 20), display: 'flex', alignItems: 'center', gap: 18}}>
              <div style={{width: 14, height: 14, borderRadius: 3, background: colors.cyan, flexShrink: 0}} />
              <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 38, color: colors.offWhite, textWrap: 'balance'} as React.CSSProperties}>{note}</span>
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};

const Chip: React.FC<{text: string; color: string}> = ({text, color}) => (
  <span
    style={{
      fontFamily: fonts.body,
      fontWeight: 600,
      fontSize: 30,
      color,
      border: `2px solid ${color}`,
      borderRadius: radius.pill,
      padding: '6px 20px',
      opacity: 0.95,
    }}
  >
    {text}
  </span>
);

import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, type} from '../brand/tokens';
import {useColors} from '../brand/theme';
import {MetricCard} from '../components/Cards';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, progress, riseStyle} from '../components/motion';
import type {ComparisonScene as ComparisonSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Two stacked metric cards with bars, then a conclusion line.
// Illustrative numbers must carry the illustrative label (enforced by validate).
export const ComparisonScene: React.FC<{scene: ComparisonSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const colors = useColors();
  const {fps} = useVideoConfig();
  const l = enter(frame, fps, 4);
  const r = enter(frame, fps, scene.rightAt);
  const lBar = progress(frame, 10, 20);
  const rBar = progress(frame, scene.rightAt + 6, 22);
  return (
    <SceneShell>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <Kicker text={scene.kicker} />
        {scene.illustrativeLabel ? (
          <span
            style={{
              fontFamily: fonts.mono,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 3,
              color: colors.warning,
              border: `2px solid ${colors.warning}`,
              borderRadius: 8,
              padding: '6px 12px',
              marginBottom: 22,
            }}
          >
            {scene.illustrativeLabel}
          </span>
        ) : null}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 22, marginTop: 10}}>
        <div style={riseStyle(l, 30)}>
          <MetricCard {...scene.left} barProgress={lBar} value={countValue(scene.left.value, lBar)} />
        </div>
        <div style={riseStyle(r, 30)}>
          <MetricCard {...scene.right} barProgress={rBar} value={countValue(scene.right.value, rBar)} />
        </div>
      </div>
      <div style={{marginTop: 56}}>
        <KineticHeadline lines={scene.conclusion} size={type.headline} start={scene.conclusionAt} stagger={6} />
      </div>
    </SceneShell>
  );
};

// Counts up the leading integer of values like "31 / 50" deterministically.
const countValue = (value: string, t: number) => {
  const m = value.match(/^(\d+)(.*)$/);
  if (!m) return value;
  const n = Math.round(interpolate(t, [0, 1], [0, Number(m[1])]));
  return `${n}${m[2]}`;
};

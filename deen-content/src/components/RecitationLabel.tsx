import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {fonts} from '../brand/tokens';
import {CANVASES} from '../brand/canvas';
import {useColors} from '../brand/theme';
import type {ReelConfig} from '../content/schema';

// While a recitation plays that is NOT the ayah on screen (e.g. under a hadith
// reel), name it: which ayah, and who recites. Sits on the brand row, right side.
export const RecitationLabel: React.FC<{config: ReelConfig}> = ({config}) => {
  const frame = useCurrentFrame();
  const c = useColors();
  const r = config.recitation;
  if (!r || r === false || r.off || r.mode !== 'background' || r.startFrame === undefined || !r.totalSec) return null;
  const end = r.startFrame + Math.ceil(r.totalSec * config.fps);
  if (frame < r.startFrame - 6 || frame > end + 12) return null;
  const o = Math.min(
    interpolate(frame, [r.startFrame - 6, r.startFrame + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    interpolate(frame, [end, end + 12], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );
  const reciter = (r.reciterName ?? '').replace(/\s*\(.*\)$/, '');
  return (
    <div
      style={{
        position: 'absolute',
        top: CANVASES.reel.brandTop - 2,
        right: 1080 - CANVASES.reel.brandRight,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: o,
        fontFamily: fonts.body,
        fontWeight: 500,
        fontSize: 22,
        color: c.slate,
      }}
    >
      <Wave color={c.indigo} frame={frame} />
      <span>
        {r.citation} · {reciter}
      </span>
    </div>
  );
};

const Wave: React.FC<{color: string; frame: number}> = ({color, frame}) => (
  <svg width="26" height="22" viewBox="0 0 26 22">
    {[0, 1, 2, 3].map((i) => {
      const h = 6 + 8 * (0.5 + 0.5 * Math.sin(frame / 6 + i * 1.3));
      return <rect key={i} x={2 + i * 6} y={11 - h / 2} width={3} height={h} rx={1.5} fill={color} />;
    })}
  </svg>
);

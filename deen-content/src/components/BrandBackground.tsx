import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {useColors, useReelStyle} from '../brand/theme';
import {alpha} from '../brand/tokens';

// Clean, quiet backgrounds. One of four backdrops per reel (style.backdrop):
//   plain     flat colour
//   gradient  a very soft vertical gradient with one faint light from the top
//   motif     one large, faint eight-pointed star turning slowly in a corner
//   border    a thin inset frame line
// Everything is a pure function of the frame; no beat pulse, no sweeps.
export const BrandBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const c = useColors();
  const {backdrop} = useReelStyle();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1]);

  return (
    <AbsoluteFill style={{backgroundColor: c.navy}}>
      {backdrop === 'gradient' ? (
        <>
          <AbsoluteFill style={{background: `linear-gradient(180deg, ${c.navy} 0%, ${c.navyRaised} 100%)`}} />
          <AbsoluteFill style={{background: `radial-gradient(1100px 700px at 50% ${-4 + drift * 6}%, ${alpha(c.indigo, c.glow)}, ${alpha(c.indigo, 0)} 70%)`}} />
        </>
      ) : null}
      {backdrop === 'motif' ? (
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          <Star cx={width * 0.92} cy={height * 0.86} r={520} rot={frame * 0.03} color={c.indigo} opacity={c.light ? 0.1 : 0.12} />
          <Star cx={width * 0.92} cy={height * 0.86} r={330} rot={-frame * 0.03 + 22.5} color={c.indigo} opacity={c.light ? 0.07 : 0.08} />
        </svg>
      ) : null}
      {backdrop === 'border' ? (
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          <rect x={40} y={40} width={width - 80} height={height - 80} rx={28} fill="none" stroke={alpha(c.indigo, 0.45)} strokeWidth={2} />
          <rect x={52} y={52} width={width - 104} height={height - 104} rx={22} fill="none" stroke={alpha(c.indigo, 0.18)} strokeWidth={1.5} />
          <Star cx={width / 2} cy={40} r={14} rot={0} color={c.indigo} opacity={0.9} fill={c.navy} />
        </svg>
      ) : null}
      {!c.light ? <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(c.navy, 0)} 70%, ${alpha(c.navy, 0.6)} 100%)`}} /> : null}
    </AbsoluteFill>
  );
};

/** Eight-pointed star (two overlapping squares). */
export const Star: React.FC<{cx: number; cy: number; r: number; rot: number; color: string; opacity: number; fill?: string}> = ({cx, cy, r, rot, color, opacity, fill}) => {
  const sq = (a0: number) =>
    [0, 1, 2, 3]
      .map((k) => {
        const t = ((a0 + rot + k * 90) * Math.PI) / 180;
        return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`;
      })
      .join(' ');
  return (
    <g stroke={color} strokeOpacity={opacity} strokeWidth={2} fill={fill ?? 'none'} strokeLinejoin="round">
      <polygon points={sq(0)} />
      <polygon points={sq(45)} />
      {fill ? <polygon points={sq(0)} fill="none" /> : null}
    </g>
  );
};

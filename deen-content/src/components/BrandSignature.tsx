import React from 'react';
import {fonts, safe} from '../brand/tokens';
import {useColors} from '../brand/theme';

// Daily Deen monogram: an eight-pointed star (khatam) framing a "D".
// Proposed mark, not a registered trademark.
const starPoints = (cx: number, cy: number, r: number, a0: number) =>
  [0, 1, 2, 3].map((k) => {
    const t = ((a0 + k * 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`;
  }).join(' ');

export const Monogram: React.FC<{size?: number}> = ({size = 56}) => {
  const colors = useColors();
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <polygon points={starPoints(60, 60, 54, 0)} fill={colors.navy} stroke={colors.indigo} strokeWidth="5" strokeLinejoin="round" />
      <polygon points={starPoints(60, 60, 54, 45)} fill={colors.navy} stroke={colors.indigo} strokeWidth="5" strokeLinejoin="round" />
      <polygon points={starPoints(60, 60, 54, 0)} fill="none" stroke={colors.indigo} strokeWidth="5" strokeLinejoin="round" />
      <text x="60" y="76" textAnchor="middle" fontFamily={fonts.serif} fontWeight={700} fontSize="46" fill={colors.cyan}>
        D
      </text>
    </svg>
  );
};

// Small persistent brand label inside the top of the safe area.
export const BrandSignature: React.FC<{opacity?: number}> = ({opacity = 1}) => {
  const colors = useColors();
  return (
  <div
    style={{
      position: 'absolute',
      top: safe.top,
      left: safe.left,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      opacity,
    }}
  >
    <div style={{width: 10, height: 10, borderRadius: 2, background: colors.cyan}} />
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 24,
        letterSpacing: 4,
        color: colors.slate,
        fontWeight: 700,
      }}
    >
      DAILY DEEN
    </span>
  </div>
  );
};

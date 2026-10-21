import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts} from '../brand/tokens';
import {useColors} from '../brand/theme';
import type {HeadlineLine} from '../content/schema';
import {enter, progress, riseStyle} from './motion';

// Line-by-line headline reveal with an optional highlighted phrase that gets
// a cyan colour and an underline sweep. `instant` keeps the first frame fully
// readable (used for hooks so a paused first frame still communicates).
export const KineticHeadline: React.FC<{
  lines: HeadlineLine[];
  size: number;
  start?: number;
  stagger?: number;
  instant?: boolean;
  align?: 'left' | 'center';
  color?: string;
  lineHeight?: number;
  /** Show the highlight underline fully drawn (for stills such as covers). */
  staticUnderline?: boolean;
}> = ({lines, size, start = 0, stagger = 5, instant = false, align = 'left', color, lineHeight = 1.06, staticUnderline = false}) => {
  const colors = useColors();
  color = color ?? colors.offWhite;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start'}}>
      {lines.map((line, i) => {
        const delay = start + i * stagger;
        const p = instant ? 1 : enter(frame, fps, delay);
        const sweep = staticUnderline ? 1 : progress(frame, delay + (instant ? 6 : 10), 16);
        return (
          <div
            key={i}
            style={{
              ...riseStyle(p, 30),
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: size,
              lineHeight,
              letterSpacing: -size * 0.025,
              color: line.highlight ? colors.cyan : color,
              textAlign: align,
              position: 'relative',
              paddingBottom: line.highlight ? size * 0.12 : 0,
            }}
          >
            {line.text}
            {line.highlight ? (
              <div
                style={{
                  position: 'absolute',
                  left: align === 'center' ? '50%' : 0,
                  bottom: size * 0.02,
                  height: Math.max(6, size * 0.075),
                  width: '100%',
                  background: colors.indigo,
                  borderRadius: 4,
                  transformOrigin: 'left center',
                  transform: `${align === 'center' ? 'translateX(-50%) ' : ''}scaleX(${sweep})`,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export const Kicker: React.FC<{text: string; tone?: string; opacity?: number}> = ({text, tone, opacity = 1}) => {
  const colors = useColors();
  tone = tone ?? colors.cyan;
  return (
  <div
    style={{
      fontFamily: fonts.mono,
      fontWeight: 700,
      fontSize: 28,
      letterSpacing: 5,
      color: tone,
      opacity,
      marginBottom: 22,
    }}
  >
    {text}
  </div>
  );
};

import React from 'react';
import {useCurrentFrame} from 'remotion';
import {safe, safeBox} from '../brand/tokens';
import {useColors} from '../brand/theme';

// Segmented progress bar: one segment per scene, filled as the reel advances.
export const ProgressIndicator: React.FC<{sceneDurations: number[]}> = ({sceneDurations}) => {
  const frame = useCurrentFrame();
  const colors = useColors();
  const gap = 8;
  const total = sceneDurations.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: safe.top + 46,
        left: safeBox.x,
        width: safeBox.width,
        display: 'flex',
        gap,
      }}
    >
      {sceneDurations.map((d, i) => {
        const start = cursor;
        cursor += d;
        const fill = Math.min(1, Math.max(0, (frame - start) / d));
        return (
          <div
            key={i}
            style={{
              flex: d / total,
              height: 5,
              borderRadius: 3,
              background: colors.navyLine,
              overflow: 'hidden',
            }}
          >
            <div style={{width: `${fill * 100}%`, height: '100%', background: colors.indigo}} />
          </div>
        );
      })}
    </div>
  );
};

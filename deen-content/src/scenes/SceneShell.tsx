import React from 'react';
import {canvas, safe, safeBox} from '../brand/tokens';

// Content region below the brand label + progress bar, inside the safe zone.
export const CONTENT_TOP = safe.top + 120;
export const CONTENT_HEIGHT = canvas.height - safe.bottom - CONTENT_TOP;

export const SceneShell: React.FC<{
  children: React.ReactNode;
  justify?: 'flex-start' | 'center' | 'space-between';
  gap?: number;
}> = ({children, justify = 'flex-start', gap = 0}) => (
  <div
    style={{
      position: 'absolute',
      left: safeBox.x,
      top: CONTENT_TOP,
      width: safeBox.width,
      height: CONTENT_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: justify,
      gap,
    }}
  >
    {children}
  </div>
);

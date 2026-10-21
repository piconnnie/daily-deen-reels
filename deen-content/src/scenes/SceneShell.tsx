import React from 'react';
import {useCanvas} from '../brand/canvas';
import {CANVASES} from '../brand/canvas';

// Content region below the brand label + progress bar, inside the safe zone of
// the current canvas (reel, carousel slide or story).
export const CONTENT_TOP = CANVASES.reel.content.top;
export const CONTENT_HEIGHT = CANVASES.reel.content.height;

export const SceneShell: React.FC<{
  children: React.ReactNode;
  justify?: 'flex-start' | 'center' | 'space-between';
  gap?: number;
}> = ({children, justify = 'flex-start', gap = 0}) => {
  const {content} = useCanvas();
  return (
    <div
      style={{
        position: 'absolute',
        left: content.left,
        top: content.top,
        width: content.width,
        height: content.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        gap,
      }}
    >
      {children}
    </div>
  );
};

import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fonts, radius, type} from '../brand/tokens';
import {useColors, useToneColor} from '../brand/theme';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {TerminalScene as TerminalSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// Terminal window with deterministic typing. Large mono type (34px) so a short
// command or eval output stays legible on a phone; keep lines under ~34 chars.
export const TerminalScene: React.FC<{scene: TerminalSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colors = useColors();
  const toneColor = useToneColor();
  const win = enter(frame, fps, 4);
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <SceneShell>
      <div style={riseStyle(enter(frame, fps, 0), 24)}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 8} start={2} />
      </div>
      <div
        style={{
          ...riseStyle(win, 30),
          marginTop: 44,
          background: colors.deep,
          border: `2px solid ${colors.navyLine}`,
          borderRadius: radius.card,
          overflow: 'hidden',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `2px solid ${colors.navyLine}`}}>
          {[colors.navyLine, colors.navyLine, colors.navyLine].map((c, i) => (
            <div key={i} style={{width: 14, height: 14, borderRadius: 7, background: c}} />
          ))}
          <span style={{fontFamily: fonts.mono, fontSize: 22, color: colors.slate, marginLeft: 12}}>{scene.title}</span>
        </div>
        <div style={{padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 420}}>
          {scene.lines.map((line, i) => {
            const chars = Math.max(0, Math.floor((frame - line.at) * scene.charsPerFrame));
            if (frame < line.at) return null;
            const shown = line.text.slice(0, chars);
            const typing = chars < line.text.length;
            return (
              <div
                key={i}
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 34,
                  lineHeight: 1.35,
                  color: line.tone ? toneColor[line.tone] : colors.offWhite,
                  whiteSpace: 'pre',
                }}
              >
                {shown}
                {typing && blink ? <span style={{color: colors.cyan}}>▍</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </SceneShell>
  );
};

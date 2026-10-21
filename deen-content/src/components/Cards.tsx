import React from 'react';
import {alpha, fonts, radius, type Palette, type Tone} from '../brand/tokens';
import {useColors, useToneColor} from '../brand/theme';

export type Status = 'pass' | 'warn' | 'unknown';

const statusTone = (colors: Palette): Record<Status, string> => ({
  pass: colors.success,
  warn: colors.warning,
  unknown: colors.slate,
});

export const StatusIcon: React.FC<{status: Status; size?: number; scale?: number}> = ({status, size = 44, scale = 1}) => {
  const c = statusTone(useColors())[status];
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{transform: `scale(${scale})`, flexShrink: 0}}>
      <circle cx="22" cy="22" r="20" fill="none" stroke={c} strokeWidth="3" />
      {status === 'pass' ? (
        <path d="M13 22.5 L19.5 29 L31 16" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ) : status === 'warn' ? (
        <>
          <line x1="22" y1="12" x2="22" y2="25" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <circle cx="22" cy="31.5" r="2.6" fill={c} />
        </>
      ) : (
        <text x="22" y="30" textAnchor="middle" fontFamily={fonts.display} fontWeight={700} fontSize="22" fill={c}>
          ?
        </text>
      )}
    </svg>
  );
};

// One input/prompt card. Used for demo prompts, real-user inputs, test cases.
export const PromptCard: React.FC<{
  text: string;
  status: Status;
  tag?: string;
  iconScale?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({text, status, tag, iconScale = 1, height = 112, style}) => {
  const colors = useColors();
  return (
  <div
    style={{
      height,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 26,
      padding: '0 30px',
      background: colors.navyRaised,
      border: `2px solid ${status === 'warn' ? alpha(colors.warning, 0.45) : colors.navyLine}`,
      borderRadius: radius.card,
      ...style,
    }}
  >
    <StatusIcon status={status} scale={iconScale} />
    <div style={{display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0}}>
      {tag ? (
        <span style={{fontFamily: fonts.mono, fontSize: 24, fontWeight: 700, letterSpacing: 3, color: statusTone(colors)[status]}}>
          {tag}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: fonts.body,
          fontWeight: 500,
          fontSize: tag ? 36 : 40,
          color: colors.offWhite,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  </div>
  );
};

export const MetricCard: React.FC<{
  label: string;
  value: string;
  tone: Tone;
  caption?: string;
  ratio?: number;
  barProgress?: number;
  width?: number | string;
  style?: React.CSSProperties;
}> = ({label, value, tone, caption, ratio, barProgress = 1, width = '100%', style}) => {
  const colors = useColors();
  const c = useToneColor()[tone];
  return (
    <div
      style={{
        width,
        boxSizing: 'border-box',
        padding: '30px 34px',
        background: colors.navyRaised,
        border: `2px solid ${colors.navyLine}`,
        borderRadius: radius.card,
        ...style,
      }}
    >
      <div style={{fontFamily: fonts.mono, fontSize: 24, fontWeight: 700, letterSpacing: 4, color: colors.slate}}>{label}</div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: 96,
          letterSpacing: -2,
          lineHeight: 1.05,
          color: c,
          marginTop: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {ratio !== undefined ? (
        <div style={{height: 12, borderRadius: 6, background: colors.navyLine, marginTop: 18, overflow: 'hidden'}}>
          <div style={{height: '100%', width: `${ratio * barProgress * 100}%`, background: c, borderRadius: 6}} />
        </div>
      ) : null}
      {caption ? (
        <div style={{fontFamily: fonts.body, fontSize: 32, color: colors.slate, marginTop: 16}}>{caption}</div>
      ) : null}
    </div>
  );
};

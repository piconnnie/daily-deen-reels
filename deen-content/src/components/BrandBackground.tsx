import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {musicBpm, useColors, useReelStyle} from '../brand/theme';
import {alpha} from '../brand/tokens';

// Theme background: base colour, one slow glow that breathes on the music's
// beat, and a faint texture that differs per theme (grid, dots, diagonal
// lines, rings, waves, eight-pointed stars, arches). Everything is a pure function of the frame.
export const BrandBackground: React.FC<{glow?: boolean; beat?: boolean}> = ({glow = true, beat = true}) => {
  const frame = useCurrentFrame();
  const {width, height, durationInFrames, fps} = useVideoConfig();
  const c = useColors();
  const style = useReelStyle();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1]);
  const gx = 78 - drift * 18;
  const gy = 18 + drift * 10;

  // Beat pulse: a quick swell on each beat that decays before the next one.
  const beatFrames = (60 / musicBpm(style.music)) * fps;
  const phase = (frame % beatFrames) / beatFrames;
  const pulse = beat && frame > fps * 1.5 ? Math.exp(-phase * 5) : 0;
  const glowA = c.glow * (1 + 0.45 * pulse);

  const ink = c.offWhite;
  const texA = c.light ? 0.06 : 0.04;

  return (
    <AbsoluteFill style={{backgroundColor: c.navy}}>
      {glow ? (
        <>
          <AbsoluteFill
            style={{
              background: `radial-gradient(${900 + pulse * 60}px ${900 + pulse * 60}px at ${gx}% ${gy}%, ${alpha(c.indigo, glowA)}, ${alpha(c.indigo, 0)} 70%)`,
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(700px 700px at ${18 + drift * 12}% ${86 - drift * 8}%, ${alpha(c.cyan, glowA * 0.45)}, ${alpha(c.cyan, 0)} 70%)`,
            }}
          />
        </>
      ) : null}
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <Texture kind={c.pattern} width={width} height={height} color={ink} opacity={texA} frame={frame} gx={gx} gy={gy} />
      </svg>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(c.navy, 0)} 60%, ${alpha(c.navy, 0.85)} 100%)`}} />
    </AbsoluteFill>
  );
};

const Texture: React.FC<{
  kind: string;
  width: number;
  height: number;
  color: string;
  opacity: number;
  frame: number;
  gx: number;
  gy: number;
}> = ({kind, width, height, color, opacity, frame, gx, gy}) => {
  const common = {stroke: color, strokeOpacity: opacity, strokeWidth: 1, fill: 'none'};
  if (kind === 'dots') {
    const step = 56;
    const dots = [];
    for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) dots.push([x, y]);
    return (
      <>
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.4} fill={color} fillOpacity={opacity * 2.2} />
        ))}
      </>
    );
  }
  if (kind === 'diagonal') {
    const step = 64;
    const shift = (frame * 0.4) % step;
    const lines = [];
    for (let k = -height; k < width + height; k += step) lines.push(k + shift);
    return (
      <>
        {lines.map((k, i) => (
          <line key={i} x1={k} y1={0} x2={k - height} y2={height} {...common} />
        ))}
      </>
    );
  }
  if (kind === 'rings') {
    const cx = (gx / 100) * width;
    const cy = (gy / 100) * height;
    const step = 96;
    const grow = (frame * 0.6) % step;
    return (
      <>
        {Array.from({length: 26}, (_, i) => (
          <circle key={i} cx={cx} cy={cy} r={i * step + grow} {...common} strokeOpacity={opacity * 1.4} />
        ))}
      </>
    );
  }
  if (kind === 'waves') {
    const step = 88;
    const amp = 14;
    const ph = frame * 0.05;
    const rows = [];
    for (let y = step / 2; y < height; y += step) rows.push(y);
    return (
      <>
        {rows.map((y, r) => {
          let d = `M 0 ${y}`;
          for (let x = 0; x <= width; x += 24) d += ` L ${x} ${(y + amp * Math.sin(x / 90 + ph + r * 0.7)).toFixed(1)}`;
          return <path key={r} d={d} {...common} strokeOpacity={opacity * 1.3} />;
        })}
      </>
    );
  }
  if (kind === 'stars') {
    // Eight-pointed stars (khatam) on a lattice: two overlapping squares each.
    const step = 120;
    const r = 30;
    const rot = frame * 0.05;
    const star = (cx: number, cy: number) => {
      const sq = (a: number) =>
        [0, 1, 2, 3].map((k) => {
          const t = ((a + k * 90 + rot) * Math.PI) / 180;
          return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`;
        }).join(' ');
      return [sq(0), sq(45)];
    };
    const out: React.ReactNode[] = [];
    for (let y = step / 2, row = 0; y < height + step; y += step, row++)
      for (let x = (row % 2 ? step / 2 : 0); x < width + step; x += step) {
        const [a, b] = star(x, y);
        out.push(<polygon key={`a${x}-${y}`} points={a} {...common} strokeOpacity={opacity * 1.6} />);
        out.push(<polygon key={`b${x}-${y}`} points={b} {...common} strokeOpacity={opacity * 1.6} />);
      }
    return <>{out}</>;
  }
  if (kind === 'arches') {
    // Rows of pointed arches, drifting up very slowly.
    const w = 108;
    const h = 150;
    const shift = (frame * 0.3) % h;
    const out: React.ReactNode[] = [];
    for (let y = -h; y < height + h; y += h)
      for (let x = 0; x < width + w; x += w) {
        const top = y - shift;
        const d = `M ${x + 10} ${top + h} L ${x + 10} ${top + h * 0.45} Q ${x + 10} ${top + 18} ${x + w / 2} ${top + 6} Q ${x + w - 10} ${top + 18} ${x + w - 10} ${top + h * 0.45} L ${x + w - 10} ${top + h}`;
        out.push(<path key={`${x}-${y}`} d={d} {...common} strokeOpacity={opacity * 1.5} />);
      }
    return <>{out}</>;
  }
  // grid (default)
  const step = 72;
  return (
    <>
      {Array.from({length: Math.ceil(width / step)}, (_, i) => (
        <line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={height} {...common} />
      ))}
      {Array.from({length: Math.ceil(height / step)}, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * step} x2={width} y2={i * step} {...common} />
      ))}
    </>
  );
};

/** A translucent accent band that sweeps across the screen at each scene change. */
export const SceneSweep: React.FC<{starts: number[]}> = ({starts}) => {
  const frame = useCurrentFrame();
  const c = useColors();
  const {width, height} = useVideoConfig();
  const LEN = 14;
  const s = starts.find((st) => st > 0 && frame >= st - 4 && frame < st - 4 + LEN);
  if (s === undefined) return null;
  const p = (frame - (s - 4)) / LEN;
  const x = interpolate(p, [0, 1], [-width * 0.9, width * 1.1]);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          top: -height * 0.25,
          left: x,
          width: width * 0.45,
          height: height * 1.5,
          transform: 'rotate(18deg)',
          background: `linear-gradient(90deg, ${alpha(c.indigo, 0)}, ${alpha(c.indigo, c.light ? 0.14 : 0.22)} 45%, ${alpha(c.cyan, c.light ? 0.12 : 0.18)} 55%, ${alpha(c.cyan, 0)})`,
        }}
      />
    </AbsoluteFill>
  );
};

// Local stand-in for the subset of the Remotion runtime API this project uses.
//
// Purpose: render previews and sample reels in environments where the
// `remotion` npm package cannot be installed (e.g. no registry access).
// The real Remotion renderer remains the primary path (`npx remotion render`).
// Scenes import from 'remotion'; the local bundler aliases that import here.
//
// Implemented: AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
// interpolate, spring, Easing, staticFile, Audio (no-op: audio is muxed by
// ffmpeg), delayRender/continueRender, Composition/Still/registerRoot (no-ops).

import React, {createContext, useContext} from 'react';

type VideoConfig = {width: number; height: number; fps: number; durationInFrames: number; id: string};

export const FrameContext = createContext<number>(0);
export const OffsetContext = createContext<number>(0);
export const ConfigContext = createContext<VideoConfig>({width: 1080, height: 1920, fps: 30, durationInFrames: 1, id: 'local'});

export const useCurrentFrame = () => useContext(FrameContext) - useContext(OffsetContext);
export const useVideoConfig = () => useContext(ConfigContext);

export const AbsoluteFill: React.FC<{style?: React.CSSProperties; children?: React.ReactNode}> = ({style, children}) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Sequence: React.FC<{
  from?: number;
  durationInFrames?: number;
  name?: string;
  layout?: 'absolute-fill' | 'none';
  children?: React.ReactNode;
}> = ({from = 0, durationInFrames = Infinity, layout = 'absolute-fill', children}) => {
  const absolute = useContext(FrameContext);
  const parentOffset = useContext(OffsetContext);
  const start = parentOffset + from;
  if (absolute < start || absolute >= start + durationInFrames) return null;
  const inner = <OffsetContext.Provider value={start}>{children}</OffsetContext.Provider>;
  return layout === 'none' ? inner : <AbsoluteFill>{inner}</AbsoluteFill>;
};

type Extrapolate = 'extend' | 'clamp' | 'identity';

export const interpolate = (
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options: {easing?: (t: number) => number; extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate} = {},
): number => {
  const {easing = (t: number) => t, extrapolateLeft = 'extend', extrapolateRight = 'extend'} = options;
  if (inputRange.length !== outputRange.length || inputRange.length < 2) {
    throw new Error('interpolate: ranges must have equal length >= 2');
  }
  let i = 1;
  while (i < inputRange.length - 1 && input > inputRange[i]) i++;
  const inMin = inputRange[i - 1];
  const inMax = inputRange[i];
  const outMin = outputRange[i - 1];
  const outMax = outputRange[i];
  let x = input;
  if (x < inMin) {
    if (extrapolateLeft === 'clamp') x = inMin;
    else if (extrapolateLeft === 'identity') return x;
  }
  if (x > inMax) {
    if (extrapolateRight === 'clamp') x = inMax;
    else if (extrapolateRight === 'identity') return x;
  }
  if (inMax === inMin) return outMin;
  let t = (x - inMin) / (inMax - inMin);
  // Easing is applied within the segment (like Remotion), not to extrapolated parts.
  if (t >= 0 && t <= 1) t = easing(t);
  return outMin + t * (outMax - outMin);
};

// Analytic damped-spring solution, matching Remotion's spring() semantics:
// starts at `from`, settles at `to`, frame-driven and deterministic.
export const spring = ({
  frame,
  fps,
  config = {},
  from = 0,
  to = 1,
}: {
  frame: number;
  fps: number;
  config?: {damping?: number; mass?: number; stiffness?: number; overshootClamping?: boolean};
  from?: number;
  to?: number;
  durationInFrames?: number;
  delay?: number;
}) => {
  const {damping = 10, mass = 1, stiffness = 100, overshootClamping = false} = config;
  if (frame <= 0) return from;
  const t = frame / fps;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x0 = -1;
  let x: number;
  if (zeta < 1) {
    const w1 = w0 * Math.sqrt(1 - zeta * zeta);
    x = Math.exp(-zeta * w0 * t) * (x0 * Math.cos(w1 * t) + ((zeta * w0 * x0) / w1) * Math.sin(w1 * t));
  } else if (zeta === 1) {
    x = Math.exp(-w0 * t) * (x0 + w0 * x0 * t);
  } else {
    const w2 = w0 * Math.sqrt(zeta * zeta - 1);
    // Numerically stable overdamped form (avoids cosh/sinh overflow).
    const r1 = -zeta * w0 + w2;
    const r2 = -zeta * w0 - w2;
    const c2 = (x0 * r1) / (r1 - r2);
    const c1 = x0 - c2;
    x = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  let p = 1 + x;
  if (overshootClamping) p = Math.min(1, p);
  return from + (to - from) * p;
};

// Cubic bezier solver (same approach as WebKit/Remotion).
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const C = (a1: number) => 3 * a1;
  const calc = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t: number, a1: number, a2: number) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  const tForX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    if (t < 0 || t > 1 || Math.abs(calc(t, x1, x2) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        const v = calc(t, x1, x2);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : calc(tForX(x), y1, y2));
};

type Fn = (t: number) => number;
export const Easing = {
  linear: (t: number) => t,
  ease: bezier(0.42, 0, 1, 1),
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  exp: (t: number) => Math.pow(2, 10 * (t - 1)),
  circle: (t: number) => 1 - Math.sqrt(1 - t * t),
  bezier,
  in: (f: Fn) => f,
  out: (f: Fn) => (t: number) => 1 - f(1 - t),
  inOut: (f: Fn) => (t: number) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2),
};

export const staticFile = (path: string) => `/${path.replace(/^\/+/, '')}`;

// Audio is mixed and muxed by ffmpeg in the local renderer.
export const Audio: React.FC<Record<string, unknown>> = () => null;
export const Html5Audio = Audio;

const pending = new Set<number>();
let counter = 0;
export const delayRender = (_label?: string) => {
  counter += 1;
  pending.add(counter);
  (window as unknown as {__pendingRenders: number}).__pendingRenders = pending.size;
  return counter;
};
export const continueRender = (handle: number) => {
  pending.delete(handle);
  (window as unknown as {__pendingRenders: number}).__pendingRenders = pending.size;
};

export const Composition: React.FC<Record<string, unknown>> = () => null;
export const Still: React.FC<Record<string, unknown>> = () => null;
export const registerRoot = (_c: unknown) => undefined;

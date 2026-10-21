import type {CSSProperties} from 'react';
import {Easing, interpolate, spring} from 'remotion';

// Shared, deterministic motion helpers. Every value derives from the frame.

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 over `duration` frames starting at `start`, eased, clamped. */
export const progress = (frame: number, start: number, duration: number, easing = easeOut) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Calm, near-critically-damped spring for entrances: settles in ~0.5s with
 *  no visible overshoot. (Heavily overdamped configs crawl to their final
 *  value and leave elements semi-transparent for seconds.) */
export const enter = (frame: number, fps: number, delay = 0) =>
  spring({frame: frame - delay, fps, config: {damping: 22, stiffness: 120, mass: 0.9, overshootClamping: true}});

/** Slightly livelier spring for small emphasis pops (badges, checks). */
export const pop = (frame: number, fps: number, delay = 0) =>
  spring({frame: frame - delay, fps, config: {damping: 14, stiffness: 180, mass: 0.6}});

/** Standard rise-in style: opacity + translateY. */
export const riseStyle = (p: number, distance = 36): CSSProperties => ({
  opacity: p,
  transform: `translateY(${(1 - p) * distance}px)`,
});

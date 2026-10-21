import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {type} from '../brand/tokens';
import {MetricCard, PromptCard} from '../components/Cards';
import {Kicker, KineticHeadline} from '../components/KineticHeadline';
import {enter, pop, progress, riseStyle} from '../components/motion';
import type {CardsScene as CardsSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// A stack of input cards. Can pop cards in, and/or flip each card to a new
// state (e.g. "demo prompt" → "real user input") with a 3D flip.
export const CardsScene: React.FC<{scene: CardsSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const popStart = scene.popStart ?? 8;
  const popStagger = scene.popStagger ?? 6;
  const swapStart = scene.swapStart ?? 0;
  const swapStagger = scene.swapStagger ?? 10;
  const m = scene.metric;

  return (
    <SceneShell>
      <div style={riseStyle(enter(frame, fps, 0), 24)}>
        <Kicker text={scene.kicker} />
        <KineticHeadline lines={scene.headline} size={type.headline - 8} start={2} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16, marginTop: 44}}>
        {scene.cards.map((card, i) => {
          const appear = scene.enter === 'pop' ? enter(frame, fps, popStart + i * popStagger) : 1;
          const check = scene.enter === 'pop' ? pop(frame, fps, popStart + i * popStagger + 6) : 1;
          let rot = 0;
          let showSwap = false;
          if (card.swap) {
            const t = progress(frame, swapStart + i * swapStagger, 14);
            rot = t * 180;
            showSwap = t >= 0.5;
          }
          const face = showSwap && card.swap ? card.swap : card;
          // Second half of the flip is mirrored back so text is never reversed.
          const visualRot = showSwap ? rot - 180 : rot;
          return (
            <div key={i} style={{perspective: 1400, ...riseStyle(appear, 28)}}>
              <PromptCard
                text={face.text}
                status={face.status}
                tag={face.tag}
                iconScale={interpolate(check, [0, 1], [0.4, 1])}
                height={120}
                style={{transform: `rotateX(${visualRot}deg)`, backfaceVisibility: 'hidden'}}
              />
            </div>
          );
        })}
      </div>
      {m ? (
        <MetricBlock frame={frame} fps={fps} metric={m} />
      ) : null}
    </SceneShell>
  );
};

const MetricBlock: React.FC<{frame: number; fps: number; metric: NonNullable<CardsSceneConfig['metric']>}> = ({frame, fps, metric}) => {
  const p = enter(frame, fps, metric.appearAt);
  const swapped = metric.swapTo && frame >= metric.swapTo.at;
  const s = metric.swapTo ? pop(frame, fps, metric.swapTo.at) : 1;
  const cur = swapped && metric.swapTo ? metric.swapTo : metric;
  return (
    <div style={{marginTop: 34, ...riseStyle(p, 30)}}>
      <MetricCard
        label={cur.label}
        value={cur.value}
        tone={cur.tone}
        style={{transform: `scale(${swapped ? interpolate(s, [0, 1], [0.94, 1]) : 1})`, padding: '22px 34px'}}
      />
    </div>
  );
};

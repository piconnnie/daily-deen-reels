import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {alpha, fonts, radius} from '../brand/tokens';
import {useColors} from '../brand/theme';
import {Kicker} from '../components/KineticHeadline';
import {enter, riseStyle} from '../components/motion';
import type {SourceScene as SourceSceneConfig} from '../content/schema';
import {SceneShell} from './SceneShell';

// A verse or hadith, shown exactly as pulled from the pinned dataset:
// Arabic (Qur'an always; hadith only via a verbatim arabicExcerpt), the English
// translation (or a verbatim excerpt of it, marked with …), and the citation.
export const displayEnglish = (scene: SourceSceneConfig) => {
  const r = scene.resolved;
  if (!r) return '';
  if (!scene.excerpt) return r.english;
  const e = scene.excerpt.trim().replace(/^…\s*|\s*…$/g, '');
  const atStart = r.english.startsWith(e);
  const atEnd = r.english.endsWith(e);
  return `${atStart ? '' : '…'}${e}${atEnd ? '' : '…'}`;
};

export const displayArabic = (scene: SourceSceneConfig) => {
  const r = scene.resolved;
  if (!r) return '';
  if (scene.arabicExcerpt) return scene.arabicExcerpt.trim();
  const show = scene.showArabic ?? r.kind === 'quran';
  return show && r.kind === 'quran' ? r.arabic : '';
};

// Rendering only (QA always compares the untouched dataset text):
//  - the dataset stores open tanween as U+08F0–08F2 (standard Unicode) and
//    puts a space between it and the following alef / alef maqsura (a
//    conversion artifact: it occurs in every one of ~2,400 cases);
//  - the King Fahd font expects its original code points U+0657/065E/0656.
const forHafsFont = (s: string) =>
  s
    .replace(/([\u08F0-\u08F2]) (?=[\u0627\u0649])/g, '$1')
    .replace(/\u08F0/g, '\u0657')
    .replace(/\u08F1/g, '\u065E')
    .replace(/\u08F2/g, '\u0656');

const englishSize = (n: number) => (n <= 90 ? 58 : n <= 150 ? 50 : n <= 210 ? 44 : 40);
const arabicSize = (n: number) => (n <= 60 ? 84 : n <= 110 ? 72 : n <= 170 ? 62 : 54);

export const SourceScene: React.FC<{scene: SourceSceneConfig}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = useColors();
  const r = scene.resolved;
  const arabic = displayArabic(scene);
  const english = displayEnglish(scene);
  const arabicAt = scene.arabicAt ?? 6;
  const englishAt = scene.englishAt ?? (arabic ? 22 : 8);
  const citationAt = scene.citationAt ?? englishAt + 14;
  const isQuran = r?.kind === 'quran';

  if (!r) {
    // Never render an unresolved quote: QA blocks this too.
    return (
      <SceneShell justify="center">
        <div style={{fontFamily: fonts.body, fontSize: 40, color: c.warning}}>Source not resolved: {scene.ref}</div>
      </SceneShell>
    );
  }

  return (
    <SceneShell justify="center" gap={34}>
      <div style={riseStyle(enter(frame, fps, 0), 20)}>
        <Kicker text={scene.kicker} />
      </div>
      <div
        style={{
          position: 'relative',
          padding: arabic ? '44px 40px 40px' : '40px 40px 36px',
          borderRadius: radius.card,
          background: alpha(c.navyRaised, c.light ? 0.92 : 0.78),
          border: `2px solid ${alpha(c.indigo, 0.55)}`,
          boxShadow: `inset 0 0 0 10px ${alpha(c.navy, 0.35)}, inset 0 0 0 12px ${alpha(c.indigo, 0.18)}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
        }}
      >
        {arabic ? (
          <div
            dir="rtl"
            lang="ar"
            style={{
              ...riseStyle(enter(frame, fps, arabicAt), 18),
              fontFamily: isQuran ? fonts.quran : fonts.arabic,
              fontSize: arabicSize([...arabic].length),
              lineHeight: isQuran ? 1.95 : 1.7,
              color: c.cyan,
              textAlign: 'center',
              textWrap: 'balance',
            } as React.CSSProperties}
          >
            {isQuran ? forHafsFont(arabic) : arabic}
          </div>
        ) : null}
        {arabic ? <div style={{height: 2, background: alpha(c.indigo, 0.35), margin: '0 60px', opacity: enter(frame, fps, englishAt - 4)}} /> : null}
        <div
          lang="en"
          style={{
            ...riseStyle(enter(frame, fps, englishAt), 18),
            fontFamily: fonts.serif,
            fontSize: englishSize([...english].length) + (arabic ? 0 : 6),
            lineHeight: 1.32,
            color: c.offWhite,
            textAlign: 'center',
            textWrap: 'balance',
          } as React.CSSProperties}
        >
          {`“${english}”`}
        </div>
      </div>
      <div
        style={{
          ...riseStyle(enter(frame, fps, citationAt), 14),
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 32,
            color: c.navy,
            background: c.indigo,
            padding: '10px 22px',
            borderRadius: radius.pill,
          }}
        >
          {r.citation}
        </span>
        <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 26, color: c.slate}}>
          {isQuran ? `Translation: ${r.translation}` : `${r.grade} · tr. ${r.translation}`}
        </span>
      </div>
    </SceneShell>
  );
};

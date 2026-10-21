import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {alpha, fonts, radius} from '../brand/tokens';
import {useColors, useReelStyle} from '../brand/theme';
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
const arabicSize = (n: number) => (n <= 60 ? 84 : n <= 110 ? 72 : n <= 170 ? 62 : n <= 230 ? 54 : 46);

// Three layouts rotate with the reel's style:
//   framed     the quote in a quiet bordered panel, centred
//   minimal    no panel: large centred text, a short rule, citation as text
//   editorial  left-aligned, a large opening quote mark, citation with an accent bar
export const SourceScene: React.FC<{scene: SourceSceneConfig; recitedBy?: string | null}> = ({scene, recitedBy}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = useColors();
  const {layout} = useReelStyle();
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

  const editorial = layout === 'editorial';
  const minimal = layout === 'minimal';
  const align: 'center' | 'left' = editorial ? 'left' : 'center';
  const meta = [isQuran ? `Translation: ${r.translation}` : `${r.grade} · tr. ${r.translation}`, recitedBy ? `Recited by ${recitedBy.replace(/\s*\(.*\)$/, '')}` : null]
    .filter(Boolean)
    .join(' · ');

  const arabicBlock = arabic ? (
    <div
      dir="rtl"
      lang="ar"
      style={{
        ...riseStyle(enter(frame, fps, arabicAt), 16),
        fontFamily: isQuran ? fonts.quran : fonts.arabic,
        fontSize: arabicSize([...arabic].length) + (minimal ? 6 : 0),
        lineHeight: isQuran ? 1.95 : 1.7,
        color: c.cyan,
        textAlign: editorial ? 'right' : 'center',
        textWrap: 'balance',
      } as React.CSSProperties}
    >
      {isQuran ? forHafsFont(arabic) : arabic}
    </div>
  ) : null;

  // Verified transliteration (Qur'an only, Tanzil). Tanzil writes ʿayn as "AA".
  const translit = scene.showTransliteration && r.transliteration ? r.transliteration.replace(/AA/g, 'ʿ') : null;
  const translitBlock = translit ? (
    <div
      style={{
        ...riseStyle(enter(frame, fps, arabicAt + 8), 14),
        fontFamily: fonts.serif,
        fontStyle: 'italic',
        fontSize: 34,
        lineHeight: 1.35,
        color: c.slate,
        textAlign: editorial ? 'left' : 'center',
        textWrap: 'balance',
      } as React.CSSProperties}
    >
      {translit}
    </div>
  ) : null;

  const englishBlock = (
    <div
      lang="en"
      style={{
        ...riseStyle(enter(frame, fps, englishAt), 16),
        fontFamily: fonts.serif,
        fontSize: englishSize([...english].length) + (arabic ? 0 : 6) + (editorial ? 2 : 0),
        lineHeight: 1.34,
        color: c.offWhite,
        textAlign: align,
        textWrap: 'balance',
      } as React.CSSProperties}
    >
      {editorial ? english : `“${english}”`}
    </div>
  );

  const rule = arabic ? (
    <div
      style={{
        height: 2,
        width: minimal ? 120 : editorial ? 160 : undefined,
        margin: minimal ? '0 auto' : editorial ? '0' : '0 60px',
        alignSelf: editorial ? 'flex-start' : undefined,
        background: alpha(c.indigo, minimal ? 0.8 : 0.35),
        opacity: enter(frame, fps, englishAt - 4),
      }}
    />
  ) : null;

  const citation = minimal ? (
    <div style={{...riseStyle(enter(frame, fps, citationAt), 12), textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8}}>
      <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 32, letterSpacing: 1, color: c.indigo}}>{r.citation}</span>
      <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 24, color: c.slate}}>{meta}</span>
    </div>
  ) : editorial ? (
    <div style={{...riseStyle(enter(frame, fps, citationAt), 12), display: 'flex', alignItems: 'stretch', gap: 18}}>
      <div style={{width: 6, borderRadius: 3, background: c.indigo}} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
        <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 32, color: c.offWhite}}>{r.citation}</span>
        <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 24, color: c.slate}}>{meta}</span>
      </div>
    </div>
  ) : (
    <div style={{...riseStyle(enter(frame, fps, citationAt), 12), display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'center'}}>
      <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: 30, color: c.navy, background: c.indigo, padding: '9px 22px', borderRadius: radius.pill}}>{r.citation}</span>
      <span style={{fontFamily: fonts.body, fontWeight: 500, fontSize: 24, color: c.slate}}>{meta}</span>
    </div>
  );

  return (
    <SceneShell justify="center" gap={minimal ? 40 : 34}>
      <div style={{...riseStyle(enter(frame, fps, 0), 16), textAlign: align}}>
        <Kicker text={scene.kicker} />
      </div>
      {editorial ? (
        <div style={{position: 'relative', display: 'flex', flexDirection: 'column', gap: 30}}>
          <div style={{fontFamily: fonts.serif, fontSize: 200, lineHeight: 0.6, height: 70, color: alpha(c.indigo, 0.9), opacity: enter(frame, fps, 2)}}>“</div>
          {arabicBlock}
          {translitBlock}
          {rule}
          {englishBlock}
        </div>
      ) : minimal ? (
        <div style={{display: 'flex', flexDirection: 'column', gap: 34}}>
          {arabicBlock}
          {translitBlock}
          {rule}
          {englishBlock}
        </div>
      ) : (
        <div
          style={{
            padding: arabic ? '44px 40px 40px' : '40px 40px 36px',
            borderRadius: radius.card,
            background: alpha(c.navyRaised, c.light ? 0.95 : 0.7),
            border: `1.5px solid ${alpha(c.indigo, 0.45)}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 30,
          }}
        >
          {arabicBlock}
          {translitBlock}
          {rule}
          {englishBlock}
        </div>
      )}
      {citation}
    </SceneShell>
  );
};

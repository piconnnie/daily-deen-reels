import React from 'react';
import {AbsoluteFill} from 'remotion';
import {loadBrandFonts} from '../brand/fonts';
import {coverSafe, fonts} from '../brand/tokens';
import {pickStyle, ThemeProvider, useColors} from '../brand/theme';
import {BrandBackground} from '../components/BrandBackground';
import {Monogram} from '../components/BrandSignature';
import {KineticHeadline} from '../components/KineticHeadline';
import type {ReelConfig} from '../content/schema';

loadBrandFonts();

// 1080×1920 cover. Everything essential sits inside the centred 1080×1350
// feed-grid crop, with side margins, so the grid thumbnail stays readable.
export const Cover: React.FC<{config: ReelConfig}> = ({config}) => (
  <ThemeProvider style={pickStyle(config.id, config.style)}>
    <CoverInner config={config} />
  </ThemeProvider>
);

const CoverInner: React.FC<{config: ReelConfig}> = ({config}) => {
  const colors = useColors();
  return (
  <AbsoluteFill>
    <BrandBackground />
    <div
      style={{
        position: 'absolute',
        top: coverSafe.y + 110,
        left: 110,
        right: 110,
        height: coverSafe.height - 220,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 44,
      }}
    >
      <span style={{fontFamily: fonts.mono, fontWeight: 700, fontSize: 30, letterSpacing: 6, color: colors.cyan}}>
        {config.cover.kicker}
      </span>
      <KineticHeadline lines={config.cover.headline} size={118} instant staticUnderline align="center" lineHeight={1.04} />
      <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 20}}>
        <Monogram size={64} />
        <span style={{fontFamily: fonts.mono, fontWeight: 700, fontSize: 26, letterSpacing: 4, color: colors.slate}}>
          DAILY DEEN
        </span>
      </div>
    </div>
  </AbsoluteFill>
  );
};

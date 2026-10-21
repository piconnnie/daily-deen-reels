import {continueRender, delayRender, staticFile} from 'remotion';

// Fonts are loaded from local files in public/fonts so renders never depend on
// a network font download. To switch to Space Grotesk / JetBrains Mono, drop
// the files into public/fonts and update the `file` entries below.
const faces: {family: string; file: string; weight: string; style?: string}[] = [
  {family: 'DEEN Display', file: 'fonts/InterDisplay-Bold.otf', weight: '700'},
  {family: 'DEEN Display', file: 'fonts/InterDisplay-SemiBold.otf', weight: '600'},
  {family: 'DEEN Body', file: 'fonts/Inter-Regular.otf', weight: '400'},
  {family: 'DEEN Body', file: 'fonts/Inter-Medium.otf', weight: '500'},
  {family: 'DEEN Body', file: 'fonts/Inter-SemiBold.otf', weight: '600'},
  {family: 'DEEN Mono', file: 'fonts/DejaVuSansMono.ttf', weight: '400'},
  {family: 'DEEN Mono', file: 'fonts/DejaVuSansMono-Bold.ttf', weight: '700'},
  // Qur'an: KFGQPC HAFS Uthmanic Script (King Fahd Glorious Qur'an Printing
  // Complex), the font made for the Hafs text we quote. Amiri (SIL OFL) for
  // hadith Arabic, ﷺ and the serif English translation lines.
  {family: 'DEEN Quran', file: 'fonts/KFGQPC-Uthmanic-Hafs-v13.ttf', weight: '400'},
  {family: 'DEEN Serif', file: 'fonts/Amiri-Regular.ttf', weight: '400'},
  {family: 'DEEN Serif', file: 'fonts/Amiri-Bold.ttf', weight: '700'},
  {family: 'DEEN Serif', file: 'fonts/Amiri-Italic.ttf', weight: '400', style: 'italic'},
];

let started = false;

export const loadBrandFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading brand fonts');
  Promise.all(
    faces.map((f) => {
      const face = new FontFace(f.family, `url(${staticFile(f.file)})`, {weight: f.weight, style: f.style ?? 'normal'});
      return face.load().then((loaded) => {
        document.fonts.add(loaded);
      });
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      // Fail loudly: a silent fallback font would break the brand.
      console.error('Font loading failed', err);
      throw err;
    });
};

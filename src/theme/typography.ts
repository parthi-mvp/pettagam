// Pure (no app imports) so tests/typography.test.ts runs it in Node; applied in src/theme/themePreference.ts.

/**
 * Appearance → Font and Text size. The interface font and the type scale are CSS variables
 * (src/global.css, set in both modes), so swapping them repaints every `font-*` / `text-*` class.
 * Display (Fraunces), Tamil and the big hero amounts (fixed px) stay as they are.
 */
export type FontId = 'golos' | 'system' | 'manrope' | 'nunito' | 'sora' | 'lexend' | 'space';
export type TextScaleId = 'small' | 'default' | 'large' | 'xlarge';

type Weights = { 400: string; 500: string; 600: string; 700: string; 800: string };

// iOS can't select SF by name, so "System" there uses Helvetica Neue's named weights.
const IOS_SYSTEM: Weights = { 400: 'HelveticaNeue', 500: 'HelveticaNeue-Medium', 600: 'HelveticaNeue-Medium', 700: 'HelveticaNeue-Bold', 800: 'HelveticaNeue-Bold' };

/** Family names = the keys fonts are registered under in APP_FONTS (src/constants/fonts.ts). */
export const FONTS: { id: FontId; name: string; description: string; families: Weights }[] = [
  {
    id: 'golos',
    name: 'Golos',
    description: 'Warm and clear (default)',
    families: { 400: 'GolosText-Regular', 500: 'GolosText-Medium', 600: 'GolosText-SemiBold', 700: 'GolosText-Bold', 800: 'GolosText-ExtraBold' },
  },
  {
    // The phone's own font. Weights are picked by family name, and Android only names a few system weights
    // (regular, medium, black), so semibold → medium and bold → black. iOS can't name SF, so Helvetica Neue's weights.
    id: 'system',
    name: 'System',
    description: 'Your phone’s own font',
    families: { 400: 'sans-serif', 500: 'sans-serif-medium', 600: 'sans-serif-medium', 700: 'sans-serif-black', 800: 'sans-serif-black' },
  },
  {
    id: 'manrope',
    name: 'Manrope',
    description: 'Modern and geometric',
    families: { 400: 'Manrope_400Regular', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' },
  },
  {
    id: 'nunito',
    name: 'Nunito',
    description: 'Rounded and friendly',
    families: { 400: 'Nunito_400Regular', 500: 'Nunito_500Medium', 600: 'Nunito_600SemiBold', 700: 'Nunito_700Bold', 800: 'Nunito_800ExtraBold' },
  },
  {
    id: 'sora',
    name: 'Sora',
    description: 'Wide and futuristic',
    families: { 400: 'Sora_400Regular', 500: 'Sora_500Medium', 600: 'Sora_600SemiBold', 700: 'Sora_700Bold', 800: 'Sora_800ExtraBold' },
  },
  {
    id: 'lexend',
    name: 'Lexend',
    description: 'Made for easy reading',
    families: { 400: 'Lexend_400Regular', 500: 'Lexend_500Medium', 600: 'Lexend_600SemiBold', 700: 'Lexend_700Bold', 800: 'Lexend_800ExtraBold' },
  },
  {
    id: 'space',
    name: 'Space Grotesk',
    description: 'Quirky and techy',
    // No 800 weight in this family: extra bold uses bold.
    families: { 400: 'SpaceGrotesk_400Regular', 500: 'SpaceGrotesk_500Medium', 600: 'SpaceGrotesk_600SemiBold', 700: 'SpaceGrotesk_700Bold', 800: 'SpaceGrotesk_700Bold' },
  },
];

export const TEXT_SCALES: { id: TextScaleId; label: string; scale: number }[] = [
  { id: 'small', label: 'Small', scale: 0.92 },
  { id: 'default', label: 'Default', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.12 },
  { id: 'xlarge', label: 'Extra large', scale: 1.25 },
];

/** The default type scale (px): [size, line height]. Mirrors src/global.css. */
const SIZES: Record<string, [number, number]> = {
  xs: [11, 15],
  sm: [12, 16],
  base: [13, 18],
  lg: [14, 19],
  xl: [15, 20],
  '2xl': [16, 22],
  '3xl': [18, 24],
  '4xl': [20, 26],
  '5xl': [24, 30],
  '6xl': [32, 38],
};

export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** A font's family names on this platform (`os` = Platform.OS; only System differs). */
export const familiesFor = (id: string, os: string): Weights => (id === 'system' && os === 'ios' ? IOS_SYSTEM : fontById(id).families);
export const scaleById = (id: string) => TEXT_SCALES.find((s) => s.id === id) ?? TEXT_SCALES[1];

/**
 * CSS variables for a font and a scale (pure, so it's testable). Sizes are plain numbers: that's what
 * Uniwind compiles them to, and a "13px" string reaches React Native as fontSize and crashes the text view.
 */
export function typographyVariables(fontId: string, scaleId: string, os = 'android'): Record<string, string | number> {
  const f = familiesFor(fontId, os);
  const k = scaleById(scaleId).scale;
  const vars: Record<string, string | number> = {
    '--font-regular': f[400],
    '--font-medium': f[500],
    '--font-semibold': f[600],
    '--font-bold': f[700],
    '--font-extrabold': f[800],
  };
  for (const [name, [size, line]] of Object.entries(SIZES)) {
    vars[`--text-${name}`] = Math.round(size * k);
    vars[`--text-${name}--line-height`] = Math.round(line * k);
  }
  return vars;
}

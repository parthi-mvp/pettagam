/**
 * Pettagam design constants for code that styles with `style={...}`.
 * Colours live in `src/global.css` (read them with useTheme / useThemeColor or use className).
 */

import { Platform, type TextStyle } from 'react-native';

/**
 * Design system type: Golos Text for the interface, Fraunces for display lines, Noto Sans Tamil for Tamil.
 * Custom fonts select weight by family name (fontWeight alone won't switch files on Android),
 * so always use font(weight) instead of fontWeight.
 */
export const FontFamily = {
  400: 'GolosText-Regular',
  500: 'GolosText-Medium',
  600: 'GolosText-SemiBold',
  700: 'GolosText-Bold',
  800: 'GolosText-ExtraBold',
  display: 'Fraunces_600SemiBold',
  tamil: 'NotoSansTamil_700Bold',
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800;
export const font = (weight: Weight = 500): TextStyle => ({ fontFamily: FontFamily[weight] });

/** 4px base unit. 16px screen gutter, 10px between cards, 24px between sections. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  gutter: 16,
  cardGap: 10,
  section: 24,
} as const;

/** Design system radii: r-sm 10 · r-md 14 (buttons, inputs) · r-lg 16 (cards) · r-xl 28 (hero, sheets). */
export const Radius = { chip: 10, input: 14, button: 14, card: 16, hero: 28 } as const;

/** Motion: 180–240ms ease-out. No celebratory motion on spending. */
export const Motion = { fast: 180, base: 220, slow: 240, stagger: 40 } as const;

export const Shadow = {
  raised: { shadowColor: '#14201E', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  hero: { shadowColor: '#082F2C', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  primary: { shadowColor: '#0F5650', shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  brass: { shadowColor: '#B8862B', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

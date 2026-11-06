import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold';
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { Lexend_700Bold } from '@expo-google-fonts/lexend/700Bold';
import { Lexend_800ExtraBold } from '@expo-google-fonts/lexend/800ExtraBold';
import { SpaceGrotesk_400Regular } from '@expo-google-fonts/space-grotesk/400Regular';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { NotoSansTamil_700Bold } from '@expo-google-fonts/noto-sans-tamil/700Bold';

import * as Font from 'expo-font';

import type { FontId } from '@/theme/typography';

import { FontFamily } from './theme';

/** Fonts every screen needs, for useFonts in each React root (the app and the SMS quick-add card). */
export const APP_FONTS = {
  [FontFamily[400]]: require('../../assets/fonts/GolosText-Regular.ttf'),
  [FontFamily[500]]: require('../../assets/fonts/GolosText-Medium.ttf'),
  [FontFamily[600]]: require('../../assets/fonts/GolosText-SemiBold.ttf'),
  [FontFamily[700]]: require('../../assets/fonts/GolosText-Bold.ttf'),
  [FontFamily[800]]: require('../../assets/fonts/GolosText-ExtraBold.ttf'),
  [FontFamily.display]: Fraunces_600SemiBold,
  [FontFamily.tamil]: NotoSansTamil_700Bold,
};

/**
 * The optional interface fonts (Appearance → Font), loaded only when picked: at start-up for the saved
 * choice, and by loadFont before switching. Keys are the family names in src/theme/typography.ts.
 * Golos is always loaded (it's the default and the fallback); System is built into the phone.
 */
export const FONT_FILES: Record<FontId, Record<string, number>> = {
  golos: {},
  system: {},
  manrope: {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  },
  nunito: {
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  },
  sora: {
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  },
  lexend: {
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
  },
  space: {
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  },
};

/** What a React root loads before its first frame: the base fonts plus the saved interface font. */
export const startupFonts = (font: FontId) => ({ ...APP_FONTS, ...FONT_FILES[font] });

/** Load a font's files before switching to it, so text never flashes in a font that isn't there yet. */
export const loadFont = (font: FontId) => Font.loadAsync(FONT_FILES[font]);

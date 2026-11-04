import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { NotoSansTamil_700Bold } from '@expo-google-fonts/noto-sans-tamil/700Bold';

import { FontFamily } from './theme';

/** Every font the app uses, for useFonts in each React root (the app and the SMS quick-add card). */
export const APP_FONTS = {
  [FontFamily[400]]: require('../../assets/fonts/GolosText-Regular.ttf'),
  [FontFamily[500]]: require('../../assets/fonts/GolosText-Medium.ttf'),
  [FontFamily[600]]: require('../../assets/fonts/GolosText-SemiBold.ttf'),
  [FontFamily[700]]: require('../../assets/fonts/GolosText-Bold.ttf'),
  [FontFamily[800]]: require('../../assets/fonts/GolosText-ExtraBold.ttf'),
  [FontFamily.display]: Fraunces_600SemiBold,
  [FontFamily.tamil]: NotoSansTamil_700Bold,
};

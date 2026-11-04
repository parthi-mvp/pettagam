// App entry: Expo Router's "main" root, plus "QuickAdd", the card Android shows over other apps
// when a bank SMS arrives (modules/sms-reader → QuickAddActivity).
import 'expo-router/entry';

import { AppRegistry } from 'react-native';

import { QuickAddRoot } from '@/quick-add/quick-add';
import { restoreThemePreference } from '@/theme/themePreference';

AppRegistry.registerComponent('QuickAdd', () => {
  restoreThemePreference(); // the card can open before the app has ever started in this process
  return QuickAddRoot;
});

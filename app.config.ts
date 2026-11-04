import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

// Set by the EAS build profile (eas.json); plain `expo start` / `expo run` builds the dev variant.
const APP_VARIANT = (process.env.APP_VARIANT as AppVariant) || 'development';

// Each variant is its own app on the phone (own name, id and link scheme), so a dev build can sit
// next to the production one without sharing its data or sign-in.
const variantConfig = {
  development: { name: 'Pettagam Dev', id: 'com.pettagam.app.dev', scheme: 'pettagam-dev', icon: '-dev' },
  preview: { name: 'Pettagam Preview', id: 'com.pettagam.app.preview', scheme: 'pettagam-preview', icon: '-preview' },
  production: { name: 'Pettagam', id: 'com.pettagam.app', scheme: 'pettagam', icon: '' },
}[APP_VARIANT];
// Dev / preview icons carry a small DEV / PREVIEW badge at the bottom; production is the clean icon.

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variantConfig.name,
  slug: 'pettagam',
  version: '1.0.0',
  orientation: 'portrait',
  icon: `./assets/icons/icon${variantConfig.icon}.png`,
  scheme: variantConfig.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: variantConfig.id,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#17150F',
      foregroundImage: `./assets/icons/android-icon-foreground${variantConfig.icon}.png`,
      backgroundImage: './assets/icons/android-icon-background.png',
      monochromeImage: './assets/icons/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: variantConfig.id,
    permissions: [
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.POST_NOTIFICATIONS',
    ],
    blockedPermissions: ['android.permission.SEND_SMS'],
  },
  web: {
    favicon: './assets/icons/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F7F3EA',
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        dark: { backgroundColor: '#17150F', image: './assets/images/splash-icon-dark.png' },
      },
    ],
    'expo-sqlite',
    // shortcut: placeholder iOS client id; Drive import fails on iPhone until it's the real one from Google Cloud.
    ['@react-native-google-signin/google-signin', { iosUrlScheme: 'com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID' }],
    'expo-secure-store',
    '@react-native-community/datetimepicker',
    [
      'expo-image-picker',
      {
        photosPermission: 'Pick a photo of a bill or receipt so Pettagam can fill in the transaction.',
        cameraPermission: 'Take a photo of a bill or receipt so Pettagam can fill in the transaction.',
      },
    ],
    ['expo-local-authentication', { faceIDPermission: 'Unlock Pettagam with Face ID so only you can open your money.' }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: APP_VARIANT,
    eas: { projectId: '66484872-d380-498c-b91d-4020177902db' },
  },
});

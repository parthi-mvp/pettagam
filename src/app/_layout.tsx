import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import '../global.css';

import { AuthProvider, useAuth } from '@/auth/session';
import { AppToaster, BackButton } from '@/components/ui';
import { APP_FONTS } from '@/constants/fonts';
import { FontFamily } from '@/constants/theme';
import { migrate } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { AutoSync } from '@/sync/auto-sync';
import { AppLockGate } from '@/components/app-lock-gate';
import { useWelcomeSeen } from '@/onboarding/welcome-seen';
import { restoreAppLock } from '@/security/app-lock';
import { restoreThemePreference } from '@/theme/themePreference';

SplashScreen.preventAutoHideAsync();
// Saved Light / Dark / System choice, applied before the first frame (no flash).
restoreThemePreference();
restoreAppLock();

export default function RootLayout() {
  const { theme } = useUniwind();
  const c = useTheme();
  // Splash stays up until fonts are in (or failed: system font fallback) and the DB is migrated.
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  if (!fontsLoaded && !fontError) return null;

  const base = theme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  return (
    // Insets feed Uniwind's safe-area classes (pt-safe, pb-safe…).
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
        <ThemeProvider value={navTheme}>
          <SQLiteProvider
            databaseName="pettagam.db"
            onInit={async (db) => {
              try {
                await migrate(db);
              } finally {
                SplashScreen.hideAsync();
              }
            }}>
            <AuthProvider>
              <AutoSync />
              <Routes />
            </AuthProvider>
          </SQLiteProvider>
        </ThemeProvider>
        <AppToaster />
      </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaListener>
  );
}

function Routes() {
  const { status } = useAuth();
  const c = useTheme();
  const welcomeSeen = useWelcomeSeen((s) => s.seen);
  const signedIn = status === 'signedIn';
  // Each sign-in resets the flag, so the next sign-out opens on the welcome screens again.
  useEffect(() => {
    if (signedIn) useWelcomeSeen.setState({ seen: false });
  }, [signedIn]);
  if (status === 'loading') return null;
  return (
    <>
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        // One quiet header on both platforms: centred semibold title on the canvas, back arrow in ink.
        headerTitleAlign: 'center',
        headerTitleStyle: { fontFamily: FontFamily[500], fontSize: 17 },
        headerTintColor: c.text,
        headerStyle: { backgroundColor: c.background },
        // The app's round back button on every pushed screen (forms, settings, Accounts, Reports…).
        headerLeft: ({ canGoBack }) => (canGoBack ? <BackButton /> : null),
        headerBackVisible: false,
      }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="transaction-form" options={{ presentation: 'modal', title: 'Transaction' }} />
        <Stack.Screen name="account-form" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="investment-form" options={{ presentation: 'modal', title: 'Investment' }} />
        <Stack.Screen name="investment/[id]" options={{ title: 'Investment' }} />
        <Stack.Screen name="sms-import" options={{ title: 'Import from SMS' }} />
        <Stack.Screen name="ask" options={{ title: 'Ask your money' }} />
        <Stack.Screen name="ai-tidy" options={{ title: 'Tidy up with AI' }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
        <Stack.Screen name="budget-form" options={{ presentation: 'modal', title: 'Budget' }} />
        <Stack.Screen name="category-form" options={{ presentation: 'modal', title: 'Category' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
        <Stack.Screen name="settings/ai" options={{ title: 'AI assistant' }} />
        <Stack.Screen name="settings/sync" options={{ title: 'Sync & backup' }} />
        <Stack.Screen name="settings/sms" options={{ title: 'Bank SMS alerts' }} />
        <Stack.Screen name="settings/developer" options={{ title: 'Developer tools' }} />
        <Stack.Screen name="settings/security" options={{ title: 'App lock' }} />
      </Stack.Protected>
      {/* Signed out: the welcome screens come first, every time; sign-in is reached from them. */}
      <Stack.Protected guard={!signedIn && !welcomeSeen}>
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
    {/* Above every screen: the fingerprint / face lock (More → Settings → App lock). */}
    <AppLockGate signedIn={signedIn} />
    </>
  );
}

import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import '../global.css';

import { AuthProvider, useAuth } from '@/auth/session';
import { AppToaster } from '@/components/ui';
import { StackHeader } from '@/components/ui/StackHeader';
import { startupFonts } from '@/constants/fonts';
import { normalizeCategoryIcons } from '@/db/category-icons';
import { migrate } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { AutoSync } from '@/sync/auto-sync';
import { AppLockGate } from '@/components/app-lock-gate';
import { OfflineFrame, setDeviceInsets } from '@/components/offline-banner';
import { useWelcomeSeen } from '@/onboarding/welcome-seen';
import { restoreAppLock } from '@/security/app-lock';
import { restoreThemePreference, useThemePreference } from '@/theme/themePreference';

SplashScreen.preventAutoHideAsync();
// Saved Light / Dark / System choice, applied before the first frame (no flash).
restoreThemePreference();
restoreAppLock();

/**
 * Module-level on purpose: SQLiteProvider closes and reopens the database whenever `onInit` changes,
 * unmounting the whole app (back to Home, "Access to closed resource"). An inline function would be a
 * new one on every RootLayout render, and a theme switch re-renders RootLayout.
 */
async function initDatabase(db: SQLiteDatabase) {
  try {
    await migrate(db);
    // Old category icons → the one icon set, stored (and synced) once; a no-op after that.
    await normalizeCategoryIcons(db).catch((e) => console.warn('category icons', e));
  } finally {
    SplashScreen.hideAsync();
  }
}

export default function RootLayout() {
  const { theme } = useUniwind();
  const c = useTheme();
  // Splash stays up until fonts are in (or failed: system font fallback) and the DB is migrated.
  const [fontsLoaded, fontError] = useFonts(startupFonts(useThemePreference.getState().font));
  if (!fontsLoaded && !fontError) return null;

  const base = theme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  return (
    // Insets feed Uniwind's safe-area classes (pt-safe, pb-safe…), via the offline bar (it may cover the top).
    <SafeAreaListener onChange={({ insets }) => setDeviceInsets(insets)}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
        <ThemeProvider value={navTheme}>
          <SQLiteProvider databaseName="pettagam.db" onInit={initDatabase}>
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
  const welcomeSeen = useWelcomeSeen((s) => s.seen);
  const signedIn = status === 'signedIn';
  // Each sign-in resets the flag, so the next sign-out opens on the welcome screens again.
  useEffect(() => {
    if (signedIn) useWelcomeSeen.setState({ seen: false });
  }, [signedIn]);
  if (status === 'loading') return null;
  return (
    <>
    {/* While offline, a bar at the top pushes every screen down (see OfflineFrame). */}
    <OfflineFrame>
    <Stack
      // A JS header (centred title, the app's round back button): the native one crashes on a theme switch (see StackHeader).
      screenOptions={{ header: (props) => <StackHeader {...props} /> }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="transaction-form" options={{ presentation: 'modal', title: 'Transaction' }} />
        <Stack.Screen name="account-form" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="investment-form" options={{ presentation: 'modal', title: 'Investment' }} />
        <Stack.Screen name="investment/[id]" options={{ title: 'Investment' }} />
        <Stack.Screen name="sms-import" options={{ title: 'Import from SMS' }} />
        <Stack.Screen name="ask" options={{ title: 'Ask your money' }} />
        <Stack.Screen name="ai-tidy" options={{ title: 'Tidy up with AI' }} />
        <Stack.Screen name="more" options={{ title: 'More' }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="year" options={{ title: 'Year in review' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="tags" options={{ title: 'Tags' }} />
        <Stack.Screen name="tag" options={{ title: 'Tag' }} />
        <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
        <Stack.Screen name="budget-form" options={{ presentation: 'modal', title: 'Budget' }} />
        <Stack.Screen name="category-form" options={{ presentation: 'modal', title: 'Category' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
        <Stack.Screen name="settings/ai" options={{ title: 'AI assistant' }} />
        <Stack.Screen name="settings/sync" options={{ title: 'Sync & backup' }} />
        <Stack.Screen name="settings/sms" options={{ title: 'Bank SMS alerts' }} />
        <Stack.Screen name="settings/developer" options={{ title: 'Developer tools' }} />
        <Stack.Screen name="settings/sms-card-test" options={{ title: 'New-SMS card' }} />
        <Stack.Screen name="settings/sms-lab" options={{ title: 'SMS tester' }} />
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
    </OfflineFrame>
    {/* Above every screen: the fingerprint / face lock (More → Settings → App lock), covering everything. */}
    <AppLockGate signedIn={signedIn} />
    </>
  );
}

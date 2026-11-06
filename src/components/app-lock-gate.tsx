import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from 'sonner-native';

import { haptic } from '@/lib/haptics';
import { authenticate, biometricSupport, noteBackground, noteForeground, useAppLock } from '@/security/app-lock';
import { DURATION } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

import { ChestMark, Icon } from './icons';
import { HeroBackdrop, PressableScale, Text } from './ui';

/**
 * App lock: covers the whole app while locked, and also whenever the app isn't in front (so the
 * recent-apps preview never shows balances). Asks for the fingerprint / face as soon as it shows.
 */
export function AppLockGate({ ready }: { ready: boolean }) {
  const insets = useSafeAreaInsets();
  const { enabled, locked, unlock } = useAppLock();
  const [appState, setAppState] = useState<AppStateStatus>((AppState.currentState as AppStateStatus | null) ?? 'active');
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState('fingerprint');
  const prompting = useRef(false);
  const [accent, ink] = useThemeColors(['brass', 'hero'] as const);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Only a real trip to the background counts; "inactive" also fires for the unlock prompt itself.
      if (next === 'background') noteBackground();
      if (next === 'active') noteForeground();
      setAppState(next);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (enabled) biometricSupport().then((s) => setMethod(s.name)).catch(() => {});
  }, [enabled]);

  const tryUnlock = async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const res = await authenticate('Unlock Pettagam');
      // Messages change only after the prompt answers (never synchronously from the auto-prompt effect).
      setMessage(null);
      if (res.success) {
        haptic.success();
        unlock();
      } else if (res.error === 'lockout') {
        setMessage('Too many attempts. Wait a moment, or unlock your phone with its PIN first.');
      } else if (res.error === 'not_enrolled' || res.error === 'passcode_not_set' || res.error === 'not_available') {
        // The phone no longer has any lock to check against: keeping the app locked would shut the
        // owner out for good, so turn app lock off and let them in.
        useAppLock.getState().setEnabled(false);
        unlock();
        toast.info('App lock turned off', { description: 'This phone has no fingerprint, face or screen lock any more.' });
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      prompting.current = false;
    }
  };

  const active = appState === 'active';
  // Prompt as soon as the lock is showing and the app is in front.
  useEffect(() => {
    // Scheduled, not called: the system prompt is an external effect; state changes after it answers.
    if (ready && enabled && locked && active) queueMicrotask(tryUnlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, enabled, locked, active]);

  if (!ready || !enabled || (!locked && active)) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.press)}
      exiting={FadeOut.duration(DURATION.release)}
      style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
      className="overflow-hidden bg-hero"
      accessibilityViewIsModal>
      <HeroBackdrop />
      <View className="flex-1 items-center justify-center gap-5 px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="h-[104px] w-[104px] items-center justify-center rounded-full border border-white/15 bg-white/10">
          <ChestMark size={54} color={accent} />
        </View>
        <View className="items-center gap-1.5">
          <Text variant="display" tone="onHero" className="text-[26px] leading-[32px]" accessibilityRole="header">
            Pettagam is locked
          </Text>
          <Text variant="body" align="center" className="text-on-hero-muted">
            {locked ? `Use your ${method} to open your strongbox.` : 'Your strongbox is hidden while Pettagam is in the background.'}
          </Text>
        </View>
        {message ? (
          <Text variant="small" align="center" className="text-hero-negative">
            {message}
          </Text>
        ) : null}
        {locked ? (
          <PressableScale
            haptic="light"
            accessibilityRole="button"
            onPress={tryUnlock}
            className="mt-2 h-12 flex-row items-center justify-center gap-2 self-stretch rounded-button bg-white">
            <Icon name="lock" size={18} color={ink} strokeWidth={2.2} />
            <Text weight="semibold" className="text-xl text-hero">
              Unlock
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

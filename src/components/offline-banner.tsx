import NetInfo from '@react-native-community/netinfo';
import { usePathname } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaInsetsContext, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import { useThemeColors } from '@/theme/useThemeColor';

import { Icon } from './icons';
import { Text } from './ui';

const OFFLINE_AFTER_MS = 1500; // a brief signal drop doesn't flash the bar
const BACK_ONLINE_MS = 2000;

// Uniwind's safe-area classes (pt-safe…) read insets set from the root listener. While the bar covers
// the status bar, the screens below must see no top inset, so the root hands its insets through here.
let realInsets: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
let topCovered = false;
const applyUniwindInsets = () => Uniwind.updateInsets(topCovered ? { ...realInsets, top: 0 } : realInsets);
/** Root SafeAreaListener → here, instead of straight to Uniwind. */
export function setDeviceInsets(insets: EdgeInsets) {
  realInsets = insets;
  applyUniwindInsets();
}

type Conn = 'online' | 'offline' | 'back';

/** Online / offline (after a short grace period) / back online (for a moment). */
function useConnection(): Conn {
  const [state, setState] = useState<Conn>('online');
  const shown = useRef<Conn>('online');
  const timers = useRef<{ off?: ReturnType<typeof setTimeout>; back?: ReturnType<typeof setTimeout> }>({});
  useEffect(() => {
    const t = timers.current;
    const show = (s: Conn) => {
      shown.current = s;
      setState(s);
    };
    const unsubscribe = NetInfo.addEventListener((n) => {
      const online = !!n.isConnected && n.isInternetReachable !== false;
      clearTimeout(t.off);
      if (!online) {
        clearTimeout(t.back);
        if (shown.current !== 'offline') t.off = setTimeout(() => show('offline'), OFFLINE_AFTER_MS);
      } else if (shown.current === 'offline') {
        show('back');
        t.back = setTimeout(() => show('online'), BACK_ONLINE_MS);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(t.off);
      clearTimeout(t.back);
    };
  }, []);
  return state;
}

/**
 * Wraps the app's screens. While offline, an amber bar sits behind the status bar and pushes every
 * screen down ("Offline · changes are saved on this phone"); when the connection returns it turns
 * green ("Back online · syncing") for a moment, then goes and the screens move back up. The screens
 * below get no top inset while it shows, so nothing is padded twice or covered.
 */
export function OfflineFrame({ children }: { children: ReactNode }) {
  const real = useSafeAreaInsets();
  const state = useConnection();
  const visible = state !== 'online';
  const offline = state === 'offline';
  const { theme } = useUniwind();
  const pathname = usePathname();
  const [warningFg, successFg] = useThemeColors(['warning-fg', 'success-fg'] as const);
  const ink = offline ? warningFg : successFg;

  useEffect(() => {
    topCovered = visible;
    applyUniwindInsets();
  }, [visible]);

  // The bar owns the status bar while it shows: icons readable on its soft tint. Screens set their own
  // style on mount, so this runs again after every navigation (a parent's effect runs after its child's).
  useEffect(() => {
    if (visible) setStatusBarStyle(theme === 'dark' ? 'light' : 'dark');
  }, [visible, theme, pathname]);

  return (
    <View style={{ flex: 1 }}>
      {visible ? (
        <Animated.View
          entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
          className={offline ? 'bg-warning-soft' : 'bg-success-soft'}
          style={{ paddingTop: real.top }}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite">
          <View className="h-8 flex-row items-center justify-center gap-2 px-4">
            <Icon name={offline ? 'ms:cloud_off' : 'ms:cloud_done'} size={16} color={ink} />
            <Text variant="small" weight="medium" style={{ color: ink }}>
              {offline ? 'Offline' : 'Back online'}
            </Text>
            <Text variant="small" style={{ color: ink }} numberOfLines={1}>
              {offline ? 'Changes are saved on this phone' : 'Syncing'}
            </Text>
          </View>
        </Animated.View>
      ) : null}
      <SafeAreaInsetsContext.Provider value={visible ? { ...real, top: 0 } : real}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

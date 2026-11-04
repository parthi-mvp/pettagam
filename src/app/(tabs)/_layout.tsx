import { router, Tabs } from 'expo-router';
import { useEffect, useRef, type ComponentProps } from 'react';
import { BackHandler, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Icon, type IconName } from '@/components/icons';
import { QuickAddSheet } from '@/components/quick-add-sheet';
import { PressableScale, Text, type SheetRef } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useThemeColors } from '@/theme/useThemeColor';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'transactions', label: 'Activity', icon: 'list' },
  { name: 'investments', label: 'Invest', icon: 'trend' },
  { name: 'more', label: 'More', icon: 'more' },
];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Rounded bar, icon + label per tab, and a raised round add button in the middle that bumps above the top edge. */
function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const quickAdd = useRef<SheetRef>(null);
  const [onPrimary, muted, fg] = useThemeColors(['on-primary', 'fg-muted', 'fg'] as const);
  const items = state.routes;
  const current = state.routes[state.index]?.name ?? '';
  const tab = (route: (typeof items)[number], i: number) => {
    const t = TABS.find((x) => x.name === route.name);
    if (!t) return null;
    const active = current === route.name;
    return (
      <PressableScale
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t.label}
        scaleTo={0.94}
        onPress={() => {
          if (!active) haptic.selection();
          navigateToTab(route.key);
        }}
        className="flex-1 items-center justify-center gap-1 py-2">
        <Icon name={t.icon} size={22} color={active ? fg : muted} strokeWidth={active ? 2.1 : 1.7} />
        <Text variant="caption" weight={active ? 'medium' : 'regular'} tone={active ? 'default' : 'muted'}>{t.label}</Text>
      </PressableScale>
    );
  };
  return (
    <View className="absolute inset-x-0 bottom-0 px-4" style={{ paddingBottom: Math.max(insets.bottom, 10) }} pointerEvents="box-none">
      <View className="h-[66px] flex-row items-center rounded-[26px] border border-line bg-surface px-1 shadow-float dark:shadow-none">
        {items.slice(0, 2).map(tab)}
        <View className="w-[76px]" />
        {items.slice(2).map(tab)}
      </View>
      {/* Raised add button: a thick canvas-coloured ring fakes the notch cut out of the bar. */}
      <View className="absolute inset-x-0 -top-6 items-center" pointerEvents="box-none">
        <View className="rounded-full border-[5px] border-canvas">
          <PressableScale
            accessibilityLabel="Add"
            scaleTo={0.94}
            haptic="light"
            onPress={() => quickAdd.current?.present()}
            className="h-14 w-14 items-center justify-center rounded-full bg-primary shadow-primary dark:shadow-none">
            <Icon name="plus" size={26} color={onPrimary} strokeWidth={2.2} />
          </PressableScale>
        </View>
        <Text variant="caption" weight="medium" className="mt-1">Add</Text>
      </View>
      <QuickAddSheet ref={quickAdd} />
    </View>
  );
}

/** Android: with nothing left to go back to, the first back press warns and a second within 2 s closes the app. */
function useDoubleBackToExit() {
  useEffect(() => {
    let last = 0;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false; // a pushed screen or another tab: normal back
      if (Date.now() - last < 2000) return false; // second press: let Android close the app
      last = Date.now();
      haptic.light();
      toast.info('Press back again to exit', { duration: 2000 });
      return true;
    });
    return () => sub.remove();
  }, []);
}

export default function TabsLayout() {
  useDoubleBackToExit();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

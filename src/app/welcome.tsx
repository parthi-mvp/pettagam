import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChestMark, Icon, type IconName } from '@/components/icons';
import { HeroBackdrop, PressableScale, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useWelcomeSeen } from '@/onboarding/welcome-seen';
import { useThemeColors } from '@/theme/useThemeColor';

type Slide = { title: string; body: string; art: ReactNode };

/** First launch: what Pettagam is, in four swipes, then straight in (no account). Shown once per install. */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const markSeen = useWelcomeSeen((s) => s.markSeen);
  const listRef = useRef<Animated.ScrollView>(null);
  const x = useSharedValue(0);
  const [page, setPage] = useState(0);
  const [heroInk, accent] = useThemeColors(['hero', 'brass'] as const);

  const slides: Slide[] = [
    {
      title: 'Your money,\none strongbox',
      body: 'Bank accounts, cards, cash, chits, FDs and gold, all in one calm place.',
      art: <StrongboxArt />,
    },
    {
      title: 'Spends fill\nthemselves in',
      body: 'Pettagam reads your bank SMS on the phone and adds each spend with its category. You just check and save.',
      art: <SmsArt />,
    },
    {
      title: 'Know what’s due,\nbefore it’s due',
      body: 'Card bills, FD maturities and chit instalments, always a step ahead.',
      art: <DuesArt />,
    },
    {
      title: 'Private\nby design',
      body: 'No account, no server. Your data stays on your phone, backed up only to your own Google Drive if you choose.',
      art: <PrivateArt />,
    },
  ];
  const last = page === slides.length - 1;

  const onScroll = useAnimatedScrollHandler((e) => {
    x.set(e.contentOffset.x);
  });

  const goTo = (i: number) => listRef.current?.scrollTo({ x: i * width, animated: true });
  // Marking it seen swaps the welcome stack for the app (Routes); Home then opens Backup for "restore".
  const finish = (restore: boolean) => {
    haptic.light();
    markSeen(restore);
  };

  return (
    <View className="flex-1 overflow-hidden bg-hero">
      <StatusBar style="light" />
      <HeroBackdrop />

      {/* Brand + skip */}
      <View className="flex-row items-center justify-between px-6" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-2.5">
          <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-white/10">
            <ChestMark size={22} color={accent} />
          </View>
          <View>
            <Text variant="heading" tone="onHero">
              Pettagam
            </Text>
            <Text variant="caption" className="font-tamil text-brass">
              பெட்டகம்
            </Text>
          </View>
        </View>
        {!last ? (
          <Pressable onPress={() => goTo(slides.length - 1)} hitSlop={12} accessibilityRole="button" className="active:opacity-60">
            <Text variant="label" className="text-on-hero-soft">
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Slides */}
      <Animated.ScrollView
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== page) haptic.selection();
          setPage(i);
        }}
        className="flex-1">
        {slides.map((s, i) => (
          <View key={i} style={{ width }} className="justify-center px-6">
            <View className="h-[260px] items-center justify-center">{s.art}</View>
            <Text
              variant="display"
              tone="onHero"
              accessibilityRole="header"
              className="mt-8 text-[30px] leading-[36px]"
              style={{ letterSpacing: -0.6 }}>
              {s.title}
            </Text>
            <Text variant="body" className="mt-3 max-w-[330px] leading-[21px] text-on-hero-muted">
              {s.body}
            </Text>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Dots + actions */}
      <View className="gap-4 px-6" style={{ paddingBottom: insets.bottom + 18 }}>
        <View className="flex-row gap-1.5" accessibilityLabel={`Page ${page + 1} of ${slides.length}`}>
          {slides.map((_, i) => (
            <Dot key={i} i={i} x={x} width={width} />
          ))}
        </View>
        <PressableScale
          haptic="light"
          accessibilityRole="button"
          onPress={() => (last ? finish(false) : goTo(page + 1))}
          className="h-12 flex-row items-center justify-center gap-2 rounded-button bg-white">
          <Text weight="semibold" className="text-xl text-hero">
            {last ? 'Get started' : 'Next'}
          </Text>
          <Icon name="arrowRight" size={18} color={heroInk} strokeWidth={2.2} />
        </PressableScale>
        <Pressable onPress={() => finish(true)} hitSlop={8} accessibilityRole="button" className="items-center py-1 active:opacity-60">
          <Text variant="label" className="text-on-hero-soft">
            Restore from Google Drive
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Page dot: stretches into a pill for the current page, following the swipe. */
function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.get() / width - i);
    return { width: interpolate(d, [0, 1], [22, 7], 'clamp'), opacity: interpolate(d, [0, 1], [1, 0.35], 'clamp') };
  });
  return <Animated.View className="h-[7px] rounded-full bg-white" style={style} />;
}

/* ---------- Slide art: small, calm compositions on frosted tiles ---------- */

function Glass({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-[18px] border border-white/10 bg-white/10 ${className ?? ''}`}>{children}</View>;
}

function Orbit({ icon, style }: { icon: IconName; style: object }) {
  return (
    <View className="absolute h-12 w-12 items-center justify-center rounded-[14px] border border-white/10 bg-white/10" style={style}>
      <Icon name={icon} size={22} color="#ffffff" />
    </View>
  );
}

function StrongboxArt() {
  const [accent] = useThemeColors(['brass'] as const);
  return (
    <View className="h-[240px] w-[240px] items-center justify-center">
      <View className="h-[124px] w-[124px] items-center justify-center rounded-full border border-white/15 bg-white/10">
        <ChestMark size={64} color={accent} />
      </View>
      <Orbit icon="bank" style={{ top: 6, left: 30 }} />
      <Orbit icon="card" style={{ top: 18, right: 16 }} />
      <Orbit icon="coin" style={{ bottom: 22, left: 6 }} />
      <Orbit icon="chit" style={{ bottom: 6, right: 40 }} />
      <Orbit icon="trend" style={{ top: 104, right: -6 }} />
    </View>
  );
}

function SmsArt() {
  const [success, accent] = useThemeColors(['hero-positive', 'brass'] as const);
  return (
    <View className="w-full max-w-[320px] gap-3">
      <Glass className="self-start px-3.5 py-3">
        <Text variant="caption" className="text-on-hero-soft">
          HDFCBK · SMS
        </Text>
        <Text variant="small" className="mt-1 text-on-hero-muted">
          Sent Rs.390.00 from A/C *9642 to CRAZY SANDWICH on 03/11/26
        </Text>
      </Glass>
      <View className="items-center">
        <Icon name="chevronDown" size={22} color={accent} strokeWidth={2.4} />
      </View>
      <Glass className="flex-row items-center gap-3 px-3.5 py-3">
        <View className="h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: '#E4572E33' }}>
          <Icon name="coffee" size={20} color="#F4A28C" />
        </View>
        <View className="min-w-0 flex-1">
          <Text weight="medium" tone="onHero">
            Crazy Sandwich
          </Text>
          <Text variant="caption" className="text-on-hero-soft">
            Food & Dining · HDFC
          </Text>
        </View>
        <Text weight="medium" tone="onHero" tabular>
          −₹390
        </Text>
        <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: success }}>
          <Icon name="check" size={12} color="#0b2422" strokeWidth={3} />
        </View>
      </Glass>
    </View>
  );
}

function DuesArt() {
  const rows: { icon: IconName; title: string; sub: string; right: string; soon?: boolean }[] = [
    { icon: 'card', title: 'ICICI Amazon card', sub: 'Bill due in 3 days', right: '₹1,999', soon: true },
    { icon: 'bank', title: 'SBI fixed deposit', sub: 'Matures 12 Dec', right: '₹1,07,200' },
    { icon: 'chit', title: 'Shriram chit', sub: 'Instalment on 5th', right: '₹5,000' },
  ];
  return (
    <Glass className="w-full max-w-[320px] px-3.5 py-1.5">
      {rows.map((r, i) => (
        <View key={r.title} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-white/10' : ''}`}>
          <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-white/10">
            <Icon name={r.icon} size={18} color="#ffffff" />
          </View>
          <View className="min-w-0 flex-1">
            <Text weight="medium" tone="onHero" numberOfLines={1}>
              {r.title}
            </Text>
            <Text variant="caption" className={r.soon ? 'text-brass' : 'text-on-hero-soft'}>
              {r.sub}
            </Text>
          </View>
          <Text weight="medium" tone="onHero" tabular>
            {r.right}
          </Text>
        </View>
      ))}
    </Glass>
  );
}

function PrivateArt() {
  const [accent] = useThemeColors(['brass'] as const);
  const points: { icon: IconName; text: string }[] = [
    { icon: 'sms', text: 'SMS read on the phone' },
    { icon: 'sync', text: 'Backed up only to your own Google Drive' },
    { icon: 'lock', text: 'Works offline' },
  ];
  return (
    <View className="items-center gap-5">
      <View className="h-[104px] w-[104px] items-center justify-center rounded-full border border-white/15 bg-white/10">
        <Icon name="lock" size={46} color={accent} strokeWidth={1.8} />
      </View>
      <View className="gap-2">
        {points.map((p) => (
          <View key={p.text} className="flex-row items-center gap-2.5">
            <Icon name={p.icon} size={16} color={accent} />
            <Text variant="small" className="text-on-hero-muted">
              {p.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

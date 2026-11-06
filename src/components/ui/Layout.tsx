import { EmptyArt, type EmptyArtKind } from '../empty-art';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';
import { tv, type VariantProps } from 'tailwind-variants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';
import { monthRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useThemeColor } from '@/theme/useThemeColor';

import { Icon, isExtraIcon, type AnyIcon } from '../icons';
import { HeroBackdrop } from './HeroBackdrop';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

// Scrolls the focused input above the keyboard (and above a sticky footer); Uniwind maps its className props.
const AwareScrollView = withUniwind(KeyboardAwareScrollView);

/** Scrollable page on `canvas`. `tab` screens have no navigation header, so they pad for the status bar. */
export function Screen({
  children,
  tab = false,
  refreshControl,
  footer,
}: {
  children: ReactNode;
  tab?: boolean;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  /** One primary action (Save), pinned to the bottom and lifted with the keyboard. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = (
    <AwareScrollView
      className="flex-1 bg-canvas"
      bottomOffset={footer ? FOOTER_SPACE : 24}
      contentInsetAdjustmentBehavior={tab ? 'never' : 'automatic'}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      contentContainerClassName={cn('gap-card px-gutter', footer ? 'pb-6' : 'pb-[110px]')}
      contentContainerStyle={{ paddingTop: tab ? insets.top + 12 : 16 }}>
      {children}
    </AwareScrollView>
  );
  if (footer) return <FooterScreen footer={footer}>{scroll}</FooterScreen>;
  if (!tab) return scroll;
  // Tab screens have no header: a canvas strip under the status bar keeps scrolled content from showing through it.
  return (
    <View className="flex-1 bg-canvas">
      {scroll}
      <View pointerEvents="none" className="absolute inset-x-0 top-0 pt-safe bg-canvas" />
    </View>
  );
}

/** Room kept between a focused input and the keyboard when a sticky footer sits on top of it. */
const FOOTER_SPACE = 96;

function FooterScreen({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <View className="flex-1 bg-canvas">
      {children}
      <StickyFooter>{footer}</StickyFooter>
    </View>
  );
}

/** Bottom action bar: hairline on top, clear of the home indicator, riding on the keyboard when it's up. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    // Opened: drop by the bottom inset, which the keyboard already covers, so the bar sits right on it.
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      <View className="border-t border-line bg-canvas px-gutter pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {children}
      </View>
    </KeyboardStickyView>
  );
}

/** Tab page title: a large title, an optional one-line subtitle, and actions aligned to the title. */
export function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 pb-1">
      <View className="shrink gap-0.5">
        <Text variant="title" accessibilityRole="header" className="text-[28px] leading-[34px]" style={{ letterSpacing: -0.6 }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children ? <View className="flex-row items-center gap-2">{children}</View> : null}
    </View>
  );
}

/** Small uppercase label over a group of rows or fields (settings, forms). */
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text variant="eyebrow" accessibilityRole="header" className="px-1">
      {children}
    </Text>
  );
}

/**
 * Section title inside a page. Optional: a colour `dot` (series key), a right-aligned `detail`
 * (a total), or a trailing link (`action` + `onAction`, "Reports ›").
 */
export function SectionTitle({
  title,
  action,
  onAction,
  detail,
  dot,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  detail?: string;
  dot?: string;
}) {
  const link = useThemeColor('primary');
  return (
    <View className="min-h-7 flex-row items-center justify-between gap-3 px-0.5">
      <View className="shrink flex-row items-center gap-2">
        {dot ? <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} /> : null}
        <Text variant="heading" accessibilityRole="header" className="text-2xl" style={{ letterSpacing: -0.2 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {detail ? (
        <Text variant="label" tone="default" tabular>
          {detail}
        </Text>
      ) : null}
      {action ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="link" className="flex-row items-center gap-0.5 active:opacity-60">
          <Text variant="small" weight="medium" tone="primary">
            {action}
          </Text>
          <Icon name="chevronRight" size={14} color={link} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * THE card: every block on the canvas is this one, so radius, surface and padding stay identical;
 * never hand-build `rounded-* bg-surface`. Pass `onPress` for a tappable card.
 *   surface — white block (default) · hero — the dark net-worth panel · brass — soft insight panel
 */
const card = tv({
  base: 'gap-2 rounded-card',
  variants: {
    variant: {
      surface: 'border border-line bg-surface',
      hero: 'overflow-hidden bg-hero shadow-raised dark:shadow-none',
      brass: 'bg-brass-soft',
    },
    /** Default 14/12pt inner padding; false for full-bleed or custom padding. */
    padded: { true: 'px-3.5 py-3' },
  },
  defaultVariants: { variant: 'surface', padded: true },
});

export type CardVariants = VariantProps<typeof card>;

export interface CardProps extends ViewProps, CardVariants {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}

export function Card({ children, className, variant, padded, onPress, ...props }: CardProps) {
  const classes = cn(card({ variant, padded }), className);
  const content = variant === 'hero' ? (
    <>
      <HeroBackdrop />
      {children}
    </>
  ) : (
    children
  );
  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" className={classes} style={props.style}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View className={classes} {...props}>
      {content}
    </View>
  );
}

/**
 * A titled group of form fields. Flat by default: the fields sit straight on the page (they carry their
 * own surface and border), with room above each section. `card` puts the group on a card instead, for
 * settings pages whose rows (switches, options) have no surface of their own.
 */
export function FormSection({ title, children, card = false }: { title?: string; children: ReactNode; card?: boolean }) {
  if (!card) {
    return (
      <View className="gap-3 pt-3">
        {title ? <GroupLabel>{title}</GroupLabel> : null}
        {children}
      </View>
    );
  }
  return (
    <View className="gap-1.5">
      {title ? <GroupLabel>{title}</GroupLabel> : null}
      <Card className="gap-3">{children}</Card>
    </View>
  );
}

/** Month stepper on a soft pill: chevrons either side, the month in the middle; can't go past this month. */
export function MonthSwitcher({ offset, onChange }: { offset: number; onChange: (offset: number) => void }) {
  const [ink, subtle] = [useThemeColor('fg'), useThemeColor('fg-subtle')];
  const label = new Date(monthRange(offset).start).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const atNow = offset >= 0;
  const step = (d: number) => {
    haptic.selection();
    onChange(offset + d);
  };
  const arrow = 'h-9 w-9 items-center justify-center rounded-[10px] bg-surface shadow-card dark:bg-raised dark:shadow-none';
  return (
    <View className="h-11 flex-row items-center rounded-input bg-fill p-1">
      <PressableScale accessibilityLabel="Previous month" scaleTo={0.92} onPress={() => step(-1)} className={arrow}>
        <Icon name="chevronLeft" size={18} color={ink} strokeWidth={2.2} />
      </PressableScale>
      <View className="flex-1 items-center" accessibilityLiveRegion="polite">
        <Text variant="label" tone="default">{label}</Text>
      </View>
      <PressableScale accessibilityLabel="Next month" scaleTo={0.92} disabled={atNow} onPress={() => step(1)} className={cn(arrow, atNow && 'bg-transparent shadow-none')}>
        <Icon name="chevronRight" size={18} color={atNow ? subtle : ink} strokeWidth={2.2} />
      </PressableScale>
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px bg-line', className)} />;
}

/** An empty list: an illustration of what will be here (src/components/empty-art.tsx), a line, and the action that fills it. */
export function Empty({ text, action, art }: { text: string; action?: ReactNode; art?: EmptyArtKind }) {
  return (
    <Card className="items-center gap-4 py-8">
      {art ? <EmptyArt kind={art} /> : null}
      <Text variant="muted" className="text-center">
        {text}
      </Text>
      {action}
    </Card>
  );
}

/** 44px tinted tile holding a 22px line icon (list rows, dues, the SMS card). */
/** Icon on a soft square. `color` (a category's own colour) overrides the tone: icon in it, tile a 13% tint. */
export function IconTile({ icon, tone = 'vault', color, size = 36 }: { icon: AnyIcon; tone?: 'vault' | 'brass'; color?: string; size?: number }) {
  const ink = useThemeColor(tone === 'brass' ? 'brass-fg' : 'primary');
  return (
    <View
      className={cn('items-center justify-center', !color && (tone === 'brass' ? 'bg-brass-soft' : 'bg-primary-soft'))}
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: color ? `${color}22` : undefined }}>
      {/* Category icons (Material Symbols, emoji) sit a step bigger: their glyphs carry their own padding. */}
      <Icon name={icon} size={Math.round(size * (isExtraIcon(icon) ? 0.58 : 0.47))} color={color ?? ink} />
    </View>
  );
}

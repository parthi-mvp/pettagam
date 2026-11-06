import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useThemeColor } from '@/theme/useThemeColor';

import { Icon, type AnyIcon } from '../icons';
import { IconTile } from './Layout';
import { Amount, Text } from './Text';

/** List row: icon tile (or colour dot), title + subtitle, amount on the right. */
export function Row({
  title,
  subtitle,
  subtitleColor,
  right,
  rightColor,
  rightSub,
  rightSubColor,
  onPress,
  dot,
  icon,
  iconTone,
  iconColor,
  leading,
}: {
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  right?: string;
  rightColor?: string;
  rightSub?: string | null;
  rightSubColor?: string;
  onPress?: () => void;
  dot?: string | null;
  icon?: AnyIcon;
  iconTone?: 'vault' | 'brass';
  /** A category's own colour for the icon tile. */
  iconColor?: string;
  /** Replaces the icon tile (e.g. a bank logo). */
  leading?: ReactNode;
}) {
  const chevron = useThemeColor('fg-subtle');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 rounded-input py-2.5 active:bg-fill">
      {leading ? (
        leading
      ) : icon ? (
        <IconTile icon={icon} tone={iconTone} color={iconColor} />
      ) : dot ? (
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
      ) : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text weight="medium" className="text-lg" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" weight={subtitleColor ? 'medium' : 'regular'} style={subtitleColor ? { color: subtitleColor } : undefined} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-0.5">
        {right ? <Amount size={14} style={rightColor ? { color: rightColor } : undefined}>{right}</Amount> : null}
        {rightSub ? (
          <Text variant="small" tabular style={rightSubColor ? { color: rightSubColor } : undefined}>
            {rightSub}
          </Text>
        ) : null}
      </View>
      {/* Navigation rows (tappable, nothing on the right) get a chevron. */}
      {onPress && !right && !rightSub ? <Icon name="chevronRight" size={18} color={chevron} /> : null}
    </Pressable>
  );
}

/** Horizontal share bar (category breakdown, allocation). */
export function ShareBar({ label, value, max, color, right }: { label: string; value: number; max: number; color: string; right: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <View className="gap-1.5">
      <View className="flex-row justify-between gap-2">
        <Text weight="medium" className="shrink text-base" numberOfLines={1}>
          {label}
        </Text>
        <Amount size={14}>{right}</Amount>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-fill">
        <View className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text variant="small">{label}</Text>
      <Amount size={17} style={color ? { color } : undefined}>
        {value}
      </Amount>
    </View>
  );
}

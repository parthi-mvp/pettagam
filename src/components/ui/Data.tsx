import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/theme/useThemeColor';

import { Icon, type IconName } from '../icons';
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
  icon?: IconName;
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

/** Grouped vertical bars: income vs expense per month. */
export function MonthBars({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const H = 140;
  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-2" style={{ height: H }}>
        {data.map((d) => (
          <View key={d.label} className="flex-1 flex-row items-end justify-center gap-[3px]">
            <View className="w-2.5 rounded-[3px] bg-success" style={{ height: Math.max(2, (d.income / max) * H) }} />
            <View className="w-2.5 rounded-[3px] bg-danger" style={{ height: Math.max(2, (d.expense / max) * H) }} />
          </View>
        ))}
      </View>
      <View className="flex-row gap-2">
        {data.map((d) => (
          <Text key={d.label} variant="small" className="flex-1 text-center text-xs">
            {d.label}
          </Text>
        ))}
      </View>
      <View className="flex-row justify-center gap-4">
        <Legend className="bg-success" label="Income (+)" />
        <Legend className="bg-danger" label="Expense (−)" />
      </View>
    </View>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('h-2.5 w-2.5 rounded-[2px]', className)} />
      <Text variant="small">{label}</Text>
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

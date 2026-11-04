import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** A choice in a sheet: leading tile/logo, title, optional subtitle and trailing mark; selected = tinted. */
export function OptionRow({
  leading,
  title,
  subtitle,
  active,
  trailing,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string | null;
  active?: boolean;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      className={cn('flex-row items-center gap-2.5 rounded-[12px] border px-2.5 py-2', active ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}>
      {leading}
      <View className="min-w-0 flex-1">
        <Text weight="medium" className="text-lg" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

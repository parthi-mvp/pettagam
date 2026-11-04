import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { DURATION, EASE_OUT, SPRING_SNAPPY } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

import { Icon } from '../icons';

export interface CheckboxProps {
  checked: boolean;
  /** Omit when a parent row handles the press: the box is then display-only (the row is the target). */
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Required when standalone; a row with the checkbox inside should label itself instead. */
  accessibilityLabel?: string;
  size?: number;
}

/**
 * Checkbox: a rounded square that fills with the brand colour and pops a check in when on.
 * Fill and check run off one spring, so a quick double tap reverses smoothly.
 */
export function Checkbox({ checked, onChange, disabled, accessibilityLabel, size = 22 }: CheckboxProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(checked ? 1 : 0);
  const held = useSharedValue(0);
  const [on, onInk, off, rest] = useThemeColors(['primary', 'on-primary', 'border-strong', 'surface'] as const);

  // Follows `checked` from outside too (select all, a reset), not only taps.
  useEffect(() => {
    progress.set(reduceMotion ? withTiming(checked ? 1 : 0, { duration: 0 }) : withSpring(checked ? 1 : 0, SPRING_SNAPPY));
  }, [checked, reduceMotion, progress]);

  const box = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      backgroundColor: interpolateColor(p, [0, 1], [rest, on]),
      borderColor: interpolateColor(p, [0, 1], [off, on]),
      transform: [{ scale: 1 - held.get() * 0.08 }],
    };
  });
  // The check scales up from 0.5 (never from nothing) as it fades in.
  const mark = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: p, transform: [{ scale: 0.5 + p * 0.5 }] };
  });

  const visual = (
    <Animated.View
      className="items-center justify-center"
      style={[{ width: size, height: size, borderRadius: size * 0.3, borderWidth: 1.5, opacity: disabled ? 0.45 : 1 }, box]}>
      <Animated.View style={mark}>
        <Icon name="check" size={size * 0.68} color={onInk} strokeWidth={2.8} />
      </Animated.View>
    </Animated.View>
  );

  if (!onChange) return visual;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={10}
      onPressIn={() => {
        if (!reduceMotion) held.set(withTiming(1, { duration: DURATION.press, easing: EASE_OUT }));
      }}
      onPressOut={() => held.set(withSpring(0, SPRING_SNAPPY))}
      onPress={() => {
        haptic.selection();
        onChange(!checked);
      }}>
      {visual}
    </Pressable>
  );
}

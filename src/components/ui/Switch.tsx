import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { DURATION, EASE_OUT, SPRING_SNAPPY } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

import { Text } from './Text';

const TRACK_W = 48;
const TRACK_H = 28;
const PAD = 3;
const THUMB = TRACK_H - PAD * 2;
const STRETCH = 5; // how much the thumb widens while held
const TRAVEL = TRACK_W - THUMB - PAD * 2;

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Read by screen readers; required unless a SwitchRow labels it. */
  accessibilityLabel?: string;
}

/** The track, the thumb and their motion. Shared by Switch (standalone) and SwitchRow (whole row is the target). */
function useSwitchMotion(value: boolean) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  const held = useSharedValue(0);
  const [on, off] = useThemeColors(['primary', 'line-strong'] as const);

  // Follows `value` from outside too (a reset, a store update), not only taps.
  useEffect(() => {
    progress.set(reduceMotion ? withTiming(value ? 1 : 0, { duration: 0 }) : withSpring(value ? 1 : 0, SPRING_SNAPPY));
  }, [value, reduceMotion, progress]);

  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.get(), [0, 1], [off, on]) }));
  const thumb = useAnimatedStyle(() => {
    const p = progress.get();
    const h = held.get();
    // Held: the thumb grows toward the centre (rightward when off, leftward when on).
    return { width: THUMB + h * STRETCH, transform: [{ translateX: p * TRAVEL - p * h * STRETCH }] };
  });

  const pressIn = () => {
    if (!reduceMotion) held.set(withTiming(1, { duration: DURATION.press, easing: EASE_OUT }));
  };
  const pressOut = () => held.set(withSpring(0, SPRING_SNAPPY));
  return { track, thumb, pressIn, pressOut };
}

function Track({ track, thumb, disabled }: { track: object; thumb: object; disabled?: boolean }) {
  return (
    <Animated.View className={cn('justify-center rounded-full', disabled && 'opacity-50')} style={[{ width: TRACK_W, height: TRACK_H, padding: PAD }, track]}>
      <Animated.View
        className="rounded-full bg-white"
        style={[{ height: THUMB, boxShadow: '0 1px 3px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.08)' }, thumb]}
      />
    </Animated.View>
  );
}

const toggle = (value: boolean, onValueChange: (v: boolean) => void) => {
  haptic.selection();
  onValueChange(!value);
};

/** On/off control. Prefer SwitchRow in settings so the label is part of the tap target. */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: SwitchProps) {
  const m = useSwitchMotion(value);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPressIn={m.pressIn}
      onPressOut={m.pressOut}
      onPress={() => toggle(value, onValueChange)}>
      <Track track={m.track} thumb={m.thumb} disabled={disabled} />
    </Pressable>
  );
}

/** A setting: title and optional description on the left, the switch on the right; the whole row toggles. */
export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
}: Omit<SwitchProps, 'accessibilityLabel'> & { title: string; description?: string }) {
  const m = useSwitchMotion(value);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={title}
      accessibilityHint={description}
      disabled={disabled}
      onPressIn={m.pressIn}
      onPressOut={m.pressOut}
      onPress={() => toggle(value, onValueChange)}
      className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text weight="medium">{title}</Text>
        {description ? <Text variant="small">{description}</Text> : null}
      </View>
      <Track track={m.track} thumb={m.thumb} disabled={disabled} />
    </Pressable>
  );
}

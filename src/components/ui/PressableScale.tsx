import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { type HapticKind, haptic } from '@/lib/haptics';
import { DURATION, EASE_OUT, SPRING_SNAPPY } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'children' | 'style'> {
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** How far it sinks while held: 0.97 buttons and rows, 0.94 small icon buttons. */
  scaleTo?: number;
  /** Optional haptic on press — reserve for meaningful moments (lib/haptics). */
  haptic?: HapticKind;
}

/**
 * The one pressable surface. It sinks slightly while held (quick ease-out in, a spring back) so
 * every tap feels heard; with Reduce Motion on it dims instead of scaling.
 */
export function PressableScale({
  children,
  className,
  style: baseStyle,
  scaleTo = 0.97,
  haptic: hapticKind,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => {
    const p = pressed.get();
    return reduceMotion ? { opacity: 1 - p * 0.35 } : { transform: [{ scale: 1 - p * (1 - scaleTo) }] };
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      className={className}
      style={[baseStyle, style]}
      onPressIn={(e: GestureResponderEvent) => {
        pressed.set(withTiming(1, { duration: DURATION.press, easing: EASE_OUT }));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        pressed.set(withSpring(0, SPRING_SNAPPY));
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (hapticKind) haptic[hapticKind]();
        onPress?.(e);
      }}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

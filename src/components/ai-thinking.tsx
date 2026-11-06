import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useThemeColors } from '@/theme/useThemeColor';

import { Icon } from './icons';
import { Text } from './ui';

// Keyframe loops (Reanimated CSS animations): they run on the UI thread, so they keep moving while the
// app waits on the network. Opacity and a 3px lift only: no layout work per frame.
const BOUNCE = {
  '0%': { opacity: 0.35, transform: [{ translateY: 0 }] },
  '40%': { opacity: 1, transform: [{ translateY: -3 }] },
  '80%': { opacity: 0.35, transform: [{ translateY: 0 }] },
  '100%': { opacity: 0.35, transform: [{ translateY: 0 }] },
};
const SHIMMER = { '0%': { opacity: 0.35 }, '50%': { opacity: 0.8 }, '100%': { opacity: 0.35 } };

/**
 * "AI is thinking": a bulb, the label, three dots bouncing in turn and, with `chips`, placeholder chips
 * shimmering where the answers will land. Reduced motion: the same row, still.
 */
export function AiThinking({ label = 'AI is thinking', chips = 0 }: { label?: string; chips?: number }) {
  const reduced = useReducedMotion();
  const [brass, soft] = useThemeColors(['brass-fg', 'primary-soft'] as const);
  return (
    <View className="flex-row flex-wrap items-center gap-2" accessibilityRole="progressbar" accessibilityLabel={label}>
      <Icon name="bulb" size={13} color={brass} strokeWidth={2.4} />
      <Text variant="caption" weight="medium" style={{ color: brass }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-[3px]">
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              { width: 4, height: 4, borderRadius: 2, backgroundColor: brass },
              reduced
                ? { opacity: 0.6 }
                : { animationName: BOUNCE, animationDuration: 900, animationDelay: i * 150, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
            ]}
          />
        ))}
      </View>
      {Array.from({ length: chips }, (_, i) => (
        <Animated.View
          key={`chip-${i}`}
          style={[
            { height: 28, width: 64 + i * 18, borderRadius: 10, backgroundColor: soft },
            reduced
              ? { opacity: 0.6 }
              : { animationName: SHIMMER, animationDuration: 1100, animationDelay: i * 180, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
          ]}
        />
      ))}
    </View>
  );
}

import { router } from 'expo-router';

import { useThemeColor } from '@/theme/useThemeColor';

import { Icon } from '../icons';
import { PressableScale } from './PressableScale';

/**
 * The app's one back button: a round button with a chevron. `surface` sits on the canvas
 * (every stack header uses it via the root layout); `hero` is the frosted one on hero headers.
 */
export function BackButton({ tone = 'surface', onPress }: { tone?: 'surface' | 'hero'; onPress?: () => void }) {
  const [fg, onHero] = [useThemeColor('fg'), useThemeColor('on-hero')];
  return (
    <PressableScale
      accessibilityLabel="Back"
      scaleTo={0.92}
      haptic="selection"
      hitSlop={6}
      onPress={onPress ?? (() => router.back())}
      className={tone === 'hero' ? 'h-10 w-10 items-center justify-center rounded-full bg-white/15' : 'h-10 w-10 items-center justify-center rounded-full bg-fill'}>
      <Icon name="chevronLeft" size={20} color={tone === 'hero' ? onHero : fg} strokeWidth={2.2} />
    </PressableScale>
  );
}

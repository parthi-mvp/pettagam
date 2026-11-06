import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useThemeColors } from '@/theme/useThemeColor';

/**
 * The hero surface (Home net worth, Investments, the add-transaction header):
 *  - a quiet gradient from the lighter hero tone at the top to the deep one at the bottom;
 *  - a kolam-style dot grid that is clearest in the top-right corner and fades out;
 *  - three thin accent rings in that corner (the "strongbox" motif).
 * Theme tokens throughout, so each colour theme gets its own. Parent must be overflow-hidden.
 */
export function HeroBackdrop({ colors }: { colors?: readonly [light: string, mid: string, deep: string] } = {}) {
  const [themeLight, themeMid, themeDeep, accent] = useThemeColors(['hero-tile', 'hero-top', 'hero', 'brass'] as const);
  // `colors` swaps the gradient (e.g. green for income); otherwise the colour theme's own.
  const [light, mid, deep] = colors ?? [themeLight, themeMid, themeDeep];
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    // The wrapper takes the parent's full size; the Svg fills the wrapper. (An absolutely-filled
    // Svg with its own 100% size measured short on Android and clipped the pattern partway down.)
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`base${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={light} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={deep} />
          </LinearGradient>
          <Pattern id={`dots${id}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <Circle cx="8" cy="8" r="1.4" fill="#ffffff" />
          </Pattern>
          <RadialGradient id={`fade${id}`} cx="1" cy="0" r="1.2">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="0.8" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`mask${id}`}>
            <Rect width="100%" height="100%" fill={`url(#fade${id})`} />
          </Mask>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#base${id})`} />
        <Rect width="100%" height="100%" fill={`url(#dots${id})`} opacity={0.22} mask={`url(#mask${id})`} />
        <Circle cx="100%" cy="0" r="190" fill="none" stroke={accent} strokeOpacity={0.16} strokeWidth={1.5} />
        <Circle cx="100%" cy="0" r="135" fill="none" stroke={accent} strokeOpacity={0.26} strokeWidth={1.5} />
        <Circle cx="100%" cy="0" r="80" fill="none" stroke={accent} strokeOpacity={0.38} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

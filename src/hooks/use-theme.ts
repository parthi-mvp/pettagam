import { useThemeColors } from '@/theme/useThemeColor';

const ORDER = [
  'canvas',
  'surface',
  'primary-soft',
  'line',
  'fill',
  'fg',
  'fg-muted',
  'primary',
  'primary-pressed',
  'primary-mid',
  'primary-fg',
  'on-primary',
  'brass',
  'brass-soft',
  'brass-fg',
  'brass-deep',
  'on-brass',
  'hero',
  'on-hero',
  'on-hero-muted',
  'hero-positive',
  'hero-negative',
  'success',
  'danger',
  'warning',
] as const;

/**
 * Colour strings for code that styles with `style={...}` (StyleSheet, react-native-svg).
 * Reads the tokens from `src/global.css` through Uniwind, so it follows the same light/dark
 * switch as `className`. Prefer className (`bg-surface`, `text-fg-muted`) in new code.
 */
export function useTheme() {
  const [
    canvas,
    surface,
    primarySoft,
    line,
    fill,
    fg,
    fgMuted,
    primary,
    primaryPressed,
    primaryMid,
    primaryFg,
    onPrimary,
    brass,
    brassSoft,
    brassFg,
    brassDeep,
    onBrass,
    hero,
    onHero,
    onHeroMuted,
    heroPositive,
    heroNegative,
    success,
    danger,
    warning,
  ] = useThemeColors(ORDER);
  return {
    background: canvas,
    card: surface,
    backgroundElement: surface,
    backgroundSelected: primarySoft,
    border: line,
    track: fill,
    text: fg,
    textSecondary: fgMuted,
    tint: primary,
    tintStrong: primaryPressed,
    tintMid: primaryMid,
    tintInk: primaryFg,
    onTint: onPrimary,
    brass,
    brassSoft,
    brassInk: brassFg,
    brassDeep,
    onBrass,
    hero,
    onHero,
    onHeroMuted,
    heroPositive,
    heroNegative,
    success,
    danger,
    warning,
  };
}

export type Theme = ReturnType<typeof useTheme>;

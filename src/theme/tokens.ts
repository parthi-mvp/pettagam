/**
 * Design-token catalogue — names only, never values.
 *
 * Values live in `src/global.css` (light + dark). This list mirrors the names so TypeScript can
 * check the few places a token is read from JS (`useThemeColor` for navigation, native modules,
 * charts). In className strings use the token directly: `bg-surface`, `text-fg-muted`,
 * `accent-primary` for RN colour props.
 */
export const COLOR_TOKENS = [
  'canvas',
  'surface',
  'raised',
  'sheet',
  'fill',
  'line',
  'line-strong',
  'border-strong',
  'focus',
  'fg',
  'fg-muted',
  'fg-subtle',
  'primary',
  'primary-pressed',
  'primary-mid',
  'primary-soft',
  'primary-fg',
  'on-primary',
  'brass',
  'brass-soft',
  'brass-fg',
  'brass-deep',
  'on-brass',
  'hero',
  'hero-top',
  'hero-tile',
  'on-hero',
  'on-hero-muted',
  'on-hero-soft',
  'hero-positive',
  'hero-negative',
  'success',
  'success-soft',
  'success-fg',
  'danger',
  'danger-soft',
  'danger-fg',
  'warning',
  'warning-soft',
  'warning-fg',
  'scrim',
  'white',
  'black',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Token name → CSS variable name (e.g. "fg-muted" → "--color-fg-muted"). */
export const colorVar = (token: ColorToken): `--color-${ColorToken}` => `--color-${token}`;

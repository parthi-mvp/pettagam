import { Easing, type WithSpringConfig } from 'react-native-reanimated';

/**
 * Motion — the JS mirror of `--ease-out-strong` in `src/global.css`.
 * Design system: 180–240ms ease-out; nothing celebratory on spending.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export const DURATION = {
  press: 120,
  release: 220,
  enter: 220,
  stagger: 40,
  sheet: 240,
} as const;

/** Small UI responding to a tap (chips, toggles, press release): one settle, no wobble. */
export const SPRING_SNAPPY: WithSpringConfig = { damping: 24, stiffness: 320, mass: 0.8 };
/** Larger surfaces settling into place. */
export const SPRING_SOFT: WithSpringConfig = { damping: 26, stiffness: 260, mass: 0.9 };

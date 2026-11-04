import { Uniwind, useCSSVariable } from 'uniwind';

import { type ColorToken, colorVar } from './tokens';

/**
 * Resolve a design token to its current string value (reactive — re-renders on theme change).
 * Use ONLY where a plain colour string is unavoidable: icons drawn with react-native-svg,
 * native module configs (TrueSheet, toasts), the navigation theme.
 * Everything that takes `className` uses the token in the class string instead.
 */
export function useThemeColor(token: ColorToken): string {
  return useCSSVariable(colorVar(token)) as string;
}

/** Reactive multi-token read, values in the same order as `tokens`. */
export function useThemeColors<const T extends readonly ColorToken[]>(tokens: T): { [K in keyof T]: string } {
  return useCSSVariable(tokens.map(colorVar)) as { [K in keyof T]: string };
}

/** Non-reactive one-shot read for event handlers and utilities outside render. */
export function getThemeColor(token: ColorToken): string {
  return Uniwind.getCSSVariable(colorVar(token)) as string;
}

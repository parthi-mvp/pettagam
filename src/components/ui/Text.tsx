import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/lib/cn';

/**
 * Typography. Pick a `variant` for size + weight and a `tone` for colour; never set a font or a
 * colour by hand. `tabular` lines digits up in columns (money, counters).
 *
 *   display 32 Fraunces · title 24 bold · heading 15 semibold · body 14
 *   muted 13 · label 13 semibold · small 12 · caption 11
 *   eyebrow 11 — UPPERCASE letterspaced section header ("OR", "TIP")
 *
 * Sizes are the design-system values (see the scale note in global.css).
 */
const text = tv(
  {
    base: 'font-regular text-fg',
    variants: {
      variant: {
        display: 'font-display text-6xl leading-9',
        title: 'font-semibold text-5xl',
        heading: 'font-medium text-xl',
        body: 'font-regular text-lg',
        muted: 'font-regular text-base text-fg-muted',
        label: 'font-medium text-base text-fg-muted',
        small: 'font-regular text-sm text-fg-muted',
        caption: 'font-regular text-xs text-fg-muted',
        eyebrow: 'font-medium text-xs uppercase text-fg-subtle',
      },
      weight: {
        regular: 'font-regular',
        medium: 'font-medium',
        semibold: 'font-semibold',
        bold: 'font-bold',
        extrabold: 'font-extrabold',
      },
      tone: {
        default: 'text-fg',
        muted: 'text-fg-muted',
        subtle: 'text-fg-subtle',
        primary: 'text-primary',
        success: 'text-success',
        danger: 'text-danger',
        warning: 'text-warning',
        brass: 'text-brass-fg',
        onPrimary: 'text-on-primary',
        onHero: 'text-on-hero',
      },
      align: {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
      },
    },
    defaultVariants: { variant: 'body' },
  },
  { twMerge: false }, // cn() below merges, with our font-family config
);

const TRACKING: Partial<Record<NonNullable<TextVariants['variant']>, TextStyle>> = {
  display: { letterSpacing: -0.6 },
  eyebrow: { letterSpacing: 0.9 },
};

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export type TextVariants = VariantProps<typeof text>;

export interface AppTextProps extends TextProps, TextVariants {
  /** Fixed-width digits, for figures that sit in a column or change while you watch. */
  tabular?: boolean;
}

export function Text({ className, variant, weight, tone, align, tabular, style, ...props }: AppTextProps) {
  const tracking = variant ? TRACKING[variant] : undefined;
  return (
    <RNText
      className={cn(text({ variant, weight, tone, align }), className)}
      style={tracking || tabular ? [tracking, tabular && TABULAR, style] : style}
      {...props}
    />
  );
}

/** Money: one line, tabular figures, signed by the caller (+ / −). */
export function Amount({ size = 15, weight = 'medium', style, ...props }: AppTextProps & { size?: number }) {
  return (
    <Text numberOfLines={1} tabular weight={weight} style={[{ fontSize: size, lineHeight: Math.round(size * 1.3) }, style]} {...props} />
  );
}

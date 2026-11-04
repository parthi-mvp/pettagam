import type { ComponentRef, Ref } from 'react';
import { TextInput as RNTextInput, type TextInputProps, type TextStyle } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/theme/useThemeColor';

/**
 * Bare input: theme font, colour and placeholder. Pick a `variant` for size; wrap it in
 * `Field` (TextField.tsx) when it needs a label, border and error line.
 *
 *   body 14 medium (form fields) · amount 34 bold, centred (the big money entry)
 */
const input = tv(
  {
    base: 'py-0 font-regular text-fg',
    variants: {
      variant: {
        body: 'text-lg',
        amount: 'min-w-[60px] text-center font-semibold text-[34px] leading-[42px]',
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

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export type TextInputVariants = VariantProps<typeof input>;

export interface AppTextInputProps extends TextInputProps, TextInputVariants {
  /** React 19 passes ref as a prop; it reaches the native input through the spread below. */
  ref?: Ref<ComponentRef<typeof RNTextInput>>;
  /** Fixed-width digits; on by default for `amount`. */
  tabular?: boolean;
}

export function TextInput({ className, variant, align, tabular = variant === 'amount', style, ...props }: AppTextInputProps) {
  const placeholder = useThemeColor('fg-subtle');
  return (
    <RNTextInput
      placeholderTextColor={placeholder}
      className={cn(input({ variant, align }), className)}
      style={[props.multiline && { textAlignVertical: 'top' as const }, tabular && TABULAR, style]}
      {...props}
    />
  );
}

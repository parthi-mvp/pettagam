import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, type TextInput as RNTextInput, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { useThemeColor } from '@/theme/useThemeColor';

import { Text } from './Text';
import { TextInput, type AppTextInputProps } from './TextInput';

const box = tv({
  // Filled, not outlined: inputs sit inside cards, and an outline there reads as a box in a box.
  // The border is always 1px (transparent at rest) so focusing doesn't shift the layout.
  base: 'h-10 flex-row items-center gap-2.5 rounded-[12px] border px-3',
  variants: {
    state: {
      idle: 'border-transparent bg-fill',
      focused: 'border-primary bg-surface',
      error: 'border-danger bg-fill',
    },
    multiline: { true: 'h-auto min-h-[104px] items-stretch py-2.5' },
    compact: { true: 'h-9 rounded-[10px]' },
  },
  defaultVariants: { state: 'idle' },
});

/** Labelled input: 40px (36px compact), hairline `line-strong` border at rest; focused = primary border + soft 3px ring at 20% so it never reads heavy. */
export function Field({
  label,
  prefix,
  error,
  hint,
  compact = false,
  accessory,
  ref,
  ...props
}: AppTextInputProps & {
  label: string;
  prefix?: string;
  error?: string | null;
  /** Helper line under the field (hidden while an error shows). */
  hint?: string;
  /** Denser 48px variant (sign-in card). */
  compact?: boolean;
  /** Inside the field on the right (a show-password eye, a unit). */
  accessory?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof RNTextInput>>(null);
  // Keep our handle on the input and still pass it to a caller's ref (sign-in moves focus between fields).
  const setRef = (el: ComponentRef<typeof RNTextInput> | null) => {
    input.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const ring = useThemeColor('focus');
  const state = error ? 'error' : focused ? 'focused' : 'idle';
  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      {/* The whole box focuses the input, not just the line of text in its middle. */}
      <Pressable
        onPress={() => input.current?.focus()}
        disabled={props.editable === false}
        accessible={false}
        className={box({ state, multiline: !!props.multiline, compact })}
        style={state === 'focused' ? { boxShadow: `0 0 0 3px ${ring}33` } : undefined}>
        {prefix ? (
          <>
            <Text weight="medium" tone="muted">{prefix}</Text>
            <View className="h-6 w-px bg-line" />
          </>
        ) : null}
        <TextInput
          {...props}
          ref={setRef}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className="min-w-0 flex-1"
          // Text area: fills the box and grows with the text instead of sitting on one line at the top.
          style={props.multiline ? { minHeight: 84, maxHeight: 220 } : undefined}
          scrollEnabled={props.multiline ? true : undefined}
        />
        {accessory}
      </Pressable>
      {error ? (
        <Text variant="small" weight="medium" tone="danger">{error}</Text>
      ) : hint ? (
        <Text variant="caption" tone="subtle">{hint}</Text>
      ) : null}
    </View>
  );
}

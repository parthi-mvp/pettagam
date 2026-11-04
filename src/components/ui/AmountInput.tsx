import { useRef, type ComponentRef } from 'react';
import { Pressable, TextInput as RNTextInput } from 'react-native';

import { useThemeColors } from '@/theme/useThemeColor';

import { Text } from './Text';
import { TextInput } from './TextInput';

/**
 * The big ₹ amount entry (transaction, investment, budget). No real placeholder: Android draws
 * the caret in the middle of a centred placeholder. The input sizes to its own text (caret right
 * after ₹) and a ghost 0 follows it until the first digit; the whole row focuses the input.
 * `hero` = white on the dark hero header.
 */
export function AmountInput({
  value,
  onChangeText,
  tone = 'surface',
  autoFocus,
  editable = true,
  accessibilityLabel = 'Amount in rupees',
}: {
  value: string;
  onChangeText: (v: string) => void;
  tone?: 'surface' | 'hero';
  autoFocus?: boolean;
  editable?: boolean;
  accessibilityLabel?: string;
}) {
  const ref = useRef<ComponentRef<typeof RNTextInput>>(null);
  const [onHero, onHeroSoft] = useThemeColors(['on-hero', 'on-hero-soft'] as const);
  const hero = tone === 'hero';
  const size = hero ? 'text-[44px] leading-[54px]' : 'text-[34px] leading-[42px]';
  return (
    <Pressable onPress={() => ref.current?.focus()} disabled={!editable} hitSlop={12} className="flex-row items-center justify-center self-center">
      <Text
        weight="medium"
        tone={hero ? undefined : value ? 'default' : 'subtle'}
        className={hero ? 'mr-1 text-[30px]' : 'mr-1 text-[24px]'}
        style={hero ? { color: value ? onHero : onHeroSoft } : undefined}>
        ₹
      </Text>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
        variant="amount"
        cursorColor={hero ? onHero : undefined}
        selectionColor={hero ? `${onHero}55` : undefined}
        className={`min-w-[8px] px-0 text-left ${hero ? `${size} text-on-hero` : ''}`}
      />
      {value ? null : (
        <Text weight="semibold" tone={hero ? undefined : 'subtle'} className={size} style={hero ? { color: `${onHeroSoft}80` } : undefined}>
          0
        </Text>
      )}
    </Pressable>
  );
}

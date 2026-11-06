import { useState } from 'react';
import { View } from 'react-native';

import { CATEGORY_COLORS } from '@/catalog/categories';
import { findSymbols, SYMBOL_COUNT } from '@/catalog/symbol-index';
import type { CategoryKind } from '@/db/types';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useThemeColor } from '@/theme/useThemeColor';

import { Icon, type AnyIcon } from './icons';
import { Field, FormSection, IconTile, PressableScale, SearchBox, SegmentedControl, Text } from './ui';

/** The last emoji typed (with its skin tone / joined parts), or null: typing 🎂 after 🐶 picks 🎂. */
export const lastEmoji = (text: string) => text.match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu)?.at(-1) ?? null;

/** One icon tile in the pickers: tinted in the category colour when picked. */
function IconChoice({ icon, label, active, color, muted, onPress }: { icon: AnyIcon; label?: string; active: boolean; color: string; muted: string; onPress: () => void }) {
  return (
    <PressableScale
      scaleTo={0.9}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label ?? icon}
      onPress={onPress}
      className={cn('h-11 w-[15%] items-center justify-center rounded-[12px] border-[1.5px]', !active && 'border-transparent bg-fill')}
      style={active ? { borderColor: color, backgroundColor: `${color}22` } : undefined}>
      <Icon name={icon} size={24} color={active ? color : muted} />
    </PressableScale>
  );
}

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export type CategoryDraft = { name: string; kind: CategoryKind; icon: AnyIcon; color: string };

/**
 * The body of a category form: live preview, name, expense/income, icon grid and colour swatches.
 * Shared by the full-page Category form and the "new category" sheet, so the two never drift apart.
 * `error` shows under the name (a duplicate, say), with an optional action next to it.
 */
export function CategoryFields({
  value,
  onChange,
  autoFocus,
  error,
  errorAction,
}: {
  value: CategoryDraft;
  onChange: (next: CategoryDraft) => void;
  autoFocus?: boolean;
  error?: string | null;
  errorAction?: React.ReactNode;
}) {
  const muted = useThemeColor('fg-muted');
  const [iconQuery, setIconQuery] = useState('');
  const found = findSymbols(iconQuery);
  const { name, kind, icon, color } = value;
  const set = (patch: Partial<CategoryDraft>) => onChange({ ...value, ...patch });
  const pick = (patch: Partial<CategoryDraft>) => {
    haptic.selection();
    set(patch);
  };

  return (
    <>
      {/* Live preview: what it will look like in lists. */}
      <View className="items-center gap-2 py-2">
        <IconTile icon={icon} color={color} size={64} />
        <Text variant="heading" tone={name.trim() ? 'default' : 'subtle'} numberOfLines={1}>
          {name.trim() || 'Category name'}
        </Text>
      </View>

      <FormSection>
        <Field label="Name" value={name} onChangeText={(t) => set({ name: t })} placeholder={kind === 'income' ? 'Side income' : 'Pets'} autoFocus={autoFocus} error={error ?? undefined} />
        {errorAction}
        <SegmentedControl options={KINDS} value={kind} onChange={(k) => set({ kind: k })} />
      </FormSection>

      <FormSection title="Icon">
        {/* One set, Material Symbols (4,000): popular money icons first, the best matches as you type. */}
        <SearchBox value={iconQuery} onChange={setIconQuery} placeholder={`Search ${SYMBOL_COUNT().toLocaleString('en-IN')} icons`} />
        <View className="flex-row flex-wrap gap-y-2" style={{ columnGap: '2%' }}>
          {found.map((s) => {
            const id = `ms:${s.name}` as const;
            return <IconChoice key={s.name} icon={id} label={s.label} active={id === icon} color={color} muted={muted} onPress={() => pick({ icon: id })} />;
          })}
        </View>
        {iconQuery.trim() && !found.length ? <Text variant="small">No icon matches “{iconQuery.trim()}”. Try another word, or use an emoji.</Text> : null}

        <Field
          label="Or an emoji"
          value={icon.startsWith('emoji:') ? icon.slice(6) : ''}
          onChangeText={(t) => {
            const e = lastEmoji(t);
            if (e) pick({ icon: `emoji:${e}` });
          }}
          placeholder="🐶 🎂 🏏"
          hint="Type or paste one from your keyboard."
        />
      </FormSection>

      <FormSection title="Colour">
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {CATEGORY_COLORS.map((c) => {
            const active = c === color;
            return (
              <PressableScale
                key={c}
                scaleTo={0.88}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Colour ${c}`}
                onPress={() => pick({ color: c })}
                className="h-11 w-[15%] items-center justify-center">
                {/* Selected: a ring in the colour around a gap, so the swatch itself stays readable. */}
                <View className="h-10 w-10 items-center justify-center rounded-full border-2" style={{ borderColor: active ? c : 'transparent' }}>
                  <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: c }}>
                    {active ? <Icon name="check" size={14} color="#ffffff" strokeWidth={2.6} /> : null}
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </FormSection>
    </>
  );
}

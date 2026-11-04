import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { CATEGORY_ICONS, categoryIcon, Icon, type IconName } from '@/components/icons';
import { Button, Field, FormSection, IconTile, PressableScale, Screen, SegmentedControl, Text } from '@/components/ui';
import { getById, listCategories, save, softDelete } from '@/db/repo';
import type { CategoryKind } from '@/db/types';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useThemeColor } from '@/theme/useThemeColor';

/** Picked to read on light and dark surfaces, as an icon and as a 13% tile tint. */
const COLORS = ['#E4572E', '#F3A712', '#7CB518', '#29BF12', '#2A9D8F', '#00A6A6', '#2E86AB', '#3D5A80', '#A846A0', '#FF5D8F', '#8D0801', '#6C584C'];

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export default function CategoryForm() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const [kind, setKind] = useState<CategoryKind>(params.kind ?? 'expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('bag');
  const [color, setColor] = useState(COLORS[0]);
  const [loaded, setLoaded] = useState(!params.id);
  const muted = useThemeColor('fg-muted');

  useEffect(() => {
    if (!params.id) return;
    getById(db, 'categories', params.id).then((c) => {
      if (!c) return;
      setKind(c.kind);
      setName(c.name);
      setIcon(categoryIcon(c.name, undefined, c.icon));
      setColor(c.color);
      setLoaded(true);
    });
  }, [db, params.id]);

  const pick = <T,>(set: (v: T) => void, v: T) => {
    haptic.selection();
    set(v);
  };

  const onSave = async () => {
    const n = name.trim();
    if (!n) return Alert.alert('Enter a name', 'e.g. "Pets", "Gifts" or "Side income"');
    const clash = (await listCategories(db)).find((c) => c.kind === kind && c.id !== params.id && c.name.toLowerCase() === n.toLowerCase());
    if (clash) return Alert.alert('Already exists', `There’s already a ${kind} category called “${clash.name}”.`);
    await save(db, 'categories', { id: params.id, name: n, kind, color, icon });
    haptic.success();
    toast.success(params.id ? 'Category saved' : `${n} added`);
    router.back();
  };

  const onDelete = () =>
    Alert.alert('Delete category?', 'Transactions already in it keep the label; it just won’t be offered for new ones.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'categories', params.id!);
          router.back();
        },
      },
    ]);

  if (!loaded) return null;

  return (
    <Screen footer={<Button size="lg" title={params.id ? 'Save changes' : 'Add category'} onPress={onSave} />}>
      <Stack.Screen options={{ title: params.id ? 'Edit category' : 'New category' }} />

      {/* Live preview: what it will look like in lists. */}
      <View className="items-center gap-2 py-2">
        <IconTile icon={icon} color={color} size={64} />
        <Text variant="heading" tone={name.trim() ? 'default' : 'subtle'} numberOfLines={1}>
          {name.trim() || 'Category name'}
        </Text>
      </View>

      <FormSection>
        <Field label="Name" value={name} onChangeText={setName} placeholder={kind === 'income' ? 'Side income' : 'Pets'} autoFocus={!params.id} />
        <SegmentedControl options={KINDS} value={kind} onChange={setKind} />
      </FormSection>

      <FormSection title="Icon">
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {CATEGORY_ICONS.map((i) => {
            const active = i === icon;
            return (
              <PressableScale
                key={i}
                scaleTo={0.9}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={i}
                onPress={() => pick(setIcon, i)}
                className={cn('h-11 w-[15%] items-center justify-center rounded-[12px] border-[1.5px]', !active && 'border-transparent bg-fill')}
                style={active ? { borderColor: color, backgroundColor: `${color}22` } : undefined}>
                <Icon name={i} size={20} color={active ? color : muted} />
              </PressableScale>
            );
          })}
        </View>
      </FormSection>

      <FormSection title="Colour">
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {COLORS.map((c) => {
            const active = c === color;
            return (
              <PressableScale
                key={c}
                scaleTo={0.88}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Colour ${c}`}
                onPress={() => pick(setColor, c)}
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

      {params.id ? (
        <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={6} className="items-center py-2.5 active:opacity-60">
          <Text variant="label" tone="danger">Delete category</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

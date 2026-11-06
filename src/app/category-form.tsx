import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { CATEGORY_COLORS } from '@/catalog/categories';
import { toast } from 'sonner-native';

import { CategoryFields } from '@/components/category-fields';
import { categoryIcon, type AnyIcon } from '@/components/icons';
import { Button, Screen, Text } from '@/components/ui';
import { getById, listCategories, save, softDelete } from '@/db/repo';
import type { CategoryKind } from '@/db/types';
import { haptic } from '@/lib/haptics';

/** Picked to read on light and dark surfaces, as an icon and as a 13% tile tint. */
const COLORS = CATEGORY_COLORS;

export default function CategoryForm() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const [kind, setKind] = useState<CategoryKind>(params.kind ?? 'expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<AnyIcon>('ms:category');
  const [color, setColor] = useState(COLORS[0]);
  const [loaded, setLoaded] = useState(!params.id);

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

      <CategoryFields
        value={{ name, kind, icon, color }}
        onChange={(d) => {
          setName(d.name);
          setKind(d.kind);
          setIcon(d.icon);
          setColor(d.color);
        }}
        autoFocus={!params.id}
      />

      {params.id ? (
        <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={6} className="items-center py-2.5 active:opacity-60">
          <Text variant="label" tone="danger">Delete category</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

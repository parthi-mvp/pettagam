import { EmptyArt } from '@/components/empty-art';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { categoryIcon } from '@/components/icons';
import { SearchBox } from '@/components/pickers';
import { Button, Card, Divider, Row, Screen, SegmentedControl, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { listCategories } from '@/db/repo';
import type { CategoryKind } from '@/db/types';

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export default function Categories() {
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const list = (categories ?? []).filter((c) => c.kind === kind && (!q || c.name.toLowerCase().includes(q)));

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push({ pathname: '/category-form', params: { kind } })} />
          ),
        }}
      />
      <SegmentedControl options={KINDS} value={kind} onChange={setKind} />
      <SearchBox value={query} onChange={setQuery} placeholder={`Search ${kind} categories`} />

      <Card className="gap-0 py-1">
        {list.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <Row
              icon={categoryIcon(c.name, undefined, c.icon)}
              iconColor={c.color}
              title={c.name}
              // Seeded categories have fixed "cat-…" ids (src/db/schema.ts).
              subtitle={c.id.startsWith('cat-') ? 'Default' : undefined}
              onPress={() => router.push({ pathname: '/category-form', params: { id: c.id } })}
            />
          </View>
        ))}
        {categories && list.length === 0 ? (
          <View className="items-center gap-3 py-4">
            <EmptyArt kind={q ? 'search' : 'tags'} />
            <Text variant="muted" className="text-center">
              {q ? `No ${kind} category matches “${query.trim()}”` : `No ${kind} categories yet.`}
            </Text>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

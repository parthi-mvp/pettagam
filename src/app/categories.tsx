import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { categoryIcon } from '@/components/icons';
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
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const list = (categories ?? []).filter((c) => c.kind === kind);

  return (
    <Screen>
      <SegmentedControl options={KINDS} value={kind} onChange={setKind} />

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
          <Text variant="muted" className="py-4 text-center">
            No {kind} categories yet.
          </Text>
        ) : null}
      </Card>

      <Button
        variant="tinted"
        icon="plus"
        title={`New ${kind} category`}
        onPress={() => router.push({ pathname: '/category-form', params: { kind } })}
      />
    </Screen>
  );
}

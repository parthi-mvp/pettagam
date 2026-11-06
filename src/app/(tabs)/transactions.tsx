import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { TxnList } from '@/components/txn-list';
import { Button, Card, Empty, FIELD_SURFACE, Header, MonthSwitcher, Screen, SegmentedControl, Stat, TextInput } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { listTransactions } from '@/db/repo';
import type { TxnType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { money, monthRange } from '@/lib/format';

type Filter = 'all' | TxnType;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Earned' },
  { value: 'transfer', label: 'Transfers' },
];

export default function Activity() {
  const t = useTheme();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { start, end } = monthRange(offset);
  const { data: rows } = useLiveQuery(
    (db) => listTransactions(db, { from: start, to: end, search: search.trim() || undefined, limit: 2000 }),
    ['transactions', 'accounts', 'categories'],
    [start, search]
  );
  const all = rows ?? [];
  const earned = all.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const spent = all.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const saved = earned - spent;
  const shown = filter === 'all' ? all : all.filter((r) => r.type === filter);

  return (
    <Screen tab>
      <Header title="Activity">
        <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push('/transaction-form')} />
      </Header>

      <MonthSwitcher offset={offset} onChange={setOffset} />

      <Card className="flex-row gap-3">
        <Stat label="Spent" value={money(spent)} />
        <Stat label="Earned" value={money(earned)} color={earned ? t.success : undefined} />
        <Stat label={saved >= 0 ? 'Saved' : 'Overspent'} value={money(Math.abs(saved))} color={saved < 0 ? t.danger : undefined} />
      </Card>

      <View className="gap-2">
        <View className={`h-10 flex-row items-center gap-2 rounded-input border px-3 ${FIELD_SURFACE}`}>
          <Icon name="search" size={17} color={t.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search merchant, note or category"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search transactions"
            className="min-w-0 flex-1"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              {/* A plus turned 45° is the clear "×". */}
              <View style={{ transform: [{ rotate: '45deg' }] }}>
                <Icon name="plus" size={18} color={t.textSecondary} strokeWidth={2} />
              </View>
            </Pressable>
          ) : null}
        </View>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {rows && shown.length === 0 ? (
        <Empty
          art={search.trim() ? 'search' : 'transactions'}
          text={search.trim() ? `Nothing matches “${search.trim()}” this month.` : filter === 'all' ? 'Nothing recorded this month yet.' : 'Nothing of this kind this month.'}
          action={!search.trim() && filter === 'all' ? <Button size="sm" icon="plus" title="Add transaction" onPress={() => router.push('/transaction-form')} /> : undefined}
        />
      ) : (
        <TxnList rows={shown} />
      )}
    </Screen>
  );
}

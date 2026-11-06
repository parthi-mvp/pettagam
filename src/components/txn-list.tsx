import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { TxnRow } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, moneyExact, tidyName } from '@/lib/format';
import { parseTags } from '@/lib/tags';

import { categoryIcon } from './icons';
import { Card, Divider, Row, Text } from './ui';

/** Transactions grouped by day: a day heading with that day's spend, then one card of rows. */
export function TxnList({ rows }: { rows: TxnRow[] }) {
  const days: { key: string; date: number; rows: TxnRow[] }[] = [];
  for (const r of rows) {
    const key = new Date(r.date).toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(r);
    else days.push({ key, date: r.date, rows: [r] });
  }
  // Read once per mount (render must stay pure); "Today" only needs day precision.
  const [now] = useState(() => Date.now());
  return (
    <View className="gap-4">
      {days.map((d) => {
        const spent = d.rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
        return (
          <View key={d.key} className="gap-1.5">
            <View className="flex-row items-baseline justify-between px-1">
              <Text variant="label">{dayLabel(d.date, now)}</Text>
              {spent > 0 ? (
                <Text variant="caption" tabular>
                  {`${moneyExact(spent)} spent`}
                </Text>
              ) : null}
            </View>
            <Card className="gap-0 py-1">
              {d.rows.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <TxnRowItem r={r} />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

function TxnRowItem({ r }: { r: TxnRow }) {
  const t = useTheme();
  const transfer = r.type === 'transfer';
  const title = transfer
    ? `${r.account_name} → ${r.to_account_name ?? '?'}`
    : tidyName(r.merchant ?? r.category_name ?? (r.type === 'income' ? 'Income' : 'Expense'));
  // Category first (what it was), then where it was paid from; the day heading carries the date.
  const tags = parseTags(r.tags).map((t) => `#${t}`);
  const subtitle = [transfer ? 'Transfer' : (r.category_name ?? 'Uncategorised'), transfer ? null : r.account_name, ...tags].filter(Boolean).join(' · ');
  return (
    <Row
      icon={categoryIcon(r.category_name, r.type, r.category_icon)}
      iconColor={transfer ? undefined : (r.category_color ?? undefined)}
      title={title}
      subtitle={subtitle}
      // Only money in is coloured: a list where every expense is red reads as a wall of warnings.
      right={`${r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}${moneyExact(r.amount)}`}
      rightColor={r.type === 'income' ? t.success : t.text}
      onPress={() => router.push({ pathname: '/transaction-form', params: { id: r.id } })}
    />
  );
}

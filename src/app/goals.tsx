import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { BudgetBar } from '@/components/budget-bar';
import { Amount, Button, Card, Empty, PressableScale, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { accountBalances } from '@/db/repo';
import type { Goal } from '@/db/types';
import { money } from '@/lib/format';
import { goalProgress } from '@/lib/goal';

const monthYear = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export default function Goals() {
  const { data: goals } = useLiveQuery((d) => d.getAllAsync<Goal>('SELECT * FROM goals WHERE deleted = 0 ORDER BY COALESCE(target_date, 9e15), name'), ['goals']);
  const { data: balances } = useLiveQuery(accountBalances, ['accounts', 'transactions']);

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <Button size="sm" variant="tinted" title="Add" onPress={() => router.push('/goal-form')} /> }} />
      {goals?.length === 0 ? (
        <Empty
          art="goals"
          text={'Save towards something: a trip, a phone, an emergency fund.\nPettagam shows how much to put aside each month.'}
          action={<Button size="sm" title="Add a goal" icon="plus" onPress={() => router.push('/goal-form')} />}
        />
      ) : null}
      {(goals ?? []).map((g) => {
        const saved = g.account_id ? (balances?.[g.account_id] ?? 0) : g.saved;
        const p = goalProgress(g.target, saved, g.target_date);
        const line = p.left === 0
          ? 'Reached'
          : p.late
            ? `${money(p.left)} to go · the date has passed`
            : p.perMonth
              ? `${money(p.perMonth)} a month to reach it by ${monthYear(g.target_date!)}`
              : `${money(p.left)} to go`;
        return (
          <PressableScale key={g.id} scaleTo={0.98} accessibilityRole="button" onPress={() => router.push({ pathname: '/goal-form', params: { id: g.id } })}>
            <Card className="gap-2.5 rounded-2xl px-3.5 py-3.5">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text tone="default" weight="medium" numberOfLines={1} className="min-w-0 flex-1">
                  {g.name}
                </Text>
                <Text variant="caption" tabular>{`${Math.round(p.share * 100)}%`}</Text>
              </View>
              <View className="flex-row items-baseline gap-1.5">
                <Amount size={20} weight="semibold">{money(p.saved)}</Amount>
                <Text variant="small" tabular>{`of ${money(g.target)}`}</Text>
              </View>
              <BudgetBar used={p.share} state={p.left === 0 ? 'ok' : p.late ? 'over' : 'ok'} />
              <Text variant="small" tone={p.late ? 'danger' : undefined} tabular>{line}</Text>
            </Card>
          </PressableScale>
        );
      })}
    </Screen>
  );
}

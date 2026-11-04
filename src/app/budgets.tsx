import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { averageSpend, budgetOverview, listBudgets, roundBudget } from '@/budget/queries';
import { BUDGET_TEXT, BudgetBar } from '@/components/budget-bar';
import { categoryIcon } from '@/components/icons';
import { Button, Card, Divider, Empty, GroupLabel, IconTile, MonthSwitcher, PressableScale, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { save } from '@/db/repo';
import { haptic } from '@/lib/haptics';
import { money, monthRange } from '@/lib/format';

export default function Budgets() {
  const db = useSQLiteContext();
  const [offset, setOffset] = useState(0);
  const { start, end } = monthRange(offset);
  const { data } = useLiveQuery((d) => budgetOverview(d, start, end), ['budgets', 'transactions', 'categories'], [start]);
  const [busy, setBusy] = useState(false);
  const current = offset === 0;

  // One tap from habits: last 3 months' average per category, rounded to a friendly number.
  const suggest = async () => {
    setBusy(true);
    try {
      const [avg, existing, cats] = await Promise.all([
        averageSpend(db, 3),
        listBudgets(db),
        db.getAllAsync<{ id: string }>("SELECT id FROM categories WHERE deleted = 0 AND kind = 'expense'"),
      ]);
      const has = new Set(existing.map((b) => b.category_id));
      let n = 0;
      if (!has.has(null) && avg.total > 0) {
        await save(db, 'budgets', { category_id: null, amount: roundBudget(avg.total) });
        n++;
      }
      for (const c of cats) {
        const a = avg.byCategory.get(c.id) ?? 0;
        if (a >= 300 && !has.has(c.id)) {
          await save(db, 'budgets', { category_id: c.id, amount: roundBudget(a) });
          n++;
        }
      }
      haptic.success();
      if (n) toast.success(`${n} budget${n === 1 ? '' : 's'} set from your last 3 months`, { description: 'Tap any of them to adjust.' });
      else toast.info('Not enough spending in the last 3 months to suggest budgets');
    } finally {
      setBusy(false);
    }
  };

  const overall = data?.overall;
  const cats = data?.categories ?? [];
  const none = data && !overall && cats.length === 0;

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push('/budget-form')} />,
        }}
      />
      <MonthSwitcher offset={offset} onChange={setOffset} />

      {none ? (
        <Empty
          text={'Set a monthly limit for all your spending, or for categories like Food and Shopping.\nPettagam shows what’s left and warns you before you go over.'}
          action={
            <View className="gap-2">
              <Button size="sm" icon="bulb" title="Suggest from my last 3 months" loading={busy} onPress={suggest} />
              <Button size="sm" variant="secondary" title="Set it myself" onPress={() => router.push('/budget-form')} />
            </View>
          }
        />
      ) : null}

      {/* Overall: the headline number is what's left (or how far over). */}
      {overall ? (
        <PressableScale scaleTo={0.99} onPress={() => router.push({ pathname: '/budget-form', params: { id: overall.budget.id } })}>
          <Card className="gap-3">
            <View className="flex-row items-baseline justify-between">
              <Text variant="label">Monthly budget</Text>
              <Text variant="small" tabular>
                {money(overall.status.spent)} of {money(overall.status.limit)}
              </Text>
            </View>
            <Text variant="display" tabular tone={overall.status.state === 'over' ? 'danger' : 'default'} className="text-[30px] leading-9">
              {overall.status.state === 'over' ? `${money(overall.status.over)} over` : `${money(overall.status.remaining)} left`}
            </Text>
            <BudgetBar used={overall.status.used} state={overall.status.state} />
            <Text variant="small">{overallLine(overall.status, current)}</Text>
          </Card>
        </PressableScale>
      ) : data && cats.length > 0 ? (
        <Button variant="tinted" icon="plus" title="Set an overall monthly budget" onPress={() => router.push({ pathname: '/budget-form', params: { overall: '1' } })} />
      ) : null}

      {cats.length > 0 ? (
        <View className="gap-1.5">
          <GroupLabel>Categories</GroupLabel>
          <Card className="gap-0 py-1">
            {cats.map((c, i) => (
              <View key={c.budget.id}>
                {i > 0 ? <Divider /> : null}
                <PressableScale
                  scaleTo={0.99}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.category!.name} budget`}
                  onPress={() => router.push({ pathname: '/budget-form', params: { id: c.budget.id } })}
                  className="gap-2 py-3">
                  <View className="flex-row items-center gap-3">
                    <IconTile icon={categoryIcon(c.category!.name, undefined, c.category!.icon)} color={c.category!.color} />
                    <View className="min-w-0 flex-1">
                      <Text weight="medium" className="text-lg" numberOfLines={1}>
                        {c.category!.name}
                      </Text>
                      <Text variant="small" tabular>
                        {money(c.status.spent)} of {money(c.status.limit)}
                      </Text>
                    </View>
                    <Text variant="label" tone={BUDGET_TEXT[c.status.state]} tabular>
                      {c.status.state === 'over' ? `${money(c.status.over)} over` : `${money(c.status.remaining)} left`}
                    </Text>
                  </View>
                  <BudgetBar used={c.status.used} state={c.status.state} thin />
                </PressableScale>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {!none && data ? (
        <Text variant="caption" align="center">
          Budgets reset on the 1st. Transfers like card bills and ATM withdrawals don’t count as spending.
        </Text>
      ) : null}
    </Screen>
  );
}

function overallLine(s: { state: string; daysLeft: number; perDay: number; projectedOver: number; over: number }, current: boolean) {
  if (!current) return s.state === 'over' ? 'This month went over budget.' : 'This month stayed within budget.';
  if (s.state === 'over') return `Over budget with ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} to go.`;
  if (s.projectedOver > 0) return `At this pace you’ll be ${money(s.projectedOver)} over by month end.`;
  return `${money(s.perDay)} a day for the next ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}.`;
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { averageSpend, listBudgets, monthSpend, roundBudget } from '@/budget/queries';
import { CategoryPicker } from '@/components/pickers';
import { AmountInput, Button, Card, FormSection, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getById, listCategories, save, softDelete } from '@/db/repo';
import type { Budget } from '@/db/types';
import { haptic } from '@/lib/haptics';
import { money, monthRange } from '@/lib/format';

/** The overall budget's value in the category picker (it has no category id). */
const OVERALL = '__overall';

export default function BudgetForm() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; categoryId?: string; overall?: string }>();
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const { data: budgets } = useLiveQuery(listBudgets, ['budgets']);
  const [existing, setExisting] = useState<Budget | null>(null);
  const [target, setTarget] = useState<string | null>(params.overall ? OVERALL : (params.categoryId ?? null));
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!params.id) return;
    getById(db, 'budgets', params.id).then((b) => {
      if (!b) return;
      setExisting(b);
      setTarget(b.category_id ?? OVERALL);
      setAmount(String(b.amount));
    });
  }, [db, params.id]);

  // Hint: what this target actually costs, so the limit is grounded in habits.
  const catId = target === OVERALL ? null : target;
  const { data: hint } = useLiveQuery(
    async (d) => {
      if (!target) return null;
      const last = monthRange(-1);
      const [lastMonth, avg] = await Promise.all([monthSpend(d, last.start, last.end), averageSpend(d, 3)]);
      return {
        last: catId === null ? lastMonth.total : (lastMonth.byCategory.get(catId) ?? 0),
        avg: catId === null ? avg.total : (avg.byCategory.get(catId) ?? 0),
      };
    },
    ['transactions'],
    [target]
  );

  const taken = new Set((budgets ?? []).filter((b) => b.id !== existing?.id).map((b) => b.category_id ?? OVERALL));
  const options = [
    ...(taken.has(OVERALL) ? [] : [{ value: OVERALL, label: 'All spending', icon: 'pie' }]),
    ...(categories ?? [])
      .filter((c) => c.kind === 'expense' && !taken.has(c.id))
      .map((c) => ({ value: c.id, label: c.name, color: c.color, icon: c.icon })),
  ];
  const targetName = target === OVERALL ? 'All spending' : (categories?.find((c) => c.id === target)?.name ?? 'Choose');
  const amt = Number(amount.replace(/,/g, '')) || 0;

  const onSave = async () => {
    if (!target) return Alert.alert('Choose what this budget is for');
    if (amt <= 0) return Alert.alert('Enter a monthly amount');
    if (taken.has(target)) return Alert.alert('Already set', `${targetName} already has a budget. Edit that one instead.`);
    await save(db, 'budgets', { id: existing?.id, category_id: catId, amount: amt });
    haptic.success();
    toast.success(`${targetName}: ${money(amt)} a month`);
    router.back();
  };

  const onRemove = () =>
    Alert.alert('Remove this budget?', 'Your spending stays; only the limit goes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'budgets', existing!.id);
          toast.info('Budget removed');
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit budget' : 'New budget' }} />

      <FormSection>
        {existing ? (
          <View className="gap-1">
            <Text variant="small">Budget for</Text>
            <Text variant="heading">{targetName}</Text>
          </View>
        ) : (
          <CategoryPicker label="Budget for" options={options} value={target} onChange={setTarget} createKind="expense" />
        )}
      </FormSection>

      <Card className="items-center gap-1 py-5">
        <Text variant="small">Monthly limit</Text>
        <AmountInput value={amount} onChangeText={setAmount} autoFocus={!params.id} accessibilityLabel="Monthly limit in rupees" />
        {hint && (hint.last > 0 || hint.avg > 0) ? (
          <View className="items-center gap-1.5 pt-1">
            <Text variant="caption" tabular>
              Last month {money(hint.last)} · 3-month average {money(hint.avg)}
            </Text>
            {hint.avg > 0 ? (
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setAmount(String(roundBudget(hint.avg)));
                }}
                hitSlop={8}
                className="rounded-chip bg-primary-soft px-3 py-1 active:opacity-70">
                <Text variant="small" weight="medium" tone="primary">
                  Use {money(roundBudget(hint.avg))}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Text variant="caption" align="center">
        Resets on the 1st of every month. You’ll see a note when you reach 80% and when you go over.
      </Text>

      <View className="gap-2">
        <Button size="lg" title={existing ? 'Save changes' : 'Set budget'} onPress={onSave} />
        {existing ? (
          <Pressable onPress={onRemove} accessibilityRole="button" className="items-center py-2.5 active:opacity-60">
            <Text variant="label" tone="danger">
              Remove budget
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccountPicker } from '@/components/pickers';
import { Button, DateField, dialog, Field, FormSection, Screen, SwitchRow, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getById, listAccounts, save, softDelete } from '@/db/repo';
import { isLiability } from '@/db/types';
import { parseDate, toInputDate } from '@/lib/format';

export default function GoalForm() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [linked, setLinked] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [add, setAdd] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    getById(db, 'goals', id).then((g) => {
      if (!g) return;
      setName(g.name);
      setTarget(String(g.target));
      setDate(g.target_date ? toInputDate(g.target_date) : '');
      setLinked(!!g.account_id);
      setAccountId(g.account_id);
      setSaved(g.saved ? String(g.saved) : '');
      setNotes(g.notes ?? '');
    });
  }, [db, id]);

  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : null);

  const onSave = async () => {
    if (!name.trim()) return dialog('Name the goal', 'e.g. "Goa trip" or "Emergency fund"');
    const t = num(target);
    if (!(t != null && t > 0 && t < 1e12)) return dialog('Enter the amount you want to save');
    const when = date ? parseDate(date) : null;
    if (date && !when) return dialog('Pick a valid date');
    if (linked && !accountId) return dialog('Pick the account you save in');
    const s = (num(saved) ?? 0) + (num(add) ?? 0);
    if (!(Math.abs(s) < 1e12)) return dialog('Enter amounts as plain numbers');
    await save(db, 'goals', {
      id,
      name: name.trim(),
      target: t,
      target_date: when,
      account_id: linked ? accountId : null,
      saved: linked ? 0 : s,
      notes: notes.trim() || null,
    });
    router.back();
  };

  const onDelete = () =>
    dialog('Delete goal?', 'Your accounts and entries stay as they are.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'goals', id!);
          router.back();
        },
      },
    ]);

  return (
    <Screen footer={<Button size="lg" title={id ? 'Save changes' : 'Add goal'} onPress={onSave} />}>
      <Stack.Screen options={{ title: id ? 'Edit goal' : 'New goal' }} />
      <FormSection>
        <Field label="Goal" value={name} onChangeText={setName} placeholder="Goa trip" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Amount" prefix="₹" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="40000" />
          </View>
          <View className="flex-1">
            <DateField label="By (optional)" value={date} onChange={setDate} />
          </View>
        </View>
      </FormSection>

      <FormSection title="Progress">
        <SwitchRow
          title="Follow an account’s balance"
          description="Saving in a separate account or RD? Progress is its balance, updated as entries come in."
          value={linked}
          onValueChange={setLinked}
        />
        {linked ? (
          <AccountPicker label="Account" accounts={(accounts ?? []).filter((a) => !isLiability(a.type))} value={accountId} onChange={setAccountId} />
        ) : (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Saved so far" prefix="₹" value={saved} onChangeText={setSaved} keyboardType="numbers-and-punctuation" placeholder="0" />
            </View>
            {id ? (
              <View className="flex-1">
                <Field label="Add now" prefix="₹" value={add} onChangeText={setAdd} keyboardType="decimal-pad" placeholder="5000" />
              </View>
            ) : null}
          </View>
        )}
      </FormSection>

      <FormSection title="Notes">
        <Field label="Anything to remember" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />
      </FormSection>

      {id ? (
        <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={6} className="items-center py-2.5 active:opacity-60">
          <Text variant="label" tone="danger">Delete goal</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

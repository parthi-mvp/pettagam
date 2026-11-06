import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { toast } from 'sonner-native';

import { TxnList } from '@/components/txn-list';
import { Button, Card, Empty, Field, FormSection, Screen, SectionTitle, ShareBar, Stat, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { listTransactions, renameTag, tagCategoryBreakdown } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { dateSpan, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { cleanTag } from '@/lib/tags';

/** One tag: what it cost in total, which categories the money went to, and every entry under it. */
export default function TagDetail() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const [newName, setNewName] = useState('');
  const { data: rows } = useLiveQuery((d) => listTransactions(d, { tag: name, limit: 5000 }), ['transactions', 'accounts', 'categories'], [name]);
  const { data: cats } = useLiveQuery((d) => tagCategoryBreakdown(d, name), ['transactions', 'categories'], [name]);

  const all = rows ?? [];
  const spent = all.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const earned = all.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const maxCat = cats?.[0]?.total ?? 0;

  const rename = async () => {
    const to = cleanTag(newName);
    if (!to || to.toLowerCase() === name.toLowerCase()) return;
    const n = await renameTag(db, name, to);
    haptic.success();
    toast.success(`Renamed on ${n} ${n === 1 ? 'entry' : 'entries'}`);
    setNewName('');
    router.setParams({ name: to });
  };

  const remove = () =>
    Alert.alert(`Remove “${name}”?`, 'The tag comes off every entry. The entries themselves stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await renameTag(db, name, null);
          toast.info(`“${name}” removed`);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: `#${name}` }} />

      {rows && all.length === 0 ? (
        <Empty text="No entries carry this tag any more." />
      ) : (
        <>
          <Card className="gap-2">
            {all.length ? <Text variant="small">{`${all.length} ${all.length === 1 ? 'entry' : 'entries'} · ${dateSpan(all[all.length - 1].date, all[0].date)}`}</Text> : null}
            <View className="flex-row gap-3">
              <Stat label="Spent" value={money(spent)} />
              {earned > 0 ? <Stat label="Received" value={money(earned)} color={t.success} /> : null}
              {earned > 0 ? <Stat label="Net cost" value={money(spent - earned)} /> : null}
            </View>
          </Card>

          {cats && cats.length > 0 ? (
            <Card className="gap-3">
              <SectionTitle title="Where it went" />
              {cats.map((c) => (
                <ShareBar key={c.name} label={c.name} value={c.total} max={maxCat} color={c.color} right={`${money(c.total)} · ${spent ? Math.round((c.total / spent) * 100) : 0}%`} />
              ))}
            </Card>
          ) : null}

          <TxnList rows={all} />
        </>
      )}

      <FormSection title="Manage tag">
        <Field label="Rename" value={newName} onChangeText={setNewName} placeholder={name} autoCorrect={false} returnKeyType="done" onSubmitEditing={rename} />
        <Button variant="secondary" title="Rename on all entries" disabled={!cleanTag(newName)} onPress={rename} />
        <Button variant="danger" title="Remove tag from all entries" onPress={remove} />
        <Text variant="caption">Renaming to a tag you already use merges the two.</Text>
      </FormSection>
    </Screen>
  );
}

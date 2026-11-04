import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { aiExplainInvestment } from '@/ai/features';
import { AiNote } from '@/components/ai-note';
import { ChitPanel } from '@/components/chit-advisor';
import { Button, Card, Chips, DateField, Divider, Field, Row, Screen, Stat, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useLiveQuery } from '@/db/events';
import { getById, listInvestmentEntries, recomputeInvested, save, softDelete } from '@/db/repo';
import { INVESTMENT_TYPE_LABELS, type InvestmentEntryKind } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { dateLabel, money, parseDate, pct, toInputDate } from '@/lib/format';
import { defaultInflowKind, fdAccruedValue, parseDetails, usesUnits, type ChitDetails, usesGrams, isFdLike } from '@/lib/invest';

const KINDS: { value: InvestmentEntryKind; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'contribution', label: 'Installment / SIP' },
  { value: 'sell', label: 'Sell / Redeem' },
  { value: 'payout', label: 'Prize / Maturity payout' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
];

export default function InvestmentDetail() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: inv } = useLiveQuery((d) => getById(d, 'investments', id), ['investments'], [id]);
  const { data: entries } = useLiveQuery((d) => listInvestmentEntries(d, id), ['investment_entries'], [id]);

  const [value, setValue] = useState('');
  const [kind, setKind] = useState<InvestmentEntryKind | null>(null);
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(() => toInputDate(Date.now()));

  if (!inv) return <Screen><Text variant="muted">Loading…</Text></Screen>;

  const gain = inv.current_value - inv.invested_amount;
  const income = (entries ?? []).filter((e) => e.kind === 'dividend' || e.kind === 'interest').reduce((s, e) => s + e.amount, 0);
  const chit = inv.type === 'chit' ? parseDetails<ChitDetails>(inv) : null;
  const activeKind = kind ?? defaultInflowKind(inv.type);
  const { id: _i, created_at: _c, updated_at: _u, deleted: _d, ...invFields } = inv;

  const updateValue = async (v: number) => {
    await save(db, 'investments', { ...invFields, id: inv.id, current_value: Math.round(v * 100) / 100 });
    setValue('');
  };

  const addEntry = async () => {
    const amt = Number(amount.replace(/,/g, ''));
    const when = parseDate(date);
    if (!amt || amt <= 0) return Alert.alert('Enter an amount');
    if (!when) return Alert.alert('Date must be DD/MM/YYYY');
    await save(db, 'investment_entries', {
      investment_id: inv.id,
      kind: activeKind,
      date: when,
      amount: amt,
      units: units ? Number(units) : null,
      note: null,
    });
    await recomputeInvested(db, inv.id);
    // Without market prices, assume value moves with money in/out; user can update it any time.
    const delta = inv.type === 'chit' ? 0 : activeKind === 'buy' || activeKind === 'contribution' ? amt : activeKind === 'sell' || activeKind === 'payout' ? -amt : 0;
    if (delta) {
      const fresh = await getById(db, 'investments', inv.id);
      if (fresh) {
        const { id: _a, created_at: _b, updated_at: _e, deleted: _f, ...rest } = fresh;
        await save(db, 'investments', { ...rest, id: fresh.id, current_value: Math.max(0, fresh.current_value + delta) });
      }
    }
    setAmount('');
    setUnits('');
  };

  const removeEntry = (entryId: string) =>
    Alert.alert('Delete entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'investment_entries', entryId);
          await recomputeInvested(db, inv.id);
        },
      },
    ]);

  const removeInvestment = () =>
    Alert.alert('Delete investment?', 'This removes it and all its entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'investments', inv.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: inv.name,
          headerRight: () => (
            <Button size="sm" variant="secondary" title="Edit" onPress={() => router.push({ pathname: '/investment-form', params: { id: inv.id } })} />
          ),
        }}
      />
      <Card>
        <Text variant="small">{[INVESTMENT_TYPE_LABELS[inv.type], inv.institution].filter(Boolean).join(' · ')}</Text>
        <Text variant="display" tabular>{money(inv.current_value)}</Text>
        {inv.type !== 'chit' ? (
          <View style={{ flexDirection: 'row', gap: Spacing.three }}>
            <Stat label="Invested" value={money(inv.invested_amount)} />
            <Stat
              label="Gain"
              value={`${money(gain)} ${inv.invested_amount > 0 ? pct((gain / inv.invested_amount) * 100) : ''}`}
              color={gain >= 0 ? t.success : t.danger}
            />
          </View>
        ) : (
          <Text variant="small">{inv.current_value > 0 ? 'Value = installments paid, until you win the prize.' : 'Prized: the pot has been paid out to you.'}</Text>
        )}
        {income > 0 ? <Text variant="small">Dividends / interest received: {money(income)}</Text> : null}
        {inv.quantity ? <Text variant="small">Holding: {inv.quantity} {usesGrams(inv.type) ? 'g' : 'units'}{inv.quantity > 0 && usesUnits(inv.type) ? ` · value per unit ${money(inv.current_value / inv.quantity, true)}` : ''}</Text> : null}
        {inv.maturity_date ? <Text variant="small">Matures {dateLabel(inv.maturity_date)}</Text> : null}
      </Card>

      <AiNote label="Explain this investment" run={() => aiExplainInvestment(inv, entries ?? [])} />

      {inv.type === 'chit' ? <ChitPanel inv={inv} entries={entries ?? []} /> : null}

      {inv.type !== 'chit' ? (
      <Card>
        <Text variant="heading">Update current value</Text>
        <Field
          label={usesUnits(inv.type) && inv.quantity ? `Total value, or price per ${usesGrams(inv.type) ? 'gram' : 'unit'} followed by "/u"` : 'Total value (₹)'}
          value={value}
          onChangeText={setValue}
          keyboardType="numbers-and-punctuation"
          placeholder={usesUnits(inv.type) ? 'e.g. 125000 or 7450/u' : 'e.g. 125000'}
        />
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Button
              size="sm"
              title="Update"
              onPress={() => {
                const perUnit = value.trim().endsWith('/u');
                const n = Number(value.replace('/u', '').replace(/,/g, ''));
                if (!n) return;
                updateValue(perUnit && inv.quantity ? n * inv.quantity : n);
              }}
            />
          </View>
          {isFdLike(inv.type) && inv.interest_rate && inv.start_date ? (
            <View style={{ flex: 1 }}>
              <Button
                size="sm"
                variant="secondary"
                title="Recalculate FD"
                onPress={() => updateValue(fdAccruedValue(inv.invested_amount, inv.interest_rate!, inv.start_date!, Date.now(), inv.maturity_date))}
              />
            </View>
          ) : null}
        </View>
      </Card>
      ) : null}

      <Card>
        <Text variant="heading">{inv.type === 'chit' ? 'Other entry (corrections)' : 'Add entry'}</Text>
        <Chips options={KINDS} value={activeKind} onChange={setKind} />
        <Field
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={chit?.installment && activeKind === 'contribution' ? String(chit.installment) : '0'}
        />
        {usesUnits(inv.type) && (activeKind === 'buy' || activeKind === 'sell') ? (
          <Field label={usesGrams(inv.type) ? 'Grams' : 'Units'} value={units} onChangeText={setUnits} keyboardType="decimal-pad" />
        ) : null}
        <DateField label="Date" value={date} onChange={setDate} />
        <Button size="sm" title="Add entry" onPress={addEntry} />
      </Card>

      <Card>
        <Text variant="heading">History</Text>
        {(entries ?? []).length === 0 ? <Text variant="muted">No entries yet.</Text> : null}
        {(entries ?? []).map((e, i) => (
          <View key={e.id}>
            {i > 0 ? <Divider /> : null}
            <Row
              title={KINDS.find((k) => k.value === e.kind)?.label ?? e.kind}
              subtitle={[dateLabel(e.date), e.units ? `${e.units} ${usesGrams(inv.type) ? 'g' : 'units'}` : null, e.note].filter(Boolean).join(' · ')}
              right={money(e.amount, true)}
              rightColor={e.kind === 'sell' || e.kind === 'payout' || e.kind === 'dividend' || e.kind === 'interest' ? t.success : t.text}
              onPress={() => removeEntry(e.id)}
            />
          </View>
        ))}
        {(entries ?? []).length > 0 ? <Text variant="small">Tap an entry to delete it.</Text> : null}
      </Card>

      <Button variant="danger" title="Delete investment" onPress={removeInvestment} />
    </Screen>
  );
}

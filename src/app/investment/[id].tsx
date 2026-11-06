import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { aiExplainInvestment } from '@/ai/features';
import { AiNote } from '@/components/ai-note';
import { ChitPanel } from '@/components/chit-advisor';
import { AccountPicker } from '@/components/pickers';
import { Button, Card, Chips, DateField, dialog, Divider, Field, Row, Screen, SegmentedControl, Stat, SwitchRow, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { deleteEntry, deleteInvestment, holdingOf, saveEntry } from '@/db/investments';
import { getById, listAccounts, listInvestmentEntries } from '@/db/repo';
import { INVESTMENT_TYPE_LABELS, type InvestmentEntry, type InvestmentEntryKind } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { dateLabel, money, parseDate, pct, toInputDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { compoundingOf, defaultInflowKind, usesGrams, usesUnits } from '@/lib/invest';
import { hasLivePrice, refreshPrices } from '@/invest/prices';

const KINDS: { value: InvestmentEntryKind; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'contribution', label: 'Installment / SIP' },
  { value: 'sell', label: 'Sell / Redeem' },
  { value: 'payout', label: 'Maturity / payout' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
];
const LABEL: Record<InvestmentEntryKind, string> = { ...Object.fromEntries(KINDS.map((k) => [k.value, k.label])), valuation: 'Value update' } as Record<InvestmentEntryKind, string>;
const MONEY_IN: InvestmentEntryKind[] = ['buy', 'contribution'];
/** Now, for event handlers (kept out of render). */
const today = () => Date.now();
const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : null);

export default function InvestmentDetail() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: inv } = useLiveQuery((d) => getById(d, 'investments', id), ['investments'], [id]);
  const { data: entries } = useLiveQuery((d) => listInvestmentEntries(d, id), ['investment_entries'], [id]);
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);

  // Value update
  const [value, setValue] = useState('');
  const [per, setPer] = useState<'unit' | 'total'>('unit');
  // Entry form (add, or edit the one tapped in History)
  const [editing, setEditing] = useState<InvestmentEntry | null>(null);
  const [kind, setKind] = useState<InvestmentEntryKind | null>(null);
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(() => toInputDate(Date.now()));
  const [linked, setLinked] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => Date.now());

  if (!inv) return <Screen><Text variant="muted">Loading…</Text></Screen>;

  const isChit = inv.type === 'chit';
  const unitType = usesUnits(inv.type);
  const unitWord = usesGrams(inv.type) ? 'gram' : 'unit';
  const h = holdingOf(inv, entries ?? [], now);
  const unrealised = h.value - h.invested;
  const live = hasLivePrice(inv);
  const activeKind = kind ?? defaultInflowKind(inv.type);
  const accountName = (aid: string | null | undefined) => accounts?.find((a) => a.id === aid)?.name ?? null;

  const resetForm = () => {
    setEditing(null);
    setKind(null);
    setAmount('');
    setUnits('');
    setDate(toInputDate(Date.now()));
    setLinked(false);
    setAccountId(null);
  };

  const startEdit = (e: InvestmentEntry) => {
    if (e.kind === 'valuation') {
      return dialog('Value update', `${money(e.amount, true)} on ${dateLabel(e.date)}`, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(db, e) },
      ]);
    }
    haptic.selection();
    setEditing(e);
    setKind(e.kind);
    setAmount(String(e.amount));
    setUnits(e.units ? String(e.units) : '');
    setDate(toInputDate(e.date));
    setLinked(!!e.account_id);
    setAccountId(e.account_id ?? null);
  };

  const submit = async () => {
    const amt = num(amount);
    const u = num(units);
    const when = parseDate(date);
    if (!amt || !(amt > 0 && amt < 1e12)) return dialog('Enter an amount');
    if (u != null && !(u > 0 && u < 1e12)) return dialog(`${usesGrams(inv.type) ? 'Grams' : 'Units'} should be a positive number`);
    if (!when) return dialog('Pick a valid date');
    if (unitType && activeKind === 'sell' && h.units && !u) return dialog(`How many ${unitWord}s did you sell?`, 'Needed to work out the cost of what you sold and the profit on it.');
    if (linked && !accountId) return dialog(MONEY_IN.includes(activeKind) ? 'Pick the account you paid from' : 'Pick the account it went into');
    setBusy(true);
    try {
      await saveEntry(db, inv, {
        id: editing?.id,
        kind: activeKind,
        date: when,
        amount: amt,
        units: unitType ? u : null,
        note: editing?.note ?? null,
        accountId: linked ? accountId : null,
      });
      haptic.success();
      toast.success(editing ? 'Entry updated' : 'Entry added', linked ? { description: `Also recorded in ${accountName(accountId)}` } : undefined);
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  const removeEditing = () =>
    dialog('Delete entry?', editing?.txn_id ? 'Its entry in your account goes too (an imported bank SMS stays, as a normal transaction).' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, editing!);
          resetForm();
        },
      },
    ]);

  const updateValue = async () => {
    const n = num(value);
    if (!n || !(n > 0 && n < 1e12)) return dialog(per === 'unit' && unitType ? `Enter the price per ${unitWord}` : 'Enter the value');
    const byUnit = unitType && per === 'unit' && h.units;
    await saveEntry(db, inv, {
      kind: 'valuation',
      date: today(),
      amount: byUnit ? n * h.units! : n,
      units: unitType ? (h.units ?? null) : null,
      note: null,
      accountId: null,
    });
    haptic.success();
    setValue('');
  };

  const refresh = async () => {
    setRefreshing(true);
    const n = await refreshPrices(db, true).catch(() => 0);
    setRefreshing(false);
    if (n) toast.success('Price updated');
    else toast.info('Couldn’t get a new price', { description: 'You may be offline. The last price stays.' });
  };

  const removeInvestment = () =>
    dialog('Delete investment?', 'It goes with all its entries. Payments recorded in your accounts stay there.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteInvestment(db, inv);
          router.back();
        },
      },
    ]);

  const comp = compoundingOf(inv.type);
  const basisLine =
    h.basis === 'price'
      ? `${live ? 'Market price' : 'Price'} ${money(h.price!, true)} a ${unitWord}${h.asOf ? ` · ${dateLabel(h.asOf)}` : ''}`
      : h.basis === 'rate'
        ? `Estimated at ${inv.interest_rate}% a year, compounded ${comp}${inv.maturity_date && inv.maturity_date < now ? ', to maturity' : ''}`
        : h.basis === 'valuation'
          ? `Value you entered on ${dateLabel(h.asOf!)}, plus money in and out since`
          : 'Same as invested: add a value update when it changes';

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: inv.name,
          headerRight: () => <Button size="sm" variant="secondary" title="Edit" onPress={() => router.push({ pathname: '/investment-form', params: { id: inv.id } })} />,
        }}
      />
      <Card className="gap-3">
        <View className="gap-0.5">
          <Text variant="small">{[INVESTMENT_TYPE_LABELS[inv.type], inv.institution].filter(Boolean).join(' · ')}</Text>
          <Text variant="display" tabular>
            {money(isChit ? inv.current_value : h.value)}
          </Text>
          {!isChit ? <Text variant="caption">{basisLine}</Text> : null}
        </View>
        {!isChit ? (
          <>
            <View className="flex-row gap-3">
              <Stat label="Invested" value={money(h.invested)} />
              <Stat
                label="Gain"
                value={`${unrealised >= 0 ? '+' : '−'}${money(Math.abs(unrealised))}${h.invested > 0 ? ` ${pct((unrealised / h.invested) * 100)}` : ''}`}
                color={unrealised >= 0 ? t.success : t.danger}
              />
            </View>
            {h.realised || h.income ? (
              <View className="flex-row gap-3">
                {h.realised ? <Stat label="Profit taken" value={`${h.realised >= 0 ? '+' : '−'}${money(Math.abs(h.realised))}`} color={h.realised >= 0 ? t.success : t.danger} /> : null}
                {h.income ? <Stat label="Dividends & interest" value={money(h.income)} color={t.success} /> : null}
              </View>
            ) : null}
            {h.units != null ? (
              <Text variant="small" tabular>
                {`Holding ${+h.units.toFixed(4)} ${usesGrams(inv.type) ? 'g' : 'units'}${h.units > 0 && h.invested > 0 ? ` · average cost ${money(h.invested / h.units, true)}` : ''}`}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="small">{inv.current_value > 0 ? 'Value = installments paid, until you win the prize.' : 'Prized: the pot has been paid out to you.'}</Text>
        )}
        {inv.maturity_date ? <Text variant="small">{`${inv.maturity_date < now ? 'Matured' : 'Matures'} ${dateLabel(inv.maturity_date)}`}</Text> : null}
      </Card>

      <AiNote label="Explain this investment" run={() => aiExplainInvestment(inv, entries ?? [])} />

      {isChit ? <ChitPanel inv={inv} entries={entries ?? []} /> : null}

      {!isChit && live ? (
        <Card className="gap-2">
          <Text variant="heading">Market price</Text>
          <Text variant="small">Updated on its own when you open the app (fund NAVs once a day).</Text>
          <Button size="sm" variant="secondary" title={refreshing ? 'Checking…' : 'Check now'} disabled={refreshing} onPress={refresh} />
        </Card>
      ) : null}

      {!isChit && !live ? (
        <Card className="gap-3">
          <Text variant="heading">{h.basis === 'rate' ? 'Correct the value' : 'Update the value'}</Text>
          {h.basis === 'rate' ? <Text variant="small">It grows on its own at the rate. Enter the value from a statement if it differs.</Text> : null}
          {unitType && h.units ? (
            <SegmentedControl
              options={[
                { value: 'unit', label: `Price per ${unitWord}` },
                { value: 'total', label: 'Total value' },
              ]}
              value={per}
              onChange={setPer}
            />
          ) : null}
          <Field
            label={unitType && h.units && per === 'unit' ? `Price per ${unitWord} today` : 'Value today'}
            prefix="₹"
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder={unitType && h.units && per === 'unit' && h.price ? h.price.toFixed(2) : String(Math.round(h.value))}
            hint={unitType && h.units && per === 'unit' && num(value) ? `= ${money(num(value)! * h.units, true)} for ${+h.units.toFixed(4)} ${usesGrams(inv.type) ? 'g' : 'units'}` : undefined}
          />
          <Button size="sm" title="Save value" onPress={updateValue} />
        </Card>
      ) : null}

      <Card className="gap-3">
        <Text variant="heading">{editing ? 'Edit entry' : isChit ? 'Other entry (corrections)' : 'Add entry'}</Text>
        <Chips options={KINDS} value={activeKind} onChange={setKind} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Amount" prefix="₹" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          </View>
          {unitType && (MONEY_IN.includes(activeKind) || activeKind === 'sell') ? (
            <View className="flex-1">
              <Field label={usesGrams(inv.type) ? 'Grams' : 'Units'} value={units} onChangeText={setUnits} keyboardType="decimal-pad" placeholder="0" />
            </View>
          ) : null}
        </View>
        <DateField label="Date" value={date} onChange={setDate} />
        <SwitchRow
          title={MONEY_IN.includes(activeKind) ? 'Paid from one of my accounts' : 'Received in one of my accounts'}
          description="Records it in that account too, so its balance is right. Not counted as spending."
          value={linked}
          onValueChange={setLinked}
        />
        {linked ? <AccountPicker label={MONEY_IN.includes(activeKind) ? 'Paid from' : 'Received in'} accounts={accounts ?? []} value={accountId} onChange={setAccountId} /> : null}
        <Button size="sm" title={busy ? 'Saving…' : editing ? 'Save changes' : 'Add entry'} disabled={busy} onPress={submit} />
        {editing ? (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button size="sm" variant="secondary" title="Cancel" onPress={resetForm} />
            </View>
            <View className="flex-1">
              <Button size="sm" variant="danger" title="Delete" onPress={removeEditing} />
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">History</Text>
        {(entries ?? []).length === 0 ? <Text variant="muted">No entries yet.</Text> : null}
        {(entries ?? []).map((e, i) => (
          <View key={e.id}>
            {i > 0 ? <Divider /> : null}
            <Row
              title={LABEL[e.kind] ?? e.kind}
              subtitle={[dateLabel(e.date), e.units ? `${+e.units.toFixed(4)} ${usesGrams(inv.type) ? 'g' : 'units'}` : null, accountName(e.account_id), e.note].filter(Boolean).join(' · ')}
              right={money(e.amount, true)}
              rightColor={e.kind === 'valuation' ? t.textSecondary : MONEY_IN.includes(e.kind) ? t.text : t.success}
              onPress={() => startEdit(e)}
            />
          </View>
        ))}
        {(entries ?? []).length > 0 ? <Text variant="small">Tap an entry to change or delete it.</Text> : null}
      </Card>

      <Button variant="danger" title="Delete investment" onPress={removeInvestment} />
    </Screen>
  );
}

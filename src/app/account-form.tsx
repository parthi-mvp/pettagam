import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoanPanel } from '@/components/loan-panel';
import { ACCOUNT_ICON, ACCOUNT_TYPE_OPTIONS, BankPicker, OptionPicker } from '@/components/pickers';
import { NetworkMark } from '@/components/network-mark';
import { Button, dialog, Field, FormSection, PressableScale, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { accountBalances, getById, save, softDelete } from '@/db/repo';
import { isCardLike, isLiability, isPersonal, type AccountType } from '@/db/types';
import type { BankKind } from '@/catalog/banks';
import { NETWORKS, networkById, type CardNetwork } from '@/catalog/networks';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const NAME_HINT: Partial<Record<AccountType, string>> = {
  credit_card: 'HDFC Millennia',
  pay_later: 'Amazon Pay Later',
  wallet: 'Paytm wallet',
  meal_card: 'Pluxee meal card',
  fastag: 'Car FASTag',
  loan: 'Home loan',
  overdraft: 'OD against FD',
};
/** Provider kinds listed first in the bank sheet for each account type. */
const PREFER: Partial<Record<AccountType, BankKind[]>> = {
  wallet: ['wallet', 'payments'],
  meal_card: ['wallet'],
  pay_later: ['wallet', 'lender', 'card'],
  loan: ['lender', 'public', 'private'],
};

export default function AccountForm() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [type, setType] = useState<AccountType>('bank');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [last4, setLast4] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [opening, setOpening] = useState('');
  const [limit, setLimit] = useState('');
  const [billingDay, setBillingDay] = useState('');
  const [notes, setNotes] = useState('');
  const [network, setNetwork] = useState<CardNetwork | null>(null);
  const [dueDay, setDueDay] = useState('');
  const [rate, setRate] = useState('');
  const [emi, setEmi] = useState('');
  const { data: balances } = useLiveQuery(accountBalances, ['accounts', 'transactions']);
  const balance = id ? (balances?.[id] ?? null) : null;

  useEffect(() => {
    if (!id) return;
    getById(db, 'accounts', id).then((a) => {
      if (!a) return;
      setType(a.type);
      setName(a.name);
      setInstitution(a.institution ?? '');
      setLast4(a.last4 ?? '');
      setCardLast4(a.card_last4 ?? '');
      setOpening(String(a.opening_balance));
      setLimit(a.credit_limit != null ? String(a.credit_limit) : '');
      setBillingDay(a.billing_day != null ? String(a.billing_day) : '');
      setNotes(a.notes ?? '');
      setNetwork(networkById(a.network)?.id ?? null);
      setDueDay(a.due_day != null ? String(a.due_day) : '');
      setRate(a.interest_rate != null ? String(a.interest_rate) : '');
      setEmi(a.emi != null ? String(a.emi) : '');
    });
  }, [db, id]);

  const liability = isLiability(type);
  const personal = isPersonal(type);
  // Bank accounts usually come with a debit card whose number ATM and shop alerts quote.
  const hasDebitCard = type === 'bank' || type === 'overdraft';
  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : null);

  const onSave = async () => {
    if (!name.trim()) return dialog('Enter a name', 'e.g. "HDFC Savings" or "ICICI Amazon Pay card"');
    if (last4 && !/^\d{3,4}$/.test(last4)) return dialog('Last digits should be 3–4 numbers');
    if (hasDebitCard && cardLast4 && !/^\d{4}$/.test(cardLast4)) return dialog('Debit card digits should be 4 numbers');
    // The server rejects these (numeric(14,2), day 1–31); a rejected row would stall every upload.
    const money = [num(opening), isCardLike(type) ? num(limit) : null];
    if (money.some((n) => n != null && !(Math.abs(n) < 1e12))) return dialog('Enter amounts as plain numbers', 'e.g. 25000 or -1500.50');
    const day = isCardLike(type) ? num(billingDay) : null;
    if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return dialog('Statement day should be 1–31');
    const loan = type === 'loan';
    const due = isCardLike(type) || loan ? num(dueDay) : null;
    if (due != null && !(Number.isInteger(due) && due >= 1 && due <= 31)) return dialog(loan ? 'EMI day should be 1–31' : 'Payment due day should be 1–31');
    const r = loan ? num(rate) : null;
    if (r != null && !(r >= 0 && r < 100)) return dialog('Interest rate should be a % a year, e.g. 8.5');
    const e = loan ? num(emi) : null;
    if (e != null && !(e > 0 && e < 1e12)) return dialog('Enter the EMI as a plain number');
    await save(db, 'accounts', {
      id,
      type,
      name: name.trim(),
      institution: personal ? null : institution.trim() || null,
      last4: personal || type === 'cash' ? null : last4 || null,
      card_last4: hasDebitCard ? cardLast4 || null : null,
      opening_balance: num(opening) ?? 0,
      credit_limit: isCardLike(type) ? num(limit) : null,
      billing_day: day,
      notes: notes.trim() || null,
      // A bank account's network is its debit card's; cash, wallets, loans and people have none.
      network: isCardLike(type) || hasDebitCard ? network : null,
      due_day: due,
      interest_rate: r,
      emi: e,
    });
    router.back();
  };

  const onDelete = () =>
    dialog('Delete account?', 'Its transactions stay but will show without an account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'accounts', id!);
          router.back();
        },
      },
    ]);

  return (
    <Screen footer={<Button size="lg" title={id ? 'Save changes' : 'Add account'} onPress={onSave} />}>
      <Stack.Screen options={{ title: id ? 'Edit account' : 'New account' }} />
      <FormSection>
        <OptionPicker label="Account type" options={ACCOUNT_TYPE_OPTIONS} value={type} onChange={setType} />
        <Field
          label={personal ? 'Person' : 'Name'}
          value={name}
          onChangeText={setName}
          placeholder={personal ? 'Ravi (college friend)' : (NAME_HINT[type] ?? 'SBI Savings')}
        />
        {type !== 'cash' && !personal ? (
          <BankPicker
            label={type === 'loan' ? 'Lender' : type === 'wallet' || type === 'meal_card' || type === 'pay_later' ? 'Provider' : 'Bank / issuer'}
            value={institution}
            onChange={setInstitution}
            prefer={PREFER[type]}
            fallbackIcon={ACCOUNT_ICON[type]}
          />
        ) : null}
      </FormSection>

      <FormSection title="Balance">
        <Field
          label={type === 'lent' ? 'Amount they owe you' : type === 'borrowed' ? 'Amount you owe' : liability ? 'Current outstanding' : 'Current balance'}
          prefix="₹"
          value={opening}
          onChangeText={setOpening}
          keyboardType="numbers-and-punctuation"
          placeholder="0"
          hint="Starting point; transactions you add from now on adjust it."
        />
        {isCardLike(type) ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Credit limit" prefix="₹" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="0" />
            </View>
            <View className="flex-1">
              <Field label="Statement day" value={billingDay} onChangeText={setBillingDay} keyboardType="number-pad" maxLength={2} placeholder="1–31" />
            </View>
          </View>
        ) : null}
        {isCardLike(type) ? (
          <Field
            label="Payment due day"
            value={dueDay}
            onChangeText={setDueDay}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="1–31"
            hint="The day each month the bill must be paid by. Used for reminders."
          />
        ) : null}
        {type === 'loan' ? (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="EMI" prefix="₹" value={emi} onChangeText={setEmi} keyboardType="decimal-pad" placeholder="24500" />
              </View>
              <View className="flex-1">
                <Field label="Interest % a year" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="8.5" />
              </View>
            </View>
            <Field label="EMI day" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} placeholder="1–31" hint="The day the EMI is paid each month." />
          </>
        ) : null}
      </FormSection>

      {type === 'loan' && balance != null && balance > 0 && num(emi) ? (
        <FormSection title="Payoff">
          <LoanPanel outstanding={balance} rate={num(rate) ?? 0} emi={num(emi)!} />
        </FormSection>
      ) : null}

      {personal && id && balance != null ? (
        <FormSection title={type === 'lent' ? 'They owe you' : 'You owe'}>
          <Text tone="default" weight="medium" tabular>
            {Math.abs(balance) < 0.5 ? 'All settled' : money(balance)}
          </Text>
          {balance >= 0.5 ? (
            <Button
              variant="secondary"
              title={type === 'lent' ? 'They paid me back' : 'I paid them back'}
              onPress={() =>
                router.push({
                  pathname: '/transaction-form',
                  // Paid back = money moves between this person and one of your accounts (you pick which).
                  params: type === 'lent' ? { type: 'transfer', accountId: id, amount: String(Math.round(balance * 100) / 100) } : { type: 'transfer', toAccountId: id, amount: String(Math.round(balance * 100) / 100) },
                })
              }
            />
          ) : null}
          <Text variant="caption">Lent more, or paid part of it? Add a transfer between this person and your account, for any amount.</Text>
        </FormSection>
      ) : null}

      {isCardLike(type) || hasDebitCard ? (
        <FormSection title={hasDebitCard ? 'Debit card network' : 'Card network'}>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {NETWORKS.map((n) => {
              const active = n.id === network;
              return (
                <PressableScale
                  key={n.id}
                  scaleTo={0.96}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={n.name}
                  onPress={() => {
                    haptic.selection();
                    setNetwork(active ? null : n.id); // tap again to clear
                  }}
                  className={cn(
                    'h-14 w-[23%] items-center justify-center gap-1 rounded-[12px] border-[1.5px] bg-surface',
                    active ? 'border-primary' : 'border-line'
                  )}>
                  <NetworkMark network={n.id} height={16} tone="surface" />
                  <Text variant="caption" numberOfLines={1} weight={active ? 'semibold' : 'regular'}>
                    {n.id === 'amex' ? 'Amex' : n.name}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Text variant="caption">Shown on the card in Accounts. Card alerts that name it fill it in for you.</Text>
        </FormSection>
      ) : null}

      {type !== 'cash' && !personal ? (
        <FormSection title="SMS matching">
          {hasDebitCard ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Account last 4" value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} placeholder="1234" />
              </View>
              <View className="flex-1">
                <Field label="Debit card last 4" value={cardLast4} onChangeText={setCardLast4} keyboardType="number-pad" maxLength={4} placeholder="5678" />
              </View>
            </View>
          ) : (
            <Field
              label={isCardLike(type) ? 'Card last 4 digits' : 'Account last 4 digits'}
              value={last4}
              onChangeText={setLast4}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1234"
            />
          )}
          <Text variant="caption" tone="subtle">
            {hasDebitCard
              ? 'Matches “A/c XX1234” alerts, and ATM or card alerts like “Debit Card XX5678”.'
              : 'Matches bank alerts like “A/c XX1234” or “card ending 1234”.'}
          </Text>
        </FormSection>
      ) : null}

      <FormSection title="Notes">
        <Field label="Anything to remember" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />
      </FormSection>

      {id ? (
        <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={6} className="items-center py-2.5 active:opacity-60">
          <Text variant="label" tone="danger">Delete account</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

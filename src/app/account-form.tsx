import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ACCOUNT_ICON, ACCOUNT_TYPE_OPTIONS, BankPicker, OptionPicker } from '@/components/pickers';
import { Button, Field, FormSection, Screen, Text } from '@/components/ui';
import { getById, save, softDelete } from '@/db/repo';
import { isCardLike, isLiability, isPersonal, type AccountType } from '@/db/types';
import type { BankKind } from '@/catalog/banks';

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
    });
  }, [db, id]);

  const liability = isLiability(type);
  const personal = isPersonal(type);
  // Bank accounts usually come with a debit card whose number ATM and shop alerts quote.
  const hasDebitCard = type === 'bank' || type === 'overdraft';
  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : null);

  const onSave = async () => {
    if (!name.trim()) return Alert.alert('Enter a name', 'e.g. "HDFC Savings" or "ICICI Amazon Pay card"');
    if (last4 && !/^\d{3,4}$/.test(last4)) return Alert.alert('Last digits should be 3–4 numbers');
    if (hasDebitCard && cardLast4 && !/^\d{4}$/.test(cardLast4)) return Alert.alert('Debit card digits should be 4 numbers');
    // The server rejects these (numeric(14,2), day 1–31); a rejected row would stall every upload.
    const money = [num(opening), isCardLike(type) ? num(limit) : null];
    if (money.some((n) => n != null && !(Math.abs(n) < 1e12))) return Alert.alert('Enter amounts as plain numbers', 'e.g. 25000 or -1500.50');
    const day = isCardLike(type) ? num(billingDay) : null;
    if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return Alert.alert('Statement day should be 1–31');
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
    });
    router.back();
  };

  const onDelete = () =>
    Alert.alert('Delete account?', 'Its transactions stay but will show without an account.', [
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
      </FormSection>

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

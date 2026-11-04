import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { BankLogo } from '@/components/bank-logo';
import { ACCOUNT_ICON } from '@/components/pickers';
import { Button, Card, Divider, Empty, Row, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { accountBalances, listAccounts } from '@/db/repo';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, isLiability, isPersonal } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/lib/format';

const ORDER = ACCOUNT_TYPE_ORDER;

export default function Accounts() {
  const t = useTheme();
  const { data } = useLiveQuery(
    async (db) => ({ accounts: await listAccounts(db), balances: await accountBalances(db) }),
    ['accounts', 'transactions']
  );
  const accounts = data?.accounts ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push('/account-form')} /> }} />
      {data && accounts.length === 0 ? (
        <Empty text="Add your bank accounts, credit cards, wallets and cash. Enter the last 4 digits so SMS alerts get matched automatically." />
      ) : null}
      {ORDER.map((type) => {
        const list = accounts.filter((a) => a.type === type);
        if (list.length === 0) return null;
        const total = list.reduce((s, a) => s + (data!.balances[a.id] ?? 0), 0);
        const liability = isLiability(type);
        return (
          <Card key={type}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="heading">{ACCOUNT_TYPE_LABELS[type]}</Text>
              <Text variant="heading" tone={liability && total > 0 ? 'danger' : 'default'}>
                {money(total)}
              </Text>
            </View>
            {list.map((a, i) => {
              const bal = data!.balances[a.id] ?? 0;
              const sub = [a.institution, a.last4 ? `••${a.last4}` : null].filter(Boolean).join(' · ');
              return (
                <View key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row
                    leading={<BankLogo institution={isPersonal(a.type) ? null : a.institution} fallback={ACCOUNT_ICON[a.type]} />}
                    title={a.name}
                    subtitle={sub || null}
                    right={money(bal, true)}
                    rightColor={liability ? (bal > 0 ? t.danger : t.success) : bal < 0 ? t.danger : t.text}
                    rightSub={
                      liability
                        ? a.credit_limit
                          ? `available ${money(a.credit_limit - bal)}`
                          : 'outstanding'
                        : null
                    }
                    onPress={() => router.push({ pathname: '/account-form', params: { id: a.id } })}
                  />
                </View>
              );
            })}
          </Card>
        );
      })}
      {accounts.some((a) => a.type === 'credit_card') ? (
        <Text variant="small">
          Paying a card bill? Add a Transfer from your bank account to the card so both balances stay correct.
        </Text>
      ) : null}
    </Screen>
  );
}

import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AccountCard, CARD_PEEK, CARD_RATIO } from '@/components/account-card';
import { TxnList } from '@/components/txn-list';
import { Button, Card, Empty, PressableScale, Screen, Stat, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { accountBalances, listAccounts, listTransactions } from '@/db/repo';
import { isCardLike, isLiability, type Account, type AccountType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/** The filter strip's groups, in wallet order. */
const GROUPS: { id: string; label: string; types: AccountType[] }[] = [
  { id: 'banks', label: 'Banks', types: ['bank', 'overdraft'] },
  { id: 'cards', label: 'Cards', types: ['credit_card', 'pay_later'] },
  { id: 'wallets', label: 'Wallets & cash', types: ['wallet', 'meal_card', 'fastag', 'cash'] },
  { id: 'loans', label: 'Loans', types: ['loan'] },
  { id: 'people', label: 'People', types: ['lent', 'borrowed'] },
];
const ORDER = GROUPS.flatMap((g) => g.types);

// Opening a card in place: the cards below spring down to make room, and back up when it closes.
// Layout transitions run on the UI thread; reduced motion makes the move instant.
const MOVE = LinearTransition.springify().duration(400).dampingRatio(0.85).reduceMotion(ReduceMotion.System);

/** Accounts as a card wallet: totals, a filter strip, and the cards stacked; tap one to open it where it sits. */
export default function Accounts() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32; // Screen's gutters are 16 each side
  const cardHeight = cardWidth / CARD_RATIO;
  const [group, setGroup] = useState<string>('all');
  // The one open card (null = all closed). Cards keep their place; opening one closes the others.
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useLiveQuery(
    async (db) => ({ accounts: await listAccounts(db), balances: await accountBalances(db) }),
    ['accounts', 'transactions']
  );
  const accounts = [...(data?.accounts ?? [])].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const bal = (a: Account) => data?.balances[a.id] ?? 0;

  // A card or loan below zero holds your money (overpaid), so it counts as yours, not as a negative debt.
  const owed = accounts.filter((a) => isLiability(a.type)).reduce((s, a) => s + Math.max(0, bal(a)), 0);
  const owned =
    accounts.filter((a) => !isLiability(a.type)).reduce((s, a) => s + bal(a), 0) +
    accounts.filter((a) => isLiability(a.type)).reduce((s, a) => s + Math.max(0, -bal(a)), 0);
  const groups = GROUPS.filter((g) => accounts.some((a) => g.types.includes(a.type)));
  const shown = group === 'all' ? accounts : accounts.filter((a) => GROUPS.find((g) => g.id === group)?.types.includes(a.type));
  const open = shown.find((a) => a.id === openId) ?? null;

  const { data: recent } = useLiveQuery(
    (db) => (open ? listTransactions(db, { accountId: open.id, limit: 3 }) : Promise.resolve([])),
    ['transactions', 'accounts', 'categories'],
    [open?.id]
  );

  const toggle = (a: Account) => {
    haptic.light();
    setOpenId((id) => (id === a.id ? null : a.id));
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push('/account-form')} /> }} />

      {data && accounts.length === 0 ? (
        <Empty text="Add your bank accounts, credit cards, wallets and cash. Enter the last 4 digits so SMS alerts get matched automatically." />
      ) : null}

      {accounts.length ? (
        <>
          <Card className="flex-row gap-3">
            <Stat label="You have" value={money(owned)} />
            <Stat label="You owe" value={money(owed)} color={owed > 0 ? t.danger : undefined} />
            <Stat label="Net" value={money(owned - owed)} color={owned - owed < 0 ? t.danger : undefined} />
          </Card>

          {groups.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="-mx-gutter" contentContainerStyle={{ paddingHorizontal: 16 }}>
              {[{ id: 'all', label: `All (${accounts.length})` }, ...groups].map((g) => {
                const active = g.id === group;
                return (
                  <PressableScale
                    key={g.id}
                    scaleTo={0.96}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      if (active) return;
                      haptic.selection();
                      setGroup(g.id);
                    }}
                    className={cn('h-9 justify-center rounded-full px-4', active ? 'bg-fg' : 'border border-line bg-surface')}>
                    <Text variant="small" weight="semibold" className={active ? 'text-canvas' : 'text-fg'}>
                      {g.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      {shown.length ? (
        <View>
          <Text variant="eyebrow" className="px-1 pb-2">
            {open ? 'Tap the open card to close it' : 'Tap a card to open it'}
          </Text>
          {shown.map((a, i) => {
            const isOpen = a.id === open?.id;
            const prevOpen = i > 0 && shown[i - 1].id === open?.id;
            // Closed cards overlap the one before so only its top row shows; nothing overlaps an open card
            // or the details under it. The last card is never covered, so it shows in full.
            const marginTop = i === 0 ? 0 : prevOpen ? 14 : CARD_PEEK - cardHeight;
            return (
              <Animated.View key={a.id} layout={MOVE} style={{ marginTop, zIndex: i + 1 }}>
                <PressableScale
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityHint={isOpen ? 'Closes this card' : 'Opens this card'}
                  onPress={() => toggle(a)}>
                  {/* Shadow cast up onto the card behind: each card visibly sits on top of the previous one. */}
                  <View style={{ borderRadius: 20, boxShadow: '0 -8px 18px rgba(0, 0, 0, 0.38)' }}>
                    <AccountCard
                      account={a}
                      balance={bal(a)}
                      width={cardWidth}
                      footer={
                        isOpen ? (
                          <PressableScale
                            scaleTo={0.95}
                            accessibilityRole="button"
                            accessibilityLabel={`Add an entry to ${a.name}`}
                            onPress={() => router.push({ pathname: '/transaction-form', params: { accountId: a.id } })}
                            className="h-9 justify-center rounded-[10px] bg-white px-4">
                            <Text weight="semibold" style={{ color: '#111111' }}>
                              Add entry
                            </Text>
                          </PressableScale>
                        ) : undefined
                      }
                    />
                  </View>
                </PressableScale>

                {isOpen ? (
                  // What the card can't say: limit left, statement day, the last few entries.
                  <Animated.View entering={FadeIn.duration(200)} className="gap-2 pt-3">
                    {isCardLike(a.type) && (a.credit_limit || a.billing_day) ? (
                      <Card className="flex-row gap-3">
                        {a.credit_limit ? <Stat label="Available" value={money(a.credit_limit - bal(a))} /> : null}
                        {a.credit_limit ? <Stat label="Limit" value={money(a.credit_limit)} /> : null}
                        {a.billing_day ? <Stat label="Statement" value={`Day ${a.billing_day}`} /> : null}
                      </Card>
                    ) : null}
                    {recent && recent.length ? <TxnList rows={recent} /> : <Text variant="small" align="center">No entries on this account yet.</Text>}
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="settings"
                      title="Edit account"
                      onPress={() => router.push({ pathname: '/account-form', params: { id: a.id } })}
                    />
                  </Animated.View>
                ) : null}
              </Animated.View>
            );
          })}
        </View>
      ) : null}

      {accounts.some((a) => a.type === 'credit_card') ? (
        <Text variant="small" className="pt-2">
          Paying a card bill? Add a Transfer from your bank account to the card so both balances stay correct.
        </Text>
      ) : null}
    </Screen>
  );
}

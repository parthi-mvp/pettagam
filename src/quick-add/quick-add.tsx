// The card that pops up over other apps when a bank SMS arrives (QuickAddActivity, Android).
// Registered as its own React root ("QuickAdd") in index.ts; shares the app's DB and code.
import '@/global.css';

import { closeQuickAdd, readInbox } from '@modules/sms-reader';
import { useFonts } from 'expo-font';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { AccountGrid, CategoryGrid } from '@/components/pickers';
import { TagField } from '@/components/tag-field';
import { Button, Field, IconTile, SegmentedControl, Text } from '@/components/ui';
import { startupFonts } from '@/constants/fonts';
import { useThemePreference } from '@/theme/themePreference';
import { listAccounts, listCategories } from '@/db/repo';
import { migrate } from '@/db/schema';
import type { Account, Category } from '@/db/types';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { aiTagSms, buildCandidates, importCandidates, type SmsCandidate } from '@/sms/import';
import { aiReady, useAi } from '@/ai/client';
import type { RawSms } from '@/sms/parser';
import { syncNow } from '@/sync/drive-sync';
import { useThemeColors } from '@/theme/useThemeColor';

export type QuickAddProps = { address: string; body: string; date: number };
type Kind = 'expense' | 'income' | 'atm';

export function QuickAddRoot(props: QuickAddProps) {
  const [fontsLoaded, fontError] = useFonts(startupFonts(useThemePreference.getState().font));
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SQLiteProvider databaseName="pettagam.db" onInit={migrate}>
            <QuickAddCard {...props} />
          </SQLiteProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

/**
 * The broadcast's timestamp isn't the one the inbox stores, and the duplicate check hashes the
 * date: use the inbox copy when the SMS app has saved it, so a later SMS import skips this one.
 */
async function inboxCopy(sms: RawSms): Promise<RawSms> {
  try {
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
    const recent = await readInbox(sms.date - 15 * 60_000, 40);
    return recent.find((m) => m.address === sms.address && flat(m.body) === flat(sms.body)) ?? sms;
  } catch {
    return sms; // no READ_SMS: keep the broadcast copy
  }
}

function QuickAddCard({ address, body, date }: QuickAddProps) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [item, setItem] = useState<SmsCandidate | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [success, muted] = useThemeColors(['success', 'fg-muted'] as const);
  const ai = useAi(aiReady);

  useEffect(() => {
    (async () => {
      const [accs, cats, sms] = await Promise.all([listAccounts(db), listCategories(db), inboxCopy({ address, body, date })]);
      setAccounts(accs);
      setCategories(cats);
      // null: not a transaction after all, or already imported. Nothing to show.
      setItem((await buildCandidates(db, [sms]))[0] ?? null);
    })().catch(() => setItem(null));
  }, [db, address, body, date]);

  useEffect(() => {
    if (item === null) closeQuickAdd();
  }, [item]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeQuickAdd();
      return true;
    });
    return () => sub.remove();
  }, []);

  const update = (patch: Partial<SmsCandidate>) => setItem((c) => (c ? { ...c, ...patch } : c));

  const save = async () => {
    if (!item?.accountId || busy) return;
    setBusy(true);
    try {
      // Re-check the inbox: the SMS app may have saved its copy only after the card opened.
      const sms = await inboxCopy(item.sms);
      const [fresh] = sms === item.sms ? [item] : await buildCandidates(db, [sms]);
      if (fresh) await importCandidates(db, [{ ...item, sms, hash: fresh.hash, selected: true }]);
      haptic.success();
      setSaved(true);
      // Back up now if Drive is connected (a no-op otherwise); offline, it goes up next time.
      syncNow(db).catch(() => {});
      setTimeout(closeQuickAdd, 700);
    } catch {
      haptic.error();
      setBusy(false);
    }
  };

  if (!item) return null;

  const kind: Kind = item.atm ? 'atm' : item.type;
  const income = kind === 'income';
  const time = new Date(item.sms.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  return (
    <View className="flex-1 justify-end">
      {/* Dimmed backdrop: tap outside the card to dismiss. */}
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} className="absolute inset-0">
        <Pressable onPress={() => closeQuickAdd()} accessibilityLabel="Ignore this SMS" className="flex-1 bg-black/45" />
      </Animated.View>

      <KeyboardAvoidingView behavior="padding">
        <Animated.View
          entering={SlideInDown.duration(260)}
          className="rounded-t-[28px] bg-sheet"
          style={{ maxHeight: height * 0.88, paddingBottom: insets.bottom + 12 }}>
          {saved ? (
            <View className="items-center gap-2 px-5 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                <Icon name="check" size={28} color={success} strokeWidth={2.6} />
              </View>
              <Text variant="heading" className="text-2xl">Saved</Text>
              <Text variant="small">{`${income ? '+' : '−'}${money(item.amount, true)}${item.merchant ? ` · ${item.merchant}` : ''}`}</Text>
            </View>
          ) : (
            <>
              {/* Header */}
              <View className="flex-row items-center gap-3 px-5 pb-2 pt-5">
                <IconTile icon="sms" tone="brass" size={40} />
                <View className="min-w-0 flex-1">
                  <Text weight="semibold" className="text-lg">New bank SMS</Text>
                  <Text variant="small" numberOfLines={1}>{`${address} · ${time}`}</Text>
                </View>
                <Pressable onPress={() => closeQuickAdd()} hitSlop={10} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full bg-fill active:opacity-70">
                  <View style={{ transform: [{ rotate: '45deg' }] }}>
                    <Icon name="plus" size={18} color={muted} strokeWidth={2.4} />
                  </View>
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-5 pb-3 pt-2">
                {/* Amount */}
                <View className="items-center gap-1 py-1">
                  <Text tabular weight="bold" className="text-[36px] leading-[44px]" style={income ? { color: success } : undefined}>
                    {`${kind === 'atm' ? '' : income ? '+' : '−'}${money(item.amount, true)}`}
                  </Text>
                  {item.ai ? <Text variant="caption">Read with AI · check before saving</Text> : null}
                  {item.cardPayment ? <Text variant="caption">Card bill payment · saved as a transfer from your bank</Text> : null}
                </View>

                <SegmentedControl<Kind>
                  options={[
                    { value: 'expense', label: 'Expense' },
                    { value: 'income', label: 'Income' },
                    { value: 'atm', label: 'ATM → Cash' },
                  ]}
                  value={kind}
                  onChange={(v) =>
                    update(v === 'atm' ? { atm: true, type: 'expense', categoryId: null } : { atm: false, type: v, categoryId: v === item.type ? item.categoryId : null })
                  }
                />

                {kind === 'atm' ? null : (
                  <Field
                    label={income ? 'From' : 'Paid to'}
                    value={item.merchant ?? ''}
                    onChangeText={(t) => update({ merchant: t || null })}
                    placeholder={income ? 'Salary, refund…' : 'Swiggy, Indian Oil…'}
                  />
                )}

                <View className="gap-2">
                  <View className="flex-row items-baseline justify-between px-0.5">
                    <Text variant="eyebrow">Account</Text>
                    {item.last4 ? <Text variant="caption">SMS mentions ••{item.last4}</Text> : null}
                  </View>
                  <AccountGrid
                    accounts={accounts}
                    value={item.accountId}
                    digits={item.last4}
                    onPick={(v) => {
                      haptic.selection();
                      update({ accountId: v });
                    }}
                  />
                </View>

                {kind === 'atm' ? null : (
                  <View className="gap-2">
                    <Text variant="eyebrow" className="px-0.5">Category</Text>
                    <CategoryGrid
                      options={categories.filter((x) => x.kind === item.type).map((x) => ({ value: x.id, label: x.name, color: x.color, icon: x.icon }))}
                      value={item.categoryId}
                      onPick={(v) => {
                        haptic.selection();
                        update({ categoryId: v });
                      }}
                      createKind={item.type}
                      onCreated={async () => setCategories(await listCategories(db))} // this card's list isn't live
                    />
                  </View>
                )}

                <TagField
                  value={item.tags ?? []}
                  onChange={(tags) => update({ tags })}
                  aiSuggest={
                    ai
                      ? async (tagNames) => {
                          const r = await aiTagSms(item, categories, tagNames);
                          if (r.categoryId) update({ categoryId: r.categoryId });
                          return r.tags;
                        }
                      : undefined
                  }
                  context={{
                    categoryId: item.categoryId,
                    merchant: item.merchant,
                    date: item.sms.date,
                    text: [item.sms.body, categories.find((c) => c.id === item.categoryId)?.name].filter(Boolean).join(' '),
                  }}
                />

                <View className="rounded-input bg-fill p-3">
                  <Text variant="small" tone="default" numberOfLines={4} selectable>{item.sms.body}</Text>
                </View>
              </ScrollView>

              {/* Actions */}
              <View className="flex-row gap-2 border-t border-line px-5 pt-3">
                <View className="flex-1">
                  <Button variant="secondary" size="lg" title="Ignore" onPress={() => closeQuickAdd()} />
                </View>
                <View className="flex-[2]">
                  <Button size="lg" icon="check" title={item.accountId ? 'Save' : 'Pick an account'} loading={busy} disabled={!item.accountId} onPress={save} />
                </View>
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

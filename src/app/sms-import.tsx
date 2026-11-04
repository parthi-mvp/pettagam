import { isSmsReadingAvailable, readInbox, requestSmsPermission } from '@modules/sms-reader';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { aiSmsReady, useAi } from '@/ai/client';
import { categoryIcon, Icon } from '@/components/icons';
import { AccountGrid, CategoryGrid } from '@/components/pickers';
import {
  Button,
  Card,
  Checkbox,
  DateField,
  Divider,
  Field,
  GroupLabel,
  IconTile,
  PressableScale,
  Row,
  Screen,
  SegmentedControl,
  Sheet,
  Text,
  type SheetRef,
} from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getSetting, listAccounts, listCategories } from '@/db/repo';
import { cn } from '@/lib/cn';
import { dateLabel, dayLabel, money, parseDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { advanceSmsCursor, buildCandidates, importCandidates, type SmsCandidate } from '@/sms/import';
import { periodRange, rangeLabel, type PeriodId, type Range } from '@/sms/period';
import { useThemeColor } from '@/theme/useThemeColor';

// shortcut: newest 3000 messages per scan; a busy inbox over a long range is cut short (we say so).
const LIMIT = 3000;

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: '90', label: 'Last 3 months' },
  { id: 'custom', label: 'Custom dates' },
];

type Kind = 'expense' | 'income' | 'atm';

export default function SmsImport() {
  const db = useSQLiteContext();
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const ai = useAi(aiSmsReady);
  const insets = useSafeAreaInsets();
  const [success, primary, muted] = [useThemeColor('success'), useThemeColor('primary'), useThemeColor('fg-muted')];

  const [cursor, setCursor] = useState(0);
  const [period, setPeriod] = useState<PeriodId>('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scanned, setScanned] = useState<{ range: Range; inbox: { date: number }[] } | null>(null);
  const [items, setItems] = useState<SmsCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const sheet = useRef<SheetRef>(null);

  // Default to "since last import" once there has been one.
  useEffect(() => {
    getSetting(db, 'sms_cursor').then((v) => {
      const c = Number(v ?? 0);
      setCursor(c);
      if (c > 0) setPeriod('new');
    });
  }, [db]);

  const [now] = useState(Date.now); // labels; the scan itself reads the clock again
  const custom = { from: parseDate(from), to: parseDate(to) };
  const range = periodRange(period, now, cursor, custom);

  const scan = async () => {
    const range = periodRange(period, Date.now(), cursor, custom);
    if (!range) return;
    setBusy(true);
    try {
      if (!(await requestSmsPermission())) {
        Alert.alert('Permission needed', 'Allow SMS access in system settings to import bank alerts.');
        return;
      }
      const inbox = await readInbox(range.from, LIMIT, range.to);
      if (inbox.length >= LIMIT) toast.info(`Read the newest ${LIMIT} messages. Pick a shorter range to reach older ones.`);
      setItems(await buildCandidates(db, inbox));
      setScanned({ range, inbox });
      haptic.light();
    } catch (e) {
      Alert.alert('Could not read SMS', String(e));
    } finally {
      setBusy(false);
    }
  };

  const parsePasted = async () => {
    const messages = paste
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((body, i) => ({ address: 'pasted', body, date: Date.now() - i }));
    setItems(await buildCandidates(db, messages));
    setScanned(null);
  };

  const update = (hash: string, patch: Partial<SmsCandidate>) =>
    setItems((list) => list?.map((c) => (c.hash === hash ? { ...c, ...patch } : c)) ?? null);
  // Picking the account for one alert also fills the others that quote the same unknown digits
  // (several ATM withdrawals on one debit card); the digits are remembered on import.
  const pickAccount = (item: SmsCandidate, accountId: string) =>
    setItems(
      (list) =>
        list?.map((c) =>
          c.hash === item.hash || (item.last4 && c.last4 === item.last4 && !c.accountId) ? { ...c, accountId, selected: true } : c
        ) ?? null
    );

  const open = (c: SmsCandidate) => {
    setEditing(c.hash);
    sheet.current?.present();
  };

  const toggle = (c: SmsCandidate, v: boolean) => (v && !c.accountId ? open(c) : update(c.hash, { selected: v }));

  const ready = items?.filter((c) => c.accountId) ?? [];
  const chosen = items?.filter((c) => c.selected && c.accountId) ?? [];
  const needAccount = (items?.length ?? 0) - ready.length;
  const allOn = ready.length > 0 && chosen.length === ready.length;
  const totals = chosen.reduce((t, c) => (c.atm ? t : c.type === 'income' ? { ...t, in: t.in + c.amount } : { ...t, out: t.out + c.amount }), { in: 0, out: 0 });

  const days = useMemo(() => {
    const groups = new Map<string, SmsCandidate[]>();
    for (const c of items ?? []) {
      const k = dayLabel(c.sms.date);
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    return [...groups];
  }, [items]);

  const doImport = async () => {
    if (!items || !chosen.length) return;
    setBusy(true);
    try {
      const n = await importCandidates(db, chosen);
      if (scanned) await advanceSmsCursor(db, scanned.inbox, scanned.range.from);
      haptic.success();
      toast.success(`${n} transaction${n === 1 ? '' : 's'} added`);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const current = items?.find((c) => c.hash === editing) ?? null;
  const reviewing = items != null;

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: reviewing ? 'Review' : 'Import from SMS' }} />
      <Screen>
        {!reviewing ? (
          <>
            {/* Intro */}
            <View className="items-center gap-2 px-4 pb-1 pt-2">
              <IconTile icon="sms" tone="brass" size={56} />
              <Text variant="title" align="center" className="text-[22px]">Bring in your bank alerts</Text>
              <Text variant="muted" align="center">
                We read bank, card and UPI messages on this phone and turn them into entries you can check before saving.
              </Text>
            </View>

            {isSmsReadingAvailable ? (
              <>
                <View className="gap-2">
                  <GroupLabel>Which messages?</GroupLabel>
                  {cursor > 0 ? (
                    <PeriodTile
                      wide
                      active={period === 'new'}
                      onPress={() => setPeriod('new')}
                      label="New since last import"
                      detail={`After ${dateLabel(cursor)}`}
                      icon="sync"
                    />
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    {PERIODS.map((p) => {
                      const r = periodRange(p.id, now, cursor);
                      return (
                        <PeriodTile
                          key={p.id}
                          active={period === p.id}
                          onPress={() => setPeriod(p.id)}
                          label={p.label}
                          detail={p.id === 'custom' ? 'Choose from and to' : r ? rangeLabel(r, now) : ''}
                        />
                      );
                    })}
                  </View>
                  {period === 'custom' ? (
                    <Card className="flex-row gap-3">
                      <View className="flex-1">
                        <DateField label="From" value={from} onChange={setFrom} />
                      </View>
                      <View className="flex-1">
                        <DateField label="To" value={to} onChange={setTo} />
                      </View>
                    </Card>
                  ) : null}
                  {period === 'custom' && from && to && !range ? (
                    <Text variant="small" tone="danger" className="px-1">The “From” date must be on or before “To”, and not in the future.</Text>
                  ) : null}
                </View>

                <View className="flex-row items-start gap-2.5 px-1">
                  <Icon name="lock" size={16} color={muted} />
                  <Text variant="small" className="flex-1">
                    Messages stay on this phone; only the entries you import are saved.
                    {ai ? ' With AI on, alerts the rules can’t read go to your AI provider with names, account digits, UPI IDs and balances masked.' : ''}
                  </Text>
                </View>
              </>
            ) : (
              <Card className="gap-3">
                <Text variant="heading">Paste messages</Text>
                <Text variant="small">
                  iPhones don’t let apps read SMS. Copy one or more bank alerts and paste them here, with a blank line between messages.
                </Text>
                <Field label="Messages" value={paste} onChangeText={setPaste} multiline placeholder="Rs.450.00 debited from A/c XX1234…" />
              </Card>
            )}

            {accounts && accounts.length > 0 && accounts.every((a) => !a.last4) ? (
              <Card variant="brass" className="flex-row items-start gap-2.5">
                <Icon name="bulb" size={18} color={primary} />
                <Text variant="small" tone="default" className="flex-1">
                  Add the last 4 digits to your accounts and cards so alerts match them automatically.
                </Text>
              </Card>
            ) : null}
          </>
        ) : (
          <>
            {/* Summary */}
            <Card className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text variant="eyebrow">{scanned ? rangeLabel(scanned.range, now) : 'Pasted messages'}</Text>
                <Pressable hitSlop={12} onPress={() => setItems(null)} accessibilityRole="button" className="active:opacity-60">
                  <Text variant="small" weight="medium" tone="primary">Change</Text>
                </Pressable>
              </View>
              <Text variant="title" className="text-[22px]">
                {items.length === 0 ? 'Nothing new' : `${items.length} transaction${items.length === 1 ? '' : 's'} found`}
              </Text>
              {items.length > 0 ? (
                <>
                  <View className="flex-row gap-2">
                    <Stat label="Money out" value={money(totals.out)} />
                    <Stat label="Money in" value={money(totals.in)} color={success} />
                  </View>
                  <Divider />
                  <Pressable onPress={() => setItems((l) => l?.map((c) => (c.accountId ? { ...c, selected: !allOn } : c)) ?? null)} className="flex-row items-center gap-3 active:opacity-70">
                    <Checkbox
                      checked={allOn}
                      onChange={(v) => setItems((l) => l?.map((c) => (c.accountId ? { ...c, selected: v } : c)) ?? null)}
                      accessibilityLabel="Select all"
                    />
                    <Text className="flex-1">Select all</Text>
                    <Text variant="small" tabular>{chosen.length} of {items.length} selected</Text>
                  </Pressable>
                </>
              ) : (
                <Text variant="muted">No bank alerts in this period, or they’re already imported.</Text>
              )}
            </Card>

            {needAccount > 0 ? (
              <Card variant="brass" className="flex-row items-start gap-2.5">
                <Icon name="card" size={18} color={primary} />
                <Text variant="small" tone="default" className="flex-1">
                  {needAccount} alert{needAccount === 1 ? '' : 's'} didn’t match an account. Tap one to choose; others with the same card digits follow.
                </Text>
              </Card>
            ) : null}

            {days.map(([day, list]) => (
              <View key={day} className="gap-1.5">
                <GroupLabel>{day}</GroupLabel>
                <Card className="gap-0 py-1">
                  {list.map((c, i) => {
                    const acc = accounts?.find((a) => a.id === c.accountId);
                    const cat = categories?.find((x) => x.id === c.categoryId);
                    const income = c.type === 'income' && !c.atm;
                    return (
                      <View key={c.hash}>
                        {i > 0 ? <Divider className="ml-[72px]" /> : null}
                        <Row
                          onPress={() => open(c)}
                          leading={
                            <View className="flex-row items-center gap-2.5">
                              <Checkbox
                                checked={c.selected && !!acc}
                                onChange={(v) => toggle(c, v)}
                                accessibilityLabel={`Import ${c.merchant ?? (income ? 'credit' : 'debit')} of ${money(c.amount, true)}`}
                              />
                              <IconTile icon={c.atm ? 'transfer' : categoryIcon(cat?.name, c.type, cat?.icon)} color={c.atm ? undefined : cat?.color} />
                            </View>
                          }
                          title={c.merchant ?? (c.atm ? 'Cash withdrawal' : income ? 'Money received' : 'Payment')}
                          subtitle={
                            acc
                              ? [acc.name, c.atm ? 'to Cash' : (cat?.name ?? 'No category'), c.ai ? 'read by AI' : null].filter(Boolean).join(' · ')
                              : `Choose account${c.last4 ? ` for ••${c.last4}` : ''}`
                          }
                          subtitleColor={acc ? undefined : primary}
                          right={`${c.atm ? '' : income ? '+' : '−'}${money(c.amount, true)}`}
                          rightColor={income ? success : undefined}
                          rightSub={new Date(c.sms.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        />
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))}
          </>
        )}
      </Screen>

      {/* Action bar */}
      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-canvas px-gutter pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {!reviewing ? (
          isSmsReadingAvailable ? (
            <Button title={busy ? 'Reading messages…' : 'Scan messages'} icon="search" loading={busy} disabled={!range} onPress={scan} />
          ) : (
            <Button title="Read messages" disabled={!paste.trim()} onPress={parsePasted} />
          )
        ) : items.length > 0 ? (
          <Button
            title={chosen.length ? `Import ${chosen.length} transaction${chosen.length === 1 ? '' : 's'}` : 'Select transactions to import'}
            icon="check"
            loading={busy}
            disabled={!chosen.length}
            onPress={doImport}
          />
        ) : (
          <Button variant="secondary" title="Try another period" onPress={() => setItems(null)} />
        )}
      </View>

      {/* Editor for one alert */}
      <Sheet
        ref={sheet}
        scrollable
        title={current ? (current.merchant ?? (current.type === 'income' ? 'Money received' : 'Payment')) : ''}
        subtitle={current ? `${money(current.amount, true)} · ${dateLabel(current.sms.date)}` : undefined}
        footer={
          <View className="px-5 pb-6 pt-2">
            <Button title="Done" onPress={() => sheet.current?.dismiss()} />
          </View>
        }>
        {current ? (
          <View className="gap-4">
            <SegmentedControl<Kind>
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
                { value: 'atm', label: 'ATM → Cash' },
              ]}
              value={current.atm ? 'atm' : current.type}
              onChange={(v) =>
                update(current.hash, v === 'atm' ? { atm: true, type: 'expense', categoryId: null } : { atm: false, type: v, categoryId: v === current.type ? current.categoryId : null })
              }
            />
            <View className="gap-2">
              <View className="flex-row items-baseline justify-between px-0.5">
                <Text variant="eyebrow">Account</Text>
                {current.last4 ? <Text variant="caption">Alert mentions ••{current.last4}</Text> : null}
              </View>
              <AccountGrid accounts={accounts ?? []} value={current.accountId} digits={current.last4} onPick={(v) => {
                  haptic.selection();
                  pickAccount(current, v);
                }} />
            </View>
            {current.atm ? null : (
              <View className="gap-2">
                <Text variant="eyebrow" className="px-0.5">Category</Text>
                <CategoryGrid
                  options={(categories ?? []).filter((x) => x.kind === current.type).map((x) => ({ value: x.id, label: x.name, color: x.color, icon: x.icon }))}
                  value={current.categoryId}
                  onPick={(v) => {
                    haptic.selection();
                    update(current.hash, { categoryId: v });
                  }}
                />
              </View>
            )}
            <View className="gap-1.5">
              <Text variant="eyebrow" className="px-0.5">Message</Text>
              <View className="rounded-input bg-fill p-3">
                <Text variant="small" tone="default" selectable>{current.sms.body}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function PeriodTile({ label, detail, active, onPress, wide, icon }: { label: string; detail: string; active: boolean; onPress: () => void; wide?: boolean; icon?: 'sync' }) {
  const primary = useThemeColor('primary');
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => {
        if (!active) haptic.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      className={cn(
        'min-h-[64px] justify-center gap-0.5 rounded-card border px-3.5 py-2.5',
        wide ? 'w-full flex-row items-center gap-3' : 'basis-[47%] grow',
        active ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
      )}>
      {icon ? <Icon name={icon} size={20} color={primary} /> : null}
      <View className={cn('gap-0.5', wide && 'flex-1')}>
        <Text weight="medium" className={active ? 'text-primary-fg' : undefined}>{label}</Text>
        {detail ? <Text variant="caption" tabular>{detail}</Text> : null}
      </View>
      {wide && active ? <Icon name="check" size={18} color={primary} /> : null}
    </PressableScale>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-input bg-fill px-3 py-2">
      <Text variant="caption">{label}</Text>
      <Text weight="semibold" tabular className="text-lg" style={color ? { color } : undefined}>{value}</Text>
    </View>
  );
}

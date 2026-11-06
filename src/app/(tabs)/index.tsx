import { isSmsReadingAvailable } from '@modules/sms-reader';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Pressable, RefreshControl, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { useWelcomeSeen } from '@/onboarding/welcome-seen';
import { categoryIcon, ChestMark, Icon } from '@/components/icons';
import { Amount, Button, Card, Divider, Empty, PressableScale, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { Motion } from '@/constants/theme';
import { useLiveQuery } from '@/db/events';
import { listTransactions } from '@/db/repo';
import { cn } from '@/lib/cn';
import { nextMonthDay } from '@/lib/card-cycle';
import { dateLabel, money, monthRange, tidyName } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { budgetOverview } from '@/budget/queries';
import { BUDGET_TEXT } from '@/components/budget-bar';
import { MonthSpendBars, PaceChart, RankedShares } from '@/components/charts';
import { categoryBreakdown, insights, monthlyTrend, netWorth, spendPace } from '@/reports/analytics';
import { pendingSms } from '@/sms/pending';
import { syncNow } from '@/sync/drive-sync';
import { describeSyncError } from '@/sync/errors';
import { useSyncStatus } from '@/sync/use-sync-status';
import { useThemeColors } from '@/theme/useThemeColor';



/** Sync state as a small coloured icon: green synced, teal spinning while syncing, amber offline, red problem. */
function SyncIcon({ label, spinning, tone, onPress }: { label: string; spinning: boolean; tone: { bg: string; ink: string }; onPress: () => void }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(spinning ? withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1) : withTiming(0, { duration: 0 }));
  }, [spinning, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));
  return (
    <PressableScale onPress={onPress} scaleTo={0.9} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} className={cn('h-8 w-8 items-center justify-center rounded-full', tone.bg)}>
      <Animated.View style={style}>
        <Icon name="sync" size={15} color={tone.ink} strokeWidth={2.4} />
      </Animated.View>
    </PressableScale>
  );
}

/** Staggered 220ms fade-up for each section (design system: 180–240ms ease-out). */
function Section({ i, children }: { i: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(Motion.base).delay(i * Motion.stagger)} className="gap-2">
      {children}
    </Animated.View>
  );
}

function ago(ms: number | null) {
  if (!ms) return 'not synced yet';
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : dateLabel(ms);
}

function shortDay(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'today';
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Next date for a given day of month (e.g. a card's statement day). */
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
/** Due within 3 days: shown in the warning colour. */
const isSoon = (t: number) => t - Date.now() < 3 * 86_400_000;

export default function Home() {
  const db = useSQLiteContext();
  const sync = useSyncStatus();
  // "Restore from Google Drive" on the welcome screens: open Backup once the app is up.
  useEffect(() => {
    if (!useWelcomeSeen.getState().restore) return;
    useWelcomeSeen.setState({ restore: false });
    router.push('/settings/sync');
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [primary, success, successFg, danger, warning, warningFg, fg, heroNegative, brassInk, brass, fgMuted] = useThemeColors([
    'primary',
    'success',
    'success-fg',
    'danger',
    'warning',
    'warning-fg',
    'fg',
    'hero-negative',
    'brass-fg',
    'brass',
    'fg-muted',
  ] as const);

  const { start, end } = monthRange(0);
  const { data: nw } = useLiveQuery(netWorth, ['accounts', 'transactions', 'investments', 'investment_entries']);
  const { data: month } = useLiveQuery(async (d) => (await monthlyTrend(d, 1))[0], ['transactions']);
  const { data: cats } = useLiveQuery((d) => categoryBreakdown(d, start, end), ['transactions', 'categories'], [start]);
  const { data: budget } = useLiveQuery((d) => budgetOverview(d, start, end), ['budgets', 'transactions', 'categories'], [start]);
  const atRisk = (budget?.categories ?? []).filter((c) => c.status.state !== 'ok').slice(0, 2);
  const { data: tips } = useLiveQuery(insights, ['transactions', 'accounts', 'investments']);
  const { data: recent } = useLiveQuery((d) => listTransactions(d, { limit: 5 }), ['transactions', 'accounts', 'categories']);
  // Bank SMS since the last import (no AI): checked on open, on return to the app and after imports.
  const { data: pending, reload: recheckSms } = useLiveQuery(pendingSms, ['transactions']);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && recheckSms());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: pace } = useLiveQuery((d) => spendPace(d), ['transactions']);
  const { data: trend } = useLiveQuery((d) => monthlyTrend(d, 6), ['transactions']);

  const spent = month?.expense ?? 0;
  const earned = month?.income ?? 0;
  const saved = earned - spent;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const monthName = now.toLocaleDateString('en-IN', { month: 'long' });
  // Last month's running total on the same day, for "₹X less than Oct by today".
  const prevByToday = pace ? (pace.previous[Math.min(pace.today, pace.previous.length - 1)] ?? 0) : 0;
  // Top five categories, the rest folded into one "Other" row.
  const shares = (() => {
    const list = (cats ?? []).filter((c) => c.total > 0);
    const top = list.slice(0, 5).map((c) => ({ key: c.id ?? c.name, name: c.name, color: c.color, icon: categoryIcon(c.name, undefined, c.icon), total: c.total }));
    const rest = list.slice(5).reduce((sum, c) => sum + c.total, 0);
    return rest > 0 ? [...top, { key: 'other', name: 'Other', color: '#8E8E93', icon: 'ms:category' as const, total: rest }] : top;
  })();
  const avgSpend = trend?.length ? trend.reduce((sum, m) => sum + m.expense, 0) / trend.length : 0;
  const tip = tips?.find((x) => !x.startsWith('Add a few'));

  const cardDues = (nw?.cards ?? []).filter((c) => c.due > 0.5);
  // Next installment after this month's dividend (estimated until the auction is recorded); finished chits drop off.
  const chits = (nw?.chits ?? []).filter((c) => !c.summary.done && c.summary.next);
  const emis = nw?.emis ?? [];
  const hasDues = cardDues.length > 0 || chits.length > 0 || emis.length > 0;
  const empty = recent && recent.length === 0 && nw && nw.bankCount === 0 && nw.investments === 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncNow(db);
    } catch (e) {
      // Offline isn't a failure: a calm note. Anything else: one plain sentence, never the raw server text.
      const { offline, message } = describeSyncError(e instanceof Error ? e.message : String(e));
      if (offline) toast.info('You’re offline', { description: 'Your changes are saved on this phone and will back up when you’re back online.' });
      else {
        haptic.error();
        toast.error('Couldn’t back up', { description: message ?? undefined });
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Backup state. "off" (only on this phone) is a choice, so it stays neutral, not a warning.
  const syncLabel =
    sync.state === 'off'
      ? 'Not backed up · set up Google Drive backup'
      : sync.state === 'locked'
        ? 'Backup locked · enter your sync password'
        : sync.state === 'syncing'
        ? 'Backing up…'
        : sync.state === 'offline'
          ? `Offline${sync.pending ? ` · ${sync.pending} to back up` : ''}`
          : sync.state === 'error'
            ? 'Backup problem · tap to retry'
            : `Backed up ${ago(sync.lastSyncAt)}`;
  const syncTone =
    sync.state === 'off'
      ? { bg: 'bg-fill', ink: fgMuted }
      : sync.state === 'error'
        ? { bg: 'bg-danger-soft', ink: danger }
        : sync.state === 'offline' || sync.state === 'locked'
          ? { bg: 'bg-warning-soft', ink: warningFg }
          : sync.state === 'syncing'
            ? { bg: 'bg-primary-soft', ink: primary }
            : { bg: 'bg-success-soft', ink: successFg };

  return (
    <View className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <Screen tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} colors={[primary]} />}>
        <View className="gap-3.5">
          {/* Greeting + sync state */}
          <Section i={0}>
            <View className="flex-row items-center justify-between gap-3">
              {/* Brand: the strongbox mark and name; the greeting lives in the net-worth card. */}
              <View className="min-w-0 flex-1 flex-row items-center gap-2.5" accessibilityRole="header" accessibilityLabel="Pettagam">
                <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-hero">
                  <ChestMark size={24} color={brass} />
                </View>
                <View className="min-w-0">
                  <Text variant="display" className="text-[22px] leading-[26px]" style={{ letterSpacing: -0.3 }} numberOfLines={1}>
                    Pettagam
                  </Text>
                  <Text variant="caption" tone="brass" className="font-tamil">
                    பெட்டகம்
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <SyncIcon
                  label={syncLabel}
                  spinning={sync.state === 'syncing'}
                  tone={syncTone}
                  onPress={() => (sync.state === 'error' ? syncNow(db).catch(() => {}) : router.push('/settings/sync'))}
                />
                <PressableScale
                  onPress={() => router.push('/ask')}
                  scaleTo={0.94}
                  accessibilityRole="button"
                  accessibilityLabel="Ask the AI assistant about your money"
                  className="h-10 flex-row items-center gap-1.5 rounded-[12px] bg-brass-soft px-3">
                  <Icon name="bulb" size={16} color={brassInk} strokeWidth={2.2} />
                  <Text variant="label" style={{ color: brassInk }}>Ask AI</Text>
                </PressableScale>
              </View>
            </View>
          </Section>

          {/* Net worth card */}
          <Section i={1}>
            <Card variant="hero" className="gap-3 rounded-[22px] p-4">
              <View className="flex-row items-baseline gap-1.5">
                <Text variant="small" className="font-tamil text-brass">
                  வணக்கம்
                </Text>
              </View>
              <View className="gap-1">
                <Text variant="eyebrow" className="text-on-hero-soft">
                  Net worth
                </Text>
                <Text
                  variant="display"
                  tone="onHero"
                  tabular
                  className="text-[28px] leading-8"
                  style={{ letterSpacing: -0.7 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {money(nw?.net ?? 0)}
                </Text>
                <Text variant="small" weight="medium" className={saved >= 0 ? 'text-hero-positive' : 'text-hero-negative'}>
                  {`${saved >= 0 ? '+' : '−'}${money(Math.abs(saved))} since ${dateLabel(start).slice(0, 6)}`}
                </Text>
              </View>
              <View className="flex-row gap-2 border-t border-white/15 pt-2.5">
                <HeroStat label="Banks" value={money(nw?.bank ?? 0)} />
                <HeroStat label="Invested" value={money(nw?.investments ?? 0)} />
                <HeroStat
                  label="Card dues"
                  value={`${(nw?.creditCardDue ?? 0) > 0 ? '−' : ''}${money(nw?.creditCardDue ?? 0)}`}
                  color={(nw?.creditCardDue ?? 0) > 0 ? heroNegative : undefined}
                />
              </View>
            </Card>
          </Section>

          {/* Updates under the net worth: bank SMS waiting to be imported, then what falls due soon. */}
          {pending && pending.count > 0 ? (
            <Section i={1}>
              <Card padded={false} className="flex-row items-center gap-2.5 rounded-2xl py-2.5 pl-3 pr-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-primary-soft">
                  <Icon name="sms" size={18} color={primary} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text variant="label" tone="default">
                    {`${pending.count} new bank SMS${pending.firstTime ? ' in 30 days' : ''}`}
                  </Text>
                  <Text variant="caption" tabular numberOfLines={1}>
                    {[pending.out > 0 ? `${money(pending.out)} out` : null, pending.in > 0 ? `${money(pending.in)} in` : null].filter(Boolean).join(' · ') ||
                      'Transfers and card payments'}
                  </Text>
                </View>
                <Button variant="tinted" size="sm" title="Review" onPress={() => router.push('/sms-import')} className="px-3.5" />
              </Card>
            </Section>
          ) : isSmsReadingAvailable && pending === null ? (
            // SMS can't be read yet (no permission): the plain prompt; Review asks for it.
            <Section i={1}>
              <Card padded={false} className="flex-row items-center gap-2.5 rounded-2xl py-2.5 pl-3 pr-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-primary-soft">
                  <Icon name="sms" size={18} color={primary} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text variant="label" tone="default">Bank SMS</Text>
                  <Text variant="caption">Turn your bank alerts into entries</Text>
                </View>
                <Button variant="tinted" size="sm" title="Review" onPress={() => router.push('/sms-import')} className="px-3.5" />
              </Card>
            </Section>
          ) : null}

          {/* Dues */}
          {hasDues ? (
            <Section i={2}>
              <SectionTitle title="Upcoming dues" action="Accounts" onAction={() => router.push('/accounts')} />
              <Card className="rounded-2xl px-3 py-0.5">
                {cardDues.map((c, i) => {
                  const pay = c.dueDay ? nextMonthDay(c.dueDay) : null;
                  return (
                    <View key={c.id}>
                      {i > 0 ? <Divider /> : null}
                      <Row
                        icon="card"
                        title={`${c.name}${c.last4 ? ` ••${c.last4}` : ''}`}
                        subtitle={pay ? `Pay by ${shortDate(pay)}` : c.billingDay ? `Statement ${shortDate(nextMonthDay(c.billingDay))}` : 'Outstanding'}
                        subtitleColor={pay && isSoon(pay) ? warning : undefined}
                        right={money(c.due)}
                        onPress={() => router.push({ pathname: '/account-form', params: { id: c.id } })}
                      />
                    </View>
                  );
                })}
                {emis.map((l, i) => {
                  const on = nextMonthDay(l.dueDay);
                  return (
                    <View key={l.id}>
                      {i > 0 || cardDues.length > 0 ? <Divider /> : null}
                      <Row
                        icon="bank"
                        title={`${l.name} EMI`}
                        subtitle={`${shortDate(on)} · ${money(l.outstanding)} left`}
                        subtitleColor={isSoon(on) ? warning : undefined}
                        right={l.emi ? money(l.emi) : undefined}
                        onPress={() => router.push({ pathname: '/account-form', params: { id: l.id } })}
                      />
                    </View>
                  );
                })}
                {chits.map(({ id, name, summary: c }, i) => (
                  <View key={id}>
                    {i > 0 || cardDues.length > 0 || emis.length > 0 ? <Divider /> : null}
                    <Row
                      icon="chit"
                      title={name}
                      subtitle={`Month ${c.next!.m} of ${c.schedule.length}${c.nextDueDate ? ` · ${dateLabel(c.nextDueDate).slice(0, 6)}` : ''}${c.next!.recorded ? '' : ' · est.'}`}
                      right={money(c.next!.net)}
                      onPress={() => router.push({ pathname: '/investment/[id]', params: { id } })}
                    />
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}


          {empty ? (
            <Section i={3}>
              <Empty
                text={'Start by adding your bank accounts and cards.\nAdd the last 4 digits so bank SMS match automatically.'}
                action={<Button size="sm" title="Add account" icon="plus" onPress={() => router.push('/account-form')} />}
              />
            </Section>
          ) : null}

          {/* This month's spending: the main chart, pace against last month and the budget. */}
          <Section i={3}>
            <SectionTitle title={`${monthName} spending`} action="Reports" onAction={() => router.push('/reports')} />
            <Card className="gap-3 rounded-2xl px-3.5 py-3.5">
              <View className="gap-0.5">
                <Amount size={24} weight="semibold" style={{ letterSpacing: -0.3 }}>
                  {money(spent)}
                </Amount>
                {pace && prevByToday > 0 ? (
                  <Text variant="small" tone={spent > prevByToday ? 'danger' : 'success'} tabular>
                    {`${money(Math.abs(spent - prevByToday))} ${spent > prevByToday ? 'more' : 'less'} than ${pace.previousLabel} by today`}
                  </Text>
                ) : (
                  <Text variant="small">{earned > 0 ? `of ${money(earned)} earned` : `${daysLeft} days left`}</Text>
                )}
              </View>

              {pace ? (
                <PaceChart
                  current={pace.current}
                  previous={pace.previous}
                  days={pace.days}
                  budget={budget?.overall?.budget.amount ?? null}
                  monthLabel={now.toLocaleDateString('en-IN', { month: 'short' })}
                  previousLabel={pace.previousLabel}
                />
              ) : null}

              <View className="gap-2 border-t border-line pt-2.5">
                {budget?.overall ? (
                  <Text variant="caption" tone={BUDGET_TEXT[budget.overall.status.state]} tabular>
                    {budget.overall.status.state === 'over'
                      ? `${money(budget.overall.status.over)} over budget · ${daysLeft} days left`
                      : `${money(budget.overall.status.remaining)} left · ${money(budget.overall.status.perDay)} a day for ${daysLeft} days`}
                  </Text>
                ) : (
                  <Text variant="caption">{earned > 0 ? `${money(earned)} earned · ${daysLeft} days left` : `${daysLeft} days left`}</Text>
                )}
                {atRisk.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {atRisk.map((c) => (
                      <Pressable
                        key={c.budget.id}
                        onPress={() => router.push('/budgets')}
                        className={cn('flex-row items-center gap-1.5 rounded-chip px-2.5 py-1', c.status.state === 'over' ? 'bg-danger-soft' : 'bg-warning-soft')}>
                        <Text variant="caption" weight="medium" tone={BUDGET_TEXT[c.status.state]}>
                          {c.category!.name.replace(/ & .*/, '')}{' '}
                          {c.status.state === 'over' ? `${money(c.status.over)} over` : `${Math.round(c.status.used * 100)}% used`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {budget && !budget.overall && budget.categories.length === 0 ? (
                  <Pressable onPress={() => router.push('/budgets')} hitSlop={6} className="self-start active:opacity-60">
                    <Text variant="caption" weight="medium" tone="primary">
                      Set a monthly budget ›
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          </Section>

          {/* Where it went: a ranked list, quieter than the main chart. */}
          {shares.length > 0 ? (
            <Section i={4}>
              <SectionTitle title="Where it went" action="Categories" onAction={() => router.push('/reports')} />
              <Card className="rounded-2xl px-3.5 py-3.5">
                <RankedShares items={shares} total={spent} onPress={() => router.push('/reports')} />
              </Card>
            </Section>
          ) : null}

          {/* The last six months, small. */}
          {trend && trend.some((m) => m.expense > 0) ? (
            <Section i={5}>
              <SectionTitle title="Last 6 months" detail={`${money(avgSpend)} a month on average`} />
              <Card className="rounded-2xl px-3.5 py-3.5">
                <MonthSpendBars months={trend.map((m) => ({ label: m.label, value: m.expense }))} />
              </Card>
            </Section>
          ) : null}

          {/* Insight */}
          {tip ? (
            <Section i={4}>
              <Card className="flex-row gap-2.5 rounded-2xl">
                <Icon name="bulb" size={18} color={brassInk} strokeWidth={2} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text variant="small" weight="medium" tone="brass">
                    Insight
                  </Text>
                  <Text tone="default">{tip}</Text>
                </View>
              </Card>
            </Section>
          ) : null}

          {/* Investments */}
          {nw && nw.allocation.length > 0 ? (
            <Section i={6}>
              <SectionTitle title="Investments" action="Portfolio" onAction={() => router.push('/investments')} />
              <View className="flex-row flex-wrap gap-2">
                {nw.allocation.slice(0, 4).map((a) => {
                  const g = a.invested > 0 ? ((a.value - a.invested) / a.invested) * 100 : 0;
                  return (
                    <Card
                      key={a.type}
                      onPress={() => router.push('/investments')}
                      className="w-[48%] grow gap-1 rounded-2xl p-3">
                      <Text variant="caption" weight="medium" numberOfLines={1}>
                        {a.label} · {a.count}
                      </Text>
                      <Amount size={16} weight="semibold" style={{ letterSpacing: -0.2 }}>
                        {money(a.value)}
                      </Amount>
                      <Text
                        variant="caption"
                        weight={g ? 'medium' : 'regular'}
                        tone="default"
                        style={{ color: g > 0 ? success : g < 0 ? danger : undefined }}
                        numberOfLines={1}>
                        {g ? `${g > 0 ? '+' : '−'}${Math.abs(g).toFixed(1)}% overall` : `${money(a.invested)} invested`}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            </Section>
          ) : null}

          {/* Recent */}
          {recent && recent.length > 0 ? (
            <Section i={7}>
              <SectionTitle title="Recent" action="All transactions" onAction={() => router.push('/transactions')} />
              <Card className="rounded-2xl px-3 py-0.5">
                {recent.map((r, i) => {
                  const sign = r.type === 'income' ? '+' : r.type === 'expense' ? '−' : '';
                  const title =
                    r.type === 'transfer'
                      ? `${r.account_name} → ${r.to_account_name ?? '?'}`
                      : tidyName(r.merchant ?? r.category_name ?? (r.type === 'income' ? 'Income' : 'Expense'));
                  return (
                    <View key={r.id}>
                      {i > 0 ? <Divider /> : null}
                      <Row
                        icon={categoryIcon(r.category_name, r.type, r.category_icon)}
                        iconColor={r.type === 'transfer' ? undefined : (r.category_color ?? undefined)}
                        title={title}
                        subtitle={[r.category_name, r.type !== 'transfer' ? r.account_name : null, shortDay(r.date)]
                          .filter(Boolean)
                          .join(' · ')}
                        right={`${sign}${money(r.amount)}`}
                        rightColor={r.type === 'income' ? success : r.type === 'expense' ? danger : fg}
                        onPress={() => router.push({ pathname: '/transaction-form', params: { id: r.id } })}
                      />
                    </View>
                  );
                })}
              </Card>
            </Section>
          ) : null}
        </View>
      </Screen>

    </View>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="caption" className="text-on-hero-soft" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="label"
        tone="onHero"
        tabular
        style={color ? { color } : undefined}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

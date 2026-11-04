import { isSmsReadingAvailable } from '@modules/sms-reader';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { useAuth } from '@/auth/session';
import { categoryIcon, ChestMark, Icon } from '@/components/icons';
import { Amount, Button, Card, Divider, Empty, IconTile, PressableScale, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { Motion } from '@/constants/theme';
import { useLiveQuery } from '@/db/events';
import { listTransactions } from '@/db/repo';
import { cn } from '@/lib/cn';
import { dateLabel, money, monthRange, tidyName } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { budgetOverview } from '@/budget/queries';
import { BUDGET_TEXT, BudgetBar } from '@/components/budget-bar';
import { categoryBreakdown, insights, monthlyTrend, netWorth } from '@/reports/analytics';
import { syncNow } from '@/sync/neon-sync';
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
function nextDay(day: number) {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(day, 28));
  return thisMonth.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    ? thisMonth
    : new Date(now.getFullYear(), now.getMonth() + 1, Math.min(day, 28));
}

export default function Home() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const sync = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [primary, success, successFg, danger, warning, warningFg, fg, heroNegative, brassInk, brass] = useThemeColors([
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
  ] as const);

  const { start, end } = monthRange(0);
  const { data: nw } = useLiveQuery(netWorth, ['accounts', 'transactions', 'investments', 'investment_entries']);
  const { data: month } = useLiveQuery(async (d) => (await monthlyTrend(d, 1))[0], ['transactions']);
  const { data: cats } = useLiveQuery((d) => categoryBreakdown(d, start, end), ['transactions', 'categories'], [start]);
  const { data: budget } = useLiveQuery((d) => budgetOverview(d, start, end), ['budgets', 'transactions', 'categories'], [start]);
  const atRisk = (budget?.categories ?? []).filter((c) => c.status.state !== 'ok').slice(0, 2);
  const { data: tips } = useLiveQuery(insights, ['transactions', 'accounts', 'investments']);
  const { data: recent } = useLiveQuery((d) => listTransactions(d, { limit: 5 }), ['transactions', 'accounts', 'categories']);

  const firstName = (user?.name || user?.email?.split('@')[0] || '').split(' ')[0];
  const spent = month?.expense ?? 0;
  const earned = month?.income ?? 0;
  const saved = earned - spent;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const topCats = (cats ?? []).slice(0, 4);
  const tip = tips?.find((x) => !x.startsWith('Add a few'));

  const cardDues = (nw?.cards ?? []).filter((c) => c.due > 0.5);
  // Next installment after this month's dividend (estimated until the auction is recorded); finished chits drop off.
  const chits = (nw?.chits ?? []).filter((c) => !c.summary.done && c.summary.next);
  const hasDues = cardDues.length > 0 || chits.length > 0;
  const empty = recent && recent.length === 0 && nw && nw.bankCount === 0 && nw.investments === 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncNow(db);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/network/i.test(msg)) toast.info('You’re offline', { description: 'Changes are saved and will upload later.' });
      else {
        haptic.error();
        toast.error('Couldn’t sync', { description: msg.slice(0, 140) });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const syncLabel =
    sync.state === 'syncing'
      ? 'Syncing…'
      : sync.state === 'offline'
        ? `Offline${sync.pending ? ` · ${sync.pending} to upload` : ''}`
        : sync.state === 'error'
          ? 'Sync problem · tap to retry'
          : `Synced ${ago(sync.lastSyncAt)}`;
  const syncTone =
    sync.state === 'error'
      ? { bg: 'bg-danger-soft', ink: danger }
      : sync.state === 'offline'
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
                  onPress={() => (sync.state === 'error' ? syncNow(db).catch(() => {}) : router.push('/more'))}
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
                  வணக்கம்,
                </Text>
                <Text variant="label" tone="onHero" className="shrink" numberOfLines={1}>
                  {firstName || 'there'}
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

          {/* SMS import (Android build only) */}
          {isSmsReadingAvailable ? (
            <Section i={2}>
              <Card padded={false} className="flex-row items-center gap-2.5 rounded-2xl py-2.5 pl-3 pr-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-primary-soft">
                  <Icon name="sms" size={18} color={primary} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text variant="label" tone="default">New bank SMS?</Text>
                  <Text variant="caption">Check the category before saving</Text>
                </View>
                <Button variant="tinted" size="sm" title="Review" onPress={() => router.push('/sms-import')} className="px-3.5" />
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

          {/* This month's spending */}
          <Section i={3}>
            <SectionTitle title={`${now.toLocaleDateString('en-IN', { month: 'long' })} spending`} action="Reports" onAction={() => router.push('/reports')} />
            <Card className="gap-2 rounded-2xl px-3.5 py-3">
              <View className="flex-row items-baseline justify-between gap-2">
                <Amount size={20} weight="semibold" style={{ letterSpacing: -0.2 }}>
                  {money(spent)}
                </Amount>
                {budget?.overall ? (
                  <Text variant="caption" tone={BUDGET_TEXT[budget.overall.status.state]} tabular>
                    {budget.overall.status.state === 'over'
                      ? `${money(budget.overall.status.over)} over budget`
                      : `${money(budget.overall.status.remaining)} left · ${money(budget.overall.status.perDay)}/day`}
                  </Text>
                ) : (
                  <Text variant="caption">
                    {earned <= 0 ? `${daysLeft} days left` : `of ${money(earned)} earned · ${daysLeft} days left`}
                  </Text>
                )}
              </View>
              {/* With a monthly budget the bar is the budget; otherwise spending against income. */}
              {budget?.overall ? (
                <BudgetBar used={budget.overall.status.used} state={budget.overall.status.state} />
              ) : earned > 0 ? (
                <View
                  className="h-1.5 overflow-hidden rounded-full bg-fill"
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${Math.round(Math.min(1, spent / earned) * 100)}% of income spent`}>
                  <View className={cn('h-full rounded-full', spent > earned ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, (spent / earned) * 100)}%` }} />
                </View>
              ) : null}
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
              {topCats.length > 0 ? (
                <View className="flex-row gap-2 pt-1">
                  {topCats.map((c) => (
                    <View key={c.name} className="flex-1 items-center gap-1.5">
                      <IconTile icon={categoryIcon(c.name, undefined, c.icon)} color={c.color} />
                      <Text variant="caption" numberOfLines={1}>
                        {c.name.replace(/ & .*/, '')}
                      </Text>
                      <Amount size={13} weight="medium">
                        {money(c.total)}
                      </Amount>
                    </View>
                  ))}
                </View>
              ) : (
                <Text variant="caption">No spending recorded this month yet</Text>
              )}
            </Card>
          </Section>

          {/* Insight */}
          {tip ? (
            <Section i={4}>
              <Card variant="brass" className="gap-1 rounded-2xl">
                <Text variant="eyebrow" tone="brass">
                  Insight
                </Text>
                <Text variant="muted" weight="regular" className="text-brass-deep">{tip}</Text>
              </Card>
            </Section>
          ) : null}

          {/* Dues */}
          {hasDues ? (
            <Section i={5}>
              <SectionTitle title="Upcoming dues" action="Accounts" onAction={() => router.push('/accounts')} />
              <Card className="rounded-2xl px-3 py-0.5">
                {cardDues.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 ? <Divider /> : null}
                    <Row
                      icon="card"
                      title={`${c.name}${c.last4 ? ` ••${c.last4}` : ''}`}
                      subtitle={c.billingDay ? `Statement ${dateLabel(nextDay(c.billingDay).getTime()).slice(0, 6)}` : 'Outstanding'}
                      subtitleColor={c.billingDay ? warning : undefined}
                      right={money(c.due)}
                      onPress={() => router.push({ pathname: '/account-form', params: { id: c.id } })}
                    />
                  </View>
                ))}
                {chits.map(({ id, name, summary: c }, i) => (
                  <View key={id}>
                    {i > 0 || cardDues.length > 0 ? <Divider /> : null}
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

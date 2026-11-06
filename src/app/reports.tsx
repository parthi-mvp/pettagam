import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { aiMonthSummary, aiTaxCheck, financialYear } from '@/ai/features';
import { AiNote } from '@/components/ai-note';
import { budgetOverview } from '@/budget/queries';
import { BUDGET_TEXT, BudgetBar } from '@/components/budget-bar';
import { CashFlowBars, CategoryTrendList, PaceChart, RankedShares, SpendCalendar } from '@/components/charts';
import { TxnList } from '@/components/txn-list';
import { listTransactions, tagTotals } from '@/db/repo';
import { categoryIcon, Icon } from '@/components/icons';
import { Amount, Button, Card, Divider, Empty, IconTile, MonthSwitcher, PressableScale, Row, Screen, SectionTitle, ShareBar, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { money, monthRange } from '@/lib/format';
import { cardStatements, categoryBreakdown, categoryTrend, dailySpend, exportCsv, insights, monthlyTrend, netWorth, paymentMethods, recurringPayments, spendPace, topMerchants } from '@/reports/analytics';
import { viaLabel } from '@/sms/parser';
import { SERIES_COLORS } from '@/theme/series';
import { useThemeColors } from '@/theme/useThemeColor';

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const CARD = 'rounded-2xl px-3.5 py-3.5';
/** "3 – 9 Oct", or one date when it's a single day. */
const spanLabel = (first: number, last: number) => {
  const f = (t: number, month: boolean) => new Date(t).toLocaleDateString('en-IN', month ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  if (new Date(first).toDateString() === new Date(last).toDateString()) return f(last, true);
  const sameMonth = new Date(first).getMonth() === new Date(last).getMonth() && new Date(first).getFullYear() === new Date(last).getFullYear();
  return `${f(first, !sameMonth)} – ${f(last, true)}`;
};
const CADENCE_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' } as const;

/** One titled block: the title sits outside its card, like Home. */
function Block({ title, action, onAction, detail, children }: { title: string; action?: string; onAction?: () => void; detail?: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 pt-3">
      <SectionTitle title={title} action={action} onAction={onAction} detail={detail} />
      {children}
    </View>
  );
}

export default function Reports() {
  const db = useSQLiteContext();
  const [offset, setOffset] = useState(0);
  const [today] = useState(() => Date.now());
  const [day, setDay] = useState<number | null>(null);
  const changeMonth = (o: number) => {
    setDay(null);
    setOffset(o);
  };
  const { start, end } = monthRange(offset);
  const deps = [start];
  // A past month is read as of its last day, so its pace line runs the whole month.
  const asOf = offset === 0 ? new Date() : new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0);
  const { data: cats } = useLiveQuery((d) => categoryBreakdown(d, start, end), ['transactions', 'categories'], deps);
  const { data: incomeCats } = useLiveQuery((d) => categoryBreakdown(d, start, end, 'income'), ['transactions', 'categories'], deps);
  const { data: pace } = useLiveQuery((d) => spendPace(d, asOf), ['transactions'], deps);
  const { data: budget } = useLiveQuery((d) => budgetOverview(d, start, end), ['budgets', 'transactions', 'categories'], deps);
  const { data: merchants } = useLiveQuery((d) => topMerchants(d, start, end), ['transactions'], deps);
  const { data: methods } = useLiveQuery((d) => paymentMethods(d, start, end), ['transactions'], deps);
  const { data: trend } = useLiveQuery((d) => monthlyTrend(d, 6), ['transactions']);
  const { data: catTrend } = useLiveQuery((d) => categoryTrend(d, 6, asOf), ['transactions', 'categories'], deps);
  const { data: incomeTrend } = useLiveQuery((d) => categoryTrend(d, 6, asOf, 'income'), ['transactions', 'categories'], deps);
  const { data: tags } = useLiveQuery(tagTotals, ['transactions']);
  const { data: daily } = useLiveQuery((d) => dailySpend(d, start, end), ['transactions'], deps);
  const dayStart = day == null ? null : new Date(new Date(start).getFullYear(), new Date(start).getMonth(), day + 1).getTime();
  const { data: dayRows } = useLiveQuery(
    (d) => (dayStart == null ? Promise.resolve([]) : listTransactions(d, { from: dayStart, to: dayStart + 86_400_000 })),
    ['transactions', 'accounts', 'categories'],
    [dayStart]
  );
  const { data: cardsDue } = useLiveQuery((d) => cardStatements(d), ['transactions', 'accounts', 'categories']);
  const { data: recurring } = useLiveQuery((d) => recurringPayments(d), ['transactions', 'categories']);
  const { data: nw } = useLiveQuery(netWorth, ['accounts', 'transactions', 'investments', 'investment_entries']);
  const { data: tips } = useLiveQuery(insights, ['transactions', 'accounts', 'investments']);
  const [brass, danger, muted] = useThemeColors(['brass', 'danger', 'fg-muted'] as const);

  const spent = cats?.reduce((s, c) => s + c.total, 0) ?? 0;
  const earned = incomeCats?.reduce((s, c) => s + c.total, 0) ?? 0;
  const saved = earned - spent;
  const monthShort = new Date(start).toLocaleDateString('en-IN', { month: 'short' });
  // Against last month: by the same day for the running month, whole months otherwise.
  const prevRef = pace ? (pace.previous[Math.min(pace.today, pace.previous.length - 1)] ?? 0) : 0;
  const diff = spent - prevRef;
  const shares = (cats ?? []).filter((c) => c.total > 0).map((c) => ({ key: c.id ?? c.name, name: c.name, color: c.color, icon: categoryIcon(c.name, undefined, c.icon), total: c.total }));
  const maxAlloc = nw?.allocation[0]?.value ?? 0;
  const trendItems = (catTrend ?? [])
    .filter((c) => c.months.some((v) => v > 0))
    .slice(0, 6)
    .map((c) => ({ key: c.id ?? 'none', name: c.name, color: c.color, icon: categoryIcon(c.name, undefined, c.icon), months: c.months }));
  const incomeItems = (incomeTrend ?? [])
    .filter((c) => c.months.some((v) => v > 0))
    .slice(0, 5)
    .map((c) => ({ key: c.id ?? 'none', name: c.name, color: c.color, icon: categoryIcon(c.name, undefined, c.icon), months: c.months }));
  const topTags = (tags ?? []).filter((t) => t.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 6);
  const year = new Date(start).getFullYear();
  const recurringMonthly = (recurring ?? []).reduce((s, r) => s + r.monthly, 0);

  const onExport = async () => {
    try {
      const csv = await exportCsv(db);
      await Share.share({ message: csv, title: 'transactions.csv' });
    } catch {
      Alert.alert('Export failed', 'Couldn’t prepare the file. Try again.');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <Button size="sm" variant="tinted" title="Export" onPress={onExport} /> }} />

      <MonthSwitcher offset={offset} onChange={changeMonth} />

      {/* The month at a glance: what went out, against last month, then in and kept. */}
      <Card className={`gap-3.5 ${CARD}`}>
        <View className="gap-0.5">
          <Text variant="small">Spent</Text>
          <Amount size={28} weight="semibold" style={{ letterSpacing: -0.4 }}>
            {money(spent)}
          </Amount>
          {pace && prevRef > 0 ? (
            <Text variant="small" tone={diff > 0 ? 'danger' : 'success'} tabular>
              {`${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${pace.previousLabel}${offset === 0 ? ' by today' : ''}`}
            </Text>
          ) : null}
        </View>
        {pace && (spent > 0 || prevRef > 0) ? (
          <PaceChart current={pace.current} previous={pace.previous} days={pace.days} budget={budget?.overall?.budget.amount ?? null} monthLabel={monthShort} previousLabel={pace.previousLabel} />
        ) : null}
        <View className="flex-row border-t border-line pt-3">
          <View className="flex-1 gap-0.5">
            <Text variant="caption">Money in</Text>
            <Amount size={16}>{money(earned)}</Amount>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption">{saved >= 0 ? 'Kept' : 'Short by'}</Text>
            <Amount size={16} style={saved < 0 ? { color: danger } : undefined}>
              {money(Math.abs(saved))}
            </Amount>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption">Savings rate</Text>
            <Amount size={16}>{earned > 0 ? pct(Math.max(0, saved), earned) : '—'}</Amount>
          </View>
        </View>
      </Card>

      <AiNote key={start} label="Summarise this month with AI" run={() => aiMonthSummary(db, offset)} />

      {/* Each day of the month, shaded by spend; tap one for its entries. */}
      {daily && pace && daily.some((d) => d.total > 0) ? (
        <Block title="Daily spending" detail={`${money(spent / (pace.today + 1))} a day on average`}>
          <Card className={`gap-3 ${CARD}`}>
            <SpendCalendar start={start} days={daily} lastDay={pace.today} pick={day} onPick={setDay} />
            {day != null ? (
              <View className="gap-0.5 border-t border-line pt-3">
                <Text tone="default" weight="medium">
                  {new Date(dayStart!).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text variant="small" tabular>
                  {daily[day].total > 0 ? `${money(daily[day].total)} spent · ${daily[day].count} ${daily[day].count === 1 ? 'entry' : 'entries'}` : 'Nothing spent'}
                </Text>
              </View>
            ) : (
              <Text variant="caption">Tap a day to see its entries</Text>
            )}
          </Card>
          {day != null && dayRows && dayRows.length > 0 ? <TxnList rows={dayRows} /> : null}
        </Block>
      ) : null}

      {/* Where it went: every category, ranked. */}
      <Block title="Where it went" detail={shares.length ? `${shares.length} categories` : undefined}>
        {cats && shares.length === 0 ? (
          <Empty text="No spending recorded this month." />
        ) : (
          <Card className={CARD}>
            <RankedShares items={shares} total={spent} />
          </Card>
        )}
      </Block>

      {/* Each category against its own usual: what's creeping up. */}
      {trendItems.length > 0 ? (
        <Block title="Category trends" detail="Last 6 months">
          <Card className={CARD}>
            <CategoryTrendList items={trendItems} />
          </Card>
        </Block>
      ) : null}

      {/* Budget vs actual for the selected month. */}
      {budget && (budget.overall || budget.categories.length > 0) ? (
        <Block title="Budgets" action="Edit" onAction={() => router.push('/budgets')}>
          <Card className={`gap-3.5 ${CARD}`}>
            {[
              ...(budget.overall ? [{ key: 'all', name: 'All spending', s: budget.overall.status }] : []),
              ...budget.categories.map((c) => ({ key: c.budget.id, name: c.category?.name ?? '', s: c.status })),
            ].map(({ key, name, s }) => (
              <View key={key} className="gap-1.5">
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text tone="default" className="shrink" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="small" tone={s.state === 'ok' ? 'muted' : BUDGET_TEXT[s.state]} tabular>
                    {`${money(s.spent)} of ${money(s.limit)}`}
                  </Text>
                </View>
                <BudgetBar used={s.used} state={s.state} thin />
              </View>
            ))}
          </Card>
        </Block>
      ) : null}

      {/* How the month's spending was paid; only once some entries say so. */}
      {methods && methods.some((m) => m.via) ? (
        <Block title="How you paid">
          <Card className={`gap-3 ${CARD}`}>
            {methods.map((m, i) => (
              <ShareBar
                key={m.via ?? 'none'}
                label={viaLabel(m.via) ?? 'Not recorded'}
                value={m.total}
                max={methods[0].total}
                color={m.via ? SERIES_COLORS[i % SERIES_COLORS.length] : '#8E8E93'}
                right={`${money(m.total)} · ${pct(m.total, spent)}`}
              />
            ))}
          </Card>
        </Block>
      ) : null}

      {merchants && merchants.length > 0 ? (
        <Block title="Top merchants">
          <Card padded={false} className="rounded-2xl px-3.5 py-1">
            {merchants.map((m, i) => (
              <View key={m.merchant}>
                {i > 0 ? <Divider /> : null}
                <Row icon="bag" title={m.merchant} subtitle={`${m.count} payment${m.count > 1 ? 's' : ''}`} right={money(m.total)} />
              </View>
            ))}
          </Card>
        </Block>
      ) : null}

      {trend && trend.some((m) => m.income > 0 || m.expense > 0) ? (
        <Block title="Cash flow" detail="Last 6 months">
          <Card className={CARD}>
            <CashFlowBars months={trend} />
          </Card>
        </Block>
      ) : null}

      {/* Credit cards by billing cycle, not calendar month: what the next statement will hold. */}
      {cardsDue && cardsDue.length > 0 ? (
        <Block title="Card statements" action="Accounts" onAction={() => router.push('/accounts')}>
          {cardsDue.map((c) => {
            const name = `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`;
            if (!c.open)
              return (
                <Card key={c.id} padded={false} className="rounded-2xl px-3.5 py-1">
                  <Row
                    icon="card"
                    title={name}
                    subtitle="Add its statement day to see each billing cycle"
                    onPress={() => router.push({ pathname: '/account-form', params: { id: c.id } })}
                  />
                </Card>
              );
            const fmt = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const lastDayOf = (end: number) => end - 86_400_000;
            return (
              <Card key={c.id} className={`gap-3 ${CARD}`}>
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text tone="default" weight="medium" numberOfLines={1} className="min-w-0 flex-1">
                    {name}
                  </Text>
                  <Text variant="caption">{`Statement ${fmt(c.open.statement)}`}</Text>
                </View>
                <View className="gap-0.5">
                  <Amount size={22} weight="semibold">
                    {money(c.open.total)}
                  </Amount>
                  <Text variant="small" tabular>
                    {`${fmt(c.open.start)} – ${fmt(lastDayOf(c.open.end))} · ${c.open.count} ${c.open.count === 1 ? 'entry' : 'entries'} so far`}
                  </Text>
                </View>
                {c.limit ? <BudgetBar used={c.open.total / c.limit} state={c.open.total > c.limit * 0.9 ? 'over' : c.open.total > c.limit * 0.7 ? 'near' : 'ok'} thin /> : null}
                {c.open.top.length > 0 ? (
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
                    {c.open.top.map((t) => (
                      <View key={t.id ?? 'none'} className="flex-row items-center gap-1.5">
                        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                        <Text variant="caption" tone="default">
                          {t.name}
                        </Text>
                        <Text variant="caption" tabular>
                          {money(t.total)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {c.last ? (
                  <Text variant="caption" tabular className="border-t border-line pt-2.5">
                    {`Last statement ${money(c.last.total)} · ${fmt(c.last.start)} – ${fmt(lastDayOf(c.last.end))}`}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </Block>
      ) : null}

      {/* Where the money comes from, each source against its usual. */}
      {incomeItems.length > 0 ? (
        <Block title="Income sources" detail="Last 6 months">
          <Card className={CARD}>
            <CategoryTrendList items={incomeItems} upIsGood />
          </Card>
        </Block>
      ) : null}

      {/* Trips, events, projects: spending across categories, by tag. */}
      {topTags.length > 0 ? (
        <Block title="By tag" action="All tags" onAction={() => router.push('/tags')}>
          <Card className={`gap-3.5 ${CARD}`}>
            {topTags.map((t) => (
              <PressableScale
                key={t.tag}
                scaleTo={0.99}
                onPress={() => router.push({ pathname: '/tag', params: { name: t.tag } })}
                accessibilityRole="button"
                accessibilityLabel={`${t.tag}: ${money(t.spent)}, ${t.count} entries`}
                className="gap-1.5">
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text tone="default" numberOfLines={1} className="min-w-0 flex-1">
                    {`#${t.tag}`}
                  </Text>
                  <Text weight="medium" tone="default" tabular>
                    {money(t.spent)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2.5">
                  <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                    <View className="h-full rounded-full bg-primary" style={{ width: `${(t.spent / topTags[0].spent) * 100}%` }} />
                  </View>
                  <Text variant="caption" tabular>
                    {`${t.count} ${t.count === 1 ? 'entry' : 'entries'} · ${spanLabel(t.first, t.last)}`}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </Card>
        </Block>
      ) : null}

      {/* Subscriptions, rent, EMIs, bills: found from steady payments, not entered by hand. */}
      {recurring && recurring.length > 0 ? (
        <Block title="Recurring payments" detail={`${money(recurringMonthly)} a month`}>
          <Card padded={false} className="rounded-2xl px-3.5 py-1">
            {recurring.map((r, i) => (
              <View key={r.merchant}>
                {i > 0 ? <Divider /> : null}
                <View className="flex-row items-center gap-2.5 py-3">
                  <IconTile icon={categoryIcon(r.category ?? '', undefined, r.icon)} color={r.color ?? '#8E8E93'} size={32} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text tone="default" numberOfLines={1}>
                      {r.merchant}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {`${CADENCE_LABEL[r.cadence]} · ${r.next < today ? 'due now' : `next ${new Date(r.next).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}`}
                    </Text>
                  </View>
                  <View className="items-end gap-0.5">
                    <Amount size={15}>{money(r.amount)}</Amount>
                    {r.cadence !== 'monthly' ? <Text variant="caption" tabular>{`${money(r.monthly)}/mo`}</Text> : null}
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </Block>
      ) : null}

      {tips && tips.length > 0 ? (
        <Block title="Insights">
          <Card className={`gap-3 ${CARD}`}>
            {tips.map((tip, i) => (
              <View key={i} className="flex-row gap-2.5">
                <Icon name="bulb" size={18} color={brass} strokeWidth={2} />
                <Text tone="default" className="min-w-0 flex-1">
                  {tip}
                </Text>
              </View>
            ))}
          </Card>
        </Block>
      ) : null}

      {/* The whole year: its own page. */}
      <PressableScale scaleTo={0.98} onPress={() => router.push({ pathname: '/year', params: { year: String(year) } })} accessibilityRole="button" className="pt-3">
        <Card className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5">
          <IconTile icon="ms:calendar_month" color={brass} size={36} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text tone="default" weight="medium">{`${year} in review`}</Text>
            <Text variant="caption">Totals, best and worst months, top categories</Text>
          </View>
          <Icon name="chevronRight" size={18} color={muted} />
        </Card>
      </PressableScale>

      <AiNote label={`Tax-saving check (80C) for ${financialYear().label}`} run={() => aiTaxCheck(db)} />

      {nw ? (
        <Block title="Net worth" action="Accounts" onAction={() => router.push('/accounts')}>
          <Card padded={false} className="rounded-2xl px-3.5 py-1">
            <Row icon="bank" title="Bank, cash & wallets" right={money(nw.bank)} />
            <Row icon="trend" title="Investments" right={money(nw.investments)} />
            <Row icon="card" title="Card dues" right={nw.creditCardDue > 0 ? `−${money(nw.creditCardDue)}` : money(0)} rightColor={nw.creditCardDue > 0 ? danger : undefined} />
            <Row icon="receipt" title="Loans" right={nw.loans > 0 ? `−${money(nw.loans)}` : money(0)} rightColor={nw.loans > 0 ? danger : undefined} />
            {nw.chitDues > 0 ? <Row icon="chit" title="Chit installments still owed" right={`−${money(nw.chitDues)}`} rightColor={danger} /> : null}
            <Divider />
            <View className="flex-row items-baseline justify-between py-3">
              <Text weight="medium" tone="default">
                Net worth
              </Text>
              <Amount size={18} weight="semibold" style={nw.net < 0 ? { color: danger } : undefined}>
                {nw.net < 0 ? `−${money(-nw.net)}` : money(nw.net)}
              </Amount>
            </View>
          </Card>
        </Block>
      ) : null}

      {nw && nw.allocation.length > 0 ? (
        <Block title="Investments" action="Open" onAction={() => router.push('/investments')}>
          <Card className={`gap-3 ${CARD}`}>
            {nw.allocation.map((a, i) => (
              <ShareBar key={a.type} label={a.label} value={a.value} max={maxAlloc} color={SERIES_COLORS[i % SERIES_COLORS.length]} right={`${money(a.value)} · ${pct(a.value, nw.investments)}`} />
            ))}
          </Card>
        </Block>
      ) : null}
    </Screen>
  );
}

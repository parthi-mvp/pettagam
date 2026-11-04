import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  Empty,
  MonthBars,
  MonthSwitcher,
  Row,
  Screen,
  SectionTitle,
  ShareBar,
  Stat,
  Text,
} from '@/components/ui';
import { aiMonthSummary, aiTaxCheck, financialYear } from '@/ai/features';
import { AiNote } from '@/components/ai-note';
import { budgetOverview } from '@/budget/queries';
import { BUDGET_TEXT, BudgetBar } from '@/components/budget-bar';
import { useLiveQuery } from '@/db/events';
import { SERIES_COLORS } from '@/theme/series';
import { useTheme } from '@/hooks/use-theme';
import { money, monthRange } from '@/lib/format';
import { categoryBreakdown, exportCsv, insights, monthlyTrend, netWorth, topMerchants } from '@/reports/analytics';

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');

export default function Reports() {
  const t = useTheme();
  const db = useSQLiteContext();
  const [offset, setOffset] = useState(0);
  const { start, end } = monthRange(offset);
  const deps = [start];
  const { data: cats } = useLiveQuery((d) => categoryBreakdown(d, start, end), ['transactions', 'categories'], deps);
  const { data: incomeCats } = useLiveQuery((d) => categoryBreakdown(d, start, end, 'income'), ['transactions', 'categories'], deps);
  const { data: budget } = useLiveQuery((d) => budgetOverview(d, start, end), ['budgets', 'transactions', 'categories'], deps);
  const { data: merchants } = useLiveQuery((d) => topMerchants(d, start, end), ['transactions'], deps);
  const { data: trend } = useLiveQuery((d) => monthlyTrend(d, 6), ['transactions']);
  const { data: nw } = useLiveQuery(netWorth, ['accounts', 'transactions', 'investments', 'investment_entries']);
  const { data: tips } = useLiveQuery(insights, ['transactions', 'accounts', 'investments']);

  const spent = cats?.reduce((s, c) => s + c.total, 0) ?? 0;
  const earned = incomeCats?.reduce((s, c) => s + c.total, 0) ?? 0;
  const saved = earned - spent;
  const maxCat = cats?.[0]?.total ?? 0;
  const maxAlloc = nw?.allocation[0]?.value ?? 0;

  const onExport = async () => {
    try {
      const csv = await exportCsv(db);
      await Share.share({ message: csv, title: 'transactions.csv' });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <Button size="sm" variant="tinted" title="Export CSV" onPress={onExport} /> }} />

      {/* This month */}
      <MonthSwitcher offset={offset} onChange={setOffset} />

      <Card className="gap-3">
        <View className="flex-row gap-3">
          <Stat label="Spent" value={money(spent)} color={spent ? t.danger : undefined} />
          <Stat label="Earned" value={money(earned)} color={earned ? t.success : undefined} />
          <Stat label={saved >= 0 ? 'Saved' : 'Overspent'} value={money(Math.abs(saved))} />
        </View>
        {earned > 0 ? (
          <Text variant="caption">
            {saved >= 0 ? `You kept ${pct(saved, earned)} of what came in.` : `You spent ${pct(spent, earned)} of what came in.`}
          </Text>
        ) : null}
      </Card>

      <AiNote key={start} label="Summarise this month with AI" run={() => aiMonthSummary(db, offset)} />

      {cats && cats.length === 0 ? (
        <Empty text="No spending recorded this month." />
      ) : (
        <Card className="gap-3">
          <SectionTitle title="Where it went" />
          {(cats ?? []).map((c) => (
            <ShareBar
              key={c.name}
              label={c.name}
              value={c.total}
              max={maxCat}
              color={c.color}
              right={`${money(c.total)} · ${pct(c.total, spent)}`}
            />
          ))}
        </Card>
      )}

      {/* Budget vs actual for the selected month. */}
      {budget && (budget.overall || budget.categories.length > 0) ? (
        <Card className="gap-3">
          <SectionTitle title="Budget vs actual" action="Budgets" onAction={() => router.push('/budgets')} />
          {[
            ...(budget.overall ? [{ key: 'all', name: 'All spending', s: budget.overall.status }] : []),
            ...budget.categories.map((c) => ({ key: c.budget.id, name: c.category?.name ?? '', s: c.status })),
          ].map(({ key, name, s }) => (
            <View key={key} className="gap-1.5">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text weight="medium" className="shrink text-lg" numberOfLines={1}>
                  {name}
                </Text>
                <Text variant="small" tone={s.state === 'ok' ? 'muted' : BUDGET_TEXT[s.state]} tabular>
                  {money(s.spent)} / {money(s.limit)}
                </Text>
              </View>
              <BudgetBar used={s.used} state={s.state} thin />
            </View>
          ))}
        </Card>
      ) : null}

      {merchants && merchants.length > 0 ? (
        <Card className="gap-0">
          <SectionTitle title="Top merchants" />
          {merchants.map((m, i) => (
            <View key={m.merchant}>
              {i > 0 ? <Divider /> : null}
              <Row icon="bag" title={m.merchant} subtitle={`${m.count} payment${m.count > 1 ? 's' : ''}`} right={money(m.total)} />
            </View>
          ))}
        </Card>
      ) : null}

      {/* Over time */}
      <View className="gap-2 pt-2">
        <SectionTitle title="Last 6 months" />
        <Card>{trend ? <MonthBars data={trend} /> : null}</Card>
      </View>

      {tips && tips.length > 0 ? (
        <Card variant="brass" className="gap-1.5">
          <Text variant="eyebrow" tone="brass">
            Insights
          </Text>
          {tips.map((tip, i) => (
            <Text key={i} variant="muted" weight="regular" className="text-brass-deep">
              {tip}
            </Text>
          ))}
        </Card>
      ) : null}

      <AiNote label={`Tax-saving check (80C) for ${financialYear().label}`} run={() => aiTaxCheck(db)} />

      {/* Overall */}
      {nw ? (
        <View className="gap-2 pt-2">
          <SectionTitle title="Net worth" />
          <Card className="gap-0">
            <Row icon="bank" title="Bank, cash & wallets" right={money(nw.bank)} />
            <Row icon="trend" title="Investments" right={money(nw.investments)} />
            <Row
              icon="card"
              title="Card dues"
              right={nw.creditCardDue > 0 ? `−${money(nw.creditCardDue)}` : money(0)}
              rightColor={nw.creditCardDue > 0 ? t.danger : undefined}
            />
            <Row
              icon="receipt"
              title="Loans"
              right={nw.loans > 0 ? `−${money(nw.loans)}` : money(0)}
              rightColor={nw.loans > 0 ? t.danger : undefined}
            />
            {nw.chitDues > 0 ? <Row icon="chit" title="Chit installments still owed" right={`−${money(nw.chitDues)}`} rightColor={t.danger} /> : null}
            <Divider className="my-1" />
            <View className="flex-row items-baseline justify-between py-1.5">
              <Text variant="heading">Net worth</Text>
              <Text variant="heading" tabular tone={nw.net < 0 ? 'danger' : 'default'}>
                {nw.net < 0 ? `−${money(-nw.net)}` : money(nw.net)}
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      {nw && nw.allocation.length > 0 ? (
        <View className="gap-2 pt-2">
          <SectionTitle title="Investments" />
          <Card className="gap-3">
            {nw.allocation.map((a, i) => (
              <ShareBar
                key={a.type}
                label={a.label}
                value={a.value}
                max={maxAlloc}
                color={SERIES_COLORS[i % SERIES_COLORS.length]}
                right={`${money(a.value)} · ${pct(a.value, nw.investments)}`}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

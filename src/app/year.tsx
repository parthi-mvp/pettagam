import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CashFlowBars, RankedShares } from '@/components/charts';
import { categoryIcon, Icon } from '@/components/icons';
import { Amount, Card, Divider, Empty, PressableScale, Row, Screen, SectionTitle, SegmentedControl, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { haptic } from '@/lib/haptics';
import { money, monthLabel } from '@/lib/format';
import { biggestExpense, categoryBreakdown, monthlyTrend, topMerchants } from '@/reports/analytics';
import { useThemeColors } from '@/theme/useThemeColor';

type Kind = 'calendar' | 'fy';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'calendar', label: 'Calendar year' },
  { value: 'fy', label: 'Financial year' },
];
const CARD = 'rounded-2xl px-3.5 py-3.5';

/** Jan–Dec, or Apr–Mar (the Indian financial year), starting in `year`. */
function period(kind: Kind, year: number) {
  const m = kind === 'fy' ? 3 : 0;
  return {
    start: new Date(year, m, 1).getTime(),
    end: new Date(year + 1, m, 1).getTime(),
    lastMonth: new Date(year + 1, m - 1, 1),
    label: kind === 'fy' ? `FY ${year}-${String(year + 1).slice(2)}` : String(year),
  };
}

export default function YearInReview() {
  const params = useLocalSearchParams<{ year?: string }>();
  const [now] = useState(() => new Date());
  const [kind, setKind] = useState<Kind>('calendar');
  const thisYear = (k: Kind) => (k === 'fy' && now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear());
  const [year, setYear] = useState(() => Number(params.year) || thisYear('calendar'));
  const p = period(kind, year);
  const prev = period(kind, year - 1);
  const deps = [p.start];
  const [ink, subtle, danger] = useThemeColors(['fg', 'fg-subtle', 'danger'] as const);

  const { data: months } = useLiveQuery((d) => monthlyTrend(d, 12, p.lastMonth), ['transactions'], deps);
  const { data: lastYear } = useLiveQuery((d) => monthlyTrend(d, 12, prev.lastMonth), ['transactions'], deps);
  const { data: cats } = useLiveQuery((d) => categoryBreakdown(d, p.start, p.end), ['transactions', 'categories'], deps);
  const { data: merchants } = useLiveQuery((d) => topMerchants(d, p.start, p.end, 5), ['transactions'], deps);
  const { data: biggest } = useLiveQuery((d) => biggestExpense(d, p.start, p.end), ['transactions', 'categories'], deps);

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const spent = sum((months ?? []).map((m) => m.expense));
  const earned = sum((months ?? []).map((m) => m.income));
  const kept = earned - spent;
  const prevSpent = sum((lastYear ?? []).map((m) => m.expense));
  // Best and worst among months that have happened and have spending.
  const past = (months ?? []).filter((m) => m.start <= now.getTime() && m.expense > 0);
  const heaviest = past.length ? past.reduce((a, b) => (b.expense > a.expense ? b : a)) : null;
  const lightest = past.length > 1 ? past.reduce((a, b) => (b.expense < a.expense ? b : a)) : null;
  const bestKept = past.length ? past.reduce((a, b) => (b.income - b.expense > a.income - a.expense ? b : a)) : null;
  const total = sum((cats ?? []).map((c) => c.total));
  const top = (cats ?? []).filter((c) => c.total > 0);
  const shares = [
    ...top.slice(0, 6).map((c) => ({ key: c.id ?? c.name, name: c.name, color: c.color, icon: categoryIcon(c.name, undefined, c.icon), total: c.total })),
    ...(top.length > 6 ? [{ key: 'other', name: 'Other', color: '#8E8E93', icon: 'ms:category' as const, total: sum(top.slice(6).map((c) => c.total)) }] : []),
  ];
  const canNext = period(kind, year + 1).start <= now.getTime();

  const step = (d: number) => {
    haptic.selection();
    setYear(year + d);
  };
  const arrow = 'h-9 w-9 items-center justify-center rounded-[10px] bg-surface shadow-card dark:bg-raised dark:shadow-none';

  return (
    <Screen>
      <SegmentedControl
        options={KINDS}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setYear(thisYear(k));
        }}
      />
      <View className="h-11 flex-row items-center rounded-input bg-fill p-1">
        <PressableScale accessibilityLabel="Previous year" scaleTo={0.92} onPress={() => step(-1)} className={arrow}>
          <Icon name="chevronLeft" size={18} color={ink} strokeWidth={2.2} />
        </PressableScale>
        <View className="flex-1 items-center" accessibilityLiveRegion="polite">
          <Text weight="semibold" tone="default">
            {p.label}
          </Text>
        </View>
        <PressableScale accessibilityLabel="Next year" scaleTo={0.92} disabled={!canNext} onPress={() => step(1)} className={arrow} style={{ opacity: canNext ? 1 : 0.4 }}>
          <Icon name="chevronRight" size={18} color={canNext ? ink : subtle} strokeWidth={2.2} />
        </PressableScale>
      </View>

      {months && spent === 0 && earned === 0 ? (
        <Empty text={`Nothing recorded in ${p.label}.`} />
      ) : (
        <>
          {/* The year in four numbers. */}
          <Card className={`gap-3.5 ${CARD}`}>
            <View className="gap-0.5">
              <Text variant="small">Spent</Text>
              <Amount size={28} weight="semibold" style={{ letterSpacing: -0.4 }}>
                {money(spent)}
              </Amount>
              {prevSpent > 0 ? (
                <Text variant="small" tone={spent > prevSpent ? 'danger' : 'success'} tabular>
                  {`${Math.round((Math.abs(spent - prevSpent) / prevSpent) * 100)}% ${spent > prevSpent ? 'more' : 'less'} than ${prev.label}`}
                </Text>
              ) : null}
            </View>
            <View className="flex-row border-t border-line pt-3">
              <View className="flex-1 gap-0.5">
                <Text variant="caption">Money in</Text>
                <Amount size={16}>{money(earned)}</Amount>
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption">{kept >= 0 ? 'Kept' : 'Short by'}</Text>
                <Amount size={16} style={kept < 0 ? { color: danger } : undefined}>
                  {money(Math.abs(kept))}
                </Amount>
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption">Savings rate</Text>
                <Amount size={16}>{earned > 0 ? `${Math.round((Math.max(0, kept) / earned) * 100)}%` : '—'}</Amount>
              </View>
            </View>
          </Card>

          {months ? (
            <View className="gap-2 pt-3">
              <SectionTitle title="Month by month" />
              <Card className={CARD}>
                <CashFlowBars months={months} />
              </Card>
            </View>
          ) : null}

          {heaviest ? (
            <View className="gap-2 pt-3">
              <SectionTitle title="Highlights" />
              <Card padded={false} className="rounded-2xl px-3.5 py-1">
                <Row icon="trend" title="Heaviest month" subtitle={monthLabel(heaviest.start)} right={money(heaviest.expense)} />
                {lightest ? (
                  <>
                    <Divider />
                    <Row icon="ms:eco" title="Lightest month" subtitle={monthLabel(lightest.start)} right={money(lightest.expense)} />
                  </>
                ) : null}
                {bestKept && bestKept.income > bestKept.expense ? (
                  <>
                    <Divider />
                    <Row icon="ms:savings" title="Kept the most" subtitle={monthLabel(bestKept.start)} right={money(bestKept.income - bestKept.expense)} />
                  </>
                ) : null}
                {biggest ? (
                  <>
                    <Divider />
                    <Row
                      icon="receipt"
                      title="Biggest single expense"
                      subtitle={`${biggest.merchant ?? biggest.note ?? biggest.category ?? 'Expense'} · ${new Date(biggest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      right={money(biggest.amount)}
                      onPress={() => router.push({ pathname: '/transaction-form', params: { id: biggest.id } })}
                    />
                  </>
                ) : null}
              </Card>
            </View>
          ) : null}

          {shares.length > 0 ? (
            <View className="gap-2 pt-3">
              <SectionTitle title="Where it went" />
              <Card className={CARD}>
                <RankedShares items={shares} total={total} />
              </Card>
            </View>
          ) : null}

          {merchants && merchants.length > 0 ? (
            <View className="gap-2 pt-3">
              <SectionTitle title="Top merchants" />
              <Card padded={false} className="rounded-2xl px-3.5 py-1">
                {merchants.map((m, i) => (
                  <View key={m.merchant}>
                    {i > 0 ? <Divider /> : null}
                    <Row icon="bag" title={m.merchant} subtitle={`${m.count} payment${m.count > 1 ? 's' : ''}`} right={money(m.total)} />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

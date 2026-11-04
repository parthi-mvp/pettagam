import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BankLogo } from '@/components/bank-logo';
import { INVESTMENT_TYPE_OPTIONS } from '@/components/pickers';
import { Button, Card, Divider, Empty, Header, IconTile, PressableScale, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { matchBank } from '@/catalog/banks';
import { useLiveQuery } from '@/db/events';
import { listInvestments } from '@/db/repo';
import { INVESTMENT_TYPE_LABELS, type Investment, type InvestmentType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { dateLabel, money, pct } from '@/lib/format';
import { usesGrams } from '@/lib/invest';
import { SERIES_COLORS } from '@/theme/series';

const ICON = Object.fromEntries(INVESTMENT_TYPE_OPTIONS.map((o) => [o.value, o.icon]));
const DAY = 86_400_000;
const SOON = 90 * DAY;

// Chits have no market gain (their result is on the chit screen), so they count at value, not at a fake loss.
const investedOf = (i: Investment) => (i.type === 'chit' ? i.current_value : i.invested_amount);

export default function Investments() {
  const t = useTheme();
  const { data: list } = useLiveQuery(listInvestments, ['investments', 'investment_entries']);
  const [filter, setFilter] = useState<InvestmentType | null>(null);
  const [now] = useState(() => Date.now());
  const items = list ?? [];

  const value = items.reduce((s, i) => s + i.current_value, 0);
  const invested = items.reduce((s, i) => s + investedOf(i), 0);
  const gain = value - invested;

  // Types by value, biggest first; each keeps one colour for the bar, legend and section.
  const types = [...new Set(items.map((i) => i.type))]
    .map((type) => {
      const group = items.filter((i) => i.type === type);
      return { type, group, value: group.reduce((s, i) => s + i.current_value, 0) };
    })
    .sort((a, b) => b.value - a.value)
    .map((g, idx) => ({ ...g, color: SERIES_COLORS[idx % SERIES_COLORS.length] }));

  const maturing = items
    .filter((i) => i.maturity_date && i.maturity_date >= now && i.maturity_date - now <= SOON)
    .sort((a, b) => a.maturity_date! - b.maturity_date!);

  const shown = filter ? types.filter((g) => g.type === filter) : types;
  const toggle = (type: InvestmentType) => {
    haptic.selection();
    setFilter((f) => (f === type ? null : type));
  };

  if (list && items.length === 0) {
    return (
      <Screen tab>
        <Header title="Investments" />
        <Empty
          text={'Track FDs, post office schemes, PPF, EPF, NPS, mutual funds, stocks, gold, chit funds and more.\nEverything you own, in one place.'}
          action={<Button size="sm" icon="plus" title="Add investment" onPress={() => router.push('/investment-form')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen tab>
      <Header title="Investments" subtitle={`${items.length} holding${items.length === 1 ? '' : 's'} across ${types.length} type${types.length === 1 ? '' : 's'}`}>
        <Button size="sm" variant="tinted" icon="plus" title="Add" onPress={() => router.push('/investment-form')} />
      </Header>

      {/* Portfolio: same hero language as Home's net worth. */}
      <Card variant="hero" className="gap-3 rounded-[22px] p-4">
        <View className="gap-1">
          <Text variant="eyebrow" className="text-on-hero-soft">
            Portfolio value
          </Text>
          <Text variant="display" tone="onHero" tabular className="text-[28px] leading-8" style={{ letterSpacing: -0.7 }} numberOfLines={1} adjustsFontSizeToFit>
            {money(value)}
          </Text>
          {invested > 0 ? (
            <Text variant="small" weight="medium" className={gain >= 0 ? 'text-hero-positive' : 'text-hero-negative'}>
              {`${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))} (${pct((gain / invested) * 100)}) overall`}
            </Text>
          ) : null}
        </View>
        <View className="flex-row gap-2 border-t border-white/15 pt-2.5">
          <HeroStat label="Invested" value={money(invested)} />
          <HeroStat label="Holdings" value={String(items.length)} />
          <HeroStat label="Maturing soon" value={String(maturing.length)} />
        </View>
      </Card>

      {/* Allocation: one stacked bar; the legend filters the list below. */}
      {types.length > 1 && value > 0 ? (
        <Card className="gap-3">
          <View className="h-2.5 flex-row gap-[2px] overflow-hidden rounded-full">
            {types.map((g) =>
              g.value > 0 ? (
                <View key={g.type} style={{ flex: g.value, backgroundColor: g.color, opacity: filter && filter !== g.type ? 0.25 : 1 }} />
              ) : null
            )}
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {types.map((g) => {
              const active = filter === g.type;
              return (
                <PressableScale
                  key={g.type}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show only ${INVESTMENT_TYPE_LABELS[g.type]}`}
                  onPress={() => toggle(g.type)}
                  className={cn('h-7 flex-row items-center gap-1.5 rounded-chip border px-2.5', active ? 'border-primary bg-primary-soft' : 'border-line')}>
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                  <Text variant="caption" weight="medium" tone="default">
                    {INVESTMENT_TYPE_LABELS[g.type]}
                  </Text>
                  <Text variant="caption" tabular>
                    {value ? `${Math.round((g.value / value) * 100)}%` : ''}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* What needs attention: maturities in the next 90 days. */}
      {maturing.length > 0 && !filter ? (
        <View className="gap-2">
          <SectionTitle title="Maturing soon" />
          <Card variant="brass" className="gap-0 py-1">
            {maturing.map((i, idx) => {
              const days = Math.ceil((i.maturity_date! - now) / DAY);
              return (
                <View key={i.id}>
                  {idx > 0 ? <Divider /> : null}
                  <Row
                    leading={<Leading inv={i} />}
                    title={i.name}
                    subtitle={`${dateLabel(i.maturity_date!)} · in ${days} day${days === 1 ? '' : 's'}`}
                    right={money(i.current_value)}
                    onPress={() => router.push({ pathname: '/investment/[id]', params: { id: i.id } })}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Holdings by type, biggest first. */}
      {shown.map((g) => (
        <View key={g.type} className="gap-2">
          <SectionTitle title={INVESTMENT_TYPE_LABELS[g.type]} dot={g.color} detail={money(g.value)} />
          <Card className="gap-0 py-1">
            {g.group.map((i, idx) => {
              const gi = i.current_value - i.invested_amount;
              const prized = i.type === 'chit' && i.current_value === 0 && i.invested_amount > 0;
              const showGain = i.invested_amount > 0 && i.type !== 'chit';
              const sub = [
                i.institution,
                i.quantity ? `${i.quantity} ${usesGrams(i.type) ? 'g' : 'units'}` : null,
                i.interest_rate ? `${i.interest_rate}%` : null,
                i.maturity_date ? `matures ${dateLabel(i.maturity_date)}` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <View key={i.id}>
                  {idx > 0 ? <Divider /> : null}
                  <Row
                    leading={<Leading inv={i} />}
                    title={i.name}
                    subtitle={sub || null}
                    right={money(i.current_value)}
                    rightSub={showGain ? `${gi >= 0 ? '+' : ''}${pct((gi / i.invested_amount) * 100)}` : prized ? 'Prized' : null}
                    rightSubColor={showGain && gi !== 0 ? (gi > 0 ? t.success : t.danger) : undefined}
                    onPress={() => router.push({ pathname: '/investment/[id]', params: { id: i.id } })}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

/** The bank's logo for deposits at a known bank (an SBI FD), else the type's icon. */
function Leading({ inv }: { inv: Investment }) {
  const icon = ICON[inv.type] ?? 'trend';
  return matchBank(inv.institution) ? <BankLogo institution={inv.institution} fallback={icon} /> : <IconTile icon={icon} />;
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="caption" className="text-on-hero-soft" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" tone="onHero" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

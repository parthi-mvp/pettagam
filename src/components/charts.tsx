import { useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { money, moneyExact } from '@/lib/format';
import { useThemeColors } from '@/theme/useThemeColor';

import type { AnyIcon } from './icons';
import { IconTile, PressableScale, Text } from './ui';

type Pt = { x: number; y: number };

/** A smooth line through the points (Catmull-Rom as cubic Béziers), kept inside the plot's top and bottom. */
function smooth(pts: Pt[], top: number, bottom: number) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const clamp = (y: number) => Math.min(bottom, Math.max(top, y));
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${clamp(p1.y + (p2.y - p0.y) / 6)} ${p2.x - (p3.x - p1.x) / 6},${clamp(p2.y - (p3.y - p1.y) / 6)} ${p2.x},${p2.y}`;
  }
  return d;
}

const H = 148;
const PAD = { top: 14, bottom: 22 };

/**
 * The Home's main chart: this month's running spend (accent line, soft fill, brass "today" marker)
 * against last month's (thin, light neutral line) and the monthly budget (hairline). Touch and drag to
 * read any day; the readout names both months, so colour is never the only key.
 */
export function PaceChart({
  current,
  previous,
  days,
  budget,
  monthLabel,
  previousLabel,
}: {
  current: number[];
  previous: number[];
  days: number;
  budget?: number | null;
  monthLabel: string;
  previousLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [accent, muted, subtle, line, brass, surface] = useThemeColors(['primary', 'fg-muted', 'fg-subtle', 'line', 'brass', 'surface'] as const);

  const prevShown = previous.slice(0, days);
  const top = Math.max(1, ...current, ...prevShown, budget ?? 0) * 1.08;
  const plotBottom = H - PAD.bottom;
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * width);
  const y = (v: number) => plotBottom - (v / top) * (plotBottom - PAD.top);
  const curPts = current.map((v, i) => ({ x: x(i), y: y(v) }));
  const prevPts = prevShown.map((v, i) => ({ x: x(i), y: y(v) }));
  const today = curPts[curPts.length - 1];
  const curPath = smooth(curPts, PAD.top, plotBottom);
  const area = today ? `${curPath} L${today.x},${plotBottom} L0,${plotBottom} Z` : '';

  const scrub = (e: GestureResponderEvent) => {
    if (!width) return;
    setPick(Math.max(0, Math.min(days - 1, Math.round((e.nativeEvent.locationX / width) * (days - 1)))));
  };
  const pickCur = pick != null && pick < current.length ? current[pick] : null;
  const pickPrev = pick != null && pick < prevShown.length ? prevShown[pick] : null;

  return (
    <View className="gap-2">
      <View
        style={{ height: H }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={scrub}
        onResponderMove={scrub}
        onResponderRelease={() => setPick(null)}
        onResponderTerminate={() => setPick(null)}
        accessibilityRole="image"
        accessibilityLabel={`${monthLabel} spending so far ${money(current[current.length - 1] ?? 0)}; ${previousLabel} by the same day ${money(prevShown[current.length - 1] ?? 0)}${budget ? `; budget ${money(budget)}` : ''}`}>
        {width ? (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={0.18} />
                <Stop offset="1" stopColor={accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {/* Recessive grid: three hairlines. */}
            {[0.33, 0.66, 1].map((f) => (
              <Line key={f} x1={0} x2={width} y1={PAD.top + (plotBottom - PAD.top) * f} y2={PAD.top + (plotBottom - PAD.top) * f} stroke={line} strokeWidth={1} />
            ))}
            {/* Budget: a solid hairline with its label; last month: thinner and lighter than this month. */}
            {budget ? <Line x1={0} x2={width} y1={y(budget)} y2={y(budget)} stroke={subtle} strokeWidth={1} /> : null}
            <Path d={smooth(prevPts, PAD.top, plotBottom)} fill="none" stroke={muted} strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={area} fill="url(#paceFill)" />
            <Path d={curPath} fill="none" stroke={accent} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
            {pick != null ? <Line x1={x(pick)} x2={x(pick)} y1={PAD.top} y2={plotBottom} stroke={muted} strokeWidth={1} /> : null}
            {pick != null && pickPrev != null ? <Circle cx={x(pick)} cy={y(pickPrev)} r={4} fill={muted} stroke={surface} strokeWidth={2} /> : null}
            {pick != null && pickCur != null ? <Circle cx={x(pick)} cy={y(pickCur)} r={4.5} fill={accent} stroke={surface} strokeWidth={2} /> : null}
            {/* Signature: the brass "today" marker at the end of this month's line. */}
            {today && pick == null ? <Circle cx={today.x} cy={today.y} r={5} fill={brass} stroke={surface} strokeWidth={2.5} /> : null}
            <Rect x={0} y={plotBottom} width={width} height={1} fill={line} />
          </Svg>
        ) : null}

        {budget && width ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: Math.max(0, y(budget) - 18) }}>
            <Text variant="caption" tabular>{`Budget ${money(budget)}`}</Text>
          </View>
        ) : null}

        {pick != null && width ? (
          // Readout: the day, then each month by name and amount.
          <View
            pointerEvents="none"
            className="absolute top-0 gap-0.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5"
            style={{ left: Math.min(Math.max(0, x(pick) - 64), width - 128), width: 128 }}>
            <Text variant="caption">{`Day ${pick + 1}`}</Text>
            {pickCur != null ? <Text variant="small" weight="semibold" tone="default" tabular>{`${monthLabel} ${moneyExact(pickCur)}`}</Text> : null}
            {pickPrev != null ? <Text variant="caption" tabular>{`${previousLabel} ${moneyExact(pickPrev)}`}</Text> : null}
          </View>
        ) : null}

        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 flex-row justify-between">
          <Text variant="caption">1</Text>
          <Text variant="caption">{Math.ceil(days / 2)}</Text>
          <Text variant="caption">{days}</Text>
        </View>
      </View>

      {/* Legend: line style + name, so the two months never rely on colour alone. */}
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <LegendSwatch color={accent} label={monthLabel} />
        <LegendSwatch color={muted} label={previousLabel} light />
        <Text variant="caption">Drag to read a day</Text>
      </View>
    </View>
  );
}

function LegendSwatch({ color, label, light }: { color: string; label: string; light?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={18} height={4}>
        <Line x1={1} x2={17} y1={2} y2={2} stroke={color} strokeOpacity={light ? 0.55 : 1} strokeWidth={light ? 1.5 : 2.25} strokeLinecap="round" />
      </Svg>
      <Text variant="caption" tone="default">
        {label}
      </Text>
    </View>
  );
}

/**
 * Where the month's money went, as a ranked list: icon, name, amount and share, with a thin bar in
 * the category's own colour. Secondary to the pace chart, so a different, quieter kind of figure.
 */
export function RankedShares({
  items,
  total,
  onPress,
}: {
  items: { key: string; name: string; color: string; icon: AnyIcon; total: number }[];
  total: number;
  onPress?: () => void;
}) {
  const [fill] = useThemeColors(['fill'] as const);
  const top = items[0]?.total ?? 1;
  return (
    <View className="gap-3">
      {items.map((it) => (
        <PressableScale key={it.key} scaleTo={0.99} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${it.name}, ${money(it.total)}, ${Math.round((it.total / total) * 100)}%`}>
          <View className="flex-row items-center gap-2.5">
            <IconTile icon={it.icon} color={it.color} size={32} />
            <View className="min-w-0 flex-1 gap-1.5">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text tone="default" numberOfLines={1} className="min-w-0 flex-1">
                  {it.name}
                </Text>
                <Text weight="medium" tone="default" tabular>
                  {money(it.total)}
                </Text>
                <Text variant="caption" tabular className="w-9 text-right">
                  {`${Math.round((it.total / total) * 100)}%`}
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: fill }}>
                <View className="h-full rounded-full" style={{ width: `${(it.total / top) * 100}%`, backgroundColor: it.color }} />
              </View>
            </View>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

/**
 * Spending for the last few months as small bars: the current month in the accent, the rest neutral.
 * Tap a bar to read its amount; the current month's shows by default.
 */
export function MonthSpendBars({ months }: { months: { label: string; value: number }[] }) {
  const [accent, neutral] = useThemeColors(['primary', 'line-strong'] as const);
  const last = months.length - 1;
  const [pick, setPick] = useState(last);
  const max = Math.max(1, ...months.map((m) => m.value));
  const BAR_H = 64;
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text variant="caption">{months[pick]?.label}</Text>
        <Text weight="semibold" tone="default" tabular>
          {money(months[pick]?.value ?? 0)}
        </Text>
      </View>
      <View className="flex-row items-end gap-2" style={{ height: BAR_H }}>
        {months.map((m, i) => (
          <PressableScale
            key={m.label}
            scaleTo={0.96}
            onPress={() => setPick(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === pick }}
            accessibilityLabel={`${m.label}: ${money(m.value)}`}
            className="h-full flex-1 justify-end">
            <View
              className="rounded-t-[4px]"
              style={{ height: Math.max(3, (m.value / max) * BAR_H), backgroundColor: i === last ? accent : neutral, opacity: i === pick || i === last ? 1 : 0.75 }}
            />
          </PressableScale>
        ))}
      </View>
      <View className="flex-row gap-2">
        {months.map((m, i) => (
          <Text key={m.label} variant="caption" align="center" weight={i === pick ? 'semibold' : 'regular'} tone={i === pick ? 'default' : 'muted'} className="flex-1">
            {m.label.split(' ')[0]}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Money in and out for the last few months as paired bars: spending in the accent (what this app
 * watches), income as a quiet neutral beside it. Tap a month to read in, out and what was kept.
 */
export function CashFlowBars({ months }: { months: { label: string; income: number; expense: number }[] }) {
  const [accent, neutral] = useThemeColors(['primary', 'line-strong'] as const);
  const last = months.length - 1;
  const [pick, setPick] = useState(last);
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const BAR_H = 112;
  // A full year (12 pairs) needs thinner bars to fit a phone's width.
  const bar = months.length > 8 ? 'w-[6px]' : 'w-[9px]';
  const m = months[pick];
  const kept = m ? m.income - m.expense : 0;
  return (
    <View className="gap-3">
      {m ? (
        <View className="flex-row items-baseline justify-between gap-3">
          <Text variant="small" tone="default" weight="medium">
            {m.label}
          </Text>
          <Text variant="small" tabular numberOfLines={1} className="shrink">
            {`In ${money(m.income)} · Out ${money(m.expense)} · `}
            <Text variant="small" weight="medium" tone={kept < 0 ? 'danger' : 'default'} tabular>
              {kept < 0 ? `Short ${money(-kept)}` : `Kept ${money(kept)}`}
            </Text>
          </Text>
        </View>
      ) : null}
      <View className={months.length > 8 ? 'flex-row items-end gap-1' : 'flex-row items-end gap-2'} style={{ height: BAR_H }}>
        {months.map((mo, i) => (
          <PressableScale
            key={mo.label}
            scaleTo={0.96}
            onPress={() => setPick(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === pick }}
            accessibilityLabel={`${mo.label}: in ${money(mo.income)}, out ${money(mo.expense)}`}
            className="h-full flex-1 flex-row items-end justify-center gap-[3px]"
            style={{ opacity: i === pick ? 1 : 0.6 }}>
            <View className={`${bar} rounded-t-[3px]`} style={{ height: Math.max(2, (mo.income / max) * BAR_H), backgroundColor: neutral }} />
            <View className={`${bar} rounded-t-[3px]`} style={{ height: Math.max(2, (mo.expense / max) * BAR_H), backgroundColor: accent }} />
          </PressableScale>
        ))}
      </View>
      <View className={months.length > 8 ? 'flex-row gap-1' : 'flex-row gap-2'}>
        {months.map((mo, i) => (
          <Text key={mo.label} variant="caption" align="center" weight={i === pick ? 'semibold' : 'regular'} tone={i === pick ? 'default' : 'muted'} className="flex-1" numberOfLines={1}>
            {months.length > 8 ? mo.label.slice(0, 1) : mo.label.split(' ')[0]}
          </Text>
        ))}
      </View>
      <View className="flex-row items-center gap-4">
        <Swatch color={neutral} label="Money in" />
        <Swatch color={accent} label="Spent" />
      </View>
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      <Text variant="caption" tone="default">
        {label}
      </Text>
    </View>
  );
}

/**
 * Each category's last few months as a row: this month's amount, how it compares with its usual
 * (the three months before), and small bars in the category's colour with this month solid.
 */
export function CategoryTrendList({
  items,
  upIsGood,
}: {
  items: { key: string; name: string; color: string; icon: AnyIcon; months: number[] }[];
  /** Income: going up is good (green), the opposite of spending. */
  upIsGood?: boolean;
}) {
  const BAR_H = 24;
  return (
    <View className="gap-3.5">
      {items.map((it) => {
        const now = it.months[it.months.length - 1] ?? 0;
        const before = it.months.slice(-4, -1);
        const usual = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
        const change = usual > 0 ? (now - usual) / usual : null;
        const max = Math.max(1, ...it.months);
        const note =
          change == null ? (now > 0 ? 'New this month' : '') : Math.abs(change) < 0.1 ? 'About usual' : `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}% vs usual`;
        return (
          <View
            key={it.key}
            className="flex-row items-center gap-2.5"
            accessible
            accessibilityLabel={`${it.name}: ${money(now)} this month. ${note}. Usual ${money(usual)}.`}>
            <IconTile icon={it.icon} color={it.color} size={32} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text tone="default" numberOfLines={1}>
                {it.name}
              </Text>
              <Text variant="caption" tone={change == null || Math.abs(change) < 0.1 ? 'muted' : change > 0 === !upIsGood ? 'danger' : 'success'} tabular>
                {note || `Usually ${money(usual)}`}
              </Text>
            </View>
            <View className="flex-row items-end gap-[3px]" style={{ height: BAR_H }}>
              {it.months.map((v, i) => (
                <View
                  key={i}
                  className="w-[5px] rounded-t-[2px]"
                  style={{ height: Math.max(2, (v / max) * BAR_H), backgroundColor: it.color, opacity: i === it.months.length - 1 ? 1 : 0.32 }}
                />
              ))}
            </View>
            <Text weight="medium" tone="default" tabular className="w-[76px] text-right">
              {money(now)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A month as a calendar, each day shaded by what was spent (one hue, light to dark; empty days stay
 * neutral). Tap a day to pick it. Days after `lastDay` (the rest of the running month) are faint.
 */
export function SpendCalendar({
  start,
  days,
  lastDay,
  pick,
  onPick,
}: {
  start: number;
  days: { total: number; count: number }[];
  lastDay: number;
  pick: number | null;
  onPick: (day: number | null) => void;
}) {
  const [accent, fg, onAccent, fill] = useThemeColors(['primary', 'fg', 'on-primary', 'fill'] as const);
  const lead = (new Date(start).getDay() + 6) % 7; // Monday first
  const max = Math.max(1, ...days.map((d) => d.total));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...days.map((_, i) => i)];
  while (cells.length % 7) cells.push(null);
  return (
    <View className="gap-1.5">
      <View className="flex-row">
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="caption" align="center" className="flex-1">
            {w}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((i, k) => {
          if (i == null) return <View key={k} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const d = days[i];
          const future = i > lastDay;
          // Square root, so one big day doesn't wash every other day out.
          const level = d.total > 0 ? 0.18 + 0.82 * Math.sqrt(d.total / max) : 0;
          const dark = level > 0.6;
          const label = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), i + 1).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <View key={k} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <PressableScale
                scaleTo={0.92}
                disabled={future}
                onPress={() => onPick(pick === i ? null : i)}
                accessibilityRole="button"
                accessibilityState={{ selected: pick === i, disabled: future }}
                accessibilityLabel={`${label}: ${d.total > 0 ? money(d.total) : 'nothing spent'}`}
                className="flex-1 items-center justify-center rounded-[8px]"
                style={{
                  backgroundColor: level ? accent : fill,
                  opacity: future ? 0.35 : 1,
                  borderWidth: pick === i ? 2 : 0,
                  borderColor: fg,
                }}>
                {level ? <View className="absolute inset-0 rounded-[8px]" style={{ backgroundColor: fill, opacity: 1 - level }} /> : null}
                <Text variant="caption" weight={pick === i ? 'semibold' : 'regular'} tabular style={{ color: dark ? onAccent : fg }}>
                  {i + 1}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </View>
      <View className="flex-row items-center justify-end gap-1.5">
        <Text variant="caption">Less</Text>
        {[0, 0.35, 0.65, 1].map((l) => (
          <View key={l} className="h-2.5 w-2.5 overflow-hidden rounded-[3px]" style={{ backgroundColor: l ? accent : fill }}>
            {l ? <View className="absolute inset-0" style={{ backgroundColor: fill, opacity: 1 - (0.18 + 0.82 * l) }} /> : null}
          </View>
        ))}
        <Text variant="caption">More</Text>
      </View>
    </View>
  );
}

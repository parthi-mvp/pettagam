import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { aiChitAdvice } from '@/ai/features';
import { recomputeInvested, save } from '@/db/repo';
import type { Investment, InvestmentEntry } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import {
  bidCostPct,
  chitPlan,
  chitSummary,
  DISCOUNT_WARN_PCT,
  maxDiscountFor,
  monthMath,
  waitReturnPct,
  type ChitAuction,
  type ChitDetails,
} from '@/lib/chit';
import { dateLabel, money, parseDate, toInputDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { parseDetails } from '@/lib/invest';

import { AiNote } from './ai-note';
import { Button, Card, DateField, Divider, Field, Stat, SwitchRow, Text } from './ui';

const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : NaN);
const pctText = (n: number | null) => (n == null ? '–' : `${n.toFixed(1)}% a year`);

/** Everything about one chit: where it stands, recording a month's auction, bid-or-wait, and the schedule. */
export function ChitPanel({ inv, entries }: { inv: Investment; entries: InvestmentEntry[] }) {
  const t = useTheme();
  const db = useSQLiteContext();
  const details = parseDetails<ChitDetails>(inv);
  const plan = chitPlan(details);
  const s = plan ? chitSummary(plan, entries, inv.start_date) : null;

  const [month, setMonth] = useState('');
  const [discount, setDiscount] = useState('');
  const [paidAmt, setPaidAmt] = useState('');
  const [won, setWon] = useState(false);
  const [prizeAmt, setPrizeAmt] = useState('');
  const [date, setDate] = useState(() => toInputDate(Date.now()));
  const [bid, setBid] = useState('');
  const [target, setTarget] = useState('12');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  // Chits saved by older versions counted the prize against "invested"; fix the stored numbers once if stale.
  const stale = !!s && (Math.abs(inv.invested_amount - s.paid) > 0.5 || Math.abs(inv.current_value - (s.prized ? 0 : s.paid)) > 0.5);
  useEffect(() => {
    if (stale) recomputeInvested(db, inv.id);
  }, [stale, db, inv.id]);

  if (!plan || !s) {
    return (
      <Card>
        <Text variant="heading">Chit calculations</Text>
        <Text variant="muted">Add the chit value and number of months (tap Edit) to see dividends, dues and bid advice.</Text>
      </Card>
    );
  }

  const m = Number.isInteger(num(month)) ? num(month) : (s.next?.m ?? plan.months);
  const row = s.schedule[Math.min(Math.max(m, 1), plan.months) - 1];
  const d = isFinite(num(discount)) ? num(discount) : row.discount;
  const calc = monthMath(plan, d);
  const isPaid = m <= s.paidCount;
  const discountWarn =
    isFinite(num(discount)) && num(discount) > (plan.value * DISCOUNT_WARN_PCT) / 100
      ? `That’s over ${DISCOUNT_WARN_PCT}% of the chit value, more than most chits allow.`
      : isFinite(num(discount)) && num(discount) > 0 && num(discount) < plan.commission
        ? `Below the ${money(plan.commission)} foreman commission, so there’s no dividend.`
        : null;

  const saveMonth = async () => {
    if (m < 1 || m > plan.months) return Alert.alert(`Month must be between 1 and ${plan.months}`);
    const when = parseDate(date);
    if (!isPaid && !when) return Alert.alert('Date must be DD/MM/YYYY');
    const amount = isFinite(num(paidAmt)) ? num(paidAmt) : Math.round(calc.net);
    const prize = isFinite(num(prizeAmt)) ? num(prizeAmt) : calc.prize;
    if (!isPaid && !(amount > 0)) return Alert.alert('Enter the amount you paid');
    if (won && !(prize > 0)) return Alert.alert('Enter the prize you received');
    setBusy(true);
    try {
      const auctions: ChitAuction[] = (details.auctions ?? []).filter((a) => a.m !== m);
      if (isFinite(num(discount))) auctions.push({ m, discount: num(discount) });
      const next: ChitDetails = { ...details, auctions: auctions.sort((a, b) => a.m - b.m), wonMonth: won ? m : (details.wonMonth ?? null) };
      const { id: _i, created_at: _c, updated_at: _u, deleted: _d, ...rest } = inv;
      await save(db, 'investments', { ...rest, id: inv.id, details: JSON.stringify(next) });
      if (!isPaid) {
        await save(db, 'investment_entries', { investment_id: inv.id, kind: 'contribution', date: when!, amount, units: 1, note: `Month ${m}` });
        if (won) await save(db, 'investment_entries', { investment_id: inv.id, kind: 'payout', date: when!, amount: prize, units: null, note: `Prize, month ${m}` });
      }
      await recomputeInvested(db, inv.id);
      haptic.success();
      toast.success(isPaid ? `Month ${m} auction updated` : `Month ${m} saved`);
      setMonth('');
      setDiscount('');
      setPaidAmt('');
      setPrizeAmt('');
      setWon(false);
    } finally {
      setBusy(false);
    }
  };

  // Bid advice is for the next unpaid month, and only while you haven't won yet.
  const bm = s.next?.m ?? 0;
  const canBid = !s.prized && !s.done && bm >= 1 && bm < plan.months;
  const bidD = num(bid);
  const cost = canBid && isFinite(bidD) ? bidCostPct(plan, bm, bidD) : null;
  const maxD = canBid && isFinite(num(target)) ? maxDiscountFor(plan, bm, num(target)) : null;
  const wait = canBid ? waitReturnPct(plan, bm) : null;
  const shown = showAll ? s.schedule : s.schedule.slice(Math.max(0, s.paidCount - 2), s.paidCount + 4);

  return (
    <>
      <Card className="gap-3">
        <Text variant="heading">Chit status</Text>
        <View className="flex-row gap-3">
          <Stat label={`Paid · ${s.paidCount}/${plan.months}`} value={money(s.paid)} />
          <Stat label="Dividends so far" value={money(s.dividendsSoFar)} color={s.dividendsSoFar > 0 ? t.success : undefined} />
        </View>
        <View className="flex-row gap-3">
          {s.prized ? (
            <Stat label={s.pendingPrize ? 'Prize (to receive)' : 'Prize received'} value={money(s.received || s.pendingPrize)} />
          ) : (
            <Stat label="Payout at end (est.)" value={money(s.finalPayout)} />
          )}
          <Stat label={`Still to pay (est.) · ${plan.months - s.paidCount} left`} value={money(s.remainingDues)} color={s.remainingDues > 0 ? t.danger : undefined} />
        </View>
        <Stat
          label={s.done ? 'Final result' : 'Projected result for the whole chit'}
          value={`${s.result >= 0 ? '+' : '−'}${money(Math.abs(s.result))}${s.rate ? ` · ${s.rate.kind === 'return' ? 'earns' : 'costs'} ${s.rate.pct.toFixed(1)}%/yr` : ''}`}
          color={s.result >= 0 ? t.success : t.danger}
        />
        {s.next && s.nextDueDate ? (
          <Text variant="small">
            Next: month {s.next.m}, about {money(Math.round(s.next.net))} on {dateLabel(s.nextDueDate)}
            {s.next.recorded ? '' : ' (estimate until the auction is recorded)'}.
          </Text>
        ) : null}
        <Text variant="small">
          {money(plan.sub)} subscription − dividend + {money(Math.round(plan.gstPerMember))} GST share. Commission {money(plan.commission)} a month. Future months
          assume the average of your last 3 recorded discounts.
        </Text>
      </Card>

      <Card className="gap-3">
        <Text variant="heading">Record a month</Text>
        <View className="flex-row gap-3">
          <View style={{ width: 90 }}>
            <Field label="Month" value={month} onChangeText={setMonth} keyboardType="number-pad" placeholder={String(s.next?.m ?? plan.months)} />
          </View>
          <View className="flex-1">
            <Field
              label="Auction discount (₹)"
              value={discount}
              onChangeText={setDiscount}
              keyboardType="decimal-pad"
              placeholder={row.recorded ? String(row.discount) : 'From the monthly statement'}
              error={discountWarn}
            />
          </View>
        </View>
        <Text variant="small">
          Month {m}: dividend {money(calc.dividend, true)} · you pay {money(calc.net, true)} · winner gets {money(calc.prize)}
        </Text>
        {isPaid ? (
          <Text variant="small">Month {m} is already paid. Saving updates only its auction discount.</Text>
        ) : (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Amount paid (₹)" value={paidAmt} onChangeText={setPaidAmt} keyboardType="decimal-pad" placeholder={String(Math.round(calc.net))} />
              </View>
              <View className="flex-1">
                <DateField label="Paid on" value={date} onChange={setDate} />
              </View>
            </View>
            {!s.prized ? <SwitchRow title="I won this month’s auction" description="Records the prize and switches to what you still owe" value={won} onValueChange={setWon} /> : null}
            {won ? (
              <Field
                label="Prize received (₹)"
                value={prizeAmt}
                onChangeText={setPrizeAmt}
                keyboardType="decimal-pad"
                placeholder={String(Math.round(calc.prize))}
                hint="Use the amount actually credited, after any document or surety charges."
              />
            ) : null}
          </>
        )}
        <Button size="sm" title={isPaid ? `Update month ${m}` : `Save month ${m}`} loading={busy} onPress={saveMonth} />
      </Card>

      {canBid ? (
        <Card className="gap-3">
          <Text variant="heading">Bid in month {bm} or wait?</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Discount you’d bid (₹)" value={bid} onChangeText={setBid} keyboardType="decimal-pad" placeholder="e.g. 20000" />
            </View>
            <View style={{ width: 110 }}>
              <Field label="Max cost %" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="12" />
            </View>
          </View>
          {isFinite(bidD) ? (
            <Text>
              Prize {money(plan.value - bidD)}. Taking it now costs about {pctText(cost)} on the {plan.months - bm} installments after it.
            </Text>
          ) : null}
          <Text>
            {maxD == null
              ? `Even the lowest bid costs more than ${num(target) || 0}% a year this month.`
              : `To keep the cost under ${num(target)}% a year, bid at most ${money(maxD)} (prize ${money(plan.value - maxD)}).`}
          </Text>
          <Text>Waiting to the end earns about {pctText(wait)} on what you still pay.</Text>
          <Text variant="small">Compare: personal loan ~11–16%, gold loan ~9–12%, FD ~6.5–7.5% a year.</Text>
        </Card>
      ) : null}
      {canBid && isFinite(bidD) ? (
        <AiNote
          key={`${bid}|${target}`}
          label="Should I bid? Ask AI"
          run={() =>
            aiChitAdvice(inv, {
              month: bm,
              months: plan.months,
              discount: bidD,
              prizeNow: plan.value - bidD,
              costPct: cost,
              targetPct: num(target),
              maxDiscount: maxD,
              waitReturnPct: wait,
              finalPayout: s.finalPayout,
              remainingDues: s.remainingDues,
            })
          }
        />
      ) : null}

      <Card className="gap-0">
        <Text variant="heading">Schedule</Text>
        {shown.map((x, i) => (
          <View key={x.m}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => setMonth(String(x.m))} className="flex-row items-center gap-3 py-2" accessibilityHint="Load this month into Record a month">
              <Text weight="medium" style={{ width: 34 }}>
                {x.m}
              </Text>
              <View className="flex-1">
                <Text variant="small">
                  Discount {money(x.discount)}
                  {x.recorded ? '' : ' (est.)'} · dividend {money(x.dividend)}
                  {plan.wonMonth === x.m ? ' · you won' : ''}
                </Text>
              </View>
              <Text tone={x.m <= s.paidCount ? 'success' : 'default'}>
                {x.m <= s.paidCount ? '✓ ' : ''}
                {money(Math.round(x.net))}
              </Text>
            </Pressable>
          </View>
        ))}
        <Button size="sm" variant="link" title={showAll ? 'Show fewer months' : `Show all ${plan.months} months`} onPress={() => setShowAll(!showAll)} />
      </Card>
    </>
  );
}

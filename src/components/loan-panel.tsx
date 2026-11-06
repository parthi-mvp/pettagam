import { useState } from 'react';
import { View } from 'react-native';

import { money } from '@/lib/format';
import { payoff, prepaySavings } from '@/lib/loan';

import { Card, Field, Stat, Text } from './ui';

const monthYear = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const span = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
};

/** From today's outstanding, the rate and the EMI: when the loan ends, interest still to pay, and what a prepayment saves. */
export function LoanPanel({ outstanding, rate, emi }: { outstanding: number; rate: number; emi: number }) {
  const [lump, setLump] = useState('');
  const p = payoff(outstanding, rate, emi);
  const extra = Number(lump.replace(/,/g, ''));
  const saved = p && extra > 0 ? prepaySavings(outstanding, rate, emi, Math.min(extra, outstanding)) : null;

  if (!p) {
    return (
      <Card>
        <Text variant="small" tone="danger">{`An EMI of ${money(emi)} doesn’t cover the interest (${money((outstanding * rate) / 1200)} a month), so this loan never ends. Check the EMI and rate.`}</Text>
      </Card>
    );
  }
  return (
    <Card className="gap-3">
      <View className="flex-row gap-3">
        <Stat label="Paid off" value={p.months ? `${monthYear(p.endsOn)}` : 'Done'} />
        <Stat label="Time left" value={span(p.months)} />
      </View>
      <Stat label="Interest still to pay" value={money(p.interest)} />
      <Field label="If you prepay" prefix="₹" value={lump} onChangeText={setLump} keyboardType="decimal-pad" placeholder="e.g. 100000" />
      {saved ? (
        <Text variant="small" tabular>
          {saved.months > 0
            ? `Same EMI, ends ${span(saved.months)} sooner and saves ${money(saved.interest)} in interest.`
            : 'Too small to change the end date this way.'}
        </Text>
      ) : (
        <Text variant="small">Keeping the EMI the same after a prepayment saves the most interest.</Text>
      )}
    </Card>
  );
}

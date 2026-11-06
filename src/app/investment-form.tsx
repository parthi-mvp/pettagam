import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { AccountPicker, INVESTMENT_TYPE_OPTIONS, OptionPicker } from '@/components/pickers';
import { canLinkPrice, PriceLinkField } from '@/components/price-link-field';
import { AmountInput, Button, Card, DateField, Field, FormSection, Screen, SwitchRow, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { recomputeInvested, saveEntry } from '@/db/investments';
import { getById, listAccounts, save } from '@/db/repo';
import { INVESTMENT_TYPE_LABELS, type Investment, type InvestmentType } from '@/db/types';
import { money, parseDate, toInputDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { DURATION, EASE_OUT } from '@/theme/motion';
import { addMonths, CHIT_DEFAULTS, MAX_COMMISSION_PCT } from '@/lib/chit';
import { defaultInflowKind, fdAccruedValue, parseDetails, usesMaturity, usesRate, usesUnits, type ChitDetails, type PriceLink, usesGrams, isFdLike } from '@/lib/invest';
import { refreshPrices } from '@/invest/prices';

// Sections that come and go with the type fade in, leave faster, and the rest slide to fill the gap.
const ENTER = FadeIn.duration(DURATION.enter).easing(EASE_OUT);
const EXIT = FadeOut.duration(140);
const LAYOUT = LinearTransition.duration(DURATION.enter).easing(EASE_OUT);

function Section({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={ENTER} exiting={EXIT} layout={LAYOUT}>
      {children}
    </Animated.View>
  );
}

export default function InvestmentForm() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [existing, setExisting] = useState<Investment | null>(null);
  const [type, setType] = useState<InvestmentType>('fd');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [invested, setInvested] = useState('');
  const [current, setCurrent] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [now] = useState(() => Date.now());
  const [start, setStart] = useState(() => toInputDate(now));
  const [maturity, setMaturity] = useState('');
  const [chitValue, setChitValue] = useState('');
  const [months, setMonths] = useState('');
  const [installment, setInstallment] = useState('');
  const [members, setMembers] = useState('');
  const [commissionPct, setCommissionPct] = useState(String(CHIT_DEFAULTS.commissionPct));
  const [gstPct, setGstPct] = useState(String(CHIT_DEFAULTS.gstPct));
  const [paidCount, setPaidCount] = useState('');
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState<PriceLink>({});
  const [linkName, setLinkName] = useState<string | null>(null);
  const [paidFrom, setPaidFrom] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);

  useEffect(() => {
    if (!id) return;
    getById(db, 'investments', id).then((i) => {
      if (!i) return;
      setExisting(i);
      setType(i.type);
      setName(i.name);
      setInstitution(i.institution ?? '');
      setInvested(String(i.invested_amount));
      setCurrent(String(i.current_value));
      setQuantity(i.quantity != null ? String(i.quantity) : '');
      setRate(i.interest_rate != null ? String(i.interest_rate) : '');
      setStart(toInputDate(i.start_date));
      setMaturity(toInputDate(i.maturity_date));
      const d = parseDetails<ChitDetails>(i);
      setChitValue(d.chitValue ? String(d.chitValue) : '');
      setMonths(d.months ? String(d.months) : '');
      setInstallment(d.installment ? String(d.installment) : '');
      setMembers(d.members ? String(d.members) : '');
      setCommissionPct(String(d.commissionPct ?? CHIT_DEFAULTS.commissionPct));
      setGstPct(String(d.gstPct ?? CHIT_DEFAULTS.gstPct));
      setNotes(i.notes ?? '');
      setLink(parseDetails<PriceLink>(i));
    });
  }, [db, id]);

  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : null);
  const startMs = parseDate(start);
  const maturityMs = maturity ? parseDate(maturity) : null;
  const fdSuggestion =
    isFdLike(type) && num(invested) && num(rate) && startMs ? fdAccruedValue(num(invested)!, num(rate)!, startMs, now, maturityMs) : null;

  // Name is optional: "SBI Fixed Deposit" is a fine default.
  const defaultName = [institution.trim(), INVESTMENT_TYPE_LABELS[type]].filter(Boolean).join(' ');

  // Subscription = chit value ÷ members when not given.
  const defaultInstallment = num(chitValue) && (num(members) ?? num(months)) ? Math.round(num(chitValue)! / (num(members) ?? num(months))!) : null;

  const onSave = async () => {
    if (!existing && paidFrom && !accountId) return toast.error('Pick the account you paid from');
    const inv = num(invested) ?? 0;
    const cur = num(current) ?? fdSuggestion ?? inv;
    if (type === 'chit') {
      const c = num(commissionPct) ?? CHIT_DEFAULTS.commissionPct;
      if (c < 0 || c > MAX_COMMISSION_PCT) return toast.error(`Foreman commission can be at most ${MAX_COMMISSION_PCT}% by law`);
      if ((num(months) ?? 0) < 2) return toast.error('Enter the number of months');
      if ((num(paidCount) ?? 0) > (num(months) ?? 0)) return toast.error('Installments paid can’t exceed the months');
    }
    const details =
      type === 'chit'
        ? JSON.stringify({
            // Keep recorded auctions and the won month when editing.
            ...(existing ? parseDetails<ChitDetails>(existing) : {}),
            chitValue: num(chitValue) ?? undefined,
            months: num(months) ?? undefined,
            installment: num(installment) ?? defaultInstallment ?? undefined,
            members: num(members) ?? undefined,
            commissionPct: num(commissionPct) ?? CHIT_DEFAULTS.commissionPct,
            gstPct: num(gstPct) ?? CHIT_DEFAULTS.gstPct,
          } satisfies ChitDetails)
        : canLinkPrice(type) && (link.mfScheme || link.coinId)
          ? JSON.stringify({ ...(existing ? parseDetails(existing) : {}), ...link })
          : (existing?.details ?? null);
    // A chit ends with its last installment: start + (months − 1).
    const chitEnd = type === 'chit' && startMs && num(months) ? addMonths(startMs, num(months)! - 1) : null;
    const newId = await save(db, 'investments', {
      id: existing?.id,
      type,
      name: name.trim() || defaultName,
      institution: institution.trim() || null,
      invested_amount: existing ? existing.invested_amount : inv,
      // Worked out from the entries (src/db/investments.ts); this is only the starting point.
      current_value: existing ? existing.current_value : type === 'chit' ? inv : Math.round(cur * 100) / 100,
      quantity: existing ? existing.quantity : num(quantity),
      interest_rate: num(rate),
      start_date: startMs,
      maturity_date: maturityMs ?? chitEnd,
      details,
      notes: notes.trim() || null,
    });
    // New holding: record the initial amount as the first entry so history is complete, and (if
    // asked) in the account it was paid from. A different value today becomes a value update.
    const created = existing ? null : await getById(db, 'investments', newId);
    if (created && inv > 0) {
      await saveEntry(db, created, {
        kind: defaultInflowKind(type),
        date: startMs ?? now,
        amount: inv,
        // For chits, units = how many installments the opening amount covers.
        units: type === 'chit' ? (num(paidCount) ?? 1) : num(quantity),
        note: type === 'chit' && num(paidCount) ? `Opening: ${num(paidCount)} installments` : 'Opening amount',
        accountId: paidFrom ? accountId : null,
      });
      const today = num(current);
      if (type !== 'chit' && !isFdLike(type) && today != null && Math.abs(today - inv) >= 1) {
        await saveEntry(db, created, { kind: 'valuation', date: now, amount: today, units: usesUnits(type) ? num(quantity) : null, note: null, accountId: null });
      }
    } else if (existing) await recomputeInvested(db, newId);
    if (link.mfScheme || link.coinId) refreshPrices(db, true).catch(() => {});
    haptic.success();
    toast.success(existing ? 'Changes saved' : `${name.trim() || defaultName} added`);
    router.back();
  };

  const half = (node: ReactNode) => <View className="flex-1">{node}</View>;
  const hasGrowth = usesUnits(type) || usesRate(type);

  return (
    <Screen footer={<Button size="lg" title={existing ? 'Save changes' : 'Add investment'} onPress={onSave} />}>
      <Stack.Screen options={{ title: existing ? 'Edit investment' : 'New investment' }} />
      {/* The modal already slides in; only sections that appear later (type change) fade. */}
      <LayoutAnimationConfig skipEntering>
        <Section>
          <OptionPicker label="Investment type" options={INVESTMENT_TYPE_OPTIONS} value={type} onChange={setType} />
        </Section>

        {/* Amount: the number people come here to enter, same big entry as a transaction. */}
        <Section>
          <Card className="items-center gap-1 py-5">
            <Text variant="small">{type === 'chit' ? 'Paid so far' : 'Amount invested'}</Text>
            <AmountInput value={invested} onChangeText={setInvested} editable={!existing} accessibilityLabel="Amount invested in rupees" />
            {existing ? (
              <Text variant="caption">Updated from the entries on the investment screen</Text>
            ) : fdSuggestion ? (
              <Animated.View entering={ENTER} exiting={EXIT}>
                <Text variant="small" weight="medium" tone="success" tabular>
                  ≈ {money(fdSuggestion)} today
                </Text>
              </Animated.View>
            ) : null}
          </Card>
        </Section>

        {!existing && type !== 'chit' ? (
          <Section>
            <FormSection>
              <SwitchRow
                title="Paid from one of my accounts"
                description="Records it in that account too, so its balance is right. Not counted as spending."
                value={paidFrom}
                onValueChange={setPaidFrom}
              />
              {paidFrom ? <AccountPicker label="Paid from" accounts={accounts ?? []} value={accountId} onChange={setAccountId} /> : null}
            </FormSection>
          </Section>
        ) : null}

        {canLinkPrice(type) ? (
          <Section key={`link-${type}`}>
            <FormSection title={type === 'mutual_fund' ? 'Live NAV' : 'Live price'}>
              <PriceLinkField
                type={type}
                value={link}
                label={linkName ?? (link.mfScheme || link.coinId ? name || null : null)}
                onChange={(p) => {
                  setLink(p?.link ?? {});
                  setLinkName(p?.name ?? null);
                  if (p && !name.trim()) setName(p.name);
                }}
              />
            </FormSection>
          </Section>
        ) : null}

        <Section>
          <FormSection title="Details">
            <Field
              label={
                type === 'chit'
                  ? 'Chit company / foreman'
                  : type === 'stock' || type === 'mutual_fund'
                    ? 'Broker / AMC'
                    : 'Bank / institution'
              }
              value={institution}
              onChangeText={setInstitution}
              placeholder={
                type === 'chit' ? 'Shriram, Margadarsi…' : type === 'stock' || type === 'mutual_fund' ? 'Zerodha, Groww…' : 'SBI, HDFC…'
              }
            />
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder={defaultName}
              hint="Optional. Leave blank to use the name shown."
            />
          </FormSection>
        </Section>

        {type === 'chit' ? (
          <Section key="chit">
            <FormSection title="Chit details">
              <Field
                label="Chit value"
                prefix="₹"
                value={chitValue}
                onChangeText={setChitValue}
                keyboardType="decimal-pad"
                placeholder="0"
                hint="Record each month’s auction and payment on the chit’s screen."
              />
              <View className="flex-row gap-3">
                {half(<Field label="Months" value={months} onChangeText={setMonths} keyboardType="number-pad" placeholder="20" />)}
                {half(
                  <Field
                    label="Installment"
                    prefix="₹"
                    value={installment}
                    onChangeText={setInstallment}
                    keyboardType="decimal-pad"
                    placeholder={defaultInstallment ? String(defaultInstallment) : '0'}
                    hint="Full amount before dividend"
                  />,
                )}
              </View>
              <View className="flex-row gap-3">
                {half(<Field label="Members" value={members} onChangeText={setMembers} keyboardType="number-pad" placeholder={months || 'Same as months'} />)}
                {half(<Field label="Commission %" value={commissionPct} onChangeText={setCommissionPct} keyboardType="decimal-pad" hint={`Max ${MAX_COMMISSION_PCT}%`} />)}
                {half(<Field label="GST on comm. %" value={gstPct} onChangeText={setGstPct} keyboardType="decimal-pad" />)}
              </View>
              {!existing ? (
                <Field
                  label="Installments already paid"
                  value={paidCount}
                  onChangeText={setPaidCount}
                  keyboardType="number-pad"
                  placeholder="0"
                  hint="If you’re adding a chit that’s already running: how many months the “Paid so far” amount covers. Set Start to the first installment’s date."
                />
              ) : null}
            </FormSection>
          </Section>
        ) : null}

        <Section>
          <FormSection title="Growth">
            {hasGrowth ? (
              <View className="flex-row gap-3">
                {usesUnits(type)
                  ? half(
                      <Field
                        label={usesGrams(type) ? 'Grams' : 'Units / shares'}
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        editable={!existing}
                      />,
                    )
                  : null}
                {usesRate(type)
                  ? half(
                      <Field label="Interest (% p.a.)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="7.1" />,
                    )
                  : null}
              </View>
            ) : null}
            {existing ? (
              <Text variant="caption">The value is worked out from the entries, prices and interest rate. Update it on the investment’s screen.</Text>
            ) : isFdLike(type) ? (
              <Text variant="caption">Its value grows on its own at the interest rate.</Text>
            ) : (
              <Field
                label="Current value"
                prefix="₹"
                value={current}
                onChangeText={setCurrent}
                keyboardType="decimal-pad"
                placeholder={invested || 'Same as invested'}
                hint={canLinkPrice(type) && (link.mfScheme || link.coinId) ? 'Leave blank: the live price sets it.' : 'Leave blank if it hasn’t changed.'}
              />
            )}
          </FormSection>
        </Section>

        <Section>
          <FormSection title="Dates">
            <View className="flex-row gap-3">
              {half(<DateField label="Start" value={start} onChange={setStart} />)}
              {usesMaturity(type) ? half(<DateField label="Matures on" value={maturity} onChange={setMaturity} />) : null}
            </View>
          </FormSection>
        </Section>

        <Section>
          <FormSection title="Notes">
            <Field label="Folio no., nominee, etc." value={notes} onChangeText={setNotes} multiline placeholder="Optional" />
          </FormSection>
        </Section>

      </LayoutAnimationConfig>
    </Screen>
  );
}

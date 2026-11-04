import { useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, INVESTMENT_TYPE_LABELS, type Account, type AccountType, type InvestmentType } from '@/db/types';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useThemeColors } from '@/theme/useThemeColor';

import { categoryIcon, Icon, type IconName } from './icons';
import { BANK_KIND_LABEL, BANKS, matchBank, type Bank, type BankKind } from '@/catalog/banks';

import { BankLogo } from './bank-logo';
import { PressableScale, Sheet, Text, TextInput, type SheetRef, IconTile, OptionRow } from './ui';

type Option = { value: string; label: string; color?: string; icon?: string | null };

/**
 * Compact category chooser: a field-shaped row showing the current pick; tapping opens a sheet
 * with a 3-column grid of icon tiles. Replaces the long chip list on the transaction form.
 */
/** The closed state both pickers share: a field-shaped row with an icon tile, the current pick and a chevron. */
function PickerRow({
  label,
  text,
  icon,
  set,
  onPress,
  leading,
}: {
  label: string;
  text: string;
  icon: IconName;
  set: boolean;
  onPress: () => void;
  /** Replaces the icon tile (a bank logo). */
  leading?: ReactNode;
}) {
  const [primary, muted, subtle] = useThemeColors(['primary', 'fg-muted', 'fg-subtle'] as const);
  return (
    <PressableScale
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${set ? text : 'not set'}`}
      onPress={onPress}
      className="h-10 flex-row items-center gap-2.5 rounded-[12px] bg-fill pl-1.5 pr-3">
      {leading ?? (
        <View className="h-7 w-7 items-center justify-center rounded-[8px] bg-primary-soft">
          <Icon name={icon} size={16} color={set ? primary : subtle} />
        </View>
      )}
      <Text className="flex-1" tone={set ? 'default' : 'subtle'} numberOfLines={1}>
        {text}
      </Text>
      <Icon name="chevronDown" size={18} color={muted} />
    </PressableScale>
  );
}

const ACCOUNT_ORDER = ACCOUNT_TYPE_ORDER;
export const ACCOUNT_ICON: Record<AccountType, IconName> = {
  bank: 'bank',
  overdraft: 'bank',
  credit_card: 'card',
  pay_later: 'card',
  wallet: 'coin',
  meal_card: 'coffee',
  fastag: 'fuel',
  cash: 'coin',
  loan: 'receipt',
  lent: 'refund',
  borrowed: 'transfer',
};

/** Account chooser: same closed row; the sheet lists accounts grouped by type with bank · ••last4 under each. */
export function AccountPicker({ label, accounts, value, onChange }: { label: string; accounts: Account[]; value: string | null; onChange: (v: string) => void }) {
  const sheet = useRef<SheetRef>(null);
  const current = accounts.find((a) => a.id === value) ?? null;

  const pick = (v: string) => {
    if (v !== value) haptic.selection();
    onChange(v);
    sheet.current?.dismiss();
  };

  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      <PickerRow
        label={label}
        set={!!current}
        icon={current ? ACCOUNT_ICON[current.type] : 'bank'}
        leading={current ? <BankLogo institution={current.institution} fallback={ACCOUNT_ICON[current.type]} size={28} /> : undefined}
        text={current ? `${current.name}${current.last4 ? ` ••${current.last4}` : ''}` : 'Choose an account'}
        onPress={() => sheet.current?.present()}
      />
      <Sheet ref={sheet} title={label} scrollable lazy>
        <View className="gap-4 pb-4">
          {ACCOUNT_ORDER.map((type) => {
            const group = accounts.filter((a) => a.type === type);
            if (group.length === 0) return null;
            return (
              <View key={type} className="gap-1">
                <Text variant="eyebrow" className="px-1">
                  {ACCOUNT_TYPE_LABELS[type]}
                </Text>
                {group.map((a) => {
                  const active = a.id === value;
                  const sub = [a.institution, a.last4 ? `••${a.last4}` : null].filter(Boolean).join(' · ');
                  return (
                    <OptionRow
                      key={a.id}
                      leading={<BankLogo institution={a.institution} fallback={ACCOUNT_ICON[type]} />}
                      title={a.name}
                      subtitle={sub}
                      active={active}
                      onPress={() => pick(a.id)}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

/** Categories as a 3-column grid of icon tiles (inside the picker sheet, or inline in another sheet). */
export function CategoryGrid({ options, value, onPick }: { options: Option[]; value: string | null; onPick: (v: string) => void }) {
  const [primary, onPrimary] = useThemeColors(['primary', 'on-primary'] as const);
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: active }}
            onPress={() => onPick(o.value)}
            className={cn('w-[31%] grow items-center gap-1.5 rounded-[14px] border py-3', active ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}>
            <View className="h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: o.color ? `${o.color}22` : undefined }}>
              <Icon name={categoryIcon(o.label, undefined, o.icon)} size={18} color={o.color ?? primary} />
            </View>
            <Text variant="caption" align="center" weight={active ? 'medium' : 'regular'} className={active ? 'text-primary-fg' : 'text-fg'} numberOfLines={2}>
              {o.label}
            </Text>
            {active ? (
              <View className="absolute right-1.5 top-1.5 h-4 w-4 items-center justify-center rounded-full bg-primary">
                <Icon name="check" size={10} color={onPrimary} strokeWidth={3} />
              </View>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * Accounts as 2-column tiles (bank logo, name, ••digits), for picking inside another sheet.
 * `digits` (from an SMS) floats the matching accounts first and tags them.
 */
export function AccountGrid({ accounts, value, onPick, digits }: { accounts: Account[]; value: string | null; onPick: (v: string) => void; digits?: string | null }) {
  const onPrimary = useThemeColors(['on-primary'] as const)[0];
  const matches = (a: Account) => !!digits && (a.last4 === digits || a.card_last4 === digits);
  const sorted = [...accounts].sort((a, b) => Number(matches(b)) - Number(matches(a)) || ACCOUNT_ORDER.indexOf(a.type) - ACCOUNT_ORDER.indexOf(b.type));
  return (
    <View className="flex-row flex-wrap gap-2">
      {sorted.map((a) => {
        const active = a.id === value;
        const sub = [ACCOUNT_TYPE_LABELS[a.type], a.last4 ? `••${a.last4}` : null].filter(Boolean).join(' · ');
        return (
          <PressableScale
            key={a.id}
            scaleTo={0.97}
            accessibilityRole="radio"
            accessibilityLabel={`${a.name}${a.last4 ? `, ending ${a.last4}` : ''}`}
            accessibilityState={{ checked: active }}
            onPress={() => onPick(a.id)}
            className={cn('basis-[47%] grow gap-2 rounded-[14px] border p-2.5', active ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}>
            <View className="flex-row items-center justify-between">
              <BankLogo institution={a.institution} fallback={ACCOUNT_ICON[a.type]} size={32} />
              {active ? (
                <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Icon name="check" size={12} color={onPrimary} strokeWidth={3} />
                </View>
              ) : matches(a) ? (
                <View className="rounded-full bg-brass-soft px-2 py-0.5">
                  <Text variant="caption" weight="medium" tone="brass">Match</Text>
                </View>
              ) : null}
            </View>
            <View className="gap-0.5">
              <Text weight="medium" numberOfLines={1} className={active ? 'text-primary-fg' : undefined}>{a.name}</Text>
              <Text variant="caption" numberOfLines={1}>{sub}</Text>
            </View>
          </PressableScale>
        );
      })}
      {accounts.length === 0 ? <Text variant="small">Add an account first (More → Accounts).</Text> : null}
    </View>
  );
}

export function CategoryPicker({ label = 'Category', options, value, onChange }: { label?: string; options: Option[]; value: string | null; onChange: (v: string) => void }) {
  const sheet = useRef<SheetRef>(null);
  const current = options.find((o) => o.value === value) ?? null;

  const pick = (v: string) => {
    if (v !== value) haptic.selection();
    onChange(v);
    sheet.current?.dismiss();
  };

  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      <PickerRow
        label={label}
        set={!!current}
        icon={current ? categoryIcon(current.label, undefined, current.icon) : 'list'}
        text={current?.label ?? 'Choose a category'}
        onPress={() => sheet.current?.present()}
      />

      <Sheet ref={sheet} title={label} scrollable lazy>
        <View className="pb-4">
          <CategoryGrid options={options} value={value} onPick={pick} />
        </View>
      </Sheet>
    </View>
  );
}

export type PickerOption<T extends string> = { value: T; label: string; icon: IconName; description?: string };

/** One-of-many chooser for a fixed list (account type, investment type): closed row, sheet with icon rows. */
export function OptionPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const sheet = useRef<SheetRef>(null);
  const [ink] = useThemeColors(['primary-fg'] as const);
  const current = options.find((o) => o.value === value);

  const pick = (v: T) => {
    if (v !== value) haptic.selection();
    onChange(v);
    sheet.current?.dismiss();
  };

  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      <PickerRow label={label} set={!!current} icon={current?.icon ?? 'list'} text={current?.label ?? 'Choose'} onPress={() => sheet.current?.present()} />
      <Sheet ref={sheet} title={label} scrollable={options.length > 6} lazy>
        <View className="gap-1.5 pb-4">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <OptionRow
                key={o.value}
                leading={<IconTile icon={o.icon} />}
                title={o.label}
                subtitle={o.description}
                active={active}
                trailing={active ? <Icon name="check" size={18} color={ink} strokeWidth={2.2} /> : null}
                onPress={() => pick(o.value)}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const ACCOUNT_HINT: Record<AccountType, string> = {
  bank: 'Savings, salary or current account',
  overdraft: 'OD or loan against FD; can go below zero',
  credit_card: 'Spend now, pay by the due date',
  pay_later: 'Simpl, LazyPay, Amazon or Flipkart Pay Later',
  wallet: 'Paytm, PhonePe, Amazon Pay balance',
  meal_card: 'Pluxee (Sodexo), Zeta meal benefits',
  fastag: 'Toll wallet on your vehicle',
  cash: 'Money in your pocket',
  loan: 'Home, car, gold, education or personal loan',
  lent: 'Money a friend or relative owes you',
  borrowed: 'Money you owe a person',
};
export const ACCOUNT_TYPE_OPTIONS: PickerOption<AccountType>[] = ACCOUNT_ORDER.map((t) => ({
  value: t,
  label: ACCOUNT_TYPE_LABELS[t],
  icon: ACCOUNT_ICON[t],
  description: ACCOUNT_HINT[t],
}));

const INVESTMENT_META: Record<InvestmentType, { icon: IconName; description: string }> = {
  fd: { icon: 'bank', description: 'Lump sum at a fixed rate' },
  rd: { icon: 'repeat', description: 'Fixed amount every month' },
  chit: { icon: 'chit', description: 'Monthly installments, auction prize' },
  stock: { icon: 'trend', description: 'Shares in your demat account' },
  mutual_fund: { icon: 'pie', description: 'SIP or lump sum' },
  gold: { icon: 'coin', description: 'Jewellery, coins, digital gold or SGB' },
  ppf: { icon: 'lock', description: 'Public Provident Fund, 15 years' },
  epf: { icon: 'lock', description: 'Employee Provident Fund' },
  nps: { icon: 'lock', description: 'National Pension System' },
  bond: { icon: 'receipt', description: 'Government or corporate bonds' },
  real_estate: { icon: 'house', description: 'Land, flat or house' },
  crypto: { icon: 'coin', description: 'Bitcoin and other coins' },
  other: { icon: 'bulb', description: 'Anything else you hold' },
  corporate_fd: { icon: 'bank', description: 'Bajaj, Shriram, Mahindra Finance deposits' },
  po_td: { icon: 'mail', description: 'Post office deposit, 1 to 5 years' },
  po_mis: { icon: 'mail', description: 'Monthly interest from the post office' },
  nsc: { icon: 'mail', description: 'National Savings Certificate, 5 years' },
  kvp: { icon: 'mail', description: 'Doubles over a fixed term' },
  scss: { icon: 'mail', description: 'Quarterly interest, age 60+' },
  ssy: { icon: 'heart', description: 'For a girl child, up to ₹1.5 lakh a year' },
  apy: { icon: 'lock', description: 'Government pension for a fixed monthly amount' },
  etf: { icon: 'trend', description: 'Index, gold or silver ETFs' },
  reit: { icon: 'house', description: 'Embassy, Mindspace, Brookfield, Nexus' },
  invit: { icon: 'trend', description: 'Infrastructure investment trusts' },
  us_stock: { icon: 'trend', description: 'Through Vested, INDmoney and others' },
  esop: { icon: 'gift', description: 'Employer stock options and RSUs' },
  digital_gold: { icon: 'coin', description: 'Gold bought in an app, by the gram' },
  sgb: { icon: 'coin', description: 'Holdings only; no new issues since 2025' },
  silver: { icon: 'coin', description: 'Coins, bars or digital silver' },
  lic: { icon: 'lock', description: 'Endowment or money-back policy' },
  ulip: { icon: 'lock', description: 'Insurance plus market-linked fund' },
};
export const INVESTMENT_TYPE_OPTIONS: PickerOption<InvestmentType>[] = (Object.keys(INVESTMENT_TYPE_LABELS) as InvestmentType[]).map((t) => ({
  value: t,
  label: INVESTMENT_TYPE_LABELS[t],
  ...INVESTMENT_META[t],
}));

/** Big national banks plus the Tamil Nadu banks, shown first when nothing is typed. */
const POPULAR = ['sbi', 'hdfc', 'icici', 'axis', 'kotak', 'indian', 'iob', 'kvb', 'cub', 'tmb', 'canara', 'bob', 'pnb', 'union'];
const KIND_ORDER: BankKind[] = ['public', 'private', 'small_finance', 'payments', 'foreign', 'card', 'wallet', 'lender'];

/**
 * Bank / issuer chooser. Stores the bank's full name as text (the `institution` column), so typed
 * names for banks that aren't listed (co-op banks, RRBs) still work: the sheet offers "Use “…”".
 */
export function BankPicker({
  label,
  value,
  onChange,
  prefer = [],
  fallbackIcon = 'bank',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Kinds listed first, e.g. wallets for a wallet account. */
  prefer?: BankKind[];
  fallbackIcon?: IconName;
}) {
  const sheet = useRef<SheetRef>(null);
  const [query, setQuery] = useState('');
  const current = matchBank(value);
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const hit = (b: Bank) => !q || [b.name, b.short, ...(b.aliases ?? [])].some((k) => k.toLowerCase().includes(q));
    const order = [...prefer, ...KIND_ORDER.filter((k) => !prefer.includes(k))];
    const out: { title: string; banks: Bank[] }[] = [];
    if (!q && prefer.length === 0) out.push({ title: 'Popular', banks: POPULAR.map((id) => BANKS.find((b) => b.id === id)!).filter(Boolean) });
    for (const k of order) {
      const banks = BANKS.filter((b) => b.kind === k && hit(b) && (q || prefer.length > 0 || !POPULAR.includes(b.id)));
      if (banks.length) out.push({ title: BANK_KIND_LABEL[k], banks });
    }
    return out;
  }, [q, prefer]);

  const pick = (v: string) => {
    if (v !== value) haptic.selection();
    onChange(v);
    setQuery('');
    sheet.current?.dismiss();
  };

  const exact = groups.some((g) => g.banks.some((b) => b.name.toLowerCase() === q));

  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      <PickerRow
        label={label}
        set={!!value}
        icon={fallbackIcon}
        text={current?.name ?? (value || 'Choose bank or issuer')}
        leading={value ? <BankLogo institution={value} fallback={fallbackIcon} size={28} /> : undefined}
        onPress={() => sheet.current?.present()}
      />
      <Sheet ref={sheet} title={label} scrollable lazy>
        <View className="gap-4 pb-4">
          <View className="h-10 flex-row items-center gap-2 rounded-[12px] bg-fill px-3">
            <TextInput value={query} onChangeText={setQuery} placeholder="Search banks, cards, wallets" autoCorrect={false} className="h-full min-w-0 flex-1" />
          </View>
          {q && !exact ? (
            <OptionRow title={`Use “${query.trim()}”`} subtitle="Not in the list (co-op bank, other)" leading={<BankLogo fallback={fallbackIcon} size={36} />} onPress={() => pick(query.trim())} />
          ) : null}
          {groups.map((g) => (
            <View key={g.title} className="gap-1">
              <Text variant="eyebrow" className="px-1">
                {g.title}
              </Text>
              {g.banks.map((b) => (
                <OptionRow key={b.id} title={b.name} active={current?.id === b.id} leading={<BankLogo bank={b} size={36} />} onPress={() => pick(b.name)} />
              ))}
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}


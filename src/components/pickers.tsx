import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { BudgetStatus } from '@/budget/status';
import { useLiveQuery } from '@/db/events';

import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, INVESTMENT_TYPE_LABELS, type Account, type AccountType, type InvestmentType } from '@/db/types';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useThemeColors } from '@/theme/useThemeColor';

import { categoryIcon, Icon, type IconName } from './icons';
import { BANK_KIND_LABEL, BANKS, matchBank, type Bank, type BankKind } from '@/catalog/banks';

import { BankLogo } from './bank-logo';
import { BudgetBar } from './budget-bar';
import { PressableScale, Sheet, Text, TextInput, type SheetRef, IconTile, OptionRow } from './ui';

type Option = { value: string; label: string; color?: string; icon?: string | null };

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
  const usage = useUsage('account_id');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const current = accounts.find((a) => a.id === value) ?? null;

  // Searching: one flat list. Otherwise your most-used accounts on top, then the rest by type.
  const top = q || accounts.length <= SEARCH_FROM_ACCOUNTS ? [] : mostUsed(accounts, (a) => a.id, usage, 3);
  const rest = accounts.filter((a) => !top.includes(a) && accountHit(a, q));
  const groups = [
    ...(top.length ? [{ title: 'Most used', accounts: top }] : []),
    ...ACCOUNT_ORDER.map((t) => ({ title: ACCOUNT_TYPE_LABELS[t], accounts: rest.filter((a) => a.type === t) })).filter((g) => g.accounts.length),
  ];

  const pick = (v: string) => {
    if (v !== value) haptic.selection();
    onChange(v);
    setQuery('');
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
          {accounts.length > SEARCH_FROM_ACCOUNTS ? <SearchBox value={query} onChange={setQuery} placeholder="Search accounts" /> : null}
          {groups.map((g) => (
            <View key={g.title} className="gap-1">
              <Text variant="eyebrow" className="px-1">
                {g.title}
              </Text>
              {g.accounts.map((a) => (
                <OptionRow
                  key={a.id}
                  leading={<BankLogo institution={a.institution} fallback={ACCOUNT_ICON[a.type]} />}
                  title={a.name}
                  subtitle={[a.institution, a.last4 ? `••${a.last4}` : null].filter(Boolean).join(' · ')}
                  active={a.id === value}
                  onPress={() => pick(a.id)}
                />
              ))}
            </View>
          ))}
          {groups.length === 0 ? <NoMatch what="account" query={query} /> : null}
        </View>
      </Sheet>
    </View>
  );
}

/** How often each category / account is used in live transactions: choosers put your habits first. */
export function useUsage(column: 'category_id' | 'account_id') {
  const { data } = useLiveQuery(
    (db) =>
      db.getAllAsync<{ id: string; n: number }>(
        `SELECT ${column} AS id, COUNT(*) AS n FROM transactions WHERE deleted = 0 AND ${column} IS NOT NULL GROUP BY ${column}`
      ),
    ['transactions'],
    [column]
  );
  return useMemo(() => new Map((data ?? []).map((u) => [u.id, u.n])), [data]);
}

/** The `n` most-used items (used at least once), busiest first. */
function mostUsed<T>(items: T[], id: (t: T) => string, usage: Map<string, number>, n: number) {
  return items
    .filter((t) => (usage.get(id(t)) ?? 0) > 0)
    .sort((a, b) => usage.get(id(b))! - usage.get(id(a))!)
    .slice(0, n);
}

/** Search and sections only pay off past a screenful; short lists show everything at once. */
const SEARCH_FROM = 8;
const SEARCH_FROM_ACCOUNTS = 6;
const TOP_CATEGORIES = 4;

const accountHit = (a: Account, q: string) =>
  !q || [a.name, a.institution, a.last4, a.card_last4, ACCOUNT_TYPE_LABELS[a.type]].some((t) => t?.toLowerCase().includes(q));

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [subtle] = useThemeColors(['fg-subtle'] as const);
  return (
    <View className="h-10 flex-row items-center gap-2 rounded-[12px] bg-fill px-3">
      <Icon name="search" size={16} color={subtle} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        className="h-full min-w-0 flex-1"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close" size={16} color={subtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

const NoMatch = ({ what, query }: { what: string; query: string }) => (
  <Text variant="small" align="center" className="py-2">
    {`No ${what} matches “${query.trim()}”`}
  </Text>
);

/** A small labelled block of tiles inside a chooser ("Most used", "All categories"). */
function TileSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      {title ? (
        <Text variant="caption" weight="medium" className="px-0.5">
          {title}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

/** One category: icon and name in a compact tile, four to a row. Picked = tinted in the category's colour. */
export function CategoryTile({ option, active, budget, onPress }: { option: Option; active: boolean; budget?: BudgetStatus; onPress: () => void }) {
  const [primary] = useThemeColors(['primary'] as const);
  const color = option.color ?? primary;
  return (
    <PressableScale
      scaleTo={0.95}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={
        budget ? `${option.label}, ${budget.state === 'over' ? 'over budget' : `${Math.round(budget.used * 100)}% of budget used`}` : option.label
      }
      onPress={onPress}
      className={cn('w-[23%] items-center gap-1 rounded-[12px] border-[1.5px] px-1 py-2', !active && 'border-transparent bg-surface')}
      style={active ? { borderColor: color, backgroundColor: `${color}1f` } : undefined}>
      <IconTile icon={categoryIcon(option.label, undefined, option.icon)} color={option.color} size={30} />
      <Text variant="caption" align="center" tone="default" weight={active ? 'medium' : 'regular'} numberOfLines={2}>
        {option.label}
      </Text>
      {budget ? <BudgetBar used={budget.used} state={budget.state} thin className="w-3/5" /> : null}
    </PressableScale>
  );
}

/**
 * Category chooser: search, then your most-used categories, then all the others, as compact tiles.
 * Short lists (income) skip search and sections. `budgetOf` adds this month's budget line to a tile.
 */
export function CategoryGrid({
  options,
  value,
  onPick,
  budgetOf,
}: {
  options: Option[];
  value: string | null;
  onPick: (v: string) => void;
  budgetOf?: (id: string) => BudgetStatus | undefined;
}) {
  const usage = useUsage('category_id');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const long = options.length > SEARCH_FROM;
  const top = q || !long ? [] : mostUsed(options, (o) => o.value, usage, TOP_CATEGORIES);
  const rest = options.filter((o) => !top.includes(o) && (!q || o.label.toLowerCase().includes(q)));
  const tile = (o: Option) => <CategoryTile key={o.value} option={o} active={o.value === value} budget={budgetOf?.(o.value)} onPress={() => onPick(o.value)} />;
  return (
    <View className="gap-3">
      {long ? <SearchBox value={query} onChange={setQuery} placeholder="Search categories" /> : null}
      {top.length ? <TileSection title="Most used">{top.map(tile)}</TileSection> : null}
      {rest.length ? <TileSection title={top.length ? 'All categories' : undefined}>{rest.map(tile)}</TileSection> : null}
      {q && !rest.length ? <NoMatch what="category" query={query} /> : null}
    </View>
  );
}

/**
 * Accounts as compact two-column tiles (logo, name, type · ••digits), for picking inside another
 * sheet. Accounts the SMS `digits` match come first and say so, then the ones you use most.
 */
export function AccountGrid({ accounts, value, onPick, digits }: { accounts: Account[]; value: string | null; onPick: (v: string) => void; digits?: string | null }) {
  const [onPrimary] = useThemeColors(['on-primary'] as const);
  const usage = useUsage('account_id');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (a: Account) => !!digits && (a.last4 === digits || a.card_last4 === digits);
  const sorted = accounts
    .filter((a) => accountHit(a, q))
    .sort(
      (a, b) =>
        Number(matches(b)) - Number(matches(a)) ||
        (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) ||
        ACCOUNT_ORDER.indexOf(a.type) - ACCOUNT_ORDER.indexOf(b.type)
    );
  if (accounts.length === 0) return <Text variant="small">Add an account first (More → Accounts).</Text>;
  return (
    <View className="gap-2">
      {accounts.length > SEARCH_FROM_ACCOUNTS ? <SearchBox value={query} onChange={setQuery} placeholder="Search accounts" /> : null}
      <View className="flex-row flex-wrap gap-2">
        {sorted.map((a) => {
          const active = a.id === value;
          const digitsText = a.last4 ? `••${a.last4}` : null;
          const sub = matches(a) ? `Matches ••${digits}` : [ACCOUNT_TYPE_LABELS[a.type], digitsText].filter(Boolean).join(' · ');
          return (
            <PressableScale
              key={a.id}
              scaleTo={0.97}
              accessibilityRole="radio"
              accessibilityLabel={`${a.name}${a.last4 ? `, ending ${a.last4}` : ''}${matches(a) ? ', matches the SMS' : ''}`}
              accessibilityState={{ checked: active }}
              onPress={() => onPick(a.id)}
              className={cn('w-[48.5%] flex-row items-center gap-2 rounded-[12px] border px-2 py-2', active ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}>
              <BankLogo institution={a.institution} fallback={ACCOUNT_ICON[a.type]} size={28} />
              <View className="min-w-0 flex-1">
                <Text weight="medium" numberOfLines={1} className={active ? 'text-primary-fg' : undefined}>
                  {a.name}
                </Text>
                <Text variant="caption" numberOfLines={1} tone={matches(a) ? 'brass' : undefined}>
                  {sub}
                </Text>
              </View>
              {active ? (
                <View className="h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Icon name="check" size={10} color={onPrimary} strokeWidth={3} />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {q && !sorted.length ? <NoMatch what="account" query={query} /> : null}
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
          <SearchBox value={query} onChange={setQuery} placeholder="Search banks, cards, wallets" />
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


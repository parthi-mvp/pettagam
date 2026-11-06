import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { matchBank } from '@/catalog/banks';
import { networkById } from '@/catalog/networks';
import { ACCOUNT_TYPE_LABELS, isCardLike, isLiability, isPersonal, type Account, type AccountType } from '@/db/types';
import { money } from '@/lib/format';

import { BankLogo } from './bank-logo';
import { NetworkMark } from './network-mark';
import { ACCOUNT_ICON } from './pickers';
import { Text } from './ui';

/** A card is 85.6 × 54 mm, like the real thing. */
export const CARD_RATIO = 1.586;
/** How much of each card shows when it sits in the stack: the logo, name and amount row. */
export const CARD_PEEK = 68;

// Cards are physical objects, so they stay dark in light mode too; a bank's brand colour tints them.
const TYPE_TINT: Record<AccountType, string> = {
  bank: '#1f3a4d',
  overdraft: '#3b2f4f',
  credit_card: '#26262b',
  pay_later: '#3a2a52',
  wallet: '#2f2a5c',
  meal_card: '#4a3518',
  fastag: '#1e3d3a',
  cash: '#2c3a24',
  loan: '#4a2323',
  lent: '#2a3c4a',
  borrowed: '#47302a',
};

/** Mix a hex colour with black: 0 = as is, 1 = black. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** What the amount on a card means, in two words. */
function amountLabel(a: Account, bal: number) {
  if (a.type === 'lent') return 'they owe you';
  if (a.type === 'borrowed') return 'you owe';
  // Below zero the card holds your money (overpaid, refund): say so rather than "nothing due".
  if (isLiability(a.type)) return bal > 0 ? 'outstanding' : bal < 0 ? 'in credit' : 'nothing due';
  return 'balance';
}

/** The little gold contact chip, drawn so it stays crisp at any size. */
function Chip() {
  return (
    <Svg width={40} height={30} viewBox="0 0 40 30">
      <Defs>
        <LinearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f3d98b" />
          <Stop offset="1" stopColor="#c99a3a" />
        </LinearGradient>
      </Defs>
      <Rect x={0.5} y={0.5} width={39} height={29} rx={6} fill="url(#chip)" stroke="#a87f2b" strokeWidth={1} />
      <Rect x={14} y={0.5} width={12} height={29} fill="none" stroke="#a87f2b" strokeWidth={1} />
      <Rect x={0.5} y={10} width={39} height={10} fill="none" stroke="#a87f2b" strokeWidth={1} />
    </Svg>
  );
}

/**
 * One account as a physical-looking card: brand-tinted gradient with soft contour rings, bank mark,
 * digits, the holder line and the amount. `footer` (the front card's button) sits bottom-right.
 * The top CARD_PEEK px carry the essentials, because that's all a stacked card shows.
 */
export const AccountCard = memo(function AccountCard({
  account: a,
  balance,
  width,
  footer,
}: {
  account: Account;
  balance: number;
  width: number;
  footer?: React.ReactNode;
}) {
  const bank = isPersonal(a.type) ? null : matchBank(a.institution);
  // Same bank, different product: cards and loans sit darker than the bank account, so two HDFC cards
  // in the stack don't read as one.
  const base = bank?.color ? shade(bank.color, isLiability(a.type) ? 0.58 : 0.3) : TYPE_TINT[a.type];
  const height = width / CARD_RATIO;
  const id = `g-${a.id}`;
  const digits = a.last4 ?? a.card_last4;
  const cardLike = isCardLike(a.type);
  const used = cardLike && a.credit_limit ? Math.min(1, Math.max(0, balance / a.credit_limit)) : null;
  const owed = isLiability(a.type) && balance > 0;
  const network = networkById(a.network);

  return (
    <View style={{ width, height, borderRadius: 20, overflow: 'hidden', backgroundColor: base }} accessibilityLabel={`${a.name}, ${money(balance)} ${amountLabel(a, balance)}`}>
      <Svg width={width} height={height} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={base} />
            <Stop offset="1" stopColor={shade(base, 0.55)} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
        {/* Contour rings off the bottom-right corner: texture without a busy pattern. */}
        {[0.35, 0.55, 0.75, 0.95, 1.15].map((r) => (
          <Circle key={r} cx={width * 0.95} cy={height * 1.05} r={width * r} fill="none" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} />
        ))}
      </Svg>
      {/* Edge: a faint outline plus a brighter top lip, like light catching a card's edge. In the stack it's
          what separates one card from the one behind it, even when both are the same colour. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          borderTopColor: 'rgba(255,255,255,0.32)',
        }}
      />

      {/* Peek row: what a stacked card shows. */}
      <View className="flex-row items-center gap-2.5 px-4" style={{ height: CARD_PEEK }}>
        <BankLogo institution={isPersonal(a.type) ? null : a.institution} fallback={ACCOUNT_ICON[a.type]} size={34} />
        <View className="min-w-0 flex-1">
          <Text weight="semibold" numberOfLines={1} style={{ color: '#ffffff' }}>
            {bank?.short ?? a.institution ?? a.name}
          </Text>
          <Text variant="caption" numberOfLines={1} style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6 }}>
            {ACCOUNT_TYPE_LABELS[a.type].toUpperCase()}
          </Text>
        </View>
        <View className="items-end">
          <Text tabular weight="bold" style={{ color: owed ? '#ffc2b8' : '#ffffff', fontSize: 19, lineHeight: 24 }} numberOfLines={1}>
            {money(Math.abs(balance), true)}
          </Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {amountLabel(a, balance)}
          </Text>
        </View>
      </View>

      <View className="flex-1 justify-between px-4 pb-4">
        <View className="flex-row items-center gap-3">
          {cardLike || a.card_last4 ? <Chip /> : null}
          {digits ? (
            <Text tabular weight="medium" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 3 }}>
              {`•• ${digits}`}
            </Text>
          ) : null}
          {network ? (
            <View className="ml-auto" accessibilityLabel={network.name}>
              <NetworkMark network={network.id} height={20} />
            </View>
          ) : null}
        </View>

        <View className="gap-2.5">
          {used !== null ? (
            <View className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
              <View className="h-full rounded-full" style={{ width: `${used * 100}%`, backgroundColor: used > 0.8 ? '#ff9a8a' : '#ffffff' }} />
            </View>
          ) : null}
          <View className="flex-row items-end justify-between gap-3">
            <Text weight="semibold" numberOfLines={1} className="min-w-0 flex-1" style={{ color: '#ffffff', letterSpacing: 2 }}>
              {a.name.toUpperCase()}
            </Text>
            {footer}
          </View>
        </View>
      </View>
    </View>
  );
});

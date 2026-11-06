import { MaterialSymbols_300Light } from '@expo-google-fonts/material-symbols/300Light';
import * as Font from 'expo-font';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { CATEGORY_CATALOG } from '@/catalog/categories';
import { symbolCodepoint } from '@/catalog/symbol-index';

/**
 * Line icons from the Pettagam design system: 24px grid, 1.8px stroke, round caps/joins.
 * 22px in lists inside 44px tinted tiles (see IconTile).
 */
export type IconName =
  | 'home'
  | 'card'
  | 'trend'
  | 'pie'
  | 'list'
  | 'plus'
  | 'eye'
  | 'eyeOff'
  | 'settings'
  | 'more'
  | 'check'
  | 'phone'
  | 'gift'
  | 'cart'
  | 'coffee'
  | 'search'
  | 'tag'
  | 'camera'
  | 'close'
  | 'info'
  | 'alert'
  | 'image'
  | 'sms'
  | 'bulb'
  | 'chit'
  | 'repeat'
  | 'bag'
  | 'fuel'
  | 'bank'
  | 'receipt'
  | 'house'
  | 'heart'
  | 'film'
  | 'book'
  | 'plane'
  | 'refund'
  | 'transfer'
  | 'coin'
  | 'lock'
  | 'mail'
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowRight'
  | 'calendar'
  | 'chevronDown'
  | 'sync'
  | 'sun'
  | 'moon';

/**
 * A category icon beyond the drawn set: any Material Symbols glyph ("ms:restaurant", 4,000 of them,
 * src/catalog/material-symbols.ts) or an emoji ("emoji:🐶"). Stored as is in categories.icon.
 */
export type ExtraIcon = `ms:${string}` | `emoji:${string}`;
export type AnyIcon = IconName | ExtraIcon;
export const isExtraIcon = (name: string): name is ExtraIcon => name.startsWith('ms:') || name.startsWith('emoji:');

// Light (300): a thinner stroke than Regular sits better beside the app's 1.8px line icons. Same glyphs.
const MS_FAMILY = 'MaterialSymbols_300Light';
let msLoading: Promise<void> | null = null;
/** The ~1 MB icon font loads the first time a symbol is drawn, not at start-up. */
const loadSymbols = () => (msLoading ??= Font.loadAsync({ [MS_FAMILY]: MaterialSymbols_300Light }));

function ExtraGlyph({ name, size, color }: { name: ExtraIcon; size: number; color: string }) {
  const symbol = name.startsWith('ms:');
  const [ready, setReady] = useState(() => !symbol || Font.isLoaded(MS_FAMILY));
  useEffect(() => {
    if (!ready) loadSymbols().then(() => setReady(true), () => {});
  }, [ready]);
  if (!symbol) {
    // Emoji keep their own colours; a touch smaller so they sit like the line icons.
    return (
      <Text allowFontScaling={false} style={{ fontSize: size * 0.85, lineHeight: size * 1.05, textAlign: 'center' }}>
        {name.slice(6)}
      </Text>
    );
  }
  const cp = symbolCodepoint(name.slice(3));
  if (!ready || cp == null) return <View style={{ width: size, height: size }} />;
  return (
    <Text allowFontScaling={false} style={{ fontFamily: MS_FAMILY, fontSize: size, lineHeight: size, width: size, color, textAlign: 'center' }}>
      {String.fromCodePoint(cp)}
    </Text>
  );
}

export function Icon({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
}: {
  name: AnyIcon;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  if (isExtraIcon(name)) return <ExtraGlyph name={name} size={size} color={color} />;
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {glyph(name, p, color)}
    </Svg>
  );
}

type P = { stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round'; fill: string };

function glyph(name: IconName, p: P, color: string) {
  switch (name) {
    case 'home':
      return <Path {...p} d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />;
    case 'card':
      return (
        <>
          <Rect {...p} x={2} y={5} width={20} height={14} rx={2} />
          <Path {...p} d="M2 10h20" />
        </>
      );
    case 'trend':
      return (
        <>
          <Path {...p} d="M3 17l6-6 4 4 8-8" />
          <Path {...p} d="M15 7h6v6" />
        </>
      );
    case 'pie':
      return (
        <>
          <Path {...p} d="M12 3v9h9" />
          <Path {...p} d="M21 12A9 9 0 1 1 12 3" />
        </>
      );
    case 'more':
      return (
        <>
          <Rect {...p} x={3.5} y={3.5} width={7} height={7} rx={2} />
          <Rect {...p} x={13.5} y={3.5} width={7} height={7} rx={2} />
          <Rect {...p} x={3.5} y={13.5} width={7} height={7} rx={2} />
          <Rect {...p} x={13.5} y={13.5} width={7} height={7} rx={2} />
        </>
      );
    case 'chevronRight':
      return <Path {...p} d="M9 18l6-6-6-6" />;
    case 'check':
      return <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'list':
      return <Path {...p} d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />;
    case 'plus':
      return <Path {...p} d="M12 5v14M5 12h14" />;
    case 'eye':
      return (
        <>
          <Path {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <Circle {...p} cx={12} cy={12} r={3} />
        </>
      );
    case 'eyeOff':
      return (
        <>
          <Path {...p} d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
          <Path {...p} d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...p} cx={12} cy={12} r={3} />
          <Path {...p} d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </>
      );
    case 'sms':
      return (
        <>
          <Path {...p} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
          <Path {...p} d="M8 9h8M8 13h5" />
        </>
      );
    case 'bulb':
      return (
        <>
          <Path {...p} d="M9 18h6" />
          <Path {...p} d="M10 21h4" />
          <Path {...p} d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z" />
        </>
      );
    case 'chit':
      return (
        <>
          <Circle {...p} cx={9} cy={8} r={3} />
          <Circle {...p} cx={17} cy={9} r={2.5} />
          <Path {...p} d="M3 20a6 6 0 0 1 12 0" />
          <Path {...p} d="M15 15a4.5 4.5 0 0 1 6 4.2" />
        </>
      );
    case 'repeat':
      return (
        <>
          <Path {...p} d="M21 12a9 9 0 1 1-3-6.7" />
          <Path {...p} d="M21 4v5h-5" />
        </>
      );
    case 'bag':
      return (
        <>
          <Path {...p} d="M3 11h18" />
          <Path {...p} d="M5 11l1.5 8h11L19 11" />
          <Path {...p} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );
    case 'fuel':
      return (
        <>
          <Path {...p} d="M3 22V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17" />
          <Path {...p} d="M2 22h13" />
          <Path {...p} d="M14 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3" />
          <Path {...p} d="M6 8h5" />
        </>
      );
    case 'bank':
      return (
        <>
          <Path {...p} d="M3 10l9-6 9 6" />
          <Path {...p} d="M5 10v8M9 10v8M15 10v8M19 10v8" />
          <Path {...p} d="M3 20h18" />
        </>
      );
    case 'tag':
      return (
        <>
          <Path {...p} d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" />
          <Path {...p} d="M7.5 7.5h.01" />
        </>
      );
    case 'receipt':
      return (
        <>
          <Path {...p} d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
          <Path {...p} d="M9 8h6M9 12h6" />
        </>
      );
    case 'house':
      return (
        <>
          <Path {...p} d="M4 11l8-6 8 6v9H4Z" />
          <Path {...p} d="M10 20v-5h4v5" />
        </>
      );
    case 'heart':
      return <Path {...p} d="M20.8 6.6a5 5 0 0 0-8.8-3 5 5 0 0 0-8.8 3c0 5.4 8.8 11.4 8.8 11.4s8.8-6 8.8-11.4Z" />;
    case 'film':
      return (
        <>
          <Rect {...p} x={3} y={4} width={18} height={16} rx={2} />
          <Path {...p} d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
        </>
      );
    case 'book':
      return (
        <>
          <Path {...p} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z" />
          <Path {...p} d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
        </>
      );
    case 'plane':
      return <Path {...p} d="M17.8 19.2L16 11l3.5-3.5c1.5-1.5 2-3.5 1.5-4.5-1-.5-3 0-4.5 1.5L13 8 4.8 6.2a.5.5 0 0 0-.5.1l-.8.8a.5.5 0 0 0 .1.8L9 11l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.1 5.4a.5.5 0 0 0 .8.1l.8-.8a.5.5 0 0 0 .1-.5Z" />;
    case 'refund':
      return (
        <>
          <Path {...p} d="M3 12a9 9 0 1 0 3-6.7" />
          <Path {...p} d="M3 4v5h5" />
        </>
      );
    case 'transfer':
      return <Path {...p} d="M7 7h13l-4-4M17 17H4l4 4" />;
    case 'coin':
      return (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M9 8h6M9 11h6M13 8c2 0 2 6-3 6l4 3" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect {...p} x={4} y={11} width={16} height={10} rx={2} />
          <Path {...p} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );
    case 'phone':
      return (
        <>
          <Rect {...p} x={7} y={2.5} width={10} height={19} rx={2.5} />
          <Path {...p} d="M11 18.5h2" />
        </>
      );
    case 'gift':
      return (
        <>
          <Rect {...p} x={3.5} y={8} width={17} height={4} rx={1} />
          <Path {...p} d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13M12 8C10.5 4 7 3.5 7 6s3 2 5 2Zm0 0c1.5-4 5-4.5 5-2s-3 2-5 2Z" />
        </>
      );
    case 'cart':
      return (
        <>
          <Path {...p} d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.3" />
          <Circle {...p} cx={9.5} cy={19.5} r={1.3} />
          <Circle {...p} cx={17} cy={19.5} r={1.3} />
        </>
      );
    case 'close':
      return <Path {...p} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
    case 'info':
      return <Path {...p} d="M12 10.5v6.5M12 7h.01" />;
    case 'alert':
      return <Path {...p} d="M12 6.5v7M12 17.5h.01" />;
    case 'camera':
      return (
        <>
          <Path {...p} d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          <Circle {...p} cx={12} cy={12.5} r={3.5} />
        </>
      );
    case 'image':
      return (
        <>
          <Rect {...p} x={3.5} y={4.5} width={17} height={15} rx={2.5} />
          <Circle {...p} cx={9} cy={9.5} r={1.6} />
          <Path {...p} d="M20.5 15.5l-4.5-4.5L6 19.5" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...p} cx={11} cy={11} r={6.5} />
          <Path {...p} d="M16 16l4.5 4.5" />
        </>
      );
    case 'coffee':
      return <Path {...p} d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5V6M12 3.5V6" />;
    case 'mail':
      return (
        <>
          <Rect {...p} x={3} y={5} width={18} height={14} rx={2} />
          <Path {...p} d="M3 7l9 6 9-6" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect {...p} x={3} y={5} width={18} height={16} rx={2} />
          <Path {...p} d="M8 3v4M16 3v4M3 10h18" />
        </>
      );
    case 'arrowRight':
      return <Path {...p} d="M5 12h14M12 5l7 7-7 7" />;
    case 'chevronDown':
      return <Path {...p} d="M6 9l6 6 6-6" />;
    case 'chevronLeft':
      return <Path {...p} d="M15 18l-6-6 6-6" />;
    case 'sync':
      return (
        <>
          <Path {...p} d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
          <Path {...p} d="M21 4v5h-5M3 20v-5h5" />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle {...p} cx={12} cy={12} r={4} />
          <Path {...p} d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case 'moon':
      return <Path {...p} d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />;
    default:
      return <Circle cx={12} cy={12} r={4} fill={color} />;
  }
}

/** The Pettagam strongbox mark (brass on vault). */
export function ChestMark({ size = 38, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M8 20c0-6.6 5.4-12 12-12h8c6.6 0 12 5.4 12 12v2H8v-2Z" stroke={color} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={6} y={22} width={36} height={18} rx={4} stroke={color} strokeWidth={3} />
      <Circle cx={24} cy={29} r={3} fill={color} />
      <Path d="M24 31v4" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

// Categories draw from one set only: Material Symbols (or an emoji the user picked).
const SEED_ICONS = new Map(CATEGORY_CATALOG.map((c) => [c.name.toLowerCase(), c.icon as ExtraIcon]));
const GUESSES: [RegExp, string][] = [
  [/food|dining/, 'restaurant'], [/grocer/, 'local_grocery_store'], [/shopping/, 'shopping_bag'], [/fuel|transport/, 'local_gas_station'],
  [/bill|utilit/, 'receipt_long'], [/rent|housing/, 'home'], [/health|medic/, 'medical_services'], [/entertain/, 'movie'],
  [/educat|school/, 'school'], [/emi|loan/, 'credit_card'], [/travel|trip/, 'flight'], [/salary/, 'payments'],
  [/interest|dividend/, 'savings'], [/refund|cashback/, 'currency_exchange'],
];

/**
 * A category's icon, always a Material Symbol (or the user's emoji): the one they chose → a default
 * category's own symbol → a guess from the name. Transfers aren't a category and keep the transfer arrows.
 */
export function categoryIcon(category: string | null | undefined, type?: string, chosen?: string | null): AnyIcon {
  if (type === 'transfer') return 'transfer';
  if (chosen && isExtraIcon(chosen)) return chosen;
  const c = (category ?? '').trim().toLowerCase();
  const seed = SEED_ICONS.get(c);
  if (seed) return seed;
  const guess = GUESSES.find(([re]) => re.test(c))?.[1];
  return `ms:${guess ?? (type === 'income' ? 'account_balance_wallet' : 'receipt_long')}`;
}

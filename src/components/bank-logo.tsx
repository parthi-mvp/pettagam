import { memo } from 'react';
import { View } from 'react-native';
import { parse, SvgAst, type JsxAST } from 'react-native-svg';
import { inlineStyles } from 'react-native-svg/css';

import { BANK_LOGOS } from '@/catalog/bank-logos';
import { type Bank, matchBank } from '@/catalog/banks';

import { type IconName } from './icons';
import { IconTile, Text } from './ui';

// Parsed once per logo for the app's lifetime: re-parsing SVG text on every mount made the bank
// sheet (70+ rows) slow to open. inlineStyles folds a logo's <style> block into its elements.
const ASTS = new Map<string, JsxAST | null>();
function logoAst(id: string): JsxAST | null {
  if (!ASTS.has(id)) {
    const xml = BANK_LOGOS[id];
    ASTS.set(id, xml ? parse(xml, xml.includes('<style') ? inlineStyles : undefined) : null);
  }
  return ASTS.get(id) ?? null;
}

/**
 * A bank's mark in a square tile: its logo on white (logos are drawn for white, so this holds in
 * dark mode too), else its short name on its brand colour, else `fallback` as a plain icon tile.
 */
export const BankLogo = memo(function BankLogo({
  bank,
  institution,
  fallback = 'bank',
  size = 36,
}: {
  bank?: Bank | null;
  /** Free text to match when `bank` isn't known ("HDFC", "State Bank"). */
  institution?: string | null;
  fallback?: IconName;
  size?: number;
}) {
  const b = bank ?? matchBank(institution);
  const radius = size * 0.28;
  if (!b) return <IconTile icon={fallback} size={size} />;
  const ast = logoAst(b.id);
  if (ast) {
    const inner = size * 0.76;
    return (
      <View
        className="items-center justify-center border border-line bg-white"
        style={{ width: size, height: size, borderRadius: radius }}
        accessibilityLabel={b.name}>
        <SvgAst ast={ast} override={{ width: inner, height: inner }} />
      </View>
    );
  }
  return (
    <View className="items-center justify-center" style={{ width: size, height: size, borderRadius: radius, backgroundColor: b.color }} accessibilityLabel={b.name}>
      <Text weight="semibold" className="text-white" style={{ fontSize: size * (b.short.length > 3 ? 0.24 : 0.3) }} numberOfLines={1}>
        {b.short}
      </Text>
    </View>
  );
});

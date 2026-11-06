import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { InvestmentType } from '@/db/types';
import { searchCoins, searchFunds } from '@/invest/prices';
import type { PriceLink } from '@/lib/invest';

import { Button, Field, OptionRow, Text } from './ui';

export const canLinkPrice = (t: InvestmentType) => t === 'mutual_fund' || t === 'crypto';

type Pick = { link: PriceLink; name: string };

/**
 * Find the fund (AMFI scheme) or coin this holding is, so its price updates on its own. Searching sends
 * only the words typed. Shows the chosen one with a way to change it.
 */
export function PriceLinkField({ type, value, label, onChange }: { type: InvestmentType; value: PriceLink; label: string | null; onChange: (p: Pick | null) => void }) {
  const fund = type === 'mutual_fund';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ key: string; title: string; subtitle?: string; pick: Pick }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = fund ? value.mfScheme : value.coinId;

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      if (fund) {
        const r = await searchFunds(q.trim());
        setResults(r.map((f) => ({ key: String(f.code), title: f.name, subtitle: `AMFI code ${f.code}`, pick: { link: { mfScheme: f.code }, name: f.name } })));
      } else {
        const r = await searchCoins(q.trim());
        setResults(r.map((c) => ({ key: c.id, title: c.name, subtitle: c.symbol.toUpperCase(), pick: { link: { coinId: c.id }, name: c.name } })));
      }
    } catch {
      setError('Couldn’t search. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (chosen && !results) {
    return (
      <View className="gap-2">
        <Text variant="small">{fund ? 'Fund' : 'Coin'}</Text>
        <OptionRow
          leading={null}
          title={label ?? String(chosen)}
          subtitle={fund ? `Price: AMFI NAV, code ${chosen}` : 'Price in ₹ from CoinGecko'}
          active
          onPress={() => setResults([])}
          trailing={<Text variant="caption">Change</Text>}
        />
      </View>
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <Field
            label={fund ? 'Find the fund (optional)' : 'Find the coin (optional)'}
            value={q}
            onChangeText={setQ}
            placeholder={fund ? 'Parag Parikh Flexi Cap Direct' : 'Bitcoin'}
            returnKeyType="search"
            onSubmitEditing={search}
            autoCorrect={false}
          />
        </View>
        <Button size="md" variant="secondary" title="Search" disabled={busy || q.trim().length < 2} onPress={search} />
      </View>
      {busy ? <ActivityIndicator /> : null}
      {error ? <Text variant="small" tone="danger">{error}</Text> : null}
      {results?.length === 0 && !busy && q ? <Text variant="small">Nothing found. Try fewer words.</Text> : null}
      {results?.map((r) => (
        <OptionRow
          key={r.key}
          leading={null}
          title={r.title}
          subtitle={r.subtitle}
          onPress={() => {
            onChange(r.pick);
            setResults(null);
            setQ('');
          }}
        />
      ))}
      {chosen ? <Button size="sm" variant="link" title="Keep the current one" onPress={() => setResults(null)} /> : null}
      <Text variant="caption">
        {fund ? 'Linked funds take the official NAV each day, so the value stays current.' : 'Linked coins update their price in rupees.'} Only the search words are sent.
      </Text>
    </View>
  );
}

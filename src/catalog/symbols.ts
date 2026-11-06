// Search over the Material Symbols catalogue. Pure (the data is passed in), so Node tests can run it;
// the app's ready-made index is in symbol-index.ts.

export type SymbolEntry = { name: string; cp: number; label: string; search: string; aliases: string[] };

/** Icons worth showing before anyone searches: everyday money categories. Missing names are skipped. */
export const POPULAR_SYMBOLS = [
  'restaurant', 'lunch_dining', 'local_cafe', 'local_pizza', 'local_bar', 'bakery_dining', 'shopping_cart', 'shopping_bag',
  'storefront', 'local_grocery_store', 'local_gas_station', 'ev_station', 'directions_car', 'two_wheeler', 'local_taxi', 'train',
  'directions_bus', 'flight', 'hotel', 'luggage', 'home', 'apartment', 'bolt', 'water_drop', 'wifi', 'smartphone', 'tv',
  'subscriptions', 'movie', 'sports_esports', 'music_note', 'fitness_center', 'sports_cricket', 'spa', 'content_cut',
  'medical_services', 'medication', 'local_hospital', 'school', 'menu_book', 'child_care', 'pets', 'card_giftcard',
  'celebration', 'volunteer_activism', 'temple_hindu', 'savings', 'account_balance', 'payments', 'credit_card',
  'receipt_long', 'request_quote', 'work', 'laptop', 'build', 'local_laundry_service', 'checkroom', 'diamond', 'handshake',
  'family_restroom', 'elderly', 'local_shipping', 'local_parking', 'toll', 'security', 'policy', 'gavel', 'park',
];

/** "name:hex[:alias_one alias_two]" lines → entries. Aliases are other official names for the same glyph. */
export function parseSymbols(data: string): SymbolEntry[] {
  return data.split('\n').map((line) => {
    const [name, hex, rest = ''] = line.split(':');
    const aliases = rest ? rest.split(' ') : [];
    const label = name.replace(/_/g, ' ');
    return { name, cp: parseInt(hex, 16), label, aliases, search: [label, ...aliases.map((a) => a.replace(/_/g, ' '))].join(' ').toLowerCase() };
  });
}

/** Every official name (shown name and aliases) → its entry. */
export const symbolLookup = (all: SymbolEntry[]) => new Map(all.flatMap((s) => [[s.name, s] as const, ...s.aliases.map((a) => [a, s] as const)]));

/** Best matches for a typed word: name starts with it, a word starts with it, then anywhere (aliases too). */
export function searchSymbols(all: SymbolEntry[], query: string, limit = 48): SymbolEntry[] {
  const q = query.trim().toLowerCase().replace(/_/g, ' ');
  if (!q) {
    const byName = symbolLookup(all);
    // Some popular names are aliases of one glyph (local_grocery_store = shopping_cart): show it once.
    return [...new Set(POPULAR_SYMBOLS.map((n) => byName.get(n)).filter((s): s is SymbolEntry => !!s))];
  }
  const ranked: { s: SymbolEntry; r: number }[] = [];
  for (const s of all) {
    const r = s.label.startsWith(q) ? 0 : s.search.split(' ').some((w) => w.startsWith(q)) ? 1 : s.search.includes(q) ? 2 : -1;
    if (r >= 0) ranked.push({ s, r });
  }
  return ranked
    .sort((a, b) => a.r - b.r || a.s.label.length - b.s.label.length)
    .slice(0, limit)
    .map((x) => x.s);
}

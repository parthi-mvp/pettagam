import { MATERIAL_SYMBOLS_DATA } from './material-symbols';
import { parseSymbols, searchSymbols, symbolLookup, type SymbolEntry } from './symbols';

// Parsed on first use (4,000 lines), then kept.
let all: SymbolEntry[] | null = null;
let byName: Map<string, SymbolEntry> | null = null;
const symbols = () => (all ??= parseSymbols(MATERIAL_SYMBOLS_DATA));

/** The glyph for any official Material Symbols name (aliases too), or null if the font doesn't have it. */
export const symbolCodepoint = (name: string) => (byName ??= symbolLookup(symbols())).get(name)?.cp ?? null;

/** Icons for the picker: popular ones for an empty search, else the best matches. */
export const findSymbols = (query: string, limit?: number) => searchSymbols(symbols(), query, limit);

export const SYMBOL_COUNT = () => symbols().length;


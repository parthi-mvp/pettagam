import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_CATALOG, LEGACY_CATEGORY_ICONS } from '../src/catalog/categories.ts';
import { MATERIAL_SYMBOLS_DATA } from '../src/catalog/material-symbols.ts';
import { parseSymbols, POPULAR_SYMBOLS, searchSymbols, symbolLookup } from '../src/catalog/symbols.ts';

const all = parseSymbols(MATERIAL_SYMBOLS_DATA);

test('the catalogue parses into thousands of icons with valid codepoints', () => {
  assert.ok(all.length > 3500);
  assert.ok(all.every((s) => s.name && Number.isInteger(s.cp) && s.cp > 0));
});

test('every popular icon exists in the font', () => {
  const names = symbolLookup(all);
  const missing = POPULAR_SYMBOLS.filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
});

test('search: empty shows popular, words find icons, aliases count', () => {
  const popular = searchSymbols(all, '');
  assert.ok(popular.length > 50);
  assert.equal(new Set(popular.map((s) => s.name)).size, popular.length, 'no glyph twice (they are list keys)');
  assert.equal(searchSymbols(all, 'pets')[0].name, 'pets');
  assert.ok(searchSymbols(all, 'gym').length + searchSymbols(all, 'fitness').length > 0);
  assert.ok(searchSymbols(all, 'restaurant').some((s) => s.name === 'restaurant'));
  assert.deepEqual(searchSymbols(all, 'zzzz-nothing'), []);
});

test('an alias resolves to the shown name of the same glyph', () => {
  const lookup = symbolLookup(all);
  assert.equal(lookup.get('local_grocery_store')?.name, lookup.get('shopping_cart')?.name);
  assert.equal(lookup.get('pets')?.name, 'pets');
});

test('every default category icon and every old-icon mapping exists in the font', () => {
  const names = symbolLookup(all);
  const seeds = CATEGORY_CATALOG.map((c) => c.icon).filter((i) => !i.startsWith('ms:') || !names.has(i.slice(3)));
  assert.deepEqual(seeds, [], 'default categories need a valid ms: icon');
  const legacy = Object.entries(LEGACY_CATEGORY_ICONS).filter(([, ms]) => !names.has(ms));
  assert.deepEqual(legacy, []);
});

test('default categories each have their own icon, stored by its shown name', () => {
  const lookup = symbolLookup(all);
  const icons = CATEGORY_CATALOG.map((c) => c.icon);
  assert.equal(new Set(icons).size, icons.length, 'two default categories share an icon');
  const aliases = icons.filter((i) => lookup.get(i.slice(3))?.name !== i.slice(3));
  assert.deepEqual(aliases, [], 'store the shown name, not an alias');
});

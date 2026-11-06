import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { typographyVariables } from '../src/theme/typography.ts';

test('default font and scale match src/global.css exactly', () => {
  const vars = typographyVariables('golos', 'default');
  const css = readFileSync(new URL('../src/global.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf('@variant light {'), css.indexOf('@variant dark {'));
  for (const [name, value] of Object.entries(vars)) {
    const css_ = typeof value === 'number' ? `${value}px` : value;
    assert.ok(light.includes(`${name}: ${css_};`), `${name}: ${css_} missing in global.css`);
  }
});

test('sizes are numbers, never "13px" strings (a string fontSize crashes React Native)', () => {
  for (const [name, value] of Object.entries(typographyVariables('golos', 'large'))) {
    if (name.startsWith('--text-')) assert.equal(typeof value, 'number', name);
  }
});

test('a font swaps every weight; a scale grows sizes and line heights together', () => {
  const v = typographyVariables('sora', 'xlarge');
  assert.equal(v['--font-regular'], 'Sora_400Regular');
  assert.equal(v['--font-extrabold'], 'Sora_800ExtraBold');
  assert.equal(v['--text-base'], 16); // 13 × 1.25
  assert.equal(v['--text-base--line-height'], 23); // 18 × 1.25
});

test('unknown ids fall back to the defaults', () => {
  assert.deepEqual(typographyVariables('comic', 'huge'), typographyVariables('golos', 'default'));
});

test('System uses Android named weights, and Helvetica Neue on iOS', () => {
  assert.equal(typographyVariables('system', 'default')['--font-medium'], 'sans-serif-medium');
  assert.equal(typographyVariables('system', 'default', 'ios')['--font-bold'], 'HelveticaNeue-Bold');
  assert.equal(typographyVariables('sora', 'default', 'ios')['--font-bold'], 'Sora_700Bold');
});

test('every font family has its file in FONT_FILES (Golos is always loaded; System is built in)', () => {
  const src = readFileSync(new URL('../src/constants/fonts.ts', import.meta.url), 'utf8');
  for (const id of ['golos', 'manrope', 'nunito', 'sora', 'lexend', 'space']) {
    for (const name of Object.values(typographyVariables(id, 'default')).filter((v) => typeof v === 'string')) {
      // Golos is registered through FontFamily[weight]; the Google fonts by their own name.
      if (!String(name).startsWith('GolosText-')) assert.ok(src.includes(`  ${name},`), `${name} missing from FONT_FILES`);
    }
  }
});

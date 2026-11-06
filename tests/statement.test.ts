import assert from 'node:assert/strict';
import { test } from 'node:test';

import { statementHtml, toCsv, type ExportRow } from '../src/reports/statement.ts';

const row = (p: Partial<ExportRow>): ExportRow => ({
  date: '2026-11-03', type: 'expense', amount: 450, account: 'HDFC', to_account: null, category: 'Food', merchant: 'Swiggy', note: null, via: 'upi', tags: '', ...p,
});

test('toCsv quotes commas, quotes and newlines, and defuses spreadsheet formulas', () => {
  const csv = toCsv([row({ merchant: 'Ravi, "Anna" Stores', note: 'line1\nline2' }), row({ merchant: '=HYPERLINK("x")', amount: 12.5 })]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'date,type,amount,account,to_account,category,merchant,note,via,tags');
  assert.ok(csv.includes('"Ravi, ""Anna"" Stores"'));
  assert.ok(csv.includes('"line1\nline2"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes(',12.5,'));
});

test('statementHtml totals in and out, escapes text, and lists categories biggest first', () => {
  const out = statementHtml(
    [row({ amount: 300, category: 'Travel' }), row({ amount: 700, merchant: '<script>x</script>' }), row({ type: 'income', amount: 5000, category: 'Salary', merchant: 'Acme' })],
    'November 2026'
  );
  assert.ok(!out.includes('<script>x'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('₹5,000.00') && out.includes('₹1,000.00') && out.includes('₹4,000.00'));
  assert.ok(out.indexOf('<td>Food</td><td class="num">₹700.00') < out.indexOf('<td>Travel</td><td class="num">₹300.00'));
});

// CSV and printable statement for an export (no imports → unit-tested in Node, see tests/statement.test.ts).

export type ExportRow = {
  date: string; // YYYY-MM-DD, local
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  account: string | null;
  to_account: string | null;
  category: string | null;
  merchant: string | null;
  note: string | null;
  via: string | null;
  tags: string; // "Goa trip; Reimbursable"
};

const COLS = ['date', 'type', 'amount', 'account', 'to_account', 'category', 'merchant', 'note', 'via', 'tags'] as const;

/** Spreadsheet-safe CSV: quotes where needed, and a leading ' on text Excel would run as a formula. */
export function toCsv(rows: ExportRow[]): string {
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLS.join(','), ...rows.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
}

const html = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** A plain A4 statement: totals, spending by category, then every entry. */
export function statementHtml(rows: ExportRow[], title: string, generatedAt = new Date()): string {
  const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.type === 'expense') byCat.set(r.category ?? 'Uncategorised', (byCat.get(r.category ?? 'Uncategorised') ?? 0) + r.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const sign = (r: ExportRow) => (r.type === 'income' ? '+' : r.type === 'expense' ? '−' : '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { margin: 18mm 14mm; }
  body { font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; color: #1b1f1e; font-size: 10.5px; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 0 2px; } h2 { font-size: 12px; font-weight: 500; margin: 18px 0 6px; }
  .muted { color: #6b7672; } .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 4px 6px; border-bottom: 0.5px solid #dfe3e1; vertical-align: top; }
  th { text-align: left; font-weight: 500; color: #6b7672; } .totals td { border: none; padding: 2px 0; font-size: 12px; }
  tr { page-break-inside: avoid; }
</style></head><body>
<h1>Pettagam statement</h1>
<div class="muted">${html(title)} · made ${html(generatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))} · ${rows.length} entries</div>
<h2>Summary</h2>
<table class="totals" style="width:auto">
<tr><td>Money in</td><td class="num" style="padding-left:24px">${rupees(income)}</td></tr>
<tr><td>Money out</td><td class="num" style="padding-left:24px">${rupees(expense)}</td></tr>
<tr><td>Kept</td><td class="num" style="padding-left:24px">${income - expense < 0 ? '−' : ''}${rupees(Math.abs(income - expense))}</td></tr>
</table>
${cats.length ? `<h2>Spending by category</h2><table><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr>${cats
    .map(([c, v]) => `<tr><td>${html(c)}</td><td class="num">${rupees(v)}</td><td class="num">${expense ? Math.round((v / expense) * 100) : 0}%</td></tr>`)
    .join('')}</table>` : ''}
<h2>Entries</h2>
<table><tr><th>Date</th><th>Details</th><th>Category</th><th>Account</th><th class="num">Amount</th></tr>${rows
    .map(
      (r) =>
        `<tr><td style="white-space:nowrap">${shortDate(r.date)}</td><td>${html(r.merchant ?? (r.type === 'transfer' ? `To ${r.to_account ?? 'another account'}` : ''))}${r.note ? `<div class="muted">${html(r.note)}</div>` : ''}</td><td>${html(r.type === 'transfer' ? 'Transfer' : r.category)}</td><td>${html(r.account)}</td><td class="num">${sign(r)}${rupees(r.amount)}</td></tr>`
    )
    .join('')}</table>
</body></html>`;
}

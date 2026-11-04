// Validates what the AI model returns. Pure TypeScript (no imports) so it runs in Node tests.

export type Kind = 'expense' | 'income';
export type AiSmsItem = { i: number; type: Kind; amount: number; merchant: string | null; category: string | null };

/** Parse a JSON reply, tolerating ```json fences some models add. Throws on garbage. */
export function readJson(text: string): any {
  return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
}

/** Map the model's category answer onto an exact name from `names`, or null. */
export function matchName(answer: unknown, names: string[]): string | null {
  if (typeof answer !== 'string') return null;
  const a = answer.trim().toLowerCase();
  return names.find((n) => n.toLowerCase() === a) ?? null;
}

/** Keep only well-formed items for indexes 0..count-1; the model's output is untrusted. */
export function readAiSms(text: string, count: number, categories: { name: string; kind: Kind }[]): AiSmsItem[] {
  const items = readJson(text)?.items;
  if (!Array.isArray(items)) return [];
  const out: AiSmsItem[] = [];
  const seen = new Set<number>();
  for (const it of items) {
    const i = it?.i;
    const amount = typeof it?.amount === 'string' ? Number(it.amount.replace(/,/g, '')) : it?.amount;
    if (!Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) continue;
    if (it.type !== 'expense' && it.type !== 'income') continue;
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) continue;
    seen.add(i);
    const merchant = typeof it.merchant === 'string' && it.merchant.trim() ? it.merchant.trim().slice(0, 40) : null;
    const names = categories.filter((c) => c.kind === it.type).map((c) => c.name);
    out.push({ i, type: it.type, amount, merchant, category: matchName(it.category, names) });
  }
  return out;
}

export type AiDraft = {
  type: 'expense' | 'income' | 'transfer';
  amount: number | null;
  account: string | null;
  toAccount: string | null;
  category: string | null;
  merchant: string | null;
  note: string | null;
  date: string | null; // DD/MM/YYYY, the form's input format
};

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** A transaction the user described in words, checked against their own accounts and categories. */
export function readAiDraft(text: string, accounts: string[], categories: { name: string; kind: Kind }[]): AiDraft {
  const j = readJson(text) ?? {};
  const type = j.type === 'income' || j.type === 'transfer' ? j.type : 'expense';
  const amount = typeof j.amount === 'string' ? Number(j.amount.replace(/,/g, '')) : j.amount;
  const d = typeof j.date === 'string' ? j.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const kind: Kind = type === 'income' ? 'income' : 'expense';
  return {
    type,
    amount: typeof amount === 'number' && isFinite(amount) && amount > 0 ? amount : null,
    account: matchName(j.account, accounts),
    toAccount: type === 'transfer' ? matchName(j.to_account, accounts) : null,
    category: type === 'transfer' ? null : matchName(j.category, categories.filter((c) => c.kind === kind).map((c) => c.name)),
    merchant: str(j.merchant, 40),
    note: str(j.note, 200),
    date: d ? `${d[3]}/${d[2]}/${d[1]}` : null,
  };
}

/** {"items":[{"i":0,"value":"…"}]} → index → value, keeping only in-range, non-empty strings. */
export function readAiPicks(text: string, count: number): Map<number, string> {
  const items = readJson(text)?.items;
  const out = new Map<number, string>();
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    const v = str(it?.value, 40);
    if (Number.isInteger(it?.i) && it.i >= 0 && it.i < count && v && !out.has(it.i)) out.set(it.i, v);
  }
  return out;
}

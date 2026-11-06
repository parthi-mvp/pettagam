const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const money = (n: number, decimals = false) => (decimals ? inr2 : inr).format(n || 0);

export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

export const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const monthLabel = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export function monthRange(offset = 0, base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1).getTime();
  const end = new Date(base.getFullYear(), base.getMonth() + offset + 1, 1).getTime();
  return { start, end };
}

/** Parse "dd/mm/yyyy", "dd-mm-yyyy" or "yyyy-mm-dd" to epoch ms; null if invalid. */
export function parseDate(s: string): number | null {
  const t = s.trim();
  // Date() rolls 31/02 over to 3 March; reject days and months that don't exist instead.
  const ymd = (y: number, mo: number, d: number) => {
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : null;
  };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

export const toInputDate = (ms: number | null | undefined) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** Money with paise only when there are any: ₹8,500 but ₹193.64. */
export const moneyExact = (n: number) => money(n, Math.round(n * 100) % 100 !== 0);

/**
 * Tames SMS merchant names for display: "CRAZY SANDWICH" → "Crazy Sandwich",
 * "PTM*ZOMATO LIMITED" → "PTM*Zomato Limited". Only all-caps names change, and words of
 * 3 letters or fewer stay as they are (SBI, UPI, K T). Mixed-case names are left alone.
 */
export function tidyName(s: string): string {
  if (/[a-z]/.test(s) || !/[A-Z]{4}/.test(s)) return s;
  return s.replace(/[A-Z]{4,}/g, (w) => w[0] + w.slice(1).toLowerCase());
}

/** Day heading for lists: "Today", "Yesterday", "Mon, 3 Nov" (year added when it isn't this year). */
export function dayLabel(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const diff = Math.round((day(now) - day(ms)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "4 Oct 2026", or "4 Oct – 9 Nov 2026" for a span (the earlier year shown only when it differs). */
export function dateSpan(from: number, to: number): string {
  const fmt = (ms: number, year: boolean) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  if (new Date(from).toDateString() === new Date(to).toDateString()) return fmt(to, true);
  return `${fmt(from, new Date(from).getFullYear() !== new Date(to).getFullYear())} – ${fmt(to, true)}`;
}

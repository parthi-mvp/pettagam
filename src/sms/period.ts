// Which messages an SMS scan reads. Pure (tests/period.test.ts).

export type PeriodId = 'new' | '7' | '30' | '90' | 'month' | 'lastMonth' | 'custom';
export type Range = { from: number; to: number };

const DAY = 86_400_000;
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
const monthStart = (now: number, offset: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
};

/**
 * The time window for a period, or null when it can't be scanned yet (no previous import for
 * "new", or custom dates missing / reversed). `from` is exclusive, `to` inclusive. Custom dates are
 * whole days: from the start of `from` to the end of `to`, never past now.
 */
export function periodRange(id: PeriodId, now: number, cursor: number, custom?: { from: number | null; to: number | null }): Range | null {
  switch (id) {
    case 'new':
      return cursor > 0 && cursor < now ? { from: cursor, to: now } : null;
    case '7':
    case '30':
    case '90':
      return { from: startOfDay(now) - (Number(id) - 1) * DAY - 1, to: now };
    case 'month':
      return { from: monthStart(now, 0) - 1, to: now };
    case 'lastMonth':
      return { from: monthStart(now, -1) - 1, to: monthStart(now, 0) - 1 };
    case 'custom': {
      const { from, to } = custom ?? { from: null, to: null };
      if (from == null || to == null || from > to || from > now) return null;
      return { from: startOfDay(from) - 1, to: Math.min(startOfDay(to) + DAY - 1, now) };
    }
  }
}

/** "4 Oct – 3 Nov", with years only when they aren't this year. */
export function rangeLabel(r: Range, now: number) {
  const year = new Date(now).getFullYear();
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== year ? { year: 'numeric' } : {}) });
  const a = fmt(r.from + 1);
  const b = fmt(r.to);
  return a === b ? a : `${a} – ${b}`;
}

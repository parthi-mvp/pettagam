// Regular payments into an investment: SIP, RD installment, premium (no imports → tested in tests/schedule.test.ts).

/** Every `every` months, from the date `next` (a local midnight), for `amount`. */
export type Schedule = { amount: number; every: 1 | 3 | 6 | 12; next: number };

/** `t` moved by `months`, keeping the day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(t: number, months: number) {
  const d = new Date(t);
  const day = d.getDate();
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)).getTime();
}

const midnight = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Which installment (0 = the stored date) is the first on or after `now`'s day. */
function firstIndex(s: Schedule, now: number) {
  const today = midnight(now);
  let k = 0;
  while (addMonths(s.next, k * s.every) < today && k < 1200) k++;
  return k;
}

/** The next due date on or after today (the stored date rolls forward on its own). */
export const nextDue = (s: Schedule, now = Date.now()) => addMonths(s.next, firstIndex(s, now) * s.every);

/** Due dates from `from` (inclusive) up to `to` (inclusive), always stepped from the stored date. */
export function dueDates(s: Schedule, from: number, to: number) {
  const out: number[] = [];
  for (let k = firstIndex(s, from); k < 1200; k++) {
    const t = addMonths(s.next, k * s.every);
    if (t > to) break;
    out.push(t);
  }
  return out;
}

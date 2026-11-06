// Credit card billing cycles (no imports → unit-tested in Node, see tests/card-cycle.test.ts).

export type Cycle = { start: number; end: number; statement: number };

/** The statement date in a month: the billing day, or the month's last day when it's shorter (31 → 28 Feb). */
const statementIn = (y: number, m: number, day: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

/**
 * The open cycle (since the last statement, closing on the next one) and the last closed one.
 * A cycle runs from the day after one statement to the statement day itself, inclusive:
 * `start` and `end` are local midnights, end exclusive, so they plug straight into date queries.
 */
export function cardCycles(billingDay: number, now = new Date()): { open: Cycle; last: Cycle } {
  const y = now.getFullYear();
  const m = now.getMonth();
  // The next statement is this month's, unless it's already past.
  const k = now.getDate() <= statementIn(y, m, billingDay).getDate() ? 0 : 1;
  const cycle = (shift: number): Cycle => {
    const st = statementIn(y, m + shift, billingDay);
    const prev = statementIn(y, m + shift - 1, billingDay);
    return {
      start: new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1).getTime(),
      end: new Date(st.getFullYear(), st.getMonth(), st.getDate() + 1).getTime(),
      statement: st.getTime(),
    };
  };
  return { open: cycle(k), last: cycle(k - 1) };
}

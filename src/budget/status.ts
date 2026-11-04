// Budget maths for one month. No imports: tests/budget.test.ts runs it in Node.

export type BudgetState = 'ok' | 'near' | 'over';

/** At or past this share of the limit, a budget is "near" (amber). */
export const NEAR = 0.8;

export type BudgetStatus = {
  state: BudgetState;
  limit: number;
  spent: number;
  /** Share of the limit used (can pass 1). */
  used: number;
  /** Left to spend (0 once over). */
  remaining: number;
  /** How far over the limit (0 while under). */
  over: number;
  /** Days left in the month including today; 0 for a past month. */
  daysLeft: number;
  /** What can still be spent per remaining day (0 once over or for a past month). */
  perDay: number;
  /** Month-end spend at the current daily pace (the month total for a past month). */
  projected: number;
  /** Projected overspend while still under budget (0 if the pace fits). */
  projectedOver: number;
};

/**
 * `start` / `end` bound the month (end exclusive, epoch ms); `now` decides how much of it is gone.
 * The pace only counts once a few days have passed, so day 1 doesn't project a wild total.
 */
export function budgetStatus(limit: number, spent: number, start: number, end: number, now: number): BudgetStatus {
  const DAY = 86_400_000;
  const totalDays = Math.round((end - start) / DAY);
  const elapsedDays = now >= end ? totalDays : now < start ? 0 : Math.floor((now - start) / DAY) + 1;
  const daysLeft = Math.max(0, totalDays - elapsedDays + (now < end && now >= start ? 1 : 0));
  const used = limit > 0 ? spent / limit : 0;
  const remaining = Math.max(0, limit - spent);
  const over = Math.max(0, spent - limit);
  const projected = elapsedDays >= 5 && now < end ? (spent / elapsedDays) * totalDays : spent;
  return {
    state: spent > limit ? 'over' : used >= NEAR ? 'near' : 'ok',
    limit,
    spent,
    used,
    remaining,
    over,
    daysLeft,
    perDay: daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0,
    projected,
    projectedOver: spent <= limit && projected > limit ? projected - limit : 0,
  };
}

/** Which line a new expense crossed, if any: drives the "80% used" / "over budget" toast. */
export function crossed(limit: number, before: number, after: number): 'near' | 'over' | null {
  if (before <= limit && after > limit) return 'over';
  if (before < limit * NEAR && after >= limit * NEAR && after <= limit) return 'near';
  return null;
}

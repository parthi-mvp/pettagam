// Savings-goal maths (no imports → unit-tested in Node, see tests/goal.test.ts).

export type GoalProgress = {
  saved: number;
  left: number;
  share: number;
  /** Whole months until the target date (at least 1 while it's ahead), null without a date. */
  monthsLeft: number | null;
  /** Needed each month to get there on time, null without a date or when reached. */
  perMonth: number | null;
  /** Date has passed and it isn't reached. */
  late: boolean;
};

export function goalProgress(target: number, saved: number, targetDate: number | null, now = new Date()): GoalProgress {
  const have = Math.max(saved, 0);
  const left = Math.max(target - have, 0);
  const share = target > 0 ? Math.min(have / target, 1) : 0;
  if (targetDate == null) return { saved: have, left, share, monthsLeft: null, perMonth: null, late: false };
  const d = new Date(targetDate);
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + (d.getDate() >= now.getDate() ? 0 : -1);
  const late = d.getTime() < now.getTime() && left > 0;
  const monthsLeft = late ? 0 : Math.max(months, 1);
  return { saved: have, left, share, monthsLeft, perMonth: left > 0 && !late ? Math.ceil(left / monthsLeft) : null, late };
}

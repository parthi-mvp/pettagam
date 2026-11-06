// Loan payoff maths (no imports → unit-tested in Node, see tests/loan.test.ts).

export type Payoff = { months: number; interest: number; endsOn: number };

/**
 * Month by month from today's outstanding: interest at rate/12, then the EMI. Null when the EMI
 * doesn't even cover the interest (the loan never ends), or after 50 years.
 */
export function payoff(balance: number, ratePa: number, emi: number, now = new Date()): Payoff | null {
  if (!(balance > 0)) return { months: 0, interest: 0, endsOn: now.getTime() };
  const r = Math.max(ratePa, 0) / 1200;
  if (!(emi > balance * r)) return null;
  let left = balance;
  let interest = 0;
  let months = 0;
  while (left > 0.005 && months < 600) {
    const i = left * r;
    interest += i;
    left = left + i - emi;
    months++;
  }
  if (left > 0.005) return null;
  return { months, interest: Math.round(interest), endsOn: new Date(now.getFullYear(), now.getMonth() + months, 1).getTime() };
}

/** What paying `lump` off today saves, keeping the same EMI (the loan ends sooner). */
export function prepaySavings(balance: number, ratePa: number, emi: number, lump: number) {
  const before = payoff(balance, ratePa, emi);
  const after = payoff(Math.max(balance - lump, 0), ratePa, emi);
  if (!before || !after) return null;
  return { months: before.months - after.months, interest: before.interest - after.interest };
}

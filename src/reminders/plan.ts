// Which reminders to schedule, and when (no imports → unit-tested in Node, see tests/reminders.test.ts).

/** Something with a date: a card bill, an EMI, a chit installment, an expected subscription charge. */
export type Due = {
  key: string;
  /** "HDFC Millennia bill", "Home loan EMI", "Netflix". */
  label: string;
  /** 'due' = must be paid; 'expected' = a recurring charge that usually comes; 'matures' = a deposit ends. */
  verb: 'due' | 'expected' | 'matures';
  amount: number | null;
  /** Local midnight of the day. */
  date: number;
  /** Screen to open when the reminder is tapped. */
  url: string;
};
export type ReminderPrefs = { enabled: boolean; daysBefore: number; hour: number; bills: boolean };
export type Planned = { id: string; at: number; title: string; body: string; url: string };

const DAY = 86_400_000;
/** Look this far ahead; the plan is rebuilt every time the app opens or data changes. */
export const HORIZON_DAYS = 40;
/** iOS keeps at most 64 pending; stay well under. */
export const MAX_REMINDERS = 48;

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const whenWord = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/**
 * For each due date: a heads-up `daysBefore` days ahead, and (for bills that must be paid) one on the
 * day itself, both at `hour`. Only ones still in the future and within the horizon, soonest first.
 */
export function planReminders(dues: Due[], prefs: ReminderPrefs, now = Date.now()): Planned[] {
  if (!prefs.enabled) return [];
  const out: Planned[] = [];
  for (const d of dues) {
    if (d.verb === 'expected' && !prefs.bills) continue;
    // A maturity gets a week's notice (time to decide: renew, or move the money) and one on the day.
    const leads = d.verb === 'matures' ? [7, 0] : d.verb === 'due' ? [...new Set([prefs.daysBefore, 0])] : [prefs.daysBefore];
    for (const lead of leads) {
      const day = new Date(d.date - lead * DAY);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prefs.hour).getTime();
      if (at <= now || at > now + HORIZON_DAYS * DAY) continue;
      const amount = d.amount != null && d.amount > 0 ? rupees(d.amount) : null;
      out.push({
        id: `${d.key}:${lead}`,
        at,
        title: `${d.label} ${d.verb} ${whenWord(lead)}`,
        body: [
          d.verb === 'matures' && amount ? `≈ ${amount}` : amount,
          d.verb === 'due' ? `pay by ${dayLabel(d.date)}` : d.verb === 'matures' ? `on ${dayLabel(d.date)}` : `around ${dayLabel(d.date)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        url: d.url,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);
}

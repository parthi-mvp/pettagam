import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planReminders, type Due } from '../src/reminders/plan.ts';

const now = new Date(2026, 10, 7, 12).getTime(); // 7 Nov, noon
const at = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h).getTime();
const prefs = { enabled: true, daysBefore: 2, hour: 9, bills: true };
const card: Due = { key: 'card-1', label: 'HDFC bill', verb: 'due', amount: 12340.4, date: new Date(2026, 10, 18).getTime(), url: '/accounts' };

test('a bill gets a heads-up and an on-the-day reminder', () => {
  const p = planReminders([card], prefs, now);
  assert.deepEqual(p.map((x) => x.at), [at(11, 16), at(11, 18)]);
  assert.equal(p[0].title, 'HDFC bill due in 2 days');
  assert.equal(p[1].title, 'HDFC bill due today');
  assert.match(p[0].body, /₹12,340 · pay by 18 Nov/);
});

test('past times are dropped; off means nothing; expected bills follow their switch', () => {
  // Due tomorrow: the 2-days-before time has passed, the on-the-day one hasn't.
  const soon = { ...card, date: new Date(2026, 10, 8).getTime() };
  assert.deepEqual(planReminders([soon], prefs, now).map((x) => x.title), ['HDFC bill due today']);
  assert.deepEqual(planReminders([card], { ...prefs, enabled: false }, now), []);
  const netflix: Due = { key: 'r-netflix', label: 'Netflix', verb: 'expected', amount: 649, date: new Date(2026, 10, 12).getTime(), url: '/reports' };
  assert.deepEqual(planReminders([netflix], prefs, now).map((x) => x.title), ['Netflix expected in 2 days']);
  assert.deepEqual(planReminders([netflix], { ...prefs, bills: false }, now), []);
});

test('same-day lead gives one reminder, beyond the horizon gives none, soonest first', () => {
  assert.equal(planReminders([card], { ...prefs, daysBefore: 0 }, now).length, 1);
  assert.deepEqual(planReminders([{ ...card, date: new Date(2027, 2, 1).getTime() }], prefs, now), []);
  const early = { ...card, key: 'loan', date: new Date(2026, 10, 10).getTime() };
  const p = planReminders([card, early], prefs, now);
  assert.deepEqual(p.map((x) => x.id), ['loan:2', 'loan:0', 'card-1:2', 'card-1:0']);
});

test('a maturity gets a week’s notice and one on the day, whatever the bill lead time', () => {
  const fd: Due = { key: 'mat-1', label: 'SBI FD', verb: 'matures', amount: 107181, date: new Date(2026, 10, 30).getTime(), url: '/investment/1' };
  const p = planReminders([fd], { ...prefs, daysBefore: 1 }, now);
  assert.deepEqual(p.map((x) => x.title), ['SBI FD matures in 7 days', 'SBI FD matures today']);
  assert.match(p[0].body, /≈ ₹1,07,181 · on 30 Nov/);
});

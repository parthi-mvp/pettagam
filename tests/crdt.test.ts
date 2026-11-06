import assert from 'node:assert/strict';
import { test } from 'node:test';

import { changedColumns, clockOf, knownColumns, mergeRow, observe, packClocks, tick, unpackRow, type Clock, type Row, type RowState } from '../src/sync/crdt.ts';

test('clocks sort in time order, and never go backwards', () => {
  assert.ok(clockOf(1000, 0, 'b') < clockOf(1001, 0, 'a'));
  assert.ok(clockOf(1000, 2, 'a') < clockOf(1000, 10, 'a'), 'counter compared as a number');
  const a = tick(null, 5000, 'p1');
  const b = tick(a, 4000, 'p1'); // the wall clock went back: still after a
  assert.ok(b > a);
  // A phone with a fast clock: after seeing its edit, a local edit still comes after it.
  const fast = clockOf(9_000_000, 3, 'p2');
  const seen = observe(b, fast, 5000, 'p1');
  assert.ok(tick(seen, 5001, 'p1') > fast);
});

test('mergeRow: each field keeps its own latest edit', () => {
  const base: Row = { id: 't1', updated_at: 100, amount: 500, category_id: 'food', note: null };
  const c0 = clockOf(100, 0, 'a');
  const local: RowState = { row: { ...base, category_id: 'travel' }, clocks: { amount: c0, category_id: clockOf(200, 0, 'a'), note: c0 } };
  const remote: RowState = { row: { ...base, amount: 650 }, clocks: { amount: clockOf(150, 0, 'b'), category_id: c0, note: c0 } };
  const m = mergeRow(local, remote);
  assert.deepEqual(m?.patch, { amount: 650, updated_at: 100 }, 'remote amount wins, local category stays');
  assert.equal(mergeRow(remote, local)?.patch.category_id, 'travel');
  assert.equal(mergeRow(local, local), null, 'merging the same thing changes nothing');
});

test('changedColumns: only what really changed', () => {
  assert.deepEqual(changedColumns({ id: 'x', amount: 5, note: null }, { id: 'x', amount: 5, note: undefined, updated_at: 9 }), []);
  assert.deepEqual(changedColumns({ amount: 5, note: 'a' }, { amount: 6, note: 'a' }), ['amount']);
  assert.deepEqual(changedColumns(null, { id: 'x', amount: 5, updated_at: 1 }), ['amount']);
});

test('packClocks / unpackRow round-trip with one base clock per row', () => {
  const a = clockOf(1, 0, 'a');
  const b = clockOf(2, 0, 'b');
  const packed = packClocks([
    { tbl: 'transactions', row_id: 't1', col: 'amount', hlc: a },
    { tbl: 'transactions', row_id: 't1', col: 'note', hlc: a },
    { tbl: 'transactions', row_id: 't1', col: 'category_id', hlc: b },
  ]);
  assert.deepEqual(packed, { transactions: { t1: { _: a, category_id: b } } });
  const row: Row = { id: 't1', updated_at: 2, amount: 1, note: null, category_id: 'c' };
  assert.deepEqual(unpackRow(packed, 'transactions', row), { amount: a, note: a, category_id: b });
  assert.deepEqual(unpackRow(packed, 'accounts', row), {});
});

// ---- Convergence: simulated phones edit at random and exchange copies in random orders. ----

type Replica = { node: string; last: Clock | null; rows: Map<string, RowState>; wall: number };
const COLS = ['amount', 'category_id', 'note', 'deleted'];

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** Every write ever made: the expected final value of each field is the one with the highest clock. */
type Oracle = Map<string, { clock: Clock; value: unknown }>;

function edit(r: Replica, rand: () => number, oracle: Oracle) {
  r.wall += Math.floor(rand() * 50) - 10; // clocks drift and even step back
  const id = `t${Math.floor(rand() * 4)}`;
  const cur = r.rows.get(id);
  const clock = (r.last = tick(r.last, r.wall, r.node));
  const next: Row = cur ? { ...cur.row } : { id, updated_at: r.wall, amount: 0, category_id: null, note: null, deleted: 0 };
  const cols = cur ? [COLS[Math.floor(rand() * COLS.length)]] : COLS;
  for (const c of cols) next[c] = c === 'deleted' ? (rand() < 0.5 ? 1 : 0) : `${r.node}-${Math.floor(rand() * 100)}`;
  next.updated_at = Math.max(cur?.row.updated_at ?? 0, r.wall);
  const clocks = { ...(cur?.clocks ?? {}) };
  for (const c of cols) {
    clocks[c] = clock;
    const k = `${id}|${c}`;
    if (!oracle.has(k) || clock > oracle.get(k)!.clock) oracle.set(k, { clock, value: next[c] });
  }
  r.rows.set(id, { row: next, clocks });
}

function pull(into: Replica, from: Replica) {
  for (const remote of from.rows.values()) {
    const local = into.rows.get(remote.row.id) ?? null;
    const m = mergeRow(local, remote);
    if (!m) continue;
    for (const c of Object.values(m.clocks)) into.last = observe(into.last, c, into.wall, into.node);
    into.rows.set(remote.row.id, {
      row: { ...(local?.row ?? remote.row), ...m.patch } as Row,
      clocks: { ...(local?.clocks ?? {}), ...m.clocks },
    });
  }
}

const fields = (r: Replica) => JSON.stringify([...r.rows.values()].sort((a, b) => (a.row.id < b.row.id ? -1 : 1)).map((s) => COLS.map((c) => s.row[c])));

test('convergence: three phones, random edits, random sync order, same data at the end', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const phones: Replica[] = ['a', 'b', 'c'].map((node, i) => ({ node, last: null, rows: new Map(), wall: 1000 + i * 37 }));
    const oracle: Oracle = new Map();
    for (let step = 0; step < 60; step++) {
      const p = phones[Math.floor(rand() * 3)];
      if (rand() < 0.6) edit(p, rand, oracle);
      else pull(p, phones[Math.floor(rand() * 3)]);
    }
    // Everyone pulls from everyone (twice, so changes relay through a third phone too).
    for (let round = 0; round < 2; round++) for (const p of phones) for (const q of phones) if (p !== q) pull(p, q);
    assert.equal(fields(phones[0]), fields(phones[1]), `seed ${seed}`);
    assert.equal(fields(phones[1]), fields(phones[2]), `seed ${seed}`);
    // And the agreed data is right: every field holds its latest write, not just the same thing everywhere.
    for (const [k, { value }] of oracle) {
      const [id, col] = k.split('|');
      assert.equal(phones[0].rows.get(id)?.row[col], value, `seed ${seed}: ${k}`);
    }
  }
});

test('knownColumns: a newer phone’s extra columns are left out, the rest merges as usual', () => {
  const newer: Row = { id: 'a1', updated_at: 5, name: 'HDFC', remind_days: 3 };
  const cols = new Set(['id', 'updated_at', 'name']);
  assert.deepEqual(knownColumns(newer, cols), { id: 'a1', updated_at: 5, name: 'HDFC' });
  const m = mergeRow(null, { row: knownColumns(newer, cols), clocks: { name: clockOf(5, 0, 'b'), remind_days: clockOf(5, 0, 'b') } });
  assert.deepEqual(Object.keys(m?.patch ?? {}).sort(), ['name', 'updated_at']);
});

test('a field never written here (a seeded default, or a column a later migration added) takes any real write', () => {
  const local: RowState = { row: { id: 'a1', updated_at: 900, name: 'HDFC', remind_days: null }, clocks: { name: clockOf(900, 0, 'me') } };
  const remote: RowState = { row: { id: 'a1', updated_at: 500, name: 'HDFC', remind_days: 3 }, clocks: { name: clockOf(100, 0, 'b'), remind_days: clockOf(500, 0, 'b') } };
  assert.deepEqual(mergeRow(local, remote)?.patch, { remind_days: 3, updated_at: 900 });
  const seed: RowState = { row: { id: 'cat-food', updated_at: 0, color: '#f00' }, clocks: {} };
  assert.equal(mergeRow(seed, seed), null, 'two untouched seeds: nothing to merge');
});

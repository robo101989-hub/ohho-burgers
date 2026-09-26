import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllRows, historyBounds, filterHistory } from '../lib/history.js';

process.env.TZ = 'Asia/Kolkata';

test('inclusive India date includes late evening and excludes following midnight', () => {
  const bounds = historyBounds('2026-09-26', '2026-09-26');
  assert.equal(new Date(bounds.start).toISOString(), '2026-09-25T18:30:00.000Z');
  assert.equal(new Date(bounds.end).toISOString(), '2026-09-26T18:30:00.000Z');
  const rows = ['2026-09-25T18:29:59Z', '2026-09-25T18:30:00Z', '2026-09-26T18:29:59Z', '2026-09-26T18:30:00Z'].map((occurred_at, id) => ({ id, occurred_at, outlet_id: 'a' }));
  assert.deepEqual(filterHistory(rows, { from: '2026-09-26', to: '2026-09-26', field: 'occurred_at' }).map(r => r.id), [1, 2]);
});

test('date boundaries handle leap day and year rollover', () => {
  assert.equal(new Date(historyBounds('', '2024-02-29').end).toISOString(), '2024-02-29T18:30:00.000Z');
  assert.equal(new Date(historyBounds('', '2026-12-31').end).toISOString(), '2026-12-31T18:30:00.000Z');
});

test('invalid and reversed dates are rejected', () => {
  for (const [from, to] of [['2026-09-27','2026-09-26'], ['2026-02-29',''], ['bad',''], ['2026-13-01','']]) assert.throws(() => historyBounds(from, to));
});

test('screen filters do not mutate shared records used by other screens', () => {
  const rows = [{ outlet_id: 'a', occurred_at: '2026-09-01T12:00:00Z' }, { outlet_id: 'b', occurred_at: '2026-09-26T12:00:00Z' }];
  assert.equal(filterHistory(rows, { outletId: 'a', field: 'occurred_at' }).length, 1);
  assert.equal(filterHistory(rows, { outletId: 'b', from: '2026-09-26', field: 'occurred_at' }).length, 1);
  assert.equal(filterHistory(rows, { field: 'occurred_at' }).length, 2);
  assert.equal(rows.length, 2);
});

test('history fetch exceeds old 300/500/1000 row cutoffs', async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const result = await readAllRows(() => ({ range: async (start, end) => ({ data: rows.slice(start, end + 1) }) }));
  assert.deepEqual(result.data, rows);
});

test('history fetch handles a database cap smaller than requested range', async () => {
  const rows = Array.from({ length: 111 }, (_, id) => ({ id }));
  const result = await readAllRows(() => ({ range: async start => ({ data: rows.slice(start, start + 25) }) }));
  assert.deepEqual(result.data, rows);
});

test('failed later page rejects instead of returning incomplete financial records', async () => {
  await assert.rejects(readAllRows(() => ({ range: async start => start ? { error: new Error('database unavailable') } : { data: [{ id: 1 }] } })), /database unavailable/);
});

test('empty history completes normally', async () => {
  assert.deepEqual(await readAllRows(() => ({ range: async () => ({ data: [] }) })), { data: [], error: null });
});

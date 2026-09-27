import test from 'node:test';
import assert from 'node:assert/strict';
import { recordIsInOpenSessions, recordIsInSessions, selectCompletedSessions } from '../lib/session-reporting.js';

const sessions = [
  { id: 'overnight', outlet_id: 'a', opened_at: '2026-09-26T18:00:00Z', closed_at: '2026-09-27T03:00:00Z' },
  { id: 'older', outlet_id: 'a', opened_at: '2026-09-20T05:00:00Z', closed_at: '2026-09-20T14:00:00Z' },
  { id: 'other-outlet', outlet_id: 'b', opened_at: '2026-09-26T18:00:00Z', closed_at: '2026-09-27T03:00:00Z' }
];

test('custom dates select complete sessions by closing date', () => {
  const result = selectCompletedSessions(sessions, { range: 'CUSTOM', from: '2026-09-27', to: '2026-09-27' });
  assert.deepEqual(result.sessions.map(row => row.id), ['overnight', 'other-outlet']);
});

test('records use opening-to-closing boundaries instead of midnight', () => {
  const selected = [sessions[0]];
  assert.equal(recordIsInSessions({ outlet_id: 'a', created_at: '2026-09-26T20:00:00Z' }, 'created_at', selected), true);
  assert.equal(recordIsInSessions({ outlet_id: 'a', created_at: '2026-09-27T02:59:59Z' }, 'created_at', selected), true);
  assert.equal(recordIsInSessions({ outlet_id: 'a', created_at: '2026-09-27T03:00:00Z' }, 'created_at', selected), false);
  assert.equal(recordIsInSessions({ outlet_id: 'b', created_at: '2026-09-26T20:00:00Z' }, 'created_at', selected), false);
});

test('all time still includes only records belonging to completed sessions', () => {
  const result = selectCompletedSessions(sessions, { range: 'ALL' });
  assert.equal(result.sessions.length, 3);
  assert.equal(recordIsInSessions({ outlet_id: 'a', occurred_at: '2026-09-25T10:00:00Z' }, 'occurred_at', result.sessions), false);
});

test('last seven days selects sessions by close time but keeps earlier opening records', () => {
  const recent = selectCompletedSessions(sessions, { range: '7_DAYS', now: new Date('2026-09-27T12:00:00+05:30') });
  assert.deepEqual(recent.sessions.map(row => row.id), ['overnight', 'other-outlet']);
  assert.equal(recordIsInSessions({ outlet_id: 'a', supplied_at: '2026-09-26T19:00:00Z' }, 'supplied_at', recent.sessions), true);
});

test('current session records start at outlet opening time and can cross midnight', () => {
  const outlets = [{ id: 'a', status: 'ACTIVE', current_session_started_at: '2026-09-27T17:00:00+05:30' }];
  assert.equal(recordIsInOpenSessions({ outlet_id: 'a', occurred_at: '2026-09-28T00:30:00+05:30' }, 'occurred_at', outlets), true);
  assert.equal(recordIsInOpenSessions({ outlet_id: 'a', occurred_at: '2026-09-27T16:59:59+05:30' }, 'occurred_at', outlets), false);
  assert.equal(recordIsInOpenSessions({ outlet_id: 'b', occurred_at: '2026-09-28T00:30:00+05:30' }, 'occurred_at', outlets), false);
});

import { historyBounds } from './history.js';

// Each expense belongs to at most one session. Keep unmatched legacy entries
// visible rather than guessing a session from their calendar date.
export function groupExpenseSessions(expenses, sessions, { mode = 'ALL', outletId = '', from = '', to = '' } = {}) {
  const bounds = mode === 'CUSTOM' ? historyBounds(from, to) : {};
  const groups = [...sessions].filter(s => !outletId || s.outlet_id === outletId)
    .sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at))
    .map(s => ({ ...s, expenses: [], total: 0 }));
  const unmatched = new Map();
  for (const row of expenses || []) {
    if (outletId && row.outlet_id !== outletId) continue;
    const time = new Date(row.occurred_at).getTime();
    const group = groups.find(s => s.outlet_id === row.outlet_id && time >= new Date(s.opened_at).getTime() && (!s.closed_at || time < new Date(s.closed_at).getTime()));
    if (group) { group.expenses.push(row); group.total += Number(row.amount || 0); }
    else if (mode === 'ALL') {
      if (!unmatched.has(row.outlet_id)) unmatched.set(row.outlet_id, { outlet_id: row.outlet_id, unmatched: true, expenses: [], total: 0 });
      const entry = unmatched.get(row.outlet_id); entry.expenses.push(row); entry.total += Number(row.amount || 0);
    }
  }
  return [...groups.filter(s => {
    if (mode === 'CURRENT') return !s.closed_at;
    const started = new Date(s.opened_at).getTime();
    return mode !== 'CUSTOM' || ((!bounds.start || started >= bounds.start) && (!bounds.end || started < bounds.end));
  }), ...unmatched.values()];
}

function localDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

export function completedSessionRange({ range, from = '', to = '', now = new Date() }) {
  if (range === 'ALL') return { start: null, end: null };
  if (range === 'CUSTOM') {
    const start = localDay(from);
    const last = localDay(to);
    if (!start || !last || start > last) return { invalid: true, start: null, end: null };
    const end = new Date(last); end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  const start = new Date(end); start.setDate(start.getDate() - (range === '30_DAYS' ? 30 : range === '7_DAYS' ? 7 : 1));
  return { start, end };
}

export function selectCompletedSessions(reports, options) {
  const bounds = completedSessionRange(options);
  if (bounds.invalid) return { ...bounds, sessions: [] };
  const sessions = (reports || []).filter(report => {
    const closedAt = new Date(report.closed_at).getTime();
    if (Number.isNaN(closedAt)) return false;
    return (!bounds.start || closedAt >= bounds.start.getTime()) && (!bounds.end || closedAt < bounds.end.getTime());
  });
  return { ...bounds, sessions };
}

export function recordIsInSessions(row, field, sessions) {
  const timestamp = new Date(row?.[field]).getTime();
  if (Number.isNaN(timestamp)) return false;
  return (sessions || []).some(session => session.outlet_id === row.outlet_id &&
    timestamp >= new Date(session.opened_at).getTime() && timestamp < new Date(session.closed_at).getTime());
}

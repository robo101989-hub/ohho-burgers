// Fetch each range explicitly: the database may cap a response below our page size.
export async function readAllRows(queryFactory, pageSize = 500) {
  const rows = [];
  for (;;) {
    const { data, error } = await queryFactory().range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return { data: rows, error: null };
    rows.push(...data);
  }
}

export function historyBounds(from, to) {
  const parse = value => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.');
    const date = new Date(`${value}T00:00:00`);
    const [year, month, day] = value.split('-').map(Number);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Choose a valid date.');
    return date;
  };
  const start = parse(from);
  const end = parse(to);
  if (start && end && start > end) throw new Error('The From date must be on or before the To date.');
  if (end) end.setDate(end.getDate() + 1);
  return { start: start?.getTime() ?? null, end: end?.getTime() ?? null };
}

export function filterHistory(rows, { outletId = '', from = '', to = '', field }) {
  const { start, end } = historyBounds(from, to);
  return rows.filter(row => {
    const time = new Date(row[field]).getTime();
    return (!outletId || row.outlet_id === outletId) && (start === null || time >= start) && (end === null || time < end);
  });
}

function cell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function recipeBookCsv({ outlet, service, generatedAt, categories }) {
  const rows = [
    ['OHHO BURGERS — COMPLETE RECIPE COST BOOK'],
    ['Outlet', outlet], ['Service', service], ['Generated', generatedAt],
    ['Basis', 'Per serving; configured item prices, with received purchase average when no configured price is available.'],
    ['Note', 'Recipe costs exclude labour, overhead, discounts and platform fees. Missing prices are marked unavailable.'],
  ];
  const amount = value => value === null || !Number.isFinite(value) ? 'Unavailable' : value.toFixed(2);
  for (const category of categories) {
    rows.push([], ['CATEGORY', category.name]);
    for (const item of category.items) {
      const complete = item.lines.length > 0 && item.lines.every(line => line.cost !== null && Number.isFinite(line.cost));
      const total = complete ? item.lines.reduce((sum, line) => sum + line.cost, 0) : null;
      rows.push([], ['MENU ITEM', item.name], ['Selling price (INR)', amount(item.price)],
        ['Ingredient / stock item', 'Portion', 'Unit', 'Rate per unit (INR)', 'Cost (INR)', 'Price source']);
      for (const line of item.lines) rows.push([line.name, line.quantity, line.unit, amount(line.cost === null || !line.quantity ? null : line.cost / line.quantity), amount(line.cost), line.costBasis]);
      if (!item.lines.length) rows.push(['No recipe configured']);
      rows.push(['RECIPE TOTAL (INR)', amount(total)],
        ['Recipe cost %', total !== null && item.price > 0 ? `${(total / item.price * 100).toFixed(1)}%` : 'Unavailable'],
        ['Balance after recipe cost (INR)', amount(total === null ? null : item.price - total)]);
    }
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

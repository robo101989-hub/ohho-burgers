function displayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}

export function calculateCurrentStockValue({ items = [], balances = [], bills = [], outletId = '' }) {
  const itemMap = new Map(items.map(item => [item.id, item]));
  const latestCost = new Map();
  [...bills]
    .filter(bill => (bill.receipt_status || 'RECEIVED') === 'RECEIVED')
    .sort((a, b) => new Date(a.supplied_at) - new Date(b.supplied_at))
    .forEach(bill => {
      (bill.supply_bill_items || []).forEach(line => {
        const item = itemMap.get(line.item_id);
        const received = displayQuantity(item, line.base_quantity);
        if (received > 0) latestCost.set(`${bill.outlet_id}:${line.item_id}`, Number(line.line_total || 0) / received);
      });
    });

  return balances
    .filter(row => !outletId || row.outlet_id === outletId)
    .reduce((sum, row) => {
      const item = itemMap.get(row.item_id);
      const fallback = item?.measurement_type === 'PIECE_KG' ? 0 : Number(item?.default_supply_price || 0);
      const unitCost = latestCost.get(`${row.outlet_id}:${row.item_id}`) ?? fallback;
      return sum + displayQuantity(item, row.quantity_on_hand) * unitCost;
    }, 0);
}

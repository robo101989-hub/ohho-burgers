function displayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}

export function calculateSuggestedRequirements({ items = [], balances = [], bills = [], outletId }) {
  const activeItems = items.filter(item => item.active !== false && Number(item.target_stock_level || 0) > 0);
  return activeItems.map(item => {
    const current = balances
      .filter(row => row.outlet_id === outletId && row.item_id === item.id)
      .reduce((sum, row) => sum + displayQuantity(item, row.quantity_on_hand), 0);
    const pending = bills
      .filter(bill => bill.outlet_id === outletId && (bill.receipt_status || 'RECEIVED') === 'PENDING')
      .flatMap(bill => bill.supply_bill_items || [])
      .filter(line => line.item_id === item.id)
      .reduce((sum, line) => sum + displayQuantity(item, line.base_quantity), 0);
    const raw = Math.max(0, Number(item.target_stock_level) - current - pending);
    const quantity = item.request_unit === 'PIECE'
      ? Math.ceil(raw)
      : Math.round((raw + Number.EPSILON) * 1000) / 1000;
    return { itemId: item.id, quantity, current, pending };
  }).filter(row => row.quantity > 0);
}

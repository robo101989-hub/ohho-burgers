function displayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}

function fallbackBaseUnitCost(item) {
  const price = Number(item?.default_supply_price || 0);
  const supplyUnit = item?.supply_unit || item?.billing_unit;
  const inventoryUnit = item?.inventory_unit || item?.base_unit;
  if (supplyUnit === 'KG' && inventoryUnit === 'G') return price / 1000;
  if (supplyUnit === 'G' && inventoryUnit === 'G') return price;
  if (supplyUnit === 'L' && inventoryUnit === 'ML') return price / 1000;
  if (supplyUnit === 'ML' && inventoryUnit === 'ML') return price;
  if (['PIECE','EACH'].includes(supplyUnit) && inventoryUnit === 'EACH') return price;
  return 0;
}

export function calculateCurrentStockValue({ items = [], balances = [], bills = [], outletId = '' }) {
  const itemMap = new Map(items.map(item => [item.id, item]));
  const receivedCosts = new Map();
  bills
    .filter(bill => (bill.receipt_status || 'RECEIVED') === 'RECEIVED')
    .forEach(bill => {
      (bill.supply_bill_items || []).forEach(line => {
        const received = Number(line.base_quantity || 0);
        const cost = Number(line.line_total || 0);
        if (!(received > 0) || !(cost >= 0)) return;
        const key = `${bill.outlet_id}:${line.item_id}`;
        const total = receivedCosts.get(key) || { quantity: 0, cost: 0 };
        total.quantity += received;
        total.cost += cost;
        receivedCosts.set(key, total);
      });
    });

  return balances
    .filter(row => !outletId || row.outlet_id === outletId)
    .reduce((sum, row) => {
      const item = itemMap.get(row.item_id);
      const fallback = fallbackBaseUnitCost(item);
      const received = receivedCosts.get(`${row.outlet_id}:${row.item_id}`);
      const unitCost = received?.quantity > 0 ? received.cost / received.quantity : fallback;
      return sum + Number(row.quantity_on_hand || 0) * unitCost;
    }, 0);
}

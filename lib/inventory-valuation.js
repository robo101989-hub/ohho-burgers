function displayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}

function fallbackBaseUnitCost(item) {
  const price = Number(item?.default_supply_price || 0);
  const conversion = Number(item?.billing_to_inventory || 0);
  if (conversion > 0) return price / conversion;
  const supplyUnit = item?.supply_unit || item?.billing_unit;
  const inventoryUnit = item?.inventory_unit || item?.base_unit;
  if (supplyUnit === 'KG' && inventoryUnit === 'G') return price / 1000;
  if (supplyUnit === 'G' && inventoryUnit === 'G') return price;
  if (supplyUnit === 'L' && inventoryUnit === 'ML') return price / 1000;
  if (supplyUnit === 'ML' && inventoryUnit === 'ML') return price;
  if (['PIECE','EACH'].includes(supplyUnit) && inventoryUnit === 'EACH') return price;
  return 0;
}

function normalizeHistoricalQuantity(line, bill, item, movements) {
  let quantity = Number(line.base_quantity || 0);
  let unit = line.inventory_unit || item?.inventory_unit || item?.base_unit;
  const currentUnit = item?.inventory_unit || item?.base_unit;

  // Older pack receipts could save the requested pack as only one inventory
  // piece while the same pack's billing conversion correctly recorded all
  // pieces. For those receipts, use the captured billing quantity/conversion
  // to cost the stock in pieces. Keep manually entered net quantities when
  // the request and billing conversions agree.
  const requestUnit = String(line.request_unit || '').toUpperCase();
  const billingUnit = String(line.unit || item?.billing_unit || item?.supply_unit || '').toUpperCase();
  const requestConversion = Number(line.request_to_inventory || 0);
  const billingConversion = Number(line.billing_to_inventory || 0);
  if (
    requestUnit && requestUnit === billingUnit &&
    requestConversion > 0 && billingConversion > 0 &&
    Math.abs(requestConversion - billingConversion) > 0.000001 &&
    Number(line.quantity) > 0
  ) {
    quantity = Number(line.quantity) * billingConversion;
  }

  if (!unit || unit === currentUnit) return quantity;

  const suppliedAt = new Date(bill.supplied_at || bill.created_at || 0).getTime();
  movements
    .filter(row => row.item_id === line.item_id && (!row.outlet_id || row.outlet_id === bill.outlet_id))
    .sort((a, b) => new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0))
    .forEach(row => {
      const rule = row.rule_snapshot || {};
      const occurredAt = new Date(row.occurred_at || 0).getTime();
      if (occurredAt < suppliedAt || rule.oldUnit !== unit || !(Number(rule.factor) > 0)) return;
      quantity *= Number(rule.factor);
      unit = rule.newUnit;
    });

  return unit === currentUnit ? quantity : Number(line.base_quantity || 0);
}

export function calculateCurrentStockValue({ items = [], balances = [], bills = [], movements = [], outletId = '' }) {
  const itemMap = new Map(items.map(item => [item.id, item]));
  const receivedCosts = new Map();
  bills
    .filter(bill => (bill.receipt_status || 'RECEIVED') === 'RECEIVED')
    .forEach(bill => {
      (bill.supply_bill_items || []).forEach(line => {
        const item = itemMap.get(line.item_id);
        const received = normalizeHistoricalQuantity(line, bill, item, movements);
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
    .filter(row => (!outletId || row.outlet_id === outletId) && itemMap.get(row.item_id)?.active !== false)
    .reduce((sum, row) => {
      const item = itemMap.get(row.item_id);
      const fallback = fallbackBaseUnitCost(item);
      const received = receivedCosts.get(`${row.outlet_id}:${row.item_id}`);
      const unitCost = received?.quantity > 0 ? received.cost / received.quantity : fallback;
      return sum + Number(row.quantity_on_hand || 0) * unitCost;
    }, 0);
}

import { standardConversion, stockRequestUnit } from './inventory-measurements.js';

function displayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}

export function calculateSuggestedRequirements({ items = [], balances = [], bills = [], outletId }) {
  const activeItems = items.filter(item => item.active !== false && !item.local_outlet_id && Number(item.target_stock_level || 0) > 0);
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
    let quantity;
    if (item.supply_unit) {
      const supplyUnit = stockRequestUnit(item);
      const baseRaw = raw * ((item.base_unit === 'G' && item.display_unit === 'KG') || (item.base_unit === 'ML' && item.display_unit === 'L') ? 1000 : 1);
      const conversion = Number(item.request_to_inventory) || standardConversion(supplyUnit, item.inventory_unit || item.base_unit);
      quantity = conversion > 0 ? baseRaw / conversion : 0;
      if (['PIECE','BOTTLE','PACK','CAN','BOX'].includes(supplyUnit)) quantity = Math.ceil(quantity);
    } else quantity = item.request_unit === 'PIECE' ? Math.ceil(raw) : raw;
    quantity = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
    return { itemId: item.id, quantity, current, pending };
  }).filter(row => row.quantity > 0);
}

// Only seed an untouched review once for the latest closed outlet session.
export function closedSessionRequirementReview({ sessions = [], outletId, requests = [] }) {
  const session = sessions.filter(row => row.outlet_id === outletId)
    .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at))[0];
  if (!session?.closed_at) return null;
  const openingDay = new Date(session.opened_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const nextDay = new Date(`${openingDay}T12:00:00+05:30`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const requiredFor = nextDay.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const existing = requests.find(row => row.outlet_id === outletId && row.required_for === requiredFor && row.status !== 'CANCELLED');
  return { key: `${outletId}:${session.id}`, requiredFor, existing: Boolean(existing) };
}

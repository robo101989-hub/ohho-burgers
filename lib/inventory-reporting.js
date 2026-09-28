import { historyBounds } from './history.js';
import { calculateCurrentStockValue } from './inventory-valuation.js';

export function stockHistoryRows(rows, field, { mode = 'ALL', outletId = '', sessions = [], from = '', to = '' } = {}) {
  const bounds = mode === 'CUSTOM' ? historyBounds(from, to) : {};
  const selected = sessions.filter(s => (!outletId || s.outlet_id === outletId) && (mode !== 'CURRENT' || !s.closed_at) && (mode !== 'CUSTOM' || ((!bounds.start || new Date(s.opened_at).getTime() >= bounds.start) && (!bounds.end || new Date(s.opened_at).getTime() < bounds.end))));
  return (rows || []).filter(row => {
    if (outletId && row.outlet_id !== outletId) return false;
    if (mode === 'ALL') return true;
    // Receipt is the inventory event; pending bills remain visible by issue date.
    const time = new Date(field === 'supplied_at' ? row.received_at || row.supplied_at : row[field]).getTime();
    return selected.some(s => s.outlet_id === row.outlet_id && time >= new Date(s.opened_at).getTime() && (!s.closed_at || time < new Date(s.closed_at).getTime()));
  });
}

export function itemCostRate(item, outletId, bills, movements = []) {
  if (!item) return null;
  const hasReceipt = bills.some(b => b.outlet_id === outletId && (b.receipt_status || 'RECEIVED') === 'RECEIVED' && (b.supply_bill_items || []).some(l => l.item_id === item.id && Number(l.base_quantity) > 0));
  const rate = calculateCurrentStockValue({ items:[{...item, active:true}], balances:[{outlet_id:outletId,item_id:item.id,quantity_on_hand:1}], bills, movements });
  return rate > 0 || hasReceipt ? rate : null;
}

export function orderUtilisation(orders, movements, items, bills) {
  const itemMap = new Map(items.map(i => [i.id,i]));
  const byOrder = new Map();
  for (const m of movements) {
    if (m.reference_type !== 'ORDER' || !['SALE_DEDUCTION','PACKAGING_CONSUMPTION','REVERSAL'].includes(m.movement_type)) continue;
    if (!byOrder.has(m.reference_id)) byOrder.set(m.reference_id, []);
    byOrder.get(m.reference_id).push(m);
  }
  return orders.map(order => {
    const lines = new Map();
    for (const m of byOrder.get(order.id) || []) {
      const item = itemMap.get(m.item_id);
      const unit = m.inventory_unit_snapshot || item?.inventory_unit || item?.base_unit || '';
      const key = `${m.item_id}:${unit}`;
      const row = lines.get(key) || { itemId:m.item_id,name:m.item_name_snapshot || item?.name || 'Unknown item',categoryId:item?.category_id,unit,quantity:0,cost:0,priced:true };
      const used = -Number(m.quantity_delta || 0);
      row.quantity += used;
      // Never apply a newer unit conversion or a future delivery rate to old usage.
      const eligibleBills = bills.filter(b => new Date(b.received_at || b.supplied_at) <= new Date(m.occurred_at));
      const rate = unit === (item?.inventory_unit || item?.base_unit) ? itemCostRate(item,order.outlet_id,eligibleBills,movements) : null;
      if (rate === null) row.priced = false; else row.cost += used * rate;
      lines.set(key,row);
    }
    const usage = [...lines.values()].filter(l => Math.abs(l.quantity) > 0.000001);
    return { order, usage, cost:usage.reduce((s,l) => s+l.cost,0), complete:usage.length > 0 && usage.every(l=>l.priced) };
  });
}

export function recipeCostLines(menuId, recipes, items, outletId, bills, movements, orderType, costBasis = 'RECEIVED') {
  return recipes.filter(r => r.menu_item_id === menuId && (r.usage_type === 'FOOD' || (!r.usage_type && !r.is_packaging) || (r.usage_type === 'DINE_IN' && orderType === 'DINE_IN') || ((r.usage_type === 'TAKEAWAY_DELIVERY' || (!r.usage_type && r.is_packaging)) && orderType !== 'DINE_IN'))).map(r => {
    const item = items.find(i=>i.id===r.inventory_item_id);
    const configuredRate = itemCostRate(item,outletId,[],[]);
    const useConfigured = costBasis === 'CONFIGURED' && configuredRate !== null;
    const rate = useConfigured ? configuredRate : itemCostRate(item,outletId,bills,movements);
    return { costBasis:useConfigured ? 'Configured item price' : 'Received purchase average', name:item?.name || 'Unknown item',unit:item?.inventory_unit || item?.base_unit,quantity:Number(r.base_quantity),cost:rate === null ? null : rate * Number(r.base_quantity) };
  });
}

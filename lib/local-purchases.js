const unitInfo = { KG: ['G', 1000], G: ['G', 1], L: ['ML', 1000], ML: ['ML', 1], PIECE: ['EACH', 1] };
export function normalizeLocalPurchase(body, items = []) {
  const quantity = Number(body.quantity);
  const cost = Number(body.cost);
  const unit = String(body.unit || '').toUpperCase();
  if (!unitInfo[unit] || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e8 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001) throw new Error('Enter a valid quantity with up to 3 decimal places and a unit.');
  if (!Number.isFinite(cost) || cost <= 0 || cost > 1e8 || Math.abs(cost * 100 - Math.round(cost * 100)) > 0.00001) throw new Error('Enter the total purchase cost with up to 2 decimal places.');
  if (!['CASH', 'UPI', 'BANK', 'OTHER'].includes(body.paymentMethod)) throw new Error('Choose how this purchase was paid.');
  const item = body.itemId ? items.find(row => row.id === body.itemId && row.active !== false && (!row.local_outlet_id || row.local_outlet_id === body.outletId)) : null;
  if (body.itemId && !item) throw new Error('Choose an active stock item available to this outlet.');
  const [baseUnit, factor] = unitInfo[unit];
  if (item && (item.inventory_unit || item.base_unit) !== baseUnit) throw new Error('The purchase unit must match the stock item. Enter pieces for counted items, weight for grams, or volume for millilitres.');
  if (baseUnit === 'EACH' && !Number.isInteger(quantity)) throw new Error('Enter a whole number of pieces.');
  const name = String(item?.name || body.name || '').trim();
  if (!name || name.length > 100 || (!item && !body.categoryId)) throw new Error('Enter an item name and choose its category.');
  return { itemId: item?.id || null, name, categoryId: item?.category_id || body.categoryId, quantity, unit, baseQuantity: quantity * factor, baseUnit, cost, paymentMethod: body.paymentMethod, notes: String(body.notes || '').trim().slice(0, 300) };
}

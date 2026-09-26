export function measurementColumns(type) {
  if (type === 'PIECE_PIECE') return { measurement_type: type, request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'EACH' };
  if (type === 'PIECE_KG') return { measurement_type: type, request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG' };
  if (type === 'KG_KG') return { measurement_type: type, request_unit: 'KG', base_unit: 'G', display_unit: 'KG', billing_unit: 'KG' };
  throw new Error('Choose a valid measurement type.');
}

export function normalizeSupplyLine(item, row) {
  if (!item) throw new Error('One or more supplied items are invalid.');
  let inventoryQuantity = Number(row.inventoryQuantity ?? row.quantity);
  let billingQuantity = Number(row.billingQuantity ?? row.quantity);
  const unitPrice = Number(item.default_supply_price);
  if (!(unitPrice > 0)) throw new Error(`Set a fixed price for ${item.name} before billing.`);
  if (item.request_unit === 'PIECE') inventoryQuantity = Math.round(inventoryQuantity);
  if (item.measurement_type !== 'PIECE_KG') billingQuantity = inventoryQuantity;
  if (!(inventoryQuantity > 0) || !(billingQuantity > 0)) throw new Error(`Enter the supplied quantity and billing quantity for ${item.name}.`);

  let baseQuantity;
  if (item.base_unit === 'G' && item.display_unit === 'KG') baseQuantity = inventoryQuantity * 1000;
  else if (item.base_unit === item.display_unit) baseQuantity = inventoryQuantity;
  else throw new Error(`${item.name} must use ${item.display_unit}.`);

  return {
    item_id: item.id,
    item_name: item.name,
    unit: item.billing_unit,
    quantity: billingQuantity,
    base_quantity: baseQuantity,
    unit_price: unitPrice
  };
}

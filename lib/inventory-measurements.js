export const SUPPLY_UNITS = ['KG', 'G', 'L', 'ML', 'PIECE', 'BOTTLE', 'PACK', 'CAN', 'BOX'];
export const INVENTORY_UNITS = ['G', 'ML', 'EACH'];

export function unitLabel(unit, quantity = 2) {
  const labels = { KG: 'kg', G: 'g', L: 'L', ML: 'ml', PIECE: quantity === 1 ? 'pc' : 'pcs', EACH: quantity === 1 ? 'pc' : 'pcs', BOTTLE: quantity === 1 ? 'bottle' : 'bottles', PACK: quantity === 1 ? 'pack' : 'packs', CAN: quantity === 1 ? 'can' : 'cans', BOX: quantity === 1 ? 'box' : 'boxes' };
  return labels[unit] || String(unit || '').toLowerCase();
}

export function flexibleUnitColumns(supplyUnit, inventoryUnit, requestUnit = supplyUnit, requestConversion, billingConversion) {
  const supply = String(supplyUnit || '').toUpperCase();
  const request = String(requestUnit || supply).toUpperCase();
  const inventory = String(inventoryUnit || '').toUpperCase();
  if (!SUPPLY_UNITS.includes(supply)) throw new Error('Choose a valid supply unit.');
  if (!SUPPLY_UNITS.includes(request)) throw new Error('Choose a valid request unit.');
  if (!INVENTORY_UNITS.includes(inventory)) throw new Error('Choose a valid inventory unit.');
  const requestToInventory = Number(requestConversion ?? standardConversion(request, inventory));
  const billingToInventory = Number(billingConversion ?? standardConversion(supply, inventory));
  if (!(requestToInventory > 0) || !(billingToInventory > 0)) throw new Error('Enter both conversion quantities in inventory units.');
  return { measurement_type: 'FLEXIBLE', request_unit: request, supply_unit: supply, base_unit: inventory, inventory_unit: inventory, display_unit: inventory, billing_unit: supply, request_to_inventory: requestToInventory, billing_to_inventory: billingToInventory };
}

export function standardConversion(fromUnit, inventoryUnit) {
  const from = String(fromUnit || '').toUpperCase();
  const inventory = String(inventoryUnit || '').toUpperCase();
  if (from === 'KG' && inventory === 'G') return 1000;
  if (from === 'L' && inventory === 'ML') return 1000;
  if (from === inventory || (['PIECE','EACH'].includes(from) && inventory === 'EACH')) return 1;
  return 0;
}

export function measurementColumns(type) {
  if (type === 'PIECE_PIECE') return { measurement_type: type, request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'EACH' };
  if (type === 'PIECE_KG') return { measurement_type: type, request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG' };
  if (type === 'KG_KG') return { measurement_type: type, request_unit: 'KG', base_unit: 'G', display_unit: 'KG', billing_unit: 'KG' };
  throw new Error('Choose a valid measurement type.');
}

export function normalizeRecipeQuantity(item, quantity, quantityUnit) {
  const value = Number(quantity);
  if (!(value > 0)) throw new Error('Recipe consumption must be greater than zero.');
  const inventoryUnit = item?.inventory_unit || item?.base_unit;
  const unit = String(quantityUnit || inventoryUnit || '').toUpperCase();
  if (unit !== inventoryUnit) throw new Error(`${item.name} recipe consumption must be entered in ${unitLabel(inventoryUnit)}.`);
  return value;
}

export function defaultNetQuantity(supplyUnit, inventoryUnit, supplyQuantity) {
  const value = Number(supplyQuantity);
  if (!(value > 0)) return '';
  if (supplyUnit === 'KG' && inventoryUnit === 'G') return value * 1000;
  if (supplyUnit === 'G' && inventoryUnit === 'G') return value;
  if (supplyUnit === 'L' && inventoryUnit === 'ML') return value * 1000;
  if (supplyUnit === 'ML' && inventoryUnit === 'ML') return value;
  if (['PIECE', 'EACH'].includes(supplyUnit) && inventoryUnit === 'EACH') return value;
  return '';
}

export function convertToInventory(item, quantity, source = 'billing') {
  const value = Number(quantity);
  if (!(value > 0)) return '';
  const configured = Number(source === 'request' ? item?.request_to_inventory : item?.billing_to_inventory);
  if (configured > 0) return value * configured;
  const unit = source === 'request' ? item?.request_unit : (item?.billing_unit || item?.supply_unit);
  const factor = standardConversion(unit, item?.inventory_unit || item?.base_unit);
  return factor > 0 ? value * factor : '';
}

export function convertRequestToBilling(item, requestQuantity) {
  const inventory = convertToInventory(item, requestQuantity, 'request');
  const billingFactor = Number(item?.billing_to_inventory) || standardConversion(item?.billing_unit || item?.supply_unit, item?.inventory_unit || item?.base_unit);
  return inventory !== '' && billingFactor > 0 ? inventory / billingFactor : '';
}

export function normalizeSupplyLine(item, row) {
  if (!item) throw new Error('One or more supplied items are invalid.');
  const supplyUnit = item.supply_unit || item.billing_unit || item.request_unit;
  const inventoryUnit = item.inventory_unit || item.base_unit;
  let billingQuantity = Number(row.supplyQuantity ?? row.billingQuantity ?? row.quantity ?? row.inventoryQuantity);
  let inventoryQuantity = Number(row.inventoryQuantity ?? row.netQuantity ?? convertToInventory(item, billingQuantity, 'billing'));
  const unitPrice = Number(item.default_supply_price);
  if (!(unitPrice > 0)) throw new Error(`Set a fixed price for ${item.name} before billing.`);
  if (!item.supply_unit && item.measurement_type !== 'PIECE_KG') billingQuantity = Number(row.inventoryQuantity ?? row.quantity);
  if (!item.supply_unit && item.base_unit === 'G' && item.display_unit === 'KG') inventoryQuantity *= 1000;
  if (inventoryUnit === 'EACH') inventoryQuantity = Math.round(inventoryQuantity);
  if (!(inventoryQuantity > 0) || !(billingQuantity > 0)) throw new Error(`Enter the billing quantity and actual net inventory for ${item.name}.`);

  return {
    item_id: item.id,
    item_name: item.name,
    unit: supplyUnit,
    quantity: billingQuantity,
    base_quantity: inventoryQuantity,
    unit_price: unitPrice,
    request_quantity: Number(row.requestedQuantity || 0) || null,
    request_unit: row.requestedUnit || item.request_unit,
    inventory_unit: inventoryUnit,
    request_to_inventory: Number(item.request_to_inventory || 1),
    billing_to_inventory: Number(item.billing_to_inventory || 1)
  };
}

// Piece-tracked items billed by weight are requested as physical pieces.
export function stockRequestUnit(item) {
  return item?.request_unit || item?.supply_unit || item?.billing_unit;
}

export function requestSupplyQuantities(item, unit, quantity) {
  const requestUnit = unit === 'EACH' ? 'PIECE' : unit;
  const supplyUnit = item.supply_unit || item.billing_unit || item.request_unit;
  const matchesConfiguredRequest = requestUnit === (item.request_unit === 'EACH' ? 'PIECE' : item.request_unit);
  return {
    inventoryQuantity: matchesConfiguredRequest ? convertToInventory(item, quantity, 'request') : defaultNetQuantity(requestUnit, item.inventory_unit || item.base_unit, quantity),
    billingQuantity: matchesConfiguredRequest ? convertRequestToBilling(item, quantity) : (requestUnit === (supplyUnit === 'EACH' ? 'PIECE' : supplyUnit) ? Number(quantity) : '')
  };
}

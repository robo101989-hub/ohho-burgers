export const SUPPLY_UNITS = ['KG', 'G', 'L', 'ML', 'PIECE', 'BOTTLE', 'PACK', 'CAN', 'BOX'];
export const INVENTORY_UNITS = ['G', 'ML', 'EACH'];

export function unitLabel(unit, quantity = 2) {
  const labels = { KG: 'kg', G: 'g', L: 'L', ML: 'ml', PIECE: quantity === 1 ? 'pc' : 'pcs', EACH: quantity === 1 ? 'pc' : 'pcs', BOTTLE: quantity === 1 ? 'bottle' : 'bottles', PACK: quantity === 1 ? 'pack' : 'packs', CAN: quantity === 1 ? 'can' : 'cans', BOX: quantity === 1 ? 'box' : 'boxes' };
  return labels[unit] || String(unit || '').toLowerCase();
}

export function flexibleUnitColumns(supplyUnit, inventoryUnit) {
  const supply = String(supplyUnit || '').toUpperCase();
  const inventory = String(inventoryUnit || '').toUpperCase();
  if (!SUPPLY_UNITS.includes(supply)) throw new Error('Choose a valid supply unit.');
  if (!INVENTORY_UNITS.includes(inventory)) throw new Error('Choose a valid inventory unit.');
  return { measurement_type: 'FLEXIBLE', request_unit: supply, supply_unit: supply, base_unit: inventory, inventory_unit: inventory, display_unit: inventory, billing_unit: supply };
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

export function normalizeSupplyLine(item, row) {
  if (!item) throw new Error('One or more supplied items are invalid.');
  const supplyUnit = item.supply_unit || item.billing_unit || item.request_unit;
  const inventoryUnit = item.inventory_unit || item.base_unit;
  let billingQuantity = Number(row.supplyQuantity ?? row.billingQuantity ?? row.quantity ?? row.inventoryQuantity);
  let inventoryQuantity = Number(row.inventoryQuantity ?? row.netQuantity ?? row.quantity);
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
    unit_price: unitPrice
  };
}

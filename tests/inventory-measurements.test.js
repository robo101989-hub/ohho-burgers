import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementColumns, normalizeSupplyLine } from '../lib/inventory-measurements.js';

test('all supported measurement types map to consistent storage and billing units', () => {
  assert.deepEqual(measurementColumns('PIECE_PIECE'), { measurement_type: 'PIECE_PIECE', request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'EACH' });
  assert.deepEqual(measurementColumns('KG_KG'), { measurement_type: 'KG_KG', request_unit: 'KG', base_unit: 'G', display_unit: 'KG', billing_unit: 'KG' });
  assert.deepEqual(measurementColumns('PIECE_KG'), { measurement_type: 'PIECE_KG', request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG' });
  assert.throws(() => measurementColumns('LITRE'), /valid measurement/);
});

test('dual-unit patty keeps 80 pieces for inventory and 6.25 kg for billing', () => {
  const item = { id: 'patty', name: 'Crispy Chicken Patty', measurement_type: 'PIECE_KG', request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG', default_supply_price: 350 };
  assert.deepEqual(normalizeSupplyLine(item, { inventoryQuantity: 80, billingQuantity: 6.25 }), {
    item_id: 'patty', item_name: 'Crispy Chicken Patty', unit: 'KG', quantity: 6.25, base_quantity: 80, unit_price: 350
  });
});

test('same-unit types use supplied quantity for both stock and billing', () => {
  const pieces = { id: 'box', name: 'Burger Box', measurement_type: 'PIECE_PIECE', request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'EACH', default_supply_price: 4 };
  assert.equal(normalizeSupplyLine(pieces, { inventoryQuantity: 20, billingQuantity: 999 }).quantity, 20);
  const weight = { id: 'sauce', name: 'Sauce', measurement_type: 'KG_KG', request_unit: 'KG', base_unit: 'G', display_unit: 'KG', billing_unit: 'KG', default_supply_price: 120 };
  assert.deepEqual(normalizeSupplyLine(weight, { inventoryQuantity: 1.25 }), { item_id: 'sauce', item_name: 'Sauce', unit: 'KG', quantity: 1.25, base_quantity: 1250, unit_price: 120 });
});

test('piece inventory is rounded and invalid quantities are rejected', () => {
  const item = { id: 'patty', name: 'Patty', measurement_type: 'PIECE_KG', request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG', default_supply_price: 350 };
  assert.equal(normalizeSupplyLine(item, { inventoryQuantity: 7.7, billingQuantity: 0.6 }).base_quantity, 8);
  assert.throws(() => normalizeSupplyLine(item, { inventoryQuantity: 8, billingQuantity: 0 }), /billing quantity/);
});

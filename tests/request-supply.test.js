import test from 'node:test';
import assert from 'node:assert/strict';
import { stockRequestUnit, requestSupplyQuantities } from '../lib/inventory-measurements.js';

test('piece request does not become an invented kilogram billing weight', () => {
  const item = { request_unit: 'PIECE', billing_unit: 'KG', supply_unit: 'KG', inventory_unit: 'EACH', request_to_inventory: 1, billing_to_inventory: 12.5 };
  assert.equal(stockRequestUnit(item), 'PIECE');
  assert.deepEqual(requestSupplyQuantities(item, 'PIECE', 80), { inventoryQuantity: 80, billingQuantity: 6.4 });
});

test('30 patties at 80g each automatically bill as 2.4kg', () => {
  const item = { request_unit: 'PIECE', billing_unit: 'KG', inventory_unit: 'EACH', request_to_inventory: 1, billing_to_inventory: 12.5 };
  assert.deepEqual(requestSupplyQuantities(item, 'PIECE', 30), { inventoryQuantity: 30, billingQuantity: 2.4 });
});

test('matching billing units retain quantity and convert inventory', () => {
  assert.deepEqual(requestSupplyQuantities({ supply_unit: 'KG', inventory_unit: 'G' }, 'KG', 5), { inventoryQuantity: 5000, billingQuantity: 5 });
  assert.deepEqual(requestSupplyQuantities({ billing_unit: 'EACH', base_unit: 'EACH' }, 'PIECE', 80), { inventoryQuantity: 80, billingQuantity: 80 });
});

test('containers still require actual net contents', () => {
  const item = { supply_unit: 'BOTTLE', inventory_unit: 'G' };
  assert.equal(stockRequestUnit(item), 'BOTTLE');
  assert.deepEqual(requestSupplyQuantities(item, 'BOTTLE', 2), { inventoryQuantity: '', billingQuantity: 2 });
});

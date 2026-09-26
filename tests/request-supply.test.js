import test from 'node:test';
import assert from 'node:assert/strict';
import { stockRequestUnit, requestSupplyQuantities } from '../lib/inventory-measurements.js';

test('piece request does not become an invented kilogram billing weight', () => {
  const item = { supply_unit: 'KG', inventory_unit: 'EACH' };
  assert.equal(stockRequestUnit(item), 'PIECE');
  assert.deepEqual(requestSupplyQuantities(item, 'PIECE', 80), { inventoryQuantity: 80, billingQuantity: '' });
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

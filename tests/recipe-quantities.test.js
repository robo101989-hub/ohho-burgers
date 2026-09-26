import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultNetQuantity, flexibleUnitColumns, normalizeRecipeQuantity, normalizeSupplyLine } from '../lib/inventory-measurements.js';

test('recipe consumption uses the item internal unit without kg conversion', () => {
  const dough = { name: 'Pizza Dough', base_unit: 'G', inventory_unit: 'G' };
  assert.equal(normalizeRecipeQuantity(dough, 160, 'G'), 160);
  assert.throws(() => normalizeRecipeQuantity(dough, 0.16, 'KG'), /must be entered in g/);
});

test('standard supplies suggest base-unit net quantities', () => {
  assert.equal(defaultNetQuantity('KG', 'G', 5), 5000);
  assert.equal(defaultNetQuantity('L', 'ML', 2), 2000);
  assert.equal(defaultNetQuantity('PIECE', 'EACH', 12), 12);
  assert.equal(defaultNetQuantity('BOTTLE', 'G', 1), '');
});

test('container supply and net contents remain separate', () => {
  const item = { id: 'j', name: 'Jalapeno', supply_unit: 'BOTTLE', inventory_unit: 'G', base_unit: 'G', default_supply_price: 100 };
  assert.deepEqual(normalizeSupplyLine(item, { supplyQuantity: 1, inventoryQuantity: 500 }), { item_id: 'j', item_name: 'Jalapeno', unit: 'BOTTLE', quantity: 1, base_quantity: 500, unit_price: 100 });
});

test('flexible items keep supply and inventory units independent', () => {
  assert.deepEqual(flexibleUnitColumns('KG', 'EACH'), { measurement_type: 'FLEXIBLE', request_unit: 'KG', supply_unit: 'KG', base_unit: 'EACH', inventory_unit: 'EACH', display_unit: 'EACH', billing_unit: 'KG' });
});

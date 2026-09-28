import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalPurchase } from '../lib/local-purchases.js';
import { calculateCurrentStockValue } from '../lib/inventory-valuation.js';
import { calculateSuggestedRequirements } from '../lib/stock-requirements.js';
const item = { id: 'mint', name: 'Mint', active: true, inventory_unit: 'G', category_id: 'veg' };
const body = { outletId: 'a', itemId: 'mint', quantity: '0.5', unit: 'KG', cost: '45.33', paymentMethod: 'CASH' };
test('local purchase converts quantities and keeps the exact paid total', () => {
  const row = normalizeLocalPurchase(body, [item]);
  assert.equal(row.baseQuantity, 500);
  assert.equal(row.cost, 45.33);
  assert.equal(row.name, 'Mint');
});
test('new items require a category and name', () => {
  assert.throws(() => normalizeLocalPurchase({ ...body, itemId: null }), /name/);
  const row = normalizeLocalPurchase({ ...body, itemId: null, name: 'Local oil', categoryId: 'c', unit: 'L' });
  assert.equal(row.baseQuantity, 500);
  assert.equal(row.baseUnit, 'ML');
});
test('rejects invalid quantities, precision, mismatched units and foreign local items', () => {
  for (const quantity of [0, -1, 'bad', Infinity, 1.0001]) assert.throws(() => normalizeLocalPurchase({ ...body, quantity }, [item]));
  for (const cost of [0, -1, NaN, Infinity, 0.001]) assert.throws(() => normalizeLocalPurchase({ ...body, cost }, [item]));
  assert.throws(() => normalizeLocalPurchase({ ...body, unit: 'PIECE' }, [item]), /match/);
  assert.throws(() => normalizeLocalPurchase(body, [{ ...item, local_outlet_id: 'b' }]), /outlet/);
  assert.throws(() => normalizeLocalPurchase(body, [{ ...item, active: false }]), /active/);
  assert.throws(() => normalizeLocalPurchase({ ...body, unit: 'PIECE', quantity: 1.5 }, [{ ...item, inventory_unit: 'EACH' }]), /whole/);
});
test('local receipts contribute their actual cost to stock valuation', () => {
  assert.equal(calculateCurrentStockValue({ items: [item], balances: [{ outlet_id: 'a', item_id: 'mint', quantity_on_hand: 250 }], bills: [{ outlet_id: 'a', purchase_source: 'LOCAL', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'mint', inventory_unit: 'G', base_quantity: 500, line_total: 45.33 }] }] }), 22.665);
});
test('outlet-created local items are not sent as central supply suggestions', () => {
  assert.deepEqual(calculateSuggestedRequirements({ outletId: 'a', items: [{ ...item, local_outlet_id: 'a', target_stock_level: 1000 }] }), []);
});

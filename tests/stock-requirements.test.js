import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSuggestedRequirements } from '../lib/stock-requirements.js';

const piece = { id: 'bun', active: true, target_stock_level: 100, request_unit: 'PIECE', base_unit: 'EACH', display_unit: 'EACH' };
const kg = { id: 'sauce', active: true, target_stock_level: 5, request_unit: 'KG', base_unit: 'G', display_unit: 'KG' };

test('subtracts current stock and pending incoming supply from the target', () => {
  const result = calculateSuggestedRequirements({
    outletId: 'outlet-1',
    items: [piece],
    balances: [{ outlet_id: 'outlet-1', item_id: 'bun', quantity_on_hand: 35 }],
    bills: [{ outlet_id: 'outlet-1', receipt_status: 'PENDING', supply_bill_items: [{ item_id: 'bun', base_quantity: 20 }] }]
  });
  assert.deepEqual(result, [{ itemId: 'bun', quantity: 45, current: 35, pending: 20 }]);
});

test('converts base grams to kg and ignores already received bills', () => {
  const result = calculateSuggestedRequirements({
    outletId: 'outlet-1',
    items: [kg],
    balances: [{ outlet_id: 'outlet-1', item_id: 'sauce', quantity_on_hand: 1200 }],
    bills: [
      { outlet_id: 'outlet-1', receipt_status: 'PENDING', supply_bill_items: [{ item_id: 'sauce', base_quantity: 800 }] },
      { outlet_id: 'outlet-1', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'sauce', base_quantity: 2000 }] }
    ]
  });
  assert.deepEqual(result, [{ itemId: 'sauce', quantity: 3, current: 1.2, pending: 0.8 }]);
});

test('rounds piece requirements up and omits fully covered targets', () => {
  const result = calculateSuggestedRequirements({
    outletId: 'outlet-1',
    items: [{ ...piece, target_stock_level: 10.2 }, { ...kg, target_stock_level: 1 }],
    balances: [
      { outlet_id: 'outlet-1', item_id: 'bun', quantity_on_hand: 9 },
      { outlet_id: 'outlet-1', item_id: 'sauce', quantity_on_hand: 1000 }
    ],
    bills: []
  });
  assert.deepEqual(result, [{ itemId: 'bun', quantity: 2, current: 9, pending: 0 }]);
});

test('migrated kilogram targets are not divided by 1000 twice', () => {
  assert.deepEqual(calculateSuggestedRequirements({
    outletId: 'outlet-1', items: [{ ...kg, supply_unit: 'KG', inventory_unit: 'G' }],
    balances: [{ outlet_id: 'outlet-1', item_id: 'sauce', quantity_on_hand: 1200 }],
    bills: [{ outlet_id: 'outlet-1', receipt_status: 'PENDING', supply_bill_items: [{ item_id: 'sauce', base_quantity: 800 }] }]
  }), [{ itemId: 'sauce', quantity: 3, current: 1.2, pending: 0.8 }]);
});

test('patty requirements stay in pieces despite kilogram billing', () => {
  assert.deepEqual(calculateSuggestedRequirements({
    outletId: 'outlet-1', items: [{ ...piece, supply_unit: 'KG', inventory_unit: 'EACH' }],
    balances: [{ outlet_id: 'outlet-1', item_id: 'bun', quantity_on_hand: 35 }, { outlet_id: 'other', item_id: 'bun', quantity_on_hand: 100 }],
    bills: [{ outlet_id: 'outlet-1', receipt_status: 'PENDING', supply_bill_items: [{ item_id: 'bun', base_quantity: 20 }] }]
  }), [{ itemId: 'bun', quantity: 45, current: 35, pending: 20 }]);
});

test('gram targets convert to requested kilograms once', () => {
  assert.equal(calculateSuggestedRequirements({ outletId: 'outlet-1', items: [{ ...kg, target_stock_level: 5000, display_unit: 'G', supply_unit: 'KG', inventory_unit: 'G' }] })[0].quantity, 5);
});

const { closedSessionRequirementReview } = await import('../lib/stock-requirements.js');
const closed = { id: 'session-1', outlet_id: 'outlet-1', opened_at: '2026-09-28T11:00:00Z', closed_at: '2026-09-28T20:00:00Z' };
test('overnight close requests stock for the next trading day, not an extra day later', () => {
  assert.deepEqual(closedSessionRequirementReview({ sessions: [closed], outletId: 'outlet-1' }), { key: 'outlet-1:session-1', requiredFor: '2026-09-29', existing: false });
});
test('latest open session suppresses stale closed-session suggestions', () => {
  assert.equal(closedSessionRequirementReview({ sessions: [closed, { ...closed, id: 'session-2', opened_at: '2026-09-29T11:00:00Z', closed_at: null }], outletId: 'outlet-1' }), null);
  assert.equal(closedSessionRequirementReview({ sessions: [closed], outletId: 'other' }), null);
});
test('existing next-session requests prevent a duplicate review, cancelled requests do not', () => {
  const request = { outlet_id: 'outlet-1', required_for: '2026-09-29', status: 'SENT' };
  const review = requests => closedSessionRequirementReview({ sessions: [closed], outletId: 'outlet-1', requests });
  assert.equal(review([request]).existing, true);
  assert.equal(review([{ ...request, status: 'CANCELLED' }]).existing, false);
  assert.equal(review([{ ...request, outlet_id: 'other' }]).existing, false);
});

test('automatic review seeds once and preserves owner changes across refreshes', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function prepareClosedSessionRequirements('), source.indexOf('function generateStockSuggestions('));
  const date = { value: '' };
  const inventory = { latestSessions: [closed], requests: [], requestLines: [], items: [piece], balances: [], bills: [] };
  const context = { state: { profile: { role: 'OWNER' }, inventory }, $: selector => selector === '#stockRequestOutlet' ? { value: 'outlet-1' } : date, closedSessionRequirementReview, calculateSuggestedRequirements };
  vm.createContext(context);
  vm.runInContext(fn + '\nprepareClosedSessionRequirements();', context);
  assert.equal(inventory.requestLines[0].quantity, 100);
  assert.equal(date.value, '2026-09-29');
  inventory.requestLines = [];
  vm.runInContext('prepareClosedSessionRequirements();', context);
  assert.equal(inventory.requestLines.length, 0, 'removed suggestions must not reappear on refresh');
  inventory.requirementReviewKey = null;
  inventory.requestLines = [{ itemId: 'bun', quantity: 7 }];
  vm.runInContext('prepareClosedSessionRequirements();', context);
  assert.equal(inventory.requestLines[0].quantity, 7);
});

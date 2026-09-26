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

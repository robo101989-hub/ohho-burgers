import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurrentStockValue } from '../lib/inventory-valuation.js';

test('values piece-to-kg stock from the received bill total rather than kg rate times pieces', () => {
  const value = calculateCurrentStockValue({
    items: [{ id: 'patty', measurement_type: 'PIECE_KG', base_unit: 'EACH', display_unit: 'EACH', default_supply_price: 350 }],
    balances: [{ outlet_id: 'outlet', item_id: 'patty', quantity_on_hand: 2500 }],
    bills: [{ outlet_id: 'outlet', supplied_at: '2026-09-25T10:00:00Z', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'patty', base_quantity: 2500, line_total: 875 }] }]
  });
  assert.equal(value, 875);
});

test('uses the latest received bill cost and ignores pending supplies', () => {
  const value = calculateCurrentStockValue({
    items: [{ id: 'sauce', measurement_type: 'KG_KG', base_unit: 'G', display_unit: 'KG', default_supply_price: 100 }],
    balances: [{ outlet_id: 'outlet', item_id: 'sauce', quantity_on_hand: 2000 }],
    bills: [
      { outlet_id: 'outlet', supplied_at: '2026-09-20T10:00:00Z', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'sauce', base_quantity: 1000, line_total: 120 }] },
      { outlet_id: 'outlet', supplied_at: '2026-09-26T10:00:00Z', receipt_status: 'PENDING', supply_bill_items: [{ item_id: 'sauce', base_quantity: 1000, line_total: 500 }] }
    ]
  });
  assert.equal(value, 240);
});

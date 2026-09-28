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

test('uses received bill cost and ignores pending supplies', () => {
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

test('uses weighted received cost so one bad cross-unit receipt cannot replace the full stock value', () => {
  const value = calculateCurrentStockValue({
    items: [{ id: 'patty', supply_unit: 'KG', inventory_unit: 'EACH', base_unit: 'EACH', default_supply_price: 350 }],
    balances: [{ outlet_id: 'outlet', item_id: 'patty', quantity_on_hand: 33 }],
    bills: [
      { outlet_id: 'outlet', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'patty', base_quantity: 30, line_total: 875 }] },
      { outlet_id: 'outlet', receipt_status: 'RECEIVED', supply_bill_items: [{ item_id: 'patty', base_quantity: 3, line_total: 875 }] }
    ]
  });
  assert.equal(value, 1750);
});

test('normalizes historical receipt quantities after a Master Item unit conversion', () => {
  const value = calculateCurrentStockValue({
    items: [{ id: 'cheese', supply_unit: 'KG', billing_unit: 'KG', inventory_unit: 'G', base_unit: 'G', default_supply_price: 500 }],
    balances: [{ outlet_id: 'outlet', item_id: 'cheese', quantity_on_hand: 3000 }],
    bills: [{
      outlet_id: 'outlet', supplied_at: '2026-09-26T10:00:00Z', receipt_status: 'RECEIVED',
      supply_bill_items: [{ item_id: 'cheese', inventory_unit: 'EACH', base_quantity: 3, line_total: 1500 }]
    }],
    movements: [{
      outlet_id: 'outlet', item_id: 'cheese', occurred_at: '2026-09-27T10:00:00Z',
      movement_type: 'ADJUSTMENT', rule_snapshot: { oldUnit: 'EACH', newUnit: 'G', factor: 1000 }
    }]
  });
  assert.equal(value, 1500);
});

test('opening stock without receipts uses configured pack conversion', () => {
  assert.equal(calculateCurrentStockValue({items:[{id:'buns',default_supply_price:35,billing_to_inventory:4}],balances:[{item_id:'buns',outlet_id:'a',quantity_on_hand:8}]}),70);
});
test('received costs take precedence over current pack price', () => {
  assert.equal(calculateCurrentStockValue({items:[{id:'buns',default_supply_price:35,billing_to_inventory:4}],balances:[{item_id:'buns',outlet_id:'a',quantity_on_hand:8}],bills:[{outlet_id:'a',receipt_status:'RECEIVED',supply_bill_items:[{item_id:'buns',base_quantity:4,line_total:20}]}]}),40);
});

test('archived duplicates are excluded from active stock valuation without deleting history', () => {
  assert.equal(calculateCurrentStockValue({items:[{id:'old',active:false,default_supply_price:350,billing_to_inventory:1},{id:'active',active:true,default_supply_price:10,billing_to_inventory:1}],balances:[{item_id:'old',outlet_id:'a',quantity_on_hand:3},{item_id:'active',outlet_id:'a',quantity_on_hand:4}]}),40);
});

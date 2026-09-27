import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePackagingConsumption } from '../lib/packaging-consumption.js';

const items = [{ id: 'burger', category_id: 'burgers' }, { id: 'pizza', category_id: 'pizza' }];
const rules = [
  { item_id: 'bag', order_types: ['TAKEAWAY'], consumption_type: 'PER_ORDER', consumption_quantity: 1 },
  { item_id: 'tissue', order_types: ['TAKEAWAY','DELIVERY'], consumption_type: 'PER_ORDER', consumption_quantity: 2 },
  { item_id: 'wrapper', order_types: ['TAKEAWAY','DELIVERY'], consumption_type: 'PER_MENU_CATEGORY', menu_category_id: 'burgers', consumption_quantity: 1 },
  { item_id: 'box', order_types: ['TAKEAWAY','DELIVERY'], consumption_type: 'PER_MENU_ITEM', menu_item_id: 'pizza', consumption_quantity: 1 }
];

test('takeaway packaging follows per-order, per-item and category rules', () => {
  assert.deepEqual(calculatePackagingConsumption({ rules, orderType: 'TAKEAWAY', menuItems: items, orderItems: [{ menu_item_id: 'burger', quantity: 2 }, { menu_item_id: 'pizza', quantity: 1 }] }), [
    { itemId: 'bag', quantity: 1 }, { itemId: 'tissue', quantity: 2 }, { itemId: 'wrapper', quantity: 2 }, { itemId: 'box', quantity: 1 }
  ]);
});

test('dine-in consumes no takeaway-only packaging', () => {
  assert.deepEqual(calculatePackagingConsumption({ rules, orderType: 'DINE_IN', menuItems: items, orderItems: [{ menu_item_id: 'burger', quantity: 2 }, { menu_item_id: 'pizza', quantity: 1 }] }), []);
});

test('delivery applies only delivery-enabled rules', () => {
  assert.deepEqual(calculatePackagingConsumption({ rules, orderType: 'DELIVERY', menuItems: items, orderItems: [{ menu_item_id: 'burger', quantity: 1 }, { menu_item_id: 'pizza', quantity: 1 }] }), [
    { itemId: 'tissue', quantity: 2 }, { itemId: 'wrapper', quantity: 1 }, { itemId: 'box', quantity: 1 }
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecipeConsumption } from '../lib/recipe-consumption.js';

const recipes = [
  { menu_item_id: 'burger', inventory_item_id: 'bun', base_quantity: 1, usage_type: 'FOOD' },
  { menu_item_id: 'burger', inventory_item_id: 'cheese', base_quantity: 20, usage_type: 'FOOD' },
  { menu_item_id: 'burger', inventory_item_id: 'box', base_quantity: 1, usage_type: 'TAKEAWAY_DELIVERY' },
  { menu_item_id: 'burger', inventory_item_id: 'tissue', base_quantity: 2, usage_type: 'DINE_IN' },
  { menu_item_id: 'burger', inventory_item_id: 'tray-paper', base_quantity: 1, usage_type: 'DINE_IN' }
];

test('dine-in deducts food and dine-in service items only', () => {
  assert.deepEqual(calculateRecipeConsumption({ recipes, orderType: 'DINE_IN', orderItems: [{ menu_item_id: 'burger', quantity: 1 }] }), [
    { itemId: 'bun', quantity: 1 },
    { itemId: 'cheese', quantity: 20 },
    { itemId: 'tissue', quantity: 2 },
    { itemId: 'tray-paper', quantity: 1 }
  ]);
});

test('takeaway and delivery deduct food and takeaway packaging only', () => {
  for (const orderType of ['TAKEAWAY', 'DELIVERY']) {
    assert.deepEqual(calculateRecipeConsumption({ recipes, orderType, orderItems: [{ menu_item_id: 'burger', quantity: 1 }] }), [
      { itemId: 'bun', quantity: 1 },
      { itemId: 'cheese', quantity: 20 },
      { itemId: 'box', quantity: 1 }
    ]);
  }
});

test('recipe quantities scale with the ordered menu quantity', () => {
  assert.deepEqual(calculateRecipeConsumption({ recipes, orderType: 'DINE_IN', orderItems: [{ menu_item_id: 'burger', quantity: 2 }] }), [
    { itemId: 'bun', quantity: 2 },
    { itemId: 'cheese', quantity: 40 },
    { itemId: 'tissue', quantity: 4 },
    { itemId: 'tray-paper', quantity: 2 }
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStaffConsumption } from '../lib/staff-consumption.js';

const rules = [
  { item_id: 'apron', quantity_per_staff: 1, active: true },
  { item_id: 'gloves', quantity_per_staff: 4, active: true },
  { item_id: 'head-cap', quantity_per_staff: 2, active: true }
];

test('two working staff calculate the expected daily consumables', () => {
  assert.deepEqual(calculateStaffConsumption(rules, 2), [
    { itemId: 'apron', quantity: 2 },
    { itemId: 'gloves', quantity: 8 },
    { itemId: 'head-cap', quantity: 4 }
  ]);
});

test('inactive staff rules are excluded', () => {
  assert.deepEqual(calculateStaffConsumption([...rules, { item_id: 'mask', quantity_per_staff: 2, active: false }], 2), [
    { itemId: 'apron', quantity: 2 },
    { itemId: 'gloves', quantity: 8 },
    { itemId: 'head-cap', quantity: 4 }
  ]);
});

test('invalid staff counts produce no deduction preview', () => {
  assert.deepEqual(calculateStaffConsumption(rules, 0), []);
  assert.deepEqual(calculateStaffConsumption(rules, 1.5), []);
});

test('per-session consumables are not multiplied by staff count', () => {
  assert.deepEqual(calculateStaffConsumption([
    ...rules,
    { item_id: 'garbage-bag', quantity_per_staff: 2, consumption_basis: 'PER_SESSION', active: true }
  ], 5), [
    { itemId: 'apron', quantity: 5 },
    { itemId: 'gloves', quantity: 20 },
    { itemId: 'head-cap', quantity: 10 },
    { itemId: 'garbage-bag', quantity: 2 }
  ]);
});

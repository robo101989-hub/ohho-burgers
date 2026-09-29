import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRIZES, cleanPrizes, normalizePrize, wheelSlots, wheelRotation, rewardDiscount } from '../lib/spin-rewards.js';
const giftId = '12345678-1234-1234-1234-123456789abc';
test('all six results land at the pointer, including both no-win slices', () => {
  const slots = wheelSlots(DEFAULT_PRIZES);
  assert.deepEqual(slots.map(p => p.type), ['PERCENT','NONE','PERCENT','FLAT','NONE','FLAT']);
  let previous = 0;
  for (let lap = 0; lap < 3; lap++) for (let index = 0; index < 6; index++) {
    const rotation = wheelRotation(index, previous);
    assert.equal((rotation + index * 60) % 360, 0);
    assert.ok(rotation - previous >= 1800);
    previous = rotation;
  }
});
test('typed rewards reject unsafe values and cannot retain contradictory labels', () => {
  for (const value of [0,-1,101,NaN,Infinity,'oops']) assert.throws(() => normalizePrize({ type:'PERCENT', value }));
  assert.deepEqual(normalizePrize({ type:'PERCENT',value:15,label:'50% OFF' }), {type:'PERCENT',value:15,label:'15% OFF'});
  assert.equal(normalizePrize({type:'FLAT',value:25}).label, '₹25 OFF');
  assert.throws(() => normalizePrize({type:'FREE_ITEM',label:'Free drink'}));
  assert.equal(cleanPrizes([{type:'FREE_ITEM',label:'Unlinked gift'}])[0].type, 'NONE');
  assert.equal(cleanPrizes()[3].value, 30);
});
test('gift discounts exactly one matching unit; its full quantity stays in stock deductions', () => {
  const gift = normalizePrize({type:'FREE_ITEM',menuItemId:giftId,category:'BEVERAGE',label:'Free lemonade'});
  const lines = [{menu_item_id:giftId,quantity:3,unit_price:60},{menu_item_id:'burger',quantity:2,unit_price:120}];
  const original = structuredClone(lines);
  assert.equal(rewardDiscount(gift,lines,420),60);
  assert.equal(rewardDiscount({reward_type:'FREE_ITEM',reward_details:{menuItemId:giftId}},lines,420),60);
  assert.deepEqual(lines,original);
  assert.throws(() => rewardDiscount(gift,[{menu_item_id:'wrong',quantity:1,unit_price:60}],60), /Add the free reward item/);
});
test('percentage and flat rewards cap at the subtotal; no-win has no discount', () => {
  assert.equal(rewardDiscount({type:'PERCENT',value:15},[],300),45);
  assert.equal(rewardDiscount({type:'FLAT',value:500},[],300),300);
  assert.equal(rewardDiscount({type:'NONE'},[],300),0);
});

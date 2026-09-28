import test from 'node:test';
import assert from 'node:assert/strict';
import { stockHistoryRows, orderUtilisation, recipeCostLines } from '../lib/inventory-reporting.js';
const sessions=[{outlet_id:'a',opened_at:'2026-09-28T17:00:00+05:30',closed_at:null}];
const bill={id:'bill',outlet_id:'a',supplied_at:'2026-09-28T16:00:00+05:30',received_at:'2026-09-28T18:00:00+05:30'};
test('custom stock history includes receipts within a selected open session',()=>{
 assert.equal(stockHistoryRows([bill],'supplied_at',{mode:'CUSTOM',sessions,from:'2026-09-28',to:'2026-09-28'}).length,1);
});
test('all supply bills resets custom filtering and includes unassigned historical bills',()=>{
 assert.equal(stockHistoryRows([bill,{...bill,id:'old',received_at:'2020-01-01'}],'supplied_at',{mode:'ALL',sessions,from:'2026-09-29',to:'2026-09-29'}).length,2);
});
test('stock history does not leak other outlets',()=>{
 assert.equal(stockHistoryRows([bill],'supplied_at',{outletId:'b'}).length,0);
});
const items=[{id:'i',name:'Ingredient',inventory_unit:'G',default_supply_price:100,billing_to_inventory:1000}];
const movement={reference_type:'ORDER',reference_id:'o',movement_type:'SALE_DEDUCTION',item_id:'i',outlet_id:'a',inventory_unit_snapshot:'G',quantity_delta:-100,occurred_at:'2026-09-28T18:00:00Z'};
test('order usage uses saved deductions instead of current recipes and ignores future deliveries',()=>{
 const bills=[{outlet_id:'a',receipt_status:'RECEIVED',received_at:'2026-09-28T10:00:00Z',supply_bill_items:[{item_id:'i',base_quantity:1000,line_total:200}]},{outlet_id:'a',receipt_status:'RECEIVED',received_at:'2026-09-29T10:00:00Z',supply_bill_items:[{item_id:'i',base_quantity:1000,line_total:1000}]}];
 const [result]=orderUtilisation([{id:'o',outlet_id:'a'}],[movement],items,bills);
 assert.equal(result.usage[0].quantity,100);assert.equal(result.cost,20);assert.equal(result.complete,true);
});
test('unknown units and missing deductions are not represented as zero actual cost',()=>{
 const rows=orderUtilisation([{id:'o',outlet_id:'a'},{id:'missing',outlet_id:'a'}],[{...movement,inventory_unit_snapshot:'EACH'}],items,[]);
 assert.equal(rows[0].complete,false);assert.equal(rows[1].complete,false);
});
test('reversals reduce recorded utilisation',()=>{
 const [result]=orderUtilisation([{id:'o',outlet_id:'a'}],[movement,{...movement,movement_type:'REVERSAL',quantity_delta:20}],items,[]);
 assert.equal(result.usage[0].quantity,80);assert.equal(result.cost,8);
});
test('recipe cost respects dine-in and takeaway ingredients',()=>{
 const recipes=[{menu_item_id:'m',inventory_item_id:'i',base_quantity:10,usage_type:'FOOD'},{menu_item_id:'m',inventory_item_id:'i',base_quantity:20,usage_type:'TAKEAWAY_DELIVERY'},{menu_item_id:'m',inventory_item_id:'i',base_quantity:5,usage_type:'DINE_IN'}];
 assert.equal(recipeCostLines('m',recipes,items,'a',[],[],'DINE_IN').reduce((s,l)=>s+l.cost,0),1.5);
 assert.equal(recipeCostLines('m',recipes,items,'a',[],[],'TAKEAWAY').reduce((s,l)=>s+l.cost,0),3);
});

test('current patty setup costs 350 / 11.11 while received costing stays unchanged',()=>{
 const item={id:'patty',name:'Patty',inventory_unit:'EACH',billing_to_inventory:11.11,default_supply_price:350};
 const recipes=[{menu_item_id:'burger',inventory_item_id:'patty',usage_type:'FOOD',base_quantity:1}];
 const bills=[{outlet_id:'a',receipt_status:'RECEIVED',supply_bill_items:[{item_id:'patty',base_quantity:10,line_total:405.6,inventory_unit:'EACH'}]}];
 const configured=recipeCostLines('burger',recipes,[item],'a',bills,[],'DINE_IN','CONFIGURED')[0];
 assert.ok(Math.abs(configured.cost-350/11.11)<0.000001);
 assert.equal(configured.costBasis,'Configured item price');
 assert.equal(recipeCostLines('burger',recipes,[item],'a',bills,[],'DINE_IN')[0].cost,40.56);
 const fallback=recipeCostLines('burger',recipes,[{...item,default_supply_price:0}],'a',bills,[],'DINE_IN','CONFIGURED')[0];
 assert.equal(fallback.cost,40.56);
 assert.equal(fallback.costBasis,'Received purchase average');
});

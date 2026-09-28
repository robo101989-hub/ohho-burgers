import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { orderUtilisation, recipeCostLines } from '../lib/inventory-reporting.js';
const source=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function renderUtilisation('),source.indexOf('function completedSessionsForRange('));
test('overview utilisation renders order deductions and product cost views with missing-data labels',()=>{
 const node={innerHTML:'',querySelectorAll:()=>[]};
 const context={ $:()=>node, orderUtilisation,recipeCostLines,selectedOperationsOutletId:()=>'',operationInRange:()=>true,isReportableOrder:()=>true,inventoryOutlet:()=>({name:'Test outlet'}),escapeHtml:String,inventoryQty:String,inventoryDate:String,unitLabel:String,formatReportMoney:v=>`Rs ${v}`,state:{reportOrders:[{id:'o',outlet_id:'a',order_number:10},{id:'missing',outlet_id:'a',order_number:11}],reportItems:[],inventory:{items:[{id:'i',name:'Flour',inventory_unit:'G',default_supply_price:100,billing_to_inventory:1000}],movements:[{reference_type:'ORDER',reference_id:'o',outlet_id:'a',item_id:'i',movement_type:'SALE_DEDUCTION',quantity_delta:-100,inventory_unit_snapshot:'G',occurred_at:'2026-09-28'}],bills:[],stockCategories:[],outlets:[],menuItems:[],menuCategories:[],recipes:[]}}};
 vm.createContext(context);vm.runInContext(fn+"\nrenderUtilisation('#overviewUtilisation',{});",context);
 assert.match(node.innerHTML,/Order #10/);assert.match(node.innerHTML,/Flour/);assert.match(node.innerHTML,/Rs 10/);assert.match(node.innerHTML,/No saved inventory deductions for this order/);assert.match(node.innerHTML,/Menu recipe cost meters/);
});

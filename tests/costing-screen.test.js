import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../dashboard.html',import.meta.url),'utf8');
test('dedicated costing replaces repeated panels and keeps operations totals',()=>{
 assert.ok(html.includes('id="costing"'));
 for(const id of ['overviewUtilisation','reportUtilisation','inventoryUtilisation']) assert.ok(!html.includes(`id="${id}"`));
 assert.ok(source.includes("if (!$('#overviewOperationsSales')) return;"));
});
test('costing shows recipe totals, incomplete costs, order usage and categories',()=>{
 const nodes={};const $=id=>nodes[id]??=({value:'',innerHTML:'',selectedOptions:[{textContent:'Dine-in'}]});
 $('#costingMode').value='menu';
 const rows=[{name:'Bun',quantity:1,unit:'EACH',cost:10}];
 const context=vm.createContext({document:{querySelectorAll:()=>[]},$,state:{inventory:{outlets:[{id:'o',name:'Outlet'}],menuCategories:[{id:'c',name:'Burgers'}],menuItems:[{id:'m',name:'Burger',category_id:'c',price:100}],stockCategories:[{id:'s',name:'Bread'}]},reportOrders:[{id:'order',outlet_id:'o'}]},inventorySelectOptions:(n,options,old)=>{n.value=options.some(x=>x.value===old)?old:options[0]?.value||''},formatReportMoney:n=>`₹${n}`,inventoryQty:String,unitLabel:String,escapeHtml:String,inventoryDate:String,isReportableOrder:()=>true,recipeCostLines:()=>rows,orderUtilisation:()=>[{order:{id:'order',order_number:1},usage:[{...rows[0],itemId:'i',categoryId:'s',priced:true}],cost:10,complete:true}]});
 vm.runInContext(source.slice(source.indexOf('function renderCostingScreen()'),source.indexOf('function renderUtilisation(')),context);
 const render=()=>vm.runInContext('renderCostingScreen()',context);
 render();assert.match($('#costingContent').innerHTML,/₹90/);assert.match($('#costingContent').innerHTML,/10.0%/);
 rows[0].cost=null;render();assert.match($('#costingContent').innerHTML,/Unavailable/);assert.doesNotMatch($('#costingContent').innerHTML,/₹90/);
 $('#costingMode').value='order';render();assert.match($('#costingContent').innerHTML,/Recorded ingredients/);assert.equal($('#costingMenuFilters').hidden,true);
 $('#costingMode').value='category';render();assert.match($('#costingContent').innerHTML,/Bread/);
});

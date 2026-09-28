import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { filterHistory } from '../lib/history.js';
const source = fs.readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function renderDailyExpenses()'), source.indexOf('function renderStockCategories()'));
function render(mode, from = '', to = '') {
  const nodes = new Map();
  const $ = key => { if (!nodes.has(key)) nodes.set(key, {value:key === '#expenseOutletFilter' ? 'a' : '',classList:{toggle(){}},setAttribute(){}}); return nodes.get(key); };
  const context = { $, filterHistory, state:{profile:{role:'ADMIN'},inventory:{expenseHistoryMode:mode,expenseHistoryFrom:from,expenseHistoryTo:to,expenses:[{outlet_id:'a',occurred_at:'2026-09-28T08:00:00Z',amount:100,description:'Before opening'},{outlet_id:'a',occurred_at:'2026-09-29T08:00:00Z',amount:50,description:'Open session'},{outlet_id:'b',occurred_at:'2026-09-29T08:00:00Z',amount:900,description:'Other outlet'}]}},formatReportMoney:String,inventoryOutlet:()=>({name:'Outlet'}),escapeHtml:String,inventoryDate:String,currentInventorySessionRows: rows => rows.filter(x => x.description === 'Open session')};
  vm.createContext(context);vm.runInContext(fn+'\nrenderDailyExpenses();',context); return nodes;
}
test('all expenses includes pre-opening and open-session records for selected outlet',()=>{
 const nodes=render('ALL');assert.equal(nodes.get('#expenseTodayTotal').textContent,'150');assert.match(nodes.get('#dailyExpenseList').innerHTML,/Before opening/);assert.doesNotMatch(nodes.get('#dailyExpenseList').innerHTML,/Other outlet/);
});
test('custom expense dates include matching records without a closed session',()=>{
 assert.equal(render('CUSTOM','2026-09-29','2026-09-29').get('#expenseTodayTotal').textContent,'50');
});
test('current session remains a separate expense view',()=>{assert.equal(render('CURRENT').get('#expenseTodayTotal').textContent,'50');});

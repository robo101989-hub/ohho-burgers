import test from 'node:test';
import assert from 'node:assert/strict';
import { groupExpenseSessions } from '../lib/expense-sessions.js';
const sessions = [
 {id:'closed',outlet_id:'a',opened_at:'2026-09-27T17:00:00+05:30',closed_at:'2026-09-28T02:00:00+05:30'},
 {id:'open',outlet_id:'a',opened_at:'2026-09-28T17:00:00+05:30',closed_at:null}
];
const expenses = [
 {id:'overnight',outlet_id:'a',occurred_at:'2026-09-28T01:00:00+05:30',amount:100},
 {id:'current',outlet_id:'a',occurred_at:'2026-09-29T00:10:00+05:30',amount:50},
 {id:'unassigned',outlet_id:'a',occurred_at:'2026-09-26T12:00:00+05:30',amount:20},
 {id:'other',outlet_id:'b',occurred_at:'2026-09-29T00:10:00+05:30',amount:900}
];
test('all history separates sessions, totals and unmatched records without dropping expenses',()=>{
 const groups=groupExpenseSessions(expenses,sessions,{outletId:'a'});
 assert.equal(groups.length,3);assert.deepEqual(groups.map(g=>g.total),[50,100,20]);
 assert.equal(groups.reduce((n,g)=>n+g.expenses.length,0),3);
});
test('custom opening dates retain the full overnight session',()=>{
 const groups=groupExpenseSessions(expenses,sessions,{mode:'CUSTOM',outletId:'a',from:'2026-09-27',to:'2026-09-27'});
 assert.equal(groups.length,1);assert.equal(groups[0].id,'closed');assert.equal(groups[0].total,100);
});
test('custom date selection can include an open session',()=>{
 assert.equal(groupExpenseSessions(expenses,sessions,{mode:'CUSTOM',from:'2026-09-28',to:'2026-09-28'})[0].total,50);
});
test('current session excludes closed and unmatched expense groups',()=>{
 const groups=groupExpenseSessions(expenses,sessions,{mode:'CURRENT'});assert.equal(groups.length,1);assert.equal(groups[0].id,'open');
});
test('closing timestamp belongs only to the next session',()=>{
 const groups=groupExpenseSessions([{outlet_id:'a',occurred_at:sessions[0].closed_at,amount:10}],[sessions[0],{outlet_id:'a',opened_at:sessions[0].closed_at,closed_at:null}]);
 assert.deepEqual(groups.map(g=>g.total),[10,0]);
});

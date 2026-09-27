import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function canEditStockRequest('), source.indexOf('function resetStockRequestEditor('));
function fixture(role = 'OWNER') {
  const elements = new Map();
  const state = { profile: { role }, session: { user: { id: 'owner' } }, inventory: { requests: [] } };
  const context = vm.createContext({ state, $: id => { if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '' }); return elements.get(id); }, inventoryOutlet: () => ({ name: 'Kairana' }), inventorySelectedOutletId: () => 'outlet', escapeHtml: s => String(s).replaceAll('<','&lt;'), inventoryDate: s => s, inventoryQty: s => s, unitLabel: s => s });
  vm.runInContext(functions, context);
  return { state, elements, context };
}
const request = { id: 'req', outlet_id: 'outlet', created_by: 'owner', status: 'SUBMITTED', required_for: '2026-09-28', updated_at: '2026-09-27T10:00:00Z', franchise_stock_request_items: [{ item_name: 'Patty', quantity: 80, unit: 'PIECE' }] };
test('Owner sees latest sent requirement and an Edit button on home and history', () => {
  const { state, context, elements } = fixture();
  state.inventory.requests = [{ ...request, id: 'old', updated_at: '2026-09-25T10:00:00Z' }, request];
  context.renderStockRequests();
  assert.equal(elements.get('#ownerLatestRequirementPanel').style.display, '');
  assert.match(elements.get('#ownerLatestRequirement').innerHTML, /data-edit-stock-draft="req"/);
  assert.doesNotMatch(elements.get('#ownerLatestRequirement').innerHTML, /data-edit-stock-draft="old"/);
  assert.match(elements.get('#stockRequestList').innerHTML, /EDIT REQUIREMENT/);
});
test('processing, billed and completed requests are locked', () => {
  const { context } = fixture();
  assert.equal(context.canEditStockRequest(request), true);
  for (const change of [{ processing_started_at: '2026-09-27' }, { bill_id: 'bill' }, { status: 'PARTIAL' }, { status: 'FULFILLED' }, { status: 'CANCELLED' }, { created_by: 'other' }]) assert.equal(context.canEditStockRequest({ ...request, ...change }), false);
});
test('Admin cannot access Owner edit action and can release unbilled processing', () => {
  const { context } = fixture('ADMIN');
  assert.equal(context.canEditStockRequest(request), false);
  const card = context.stockRequestCard({ ...request, processing_started_at: '2026-09-27' });
  assert.match(card, /ALLOW OWNER TO EDIT/);
  assert.match(card, /CANCEL REQUEST/);
  assert.match(card, /VIEW OUTLET INVENTORY/);
  assert.doesNotMatch(card, /data-edit-stock-draft/);
});

test('fulfilled request links directly to its related bill and outlet inventory', () => {
  const { context } = fixture('ADMIN');
  const card = context.stockRequestCard({ ...request, status: 'FULFILLED', bill_id: 'bill-1' });
  assert.match(card, /data-request-view-bill="bill-1"/);
  assert.match(card, /data-request-view-stock="outlet"/);
  assert.doesNotMatch(card, /CANCEL REQUEST/);
});
test('requirement history filters the outlet while home shows latest assigned requirement', () => {
  const { state, context, elements } = fixture();
  state.inventory.requests = [{ ...request, outlet_id: 'other-outlet' }];
  context.renderStockRequests();
  assert.match(elements.get('#stockRequestList').innerHTML, /No requirements yet/);
  assert.match(elements.get('#ownerLatestRequirement').innerHTML, /EDIT REQUIREMENT/);
});

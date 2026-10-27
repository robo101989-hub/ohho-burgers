import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { wheelSlots } from '../lib/spin-rewards.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('let homeSpinBusy = false;'), app.indexOf("render('#locationGrid', '<p class=\"location-error\">Loading outlets…</p>');"));
const prizes = [{ type: 'FLAT', value: 20, label: '₹20 OFF' }, { type: 'FLAT', value: 30, label: '₹30 OFF' }, { type: 'FLAT', value: 40, label: '₹40 OFF' }, { type: 'PERCENT', value: 50, label: '50% OFF' }];
const saved = (name = 'Kairana', enabled = false) => ({ outlet: { name }, prizes, enabled, minimumOrder: 99 });
const response = data => ({ ok: true, json: async () => data });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetch, search = '') {
  const nodes = new Map();
  const focus = {};
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', dataset: {}, style: {}, listeners: {}, classList: { remove() {}, add() {} }, setAttribute(key, value) { this[key] = value; }, addEventListener(event, callback) { this.listeners[event] = callback; } });
    return nodes.get(id);
  };
  const context = vm.createContext({ $, fetch, wheelSlots, escapeHtml: v => v, URLSearchParams, location: { search }, window: { addEventListener(event, callback) { focus[event] = callback; } }, drawWheel: (node, slots) => { node.textContent = slots.map(p => p.label).join(', '); } });
  vm.runInContext(source + '\nthis.start = renderHomeSpinnerOutlets; this.check = checkHomeSpinOutlet;', context);
  return { $, context, focus };
}
const outlets = [{ slug: 'kairana', name: 'Kairana' }, { slug: 'shamli', name: 'Shamli' }];

test('homepage immediately loads saved rewards, minimum order and paused state', async () => {
  const calls = [];
  const f = fixture(async (...args) => { calls.push(args); return response(saved()); });
  f.context.start(outlets);
  await tick();
  assert.equal(f.$('#homeSpinOutlet').value, 'kairana');
  assert.equal(calls[0][0], '/api/spin?outlet=kairana');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.match(f.$('#homeSpinWheel').textContent, /₹20 OFF.*₹30 OFF.*₹40 OFF.*50% OFF/);
  assert.match(f.$('#homeSpinEligibility').textContent, /₹99\+/);
  assert.equal(f.$('#homeSpinButton').disabled, true);
  assert.match(f.$('#homeSpinMessage').textContent, /paused/);
});

test('QR outlet wins over the default and returning from dashboard reloads settings', async () => {
  let enabled = false, calls = 0;
  const f = fixture(async () => { calls++; return response(saved('Shamli', enabled)); }, '?outlet=shamli');
  f.context.start(outlets); await tick();
  assert.equal(f.$('#homeSpinOutlet').value, 'shamli');
  enabled = true; f.focus.focus(); await tick();
  assert.equal(calls, 2);
  assert.equal(f.$('#homeSpinButton').disabled, false);
});

test('late outlet responses cannot replace the newest selection', async () => {
  const pending = [];
  const f = fixture(() => new Promise(resolve => pending.push(resolve)));
  f.context.start(outlets);
  f.$('#homeSpinOutlet').value = 'shamli';
  f.$('#homeSpinOutlet').listeners.change();
  pending[1](response(saved('Shamli', false))); await tick();
  pending[0](response(saved('Kairana', true))); await tick();
  assert.equal(f.$('#homeSpinWheel')['aria-label'], 'Saved rewards for Shamli');
  assert.equal(f.$('#homeSpinButton').disabled, true);
});

test('clearing an outlet or a failed refresh removes stale rewards and disables spinning', async () => {
  let fail = false;
  const f = fixture(async () => { if (fail) throw new Error('Connection unavailable'); return response(saved('Kairana', true)); });
  f.context.start(outlets); await tick();
  fail = true; await f.context.check();
  assert.equal(f.$('#homeSpinWheel').textContent, 'Rewards unavailable');
  assert.equal(f.$('#homeSpinButton').disabled, true);
  f.$('#homeSpinOutlet').value = ''; f.$('#homeSpinOutlet').listeners.change(); await tick();
  assert.equal(f.$('#homeSpinWheel').textContent, 'Choose your outlet to see rewards.');
  assert.equal(f.$('#homeSpinEligibility').textContent, 'SELECT AN OUTLET TO SEE ELIGIBILITY');
});

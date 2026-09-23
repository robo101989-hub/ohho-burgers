import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function tokenFrom(req) {
  return (req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || null;
}

async function requireUser(req, res) {
  const token = tokenFrom(req);
  if (!token) { res.status(401).json({ error: 'Authentication required.' }); return null; }
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData?.user) { res.status(401).json({ error: 'Your session has expired.' }); return null; }
  const { data: profile } = await db.from('profiles').select('id,role,is_active').eq('id', authData.user.id).maybeSingle();
  if (!profile || profile.is_active === false || !['ADMIN','OWNER','MANAGER'].includes(profile.role)) {
    res.status(403).json({ error: 'Inventory access denied.' }); return null;
  }
  let outletIds = null;
  if (profile.role !== 'ADMIN') {
    const { data, error } = await db.from('outlet_users').select('outlet_id').eq('user_id', profile.id);
    if (error) { res.status(500).json({ error: 'Unable to verify outlet access.' }); return null; }
    outletIds = (data || []).map(row => row.outlet_id);
  }
  return { user: authData.user, profile, outletIds };
}

function allowed(auth, outletId) {
  return auth.profile.role === 'ADMIN' || auth.outletIds.includes(outletId);
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function baseQuantity(item, quantity, unit) {
  const value = Number(quantity);
  if (!(value > 0)) throw new Error('Every quantity must be greater than zero.');
  if (item.base_unit === 'G' && unit === 'KG') return value * 1000;
  if (item.base_unit === 'ML' && unit === 'L') return value * 1000;
  if (item.base_unit === unit) return value;
  throw new Error(`${item.name} must use ${item.display_unit}.`);
}

async function loadData(auth, req, res) {
  const requestedOutlet = String(req.query?.outletId || '').trim();
  if (requestedOutlet && !allowed(auth, requestedOutlet)) return res.status(403).json({ error: 'Outlet access denied.' });
  const scopedIds = requestedOutlet ? [requestedOutlet] : auth.outletIds;
  const [itemsResult, outletsResult] = await Promise.all([
    db.from('inventory_items').select('*').order('name'),
    db.from('outlets').select('id,name,slug').order('name')
  ]);
  if (itemsResult.error || outletsResult.error) return res.status(500).json({ error: 'Unable to load inventory setup.' });
  const outlets = (outletsResult.data || []).filter(outlet => !auth.outletIds || auth.outletIds.includes(outlet.id));
  const outletIds = requestedOutlet ? [requestedOutlet] : outlets.map(outlet => outlet.id);
  if (!outletIds.length) return res.status(200).json({ items: itemsResult.data || [], outlets, inventory: [], bills: [], movements: [] });

  let inventoryQuery = db.from('outlet_inventory').select('outlet_id,item_id,quantity_on_hand,updated_at').in('outlet_id', outletIds);
  let billsQuery = db.from('supply_bills').select('*,supply_bill_items(*),supply_bill_payments(*)').in('outlet_id', outletIds).order('supplied_at', { ascending: false }).limit(1000);
  let movementsQuery = db.from('inventory_movements').select('*').in('outlet_id', outletIds).order('occurred_at', { ascending: false }).limit(1000);
  const from = safeDate(req.query?.from);
  const to = safeDate(req.query?.to);
  if (from) { billsQuery = billsQuery.gte('supplied_at', from); movementsQuery = movementsQuery.gte('occurred_at', from); }
  if (to) { billsQuery = billsQuery.lt('supplied_at', to); movementsQuery = movementsQuery.lt('occurred_at', to); }
  const [inventoryResult, billsResult, movementsResult] = await Promise.all([inventoryQuery, billsQuery, movementsQuery]);
  if (inventoryResult.error || billsResult.error || movementsResult.error) return res.status(500).json({ error: 'Unable to load inventory records.' });
  return res.status(200).json({
    role: auth.profile.role,
    items: itemsResult.data || [], outlets,
    inventory: inventoryResult.data || [], bills: billsResult.data || [], movements: movementsResult.data || []
  });
}

async function createItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const name = String(body.name || '').trim().slice(0, 100);
  const sku = String(body.sku || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const baseUnit = ['G','ML','EACH'].includes(body.baseUnit) ? body.baseUnit : 'EACH';
  const displayUnit = ['G','KG','ML','L','EACH'].includes(body.displayUnit) ? body.displayUnit : baseUnit;
  if (!name || !sku) return res.status(400).json({ error: 'Item name and SKU are required.' });
  const { data, error } = await db.from('inventory_items').insert({
    name, sku, base_unit: baseUnit, display_unit: displayUnit,
    low_stock_threshold: Math.max(0, Number(body.lowStockThreshold || 0)),
    default_supply_price: Math.max(0, Number(body.defaultSupplyPrice || 0))
  }).select('*').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'An inventory item with this SKU already exists.' : 'Unable to create inventory item.' });
  return res.status(201).json({ item: data });
}

async function issueBill(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const outletId = String(body.outletId || '').trim();
  const rows = Array.isArray(body.items) ? body.items : [];
  if (!outletId || !rows.length || rows.length > 100) return res.status(400).json({ error: 'Select an outlet and add at least one item.' });
  const ids = [...new Set(rows.map(row => String(row.itemId || '')))].filter(Boolean);
  const { data: items, error: itemError } = await db.from('inventory_items').select('*').in('id', ids).eq('active', true);
  if (itemError || items?.length !== ids.length) return res.status(400).json({ error: 'One or more supplied items are invalid.' });
  const itemMap = new Map(items.map(item => [item.id, item]));
  let normalized;
  try {
    normalized = rows.map(row => {
      const item = itemMap.get(String(row.itemId));
      const quantity = Number(row.quantity);
      const unitPrice = Number(row.unitPrice);
      if (!item || !(unitPrice >= 0)) throw new Error('Enter valid quantities and prices.');
      return { item_id: item.id, item_name: item.name, unit: item.display_unit, quantity, base_quantity: baseQuantity(item, quantity, item.display_unit), unit_price: unitPrice };
    });
  } catch (error) { return res.status(400).json({ error: error.message }); }
  const { data: billId, error } = await db.rpc('issue_supply_bill', {
    p_outlet_id: outletId, p_items: normalized, p_notes: String(body.notes || '').trim() || null,
    p_supplied_at: safeDate(body.suppliedAt) || new Date().toISOString(), p_user: auth.user.id
  });
  if (error) { console.error('Supply bill error', error); return res.status(500).json({ error: error.message || 'Unable to generate supply bill.' }); }
  return res.status(201).json({ success: true, billId });
}

async function recordPayment(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const method = ['CASH','UPI','BANK','OTHER'].includes(body.method) ? body.method : 'OTHER';
  const { data, error } = await db.rpc('record_supply_payment', {
    p_bill_id: body.billId, p_amount: Number(body.amount), p_method: method,
    p_reference: String(body.reference || '').trim() || null, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to record payment.' });
  return res.status(200).json({ success: true, paymentStatus: data });
}

async function adjustStock(auth, body, res) {
  const outletId = String(body.outletId || '').trim();
  if (!allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  const type = ['USAGE','WASTE','ADJUSTMENT'].includes(body.movementType) ? body.movementType : null;
  let delta = Number(body.quantity);
  if (!type || !Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Enter a valid adjustment.' });
  if (['USAGE','WASTE'].includes(type)) delta = -Math.abs(delta);
  const { data, error } = await db.rpc('adjust_outlet_inventory', {
    p_outlet_id: outletId, p_item_id: body.itemId, p_delta: delta, p_type: type,
    p_notes: String(body.notes || '').trim() || null, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to adjust inventory.' });
  return res.status(200).json({ success: true, balance: data });
}

export default async function inventoryHandler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  try {
    if (req.method === 'GET') return loadData(auth, req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const action = req.body?.action;
    if (action === 'create_item') return createItem(auth, req.body, res);
    if (action === 'issue_bill') return issueBill(auth, req.body, res);
    if (action === 'record_payment') return recordPayment(auth, req.body, res);
    if (action === 'adjust_stock') return adjustStock(auth, req.body, res);
    return res.status(400).json({ error: 'Unknown inventory action.' });
  } catch (error) {
    console.error('Inventory API error', error);
    return res.status(500).json({ error: 'Inventory service is temporarily unavailable.' });
  }
}

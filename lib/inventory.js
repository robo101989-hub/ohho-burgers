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
  const [itemsResult, outletsResult, stockCategoriesResult, expenseCategoriesResult] = await Promise.all([
    db.from('inventory_items').select('*').order('name'),
    db.from('outlets').select('id,name,slug').order('name'),
    db.from('stock_categories').select('*').order('sort_order').order('name'),
    db.from('expense_categories').select('*').order('sort_order').order('name')
  ]);
  if (itemsResult.error || outletsResult.error || stockCategoriesResult.error || expenseCategoriesResult.error) return res.status(500).json({ error: 'Unable to load stock and expense setup.' });
  const outlets = (outletsResult.data || []).filter(outlet => !auth.outletIds || auth.outletIds.includes(outlet.id));
  const outletIds = requestedOutlet ? [requestedOutlet] : outlets.map(outlet => outlet.id);
  if (!outletIds.length) return res.status(200).json({ items: itemsResult.data || [], stockCategories: stockCategoriesResult.data || [], expenseCategories: expenseCategoriesResult.data || [], outlets, inventory: [], bills: [], movements: [], notifications: [], requests: [], expenses: [] });

  let inventoryQuery = db.from('outlet_inventory').select('outlet_id,item_id,quantity_on_hand,updated_at').in('outlet_id', outletIds);
  let billsQuery = db.from('supply_bills').select('*,supply_bill_items(*),supply_bill_payments(*)').in('outlet_id', outletIds).order('supplied_at', { ascending: false }).limit(1000);
  let movementsQuery = db.from('inventory_movements').select('*').in('outlet_id', outletIds).order('occurred_at', { ascending: false }).limit(1000);
  let notificationsQuery = db.from('inventory_notifications').select('*').in('outlet_id', outletIds).order('created_at', { ascending: false }).limit(50);
  let requestsQuery = db.from('franchise_stock_requests').select('*,franchise_stock_request_items(*)').in('outlet_id', outletIds).order('created_at', { ascending: false }).limit(500);
  let expensesQuery = db.from('daily_expenses').select('*,expense_categories(name)').in('outlet_id', outletIds).order('occurred_at', { ascending: false }).limit(1000);
  const from = safeDate(req.query?.from);
  const to = safeDate(req.query?.to);
  if (from) { billsQuery = billsQuery.gte('supplied_at', from); movementsQuery = movementsQuery.gte('occurred_at', from); }
  if (from) expensesQuery = expensesQuery.gte('occurred_at', from);
  if (to) { billsQuery = billsQuery.lt('supplied_at', to); movementsQuery = movementsQuery.lt('occurred_at', to); expensesQuery = expensesQuery.lt('occurred_at', to); }
  const [inventoryResult, billsResult, movementsResult, notificationsResult, requestsResult, expensesResult] = await Promise.all([inventoryQuery, billsQuery, movementsQuery, notificationsQuery, requestsQuery, expensesQuery]);
  if (inventoryResult.error || billsResult.error || movementsResult.error || notificationsResult.error || requestsResult.error || expensesResult.error) return res.status(500).json({ error: 'Unable to load inventory records.' });
  return res.status(200).json({
    role: auth.profile.role,
    items: itemsResult.data || [], stockCategories: stockCategoriesResult.data || [], expenseCategories: expenseCategoriesResult.data || [], outlets,
    inventory: inventoryResult.data || [], bills: billsResult.data || [], movements: movementsResult.data || [], notifications: notificationsResult.data || [],
    requests: requestsResult.data || [], expenses: (expensesResult.data || []).map(row => ({ ...row, category_name: row.expense_categories?.name || row.category, expense_categories: undefined }))
  });
}

async function updateItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const price = Number(body.defaultSupplyPrice);
  const threshold = Number(body.lowStockThreshold);
  const name = String(body.name || '').trim().slice(0, 100);
  const requestUnit = body.requestUnit === 'PIECE' ? 'PIECE' : 'KG';
  const displayUnit = body.displayUnit === 'KG' ? 'KG' : 'EACH';
  const baseUnit = displayUnit === 'KG' ? 'G' : 'EACH';
  if (!body.itemId || !name || !body.categoryId || !(price > 0) || !(threshold >= 0)) return res.status(400).json({ error: 'Enter the item name, category, fixed price and low-stock level.' });
  const { data, error } = await db.from('inventory_items').update({
    name, category_id: body.categoryId, request_unit: requestUnit, base_unit: baseUnit, display_unit: displayUnit,
    default_supply_price: price, low_stock_threshold: threshold, updated_at: new Date().toISOString()
  }).eq('id', body.itemId).select('*').single();
  if (error) return res.status(500).json({ error: 'Unable to update the fixed item price.' });
  return res.status(200).json({ item: data });
}

async function deleteItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  if (!body.itemId) return res.status(400).json({ error: 'Stock item is required.' });
  const { data, error } = await db.from('inventory_items').delete().eq('id', body.itemId).select('id').maybeSingle();
  if (!error && data) return res.status(200).json({ success: true, archived: false });
  if (error?.code !== '23503') return res.status(error ? 500 : 404).json({ error: error ? 'Unable to delete stock item.' : 'Stock item not found.' });
  const { data: archived, error: archiveError } = await db.from('inventory_items').update({ active: false, updated_at: new Date().toISOString() }).eq('id', body.itemId).select('id').maybeSingle();
  if (archiveError || !archived) return res.status(500).json({ error: 'Unable to archive stock item.' });
  return res.status(200).json({ success: true, archived: true });
}

async function createItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const name = String(body.name || '').trim().slice(0, 100);
  const sku = String(body.sku || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const displayUnit = body.displayUnit === 'KG' ? 'KG' : 'EACH';
  const baseUnit = displayUnit === 'KG' ? 'G' : 'EACH';
  const requestUnit = body.requestUnit === 'PIECE' ? 'PIECE' : 'KG';
  if (!name || !sku || !body.categoryId) return res.status(400).json({ error: 'Item name, SKU and category are required.' });
  const { data, error } = await db.from('inventory_items').insert({
    name, sku, category_id: body.categoryId, request_unit: requestUnit, base_unit: baseUnit, display_unit: displayUnit,
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
      const unitPrice = Number(item.default_supply_price);
      if (!item || !(unitPrice > 0)) throw new Error(`Set a fixed price for ${item?.name || 'this item'} before billing.`);
      return { item_id: item.id, item_name: item.name, unit: item.display_unit, quantity, base_quantity: baseQuantity(item, quantity, item.display_unit), unit_price: unitPrice };
    });
  } catch (error) { return res.status(400).json({ error: error.message }); }
  const { data: billId, error } = await db.rpc('issue_supply_bill', {
    p_outlet_id: outletId, p_items: normalized, p_notes: String(body.notes || '').trim() || null,
    p_supplied_at: safeDate(body.suppliedAt) || new Date().toISOString(), p_user: auth.user.id
  });
  if (error) { console.error('Supply bill error', error); return res.status(500).json({ error: error.message || 'Unable to generate supply bill.' }); }
  if (body.requestId) {
    const { data: request } = await db.from('franchise_stock_requests').select('id,franchise_stock_request_items(item_id)').eq('id', body.requestId).eq('outlet_id', outletId).maybeSingle();
    const supplied = new Set(normalized.map(row => row.item_id));
    const fullySupplied = Boolean(request) && (request.franchise_stock_request_items || []).every(row => supplied.has(row.item_id));
    await db.from('franchise_stock_requests').update({ status: fullySupplied ? 'FULFILLED' : 'PARTIAL', bill_id: billId, updated_at: new Date().toISOString() })
      .eq('id', body.requestId).eq('outlet_id', outletId).in('status', ['SUBMITTED','PARTIAL']);
  }
  return res.status(201).json({ success: true, billId });
}

async function submitStockRequest(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Franchise owner access required.' });
  const outletId = String(body.outletId || '').trim();
  if (!allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  const rows = Array.isArray(body.items) ? body.items : [];
  const ids = [...new Set(rows.map(row => String(row.itemId || '')))].filter(Boolean);
  const { data: items, error: itemError } = await db.from('inventory_items').select('*').in('id', ids).eq('active', true);
  if (itemError || !rows.length || items?.length !== ids.length) return res.status(400).json({ error: 'Select at least one valid stock item.' });
  const itemMap = new Map(items.map(item => [item.id, item]));
  const normalized = rows.map(row => {
    const item = itemMap.get(String(row.itemId));
    const unit = item.request_unit === 'PIECE' ? 'PIECE' : 'KG';
    return { item_id: item.id, item_name: item.name, unit, quantity: Number(row.quantity), fixed_unit_price: Number(item.default_supply_price || 0) };
  });
  const { data: requestId, error } = await db.rpc('submit_franchise_stock_request', {
    p_outlet_id: outletId, p_required_for: body.requiredFor, p_items: normalized,
    p_notes: String(body.notes || '').trim() || null, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to submit stock requirement.' });
  return res.status(201).json({ success: true, requestId });
}

async function loadExpenseCategory(categoryId) {
  if (!categoryId) return null;
  const { data } = await db.from('expense_categories').select('id,name,active').eq('id', categoryId).maybeSingle();
  return data?.active === false ? null : data;
}

async function addDailyExpense(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Only a franchise owner can add outlet expenses.' });
  const outletId = String(body.outletId || '').trim();
  if (!allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  const category = await loadExpenseCategory(body.categoryId);
  const description = String(body.description || '').trim().slice(0, 200);
  const amount = Number(body.amount);
  if (!category || !(amount > 0)) return res.status(400).json({ error: 'Select an expense category and enter an amount.' });
  const { data, error } = await db.from('daily_expenses').insert({ outlet_id: outletId, category_id: category.id, category: 'OTHER', description: description || category.name, amount, payment_method: 'OTHER', occurred_at: safeDate(body.occurredAt) || new Date().toISOString(), created_by: auth.user.id }).select('*').single();
  if (error) return res.status(500).json({ error: 'Unable to save daily expense.' });
  return res.status(201).json({ expense: data });
}

async function updateDailyExpense(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Only the owner who created an expense can edit it.' });
  const outletId = String(body.outletId || '').trim();
  if (!allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  const category = await loadExpenseCategory(body.categoryId);
  const amount = Number(body.amount);
  const description = String(body.description || '').trim().slice(0, 200);
  if (!body.expenseId || !category || !(amount > 0)) return res.status(400).json({ error: 'Select a category and enter an amount.' });
  const { data, error } = await db.from('daily_expenses').update({ outlet_id: outletId, category_id: category.id, description: description || category.name, amount, occurred_at: safeDate(body.occurredAt) || new Date().toISOString() }).eq('id', body.expenseId).eq('created_by', auth.user.id).in('outlet_id', auth.outletIds || []).select('*').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to update daily expense.' });
  if (!data) return res.status(404).json({ error: 'Expense not found or cannot be edited.' });
  return res.status(200).json({ expense: data });
}

async function deleteDailyExpense(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Only the owner who created an expense can delete it.' });
  const { data, error } = await db.from('daily_expenses').delete().eq('id', body.expenseId).eq('created_by', auth.user.id).in('outlet_id', auth.outletIds || []).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to delete daily expense.' });
  if (!data) return res.status(404).json({ error: 'Expense not found or cannot be deleted.' });
  return res.status(200).json({ success: true });
}

async function createCategory(auth, body, res, type) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Enter a category name.' });
  const table = type === 'stock' ? 'stock_categories' : 'expense_categories';
  const { data, error } = await db.from(table).insert({ name, created_by: auth.user.id }).select('*').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'This category already exists.' : 'Unable to create category.' });
  return res.status(201).json({ category: data });
}

async function updateCategory(auth, body, res, type) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const name = String(body.name || '').trim().slice(0, 80);
  if (!body.categoryId || !name) return res.status(400).json({ error: 'Category name is required.' });
  const table = type === 'stock' ? 'stock_categories' : 'expense_categories';
  const { data, error } = await db.from(table).update({ name, active: body.active !== false, updated_at: new Date().toISOString() }).eq('id', body.categoryId).select('*').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to update category.' });
  if (!data) return res.status(404).json({ error: 'Category not found.' });
  return res.status(200).json({ category: data });
}

async function deleteCategory(auth, body, res, type) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  if (!body.categoryId) return res.status(400).json({ error: 'Category is required.' });
  if (type === 'stock') {
    const { count, error: countError } = await db.from('inventory_items').select('id', { count: 'exact', head: true }).eq('category_id', body.categoryId).eq('active', true);
    if (countError) return res.status(500).json({ error: 'Unable to check category items.' });
    if (count > 0) return res.status(409).json({ error: 'This category still contains active items. Move or delete those items first.' });
  }
  const table = type === 'stock' ? 'stock_categories' : 'expense_categories';
  const { data, error } = await db.from(table).delete().eq('id', body.categoryId).select('id').maybeSingle();
  if (!error && data) return res.status(200).json({ success: true, archived: false });
  if (error?.code !== '23503') return res.status(error ? 500 : 404).json({ error: error ? 'Unable to delete category.' : 'Category not found.' });
  const { data: archived, error: archiveError } = await db.from(table).update({ active: false, updated_at: new Date().toISOString() }).eq('id', body.categoryId).select('id').maybeSingle();
  if (archiveError || !archived) return res.status(500).json({ error: 'Unable to archive category.' });
  return res.status(200).json({ success: true, archived: true });
}

async function markNotification(auth, body, res) {
  const { data: notification, error: loadError } = await db.from('inventory_notifications').select('id,outlet_id').eq('id', body.notificationId).maybeSingle();
  if (loadError || !notification || !allowed(auth, notification.outlet_id)) return res.status(404).json({ error: 'Notification not found.' });
  const { error } = await db.from('inventory_notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id);
  if (error) return res.status(500).json({ error: 'Unable to dismiss notification.' });
  return res.status(200).json({ success: true });
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

export default async function inventoryHandler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  try {
    if (req.method === 'GET') return loadData(auth, req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const action = req.body?.action;
    if (action === 'create_item') return createItem(auth, req.body, res);
    if (action === 'update_item') return updateItem(auth, req.body, res);
    if (action === 'delete_item') return deleteItem(auth, req.body, res);
    if (action === 'issue_bill') return issueBill(auth, req.body, res);
    if (action === 'submit_request') return submitStockRequest(auth, req.body, res);
    if (action === 'add_expense') return addDailyExpense(auth, req.body, res);
    if (action === 'update_expense') return updateDailyExpense(auth, req.body, res);
    if (action === 'delete_expense') return deleteDailyExpense(auth, req.body, res);
    if (action === 'create_stock_category') return createCategory(auth, req.body, res, 'stock');
    if (action === 'update_stock_category') return updateCategory(auth, req.body, res, 'stock');
    if (action === 'delete_stock_category') return deleteCategory(auth, req.body, res, 'stock');
    if (action === 'create_expense_category') return createCategory(auth, req.body, res, 'expense');
    if (action === 'update_expense_category') return updateCategory(auth, req.body, res, 'expense');
    if (action === 'delete_expense_category') return deleteCategory(auth, req.body, res, 'expense');
    if (action === 'record_payment') return recordPayment(auth, req.body, res);
    if (action === 'mark_notification') return markNotification(auth, req.body, res);
    return res.status(400).json({ error: 'Unknown inventory action.' });
  } catch (error) {
    console.error('Inventory API error', error);
    return res.status(500).json({ error: 'Inventory service is temporarily unavailable.' });
  }
}

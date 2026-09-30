import { createClient } from '@supabase/supabase-js';
import { normalizeLocalPurchase } from './local-purchases.js';
import { readAllRows } from './history.js';
import { convertRequestToBilling, convertToInventory, stockRequestUnit, flexibleUnitColumns, measurementColumns, normalizeRecipeQuantity, normalizeSupplyLine } from './inventory-measurements.js';

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

async function loadData(auth, req, res) {
  const requestedOutlet = String(req.query?.outletId || '').trim();
  if (requestedOutlet && !allowed(auth, requestedOutlet)) return res.status(403).json({ error: 'Outlet access denied.' });
  const [itemsResult, outletsResult, stockCategoriesResult, expenseCategoriesResult, menuItemsResult, menuCategoriesResult, recipesResult, packagingRulesResult, staffRulesResult] = await Promise.all([
    readAllRows(() => db.from('inventory_items').select('*').order('name').order('id')),
    readAllRows(() => db.from('outlets').select('id,name,slug,status,current_session_started_at').order('name').order('id')),
    readAllRows(() => db.from('stock_categories').select('*').order('sort_order').order('name').order('id')),
    readAllRows(() => db.from('expense_categories').select('*').order('sort_order').order('name').order('id')),
    readAllRows(() => db.from('menu_items').select('id,category_id,name,price,is_archived').eq('is_archived', false).order('name').order('id')),
    readAllRows(() => db.from('menu_categories').select('id,name,active').eq('active', true).order('display_order').order('name')),
    readAllRows(() => db.from('menu_item_recipes').select('*').order('menu_item_id').order('inventory_item_id')),
    readAllRows(() => db.from('inventory_packaging_rules').select('*').order('created_at').order('id')),
    readAllRows(() => db.from('staff_consumable_rules').select('*').order('created_at').order('id'))
  ]);
  if (itemsResult.error || outletsResult.error || stockCategoriesResult.error || expenseCategoriesResult.error || menuItemsResult.error || menuCategoriesResult.error || recipesResult.error || packagingRulesResult.error || staffRulesResult.error) return res.status(500).json({ error: 'Unable to load stock and expense setup.' });
  const outlets = (outletsResult.data || []).filter(outlet => !auth.outletIds || auth.outletIds.includes(outlet.id));
  const outletIds = requestedOutlet ? [requestedOutlet] : outlets.map(outlet => outlet.id);
  if (!outletIds.length) return res.status(200).json({ items: (itemsResult.data || []).filter(item => !item.local_outlet_id || !auth.outletIds || auth.outletIds.includes(item.local_outlet_id)), stockCategories: stockCategoriesResult.data || [], expenseCategories: expenseCategoriesResult.data || [], menuItems: menuItemsResult.data || [], menuCategories: menuCategoriesResult.data || [], recipes: recipesResult.data || [], packagingRules: packagingRulesResult.data || [], staffRules: staffRulesResult.data || [], staffEvents: [], openSessions: [], outlets, inventory: [], bills: [], movements: [], notifications: [], requests: [], expenses: [] });

  const from = safeDate(req.query?.from);
  const to = safeDate(req.query?.to);
  if ((req.query?.from && !from) || (req.query?.to && !to) || (from && to && from >= to)) {
    return res.status(400).json({ error: 'Choose a valid date range.' });
  }
  const historyQuery = (table, select, field) => () => {
    let query = db.from(table).select(select).in('outlet_id', outletIds)
      .order(field, { ascending: false }).order('id', { ascending: false });
    if (from) query = query.gte(field, from);
    if (to) query = query.lt(field, to);
    return query;
  };
  const [inventoryResult, billsResult, movementsResult, notificationsResult, requestsResult, expensesResult, openingResult, staffEventsResult, openSessionsResult] = await Promise.all([
    readAllRows(() => db.from('outlet_inventory').select('outlet_id,item_id,quantity_on_hand,updated_at').in('outlet_id', outletIds).order('outlet_id').order('item_id')),
    readAllRows(historyQuery('supply_bills', '*,supply_bill_items(*),supply_bill_payments(*)', 'supplied_at')),
    readAllRows(historyQuery('inventory_movements', '*', 'occurred_at')),
    db.from('inventory_notifications').select('*').in('outlet_id', outletIds).is('read_at', null).order('created_at', { ascending: false }).limit(50),
    readAllRows(() => db.from('franchise_stock_requests').select('*,franchise_stock_request_items(*)').in('outlet_id', outletIds).order('created_at', { ascending: false }).order('id')),
    readAllRows(historyQuery('daily_expenses', '*,expense_categories(name)', 'occurred_at')),
    readAllRows(() => db.from('inventory_opening_stock_events').select('*,inventory_opening_stock_items(*)').in('outlet_id', outletIds).order('confirmed_at', { ascending: false }).order('id')),
    readAllRows(() => db.from('staff_consumption_events').select('*,staff_consumption_event_items(*)').in('outlet_id', outletIds).order('confirmed_at', { ascending: false }).order('id')),
    readAllRows(() => db.from('outlet_sales_sessions').select('id,outlet_id,opened_at,closed_at').in('outlet_id', outletIds).order('opened_at', { ascending: false }).order('id'))
  ]);
  if (notificationsResult.error || staffEventsResult.error || openSessionsResult.error) throw notificationsResult.error || staffEventsResult.error || openSessionsResult.error;
  return res.status(200).json({
    role: auth.profile.role,
    items: (itemsResult.data || []).filter(item => !item.local_outlet_id || !auth.outletIds || auth.outletIds.includes(item.local_outlet_id)), stockCategories: stockCategoriesResult.data || [], expenseCategories: expenseCategoriesResult.data || [], menuItems: menuItemsResult.data || [], menuCategories: menuCategoriesResult.data || [], recipes: recipesResult.data || [], packagingRules: packagingRulesResult.data || [], staffRules: staffRulesResult.data || [], staffEvents: staffEventsResult.data || [], openSessions: (openSessionsResult.data || []).filter(row => !row.closed_at), latestSessions: [...new Map((openSessionsResult.data || []).slice().reverse().map(row => [row.outlet_id, row])).values()], outlets,
    inventory: inventoryResult.data || [], bills: billsResult.data || [], movements: movementsResult.data || [], notifications: notificationsResult.data || [],
    requests: (requestsResult.data || []).filter(row => row.status !== 'DRAFT' || (auth.profile.role === 'OWNER' && row.created_by === auth.user.id)),
    expenses: (expensesResult.data || []).map(row => ({ ...row, category_name: row.expense_categories?.name || row.category, expense_categories: undefined })),
    openingStockEvents: openingResult.data || []
  });
}

async function updateItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const price = Number(body.defaultSupplyPrice);
  const threshold = Number(body.lowStockThreshold);
  const targetStockLevel = Number(body.targetStockLevel);
  const name = String(body.name || '').trim().slice(0, 100);
  let units;
  try { units = body.supplyUnit && body.inventoryUnit ? flexibleUnitColumns(body.supplyUnit, body.inventoryUnit, body.requestUnit, body.requestConversion, body.billingConversion) : measurementColumns(body.measurementType); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (!body.itemId || !name || !body.categoryId || !(price > 0) || !(threshold >= 0) || !(targetStockLevel >= 0)) return res.status(400).json({ error: 'Enter the item name, category, fixed price, low-stock level and target stock.' });
  const finalValues = {
    name, category_id: body.categoryId, request_unit: units.request_unit, billing_unit: units.billing_unit,
    inventory_unit: units.inventory_unit, request_to_inventory: units.request_to_inventory,
    billing_to_inventory: units.billing_to_inventory, active: body.active !== false,
    default_supply_price: price, low_stock_threshold: threshold, target_stock_level: targetStockLevel
  };
  let { data, error } = await db.rpc('update_inventory_master_item', {
    p_item_id: body.itemId, p_user: auth.user.id, p_values: finalValues
  });

  // Older production functions require billing and inventory units to be
  // changed in separate calls. Keep that database safeguard compatible while
  // presenting one direct Save action to Admin. The replacement migration
  // handles the same edit atomically, so this fallback becomes unnecessary as
  // soon as that migration is present.
  if (error?.message?.includes('Change the billing unit first')) {
    const { data: current, error: currentError } = await db.from('inventory_items')
      .select('name,category_id,request_unit,billing_unit,inventory_unit,request_to_inventory,billing_to_inventory,default_supply_price,low_stock_threshold,target_stock_level,active')
      .eq('id', body.itemId).maybeSingle();
    if (currentError || !current) return res.status(400).json({ error: currentError?.message || 'Unable to load the current Master Item.' });

    const intermediateValues = {
      name: current.name,
      category_id: current.category_id,
      request_unit: current.request_unit,
      billing_unit: units.billing_unit,
      inventory_unit: current.inventory_unit,
      request_to_inventory: current.request_to_inventory,
      billing_to_inventory: current.billing_to_inventory,
      active: current.active !== false,
      default_supply_price: current.default_supply_price,
      low_stock_threshold: current.low_stock_threshold,
      target_stock_level: current.target_stock_level
    };
    const intermediate = await db.rpc('update_inventory_master_item', {
      p_item_id: body.itemId, p_user: auth.user.id, p_values: intermediateValues
    });
    if (intermediate.error) return res.status(400).json({ error: intermediate.error.message || 'Unable to prepare the Master Item unit change.' });
    ({ data, error } = await db.rpc('update_inventory_master_item', {
      p_item_id: body.itemId, p_user: auth.user.id, p_values: finalValues
    }));
  }

  if (error) return res.status(400).json({ error: error.message || 'Unable to update the Master Item.' });
  return res.status(200).json({ item: data });
}

async function deleteItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  if (!body.itemId) return res.status(400).json({ error: 'Stock item is required.' });
  const { data: archived, error } = await db.from('inventory_items').update({ active: false, updated_at: new Date().toISOString() }).eq('id', body.itemId).select('id').maybeSingle();
  if (error || !archived) return res.status(error ? 500 : 404).json({ error: error ? 'Unable to deactivate stock item.' : 'Stock item not found.' });
  return res.status(200).json({ success: true, archived: true });
}

async function createItem(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const name = String(body.name || '').trim().slice(0, 100);
  const sku = String(body.sku || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let units;
  try { units = body.supplyUnit && body.inventoryUnit ? flexibleUnitColumns(body.supplyUnit, body.inventoryUnit, body.requestUnit, body.requestConversion, body.billingConversion) : measurementColumns(body.measurementType); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (!name || !sku || !body.categoryId) return res.status(400).json({ error: 'Item name, SKU and category are required.' });
  const { data, error } = await db.from('inventory_items').insert({
    name, sku, category_id: body.categoryId, ...units,
    low_stock_threshold: Math.max(0, Number(body.lowStockThreshold || 0)),
    target_stock_level: Math.max(0, Number(body.targetStockLevel || 0)),
    default_supply_price: Math.max(0, Number(body.defaultSupplyPrice || 0))
  }).select('*').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'An inventory item with this SKU already exists.' : 'Unable to create inventory item.' });
  return res.status(201).json({ item: data });
}

async function savePackagingRule(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const orderTypes = [...new Set(Array.isArray(body.orderTypes) ? body.orderTypes.map(value => String(value).toUpperCase()) : [])];
  const consumptionType = String(body.consumptionType || '').toUpperCase();
  const packagingGroup = String(body.packagingGroup || '').toUpperCase();
  const quantity = Number(body.quantity);
  const orderSizeTier = String(body.orderSizeTier || '').toUpperCase();
  const minimumOrderItemCount = Number(body.minimumOrderItemCount);
  const maximumOrderItemCount = body.maximumOrderItemCount === '' || body.maximumOrderItemCount == null ? null : Number(body.maximumOrderItemCount);
  const sizeRuleTypes = ['PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'];
  if (!body.itemId || !orderTypes.length || orderTypes.some(value => !['DINE_IN','TAKEAWAY','DELIVERY'].includes(value)) || !['PER_ORDER','PER_MENU_ITEM','PER_MENU_CATEGORY',...sizeRuleTypes].includes(consumptionType) || !(quantity > 0)) {
    return res.status(400).json({ error: 'Choose the packaging item, order types, consumption rule and quantity.' });
  }
  if (sizeRuleTypes.includes(consumptionType) && (!['BROWN_BAG','CARRY_BAG'].includes(packagingGroup) || !['SMALL','MEDIUM','LARGE'].includes(orderSizeTier))) return res.status(400).json({ error: 'Choose a packaging group and size.' });
  if (consumptionType === 'PER_ORDER_SIZE' && (!Number.isInteger(minimumOrderItemCount) || minimumOrderItemCount < 1)) return res.status(400).json({ error: 'Enter the minimum total item count for this bag size.' });
  if (consumptionType === 'PER_ORDER_SIZE' && maximumOrderItemCount !== null && (!Number.isInteger(maximumOrderItemCount) || maximumOrderItemCount < minimumOrderItemCount)) return res.status(400).json({ error: 'The item-count upper limit must be a whole number at least as high as the lower limit.' });
  if (['PER_MENU_ITEM','MINIMUM_ITEM_SIZE'].includes(consumptionType) && !body.menuItemId) return res.status(400).json({ error: 'Choose the mapped menu item.' });
  if (['PER_MENU_CATEGORY','MINIMUM_CATEGORY_SIZE'].includes(consumptionType) && !body.menuCategoryId) return res.status(400).json({ error: 'Choose the mapped menu category.' });
  if (['MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'].includes(consumptionType)) {
    const { data: tierRule, error: tierError } = await db.from('inventory_packaging_rules').select('item_id,order_types').eq('active', true).eq('packaging_group', packagingGroup).eq('consumption_type', 'PER_ORDER_SIZE').eq('order_size_tier', orderSizeTier).limit(1).maybeSingle();
    if (tierError) return res.status(500).json({ error: 'Unable to verify the package size rule.' });
    if (!tierRule || tierRule.item_id !== body.itemId || orderTypes.some(type => !(tierRule.order_types || []).includes(type))) return res.status(400).json({ error: 'Create the matching order-size tier first and use its stock item and order types.' });
  }
  const values = {
    item_id: body.itemId, order_types: orderTypes, consumption_type: consumptionType,
    consumption_quantity: quantity,
    packaging_group: sizeRuleTypes.includes(consumptionType) ? packagingGroup : null,
    order_size_tier: sizeRuleTypes.includes(consumptionType) ? orderSizeTier : null,
    minimum_order_item_count: consumptionType === 'PER_ORDER_SIZE' ? minimumOrderItemCount : null,
    maximum_order_item_count: consumptionType === 'PER_ORDER_SIZE' ? maximumOrderItemCount : null,
    menu_item_id: ['PER_MENU_ITEM','MINIMUM_ITEM_SIZE'].includes(consumptionType) ? body.menuItemId : null,
    menu_category_id: ['PER_MENU_CATEGORY','MINIMUM_CATEGORY_SIZE'].includes(consumptionType) ? body.menuCategoryId : null,
    active: body.active !== false, updated_at: new Date().toISOString()
  };
  const query = body.ruleId
    ? db.from('inventory_packaging_rules').update(values).eq('id', body.ruleId)
    : db.from('inventory_packaging_rules').insert(values);
  const { data, error } = await query.select('*').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'This packaging rule already exists.' : 'Unable to save packaging rule.' });
  return res.status(body.ruleId ? 200 : 201).json({ rule: data });
}

async function deactivatePackagingRule(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const { data, error } = await db.from('inventory_packaging_rules').update({ active: false, updated_at: new Date().toISOString() }).eq('id', body.ruleId).select('id').maybeSingle();
  if (error || !data) return res.status(error ? 500 : 404).json({ error: error ? 'Unable to deactivate packaging rule.' : 'Packaging rule not found.' });
  return res.status(200).json({ success: true });
}

async function saveStaffConsumableRule(auth, body, res) {
  if (!['ADMIN','OWNER'].includes(auth.profile.role)) return res.status(403).json({ error: 'Admin or Owner access required.' });
  const quantity = Number(body.quantityPerStaff);
  const consumptionBasis = body.consumptionBasis === 'PER_SESSION' ? 'PER_SESSION' : 'PER_STAFF';
  if (!body.itemId || !(quantity > 0)) return res.status(400).json({ error: 'Choose a stock item and enter its consumption quantity.' });
  const { data: item } = await db.from('inventory_items').select('id,active').eq('id', body.itemId).maybeSingle();
  if (!item || item.active === false) return res.status(400).json({ error: 'Choose an active stock item.' });
  const values = { item_id: item.id, quantity_per_staff: quantity, consumption_basis: consumptionBasis, active: true, created_by: auth.user.id, updated_at: new Date().toISOString() };
  const query = body.ruleId
    ? db.from('staff_consumable_rules').update(values).eq('id', body.ruleId)
    : db.from('staff_consumable_rules').upsert(values, { onConflict: 'item_id' });
  const { data, error } = await query.select('*').single();
  if (error) return res.status(500).json({ error: 'Unable to save the staff consumable rule.' });
  return res.status(body.ruleId ? 200 : 201).json({ rule: data });
}

async function deactivateStaffConsumableRule(auth, body, res) {
  if (!['ADMIN','OWNER'].includes(auth.profile.role)) return res.status(403).json({ error: 'Admin or Owner access required.' });
  const { data, error } = await db.from('staff_consumable_rules').update({ active: false, updated_at: new Date().toISOString() }).eq('id', body.ruleId).select('id').maybeSingle();
  if (error || !data) return res.status(error ? 500 : 404).json({ error: error ? 'Unable to deactivate the rule.' : 'Staff consumable rule not found.' });
  return res.status(200).json({ success: true });
}

async function confirmStaffConsumption(auth, body, res) {
  if (!['ADMIN','OWNER','MANAGER'].includes(auth.profile.role)) return res.status(403).json({ error: 'Admin, Owner or Manager access required.' });
  const outletId = String(body.outletId || '').trim();
  const staffCount = Number(body.staffCount);
  if (!outletId || !allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  if (!Number.isInteger(staffCount) || staffCount <= 0 || staffCount > 100) return res.status(400).json({ error: 'Enter the number of staff working in this session.' });
  const { data, error } = await db.rpc('confirm_staff_consumption', { p_outlet_id: outletId, p_staff_count: staffCount, p_user: auth.user.id });
  if (error) return res.status(400).json({ error: error.message || 'Unable to confirm staff consumption.' });
  return res.status(201).json({ success: true, eventId: data });
}

async function recordLocalPurchase(auth, body, res) {
  const outletId = String(body.outletId || '').trim();
  if (!outletId || !allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.entryKey || '')) return res.status(400).json({ error: 'Refresh the purchase form and try again.' });
  const { data: items, error: itemError } = body.itemId ? await db.from('inventory_items').select('*').eq('id', body.itemId) : { data: [], error: null };
  if (itemError) return res.status(400).json({ error: 'Unable to load the stock item.' });
  let purchase;
  try { purchase = normalizeLocalPurchase(body, items); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { data, error } = await db.rpc('record_local_purchase', { p_outlet_id: outletId, p_entry_key: body.entryKey, p_purchase: purchase, p_user: auth.user.id });
  if (error) return res.status(400).json({ error: error.code === 'PGRST202' ? 'Local purchases are not available yet. Please contact Admin.' : error.message || 'Unable to save local purchase.' });
  return res.status(201).json({ success: true, billId: data });
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
    normalized = rows.map(row => normalizeSupplyLine(itemMap.get(String(row.itemId)), row));
  } catch (error) { return res.status(400).json({ error: error.message }); }
  if (body.requestId) {
    const { data: request } = await db.from('franchise_stock_requests').select('id').eq('id', body.requestId).eq('outlet_id', outletId).maybeSingle();
    if (!request) return res.status(404).json({ error: 'Requirement not found for this outlet.' });
    const { error: lockError } = await db.rpc('set_stock_request_processing', { p_request_id: body.requestId, p_start: true, p_expected_updated_at: body.requestUpdatedAt || null });
    if (lockError) return res.status(409).json({ error: lockError.message });
  }
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
  if (body.receiveNow === true) {
    const { error: receiptError } = await db.rpc('confirm_supply_receipt', {
      p_bill_id: billId, p_user: auth.user.id, p_received_at: safeDate(body.suppliedAt) || new Date().toISOString()
    });
    if (receiptError) return res.status(400).json({ error: receiptError.message || 'Bill created, but direct inventory receipt could not be completed.', billId });
  }
  return res.status(201).json({ success: true, billId, receivedNow: body.receiveNow === true });
}

async function confirmSupplyReceipt(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Only the assigned outlet owner can confirm stock receipt.' });
  const { data: bill, error: loadError } = await db.from('supply_bills').select('id,outlet_id,receipt_status').eq('id', body.billId).maybeSingle();
  if (loadError || !bill || !allowed(auth, bill.outlet_id)) return res.status(404).json({ error: 'Supply bill not found.' });
  if (bill.receipt_status === 'RECEIVED') return res.status(200).json({ success: true, alreadyReceived: true });
  const { data, error } = await db.rpc('confirm_supply_receipt', {
    p_bill_id: bill.id, p_user: auth.user.id, p_received_at: new Date().toISOString()
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to confirm stock receipt.' });
  return res.status(200).json({ success: true, alreadyReceived: data === false });
}

async function saveRecipeIngredient(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const quantity = Number(body.quantity);
  const usageType = ['FOOD','TAKEAWAY_DELIVERY','DINE_IN'].includes(body.usageType) ? body.usageType : (body.isPackaging === true ? 'TAKEAWAY_DELIVERY' : 'FOOD');
  if (!body.menuItemId || !body.itemId || !(quantity > 0)) return res.status(400).json({ error: 'Choose a menu item, stock item and quantity.' });
  const [{ data: item }, { data: menuItem }] = await Promise.all([
    db.from('inventory_items').select('id,name,base_unit,display_unit,active').eq('id', body.itemId).maybeSingle(),
    db.from('menu_items').select('id,name,is_archived').eq('id', body.menuItemId).maybeSingle()
  ]);
  if (!item || item.active === false || !menuItem || menuItem.is_archived) return res.status(400).json({ error: 'The selected menu or stock item is unavailable.' });
  let baseQuantity;
  try { baseQuantity = normalizeRecipeQuantity(item, quantity, body.quantityUnit); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { data, error } = await db.from('menu_item_recipes').upsert({
    menu_item_id: menuItem.id, inventory_item_id: item.id, base_quantity: baseQuantity,
    usage_type: usageType, is_packaging: usageType !== 'FOOD'
  }, { onConflict: 'menu_item_id,inventory_item_id' }).select('*').single();
  if (error) return res.status(500).json({ error: 'Unable to save this recipe ingredient.' });
  return res.status(200).json({ recipe: data });
}

async function recordWastage(auth, body, res) {
  if (auth.profile.role !== 'OWNER') return res.status(403).json({ error: 'Only the assigned outlet owner can record wastage.' });
  const outletId = String(body.outletId || '').trim();
  if (!allowed(auth, outletId)) return res.status(403).json({ error: 'Outlet access denied.' });
  const type = body.type === 'STOCK_ITEM' ? 'STOCK_ITEM' : 'MENU_ITEM';
  const quantity = Number(body.quantity);
  if (!(quantity > 0)) return res.status(400).json({ error: 'Enter a valid wastage quantity.' });
  let baseQuantity = null;
  if (type === 'STOCK_ITEM') {
    const { data: item } = await db.from('inventory_items').select('id,base_unit,display_unit,request_unit,active').eq('id', body.stockItemId).maybeSingle();
    if (!item || item.active === false) return res.status(400).json({ error: 'Choose a valid stock item.' });
    const displayQuantity = item.request_unit === 'PIECE' ? Math.round(quantity) : quantity;
    baseQuantity = item.base_unit === 'G' && item.display_unit === 'KG' ? displayQuantity * 1000 : displayQuantity;
  }
  const reasons = ['BURNT','DAMAGED_DROPPED','SPOILED_EXPIRED','PREPARATION_WASTE','OTHER'];
  const reason = reasons.includes(body.reason) ? body.reason : 'OTHER';
  const { data, error } = await db.rpc('record_kitchen_wastage', {
    p_outlet_id: outletId, p_type: type,
    p_menu_item_id: type === 'MENU_ITEM' ? body.menuItemId : null,
    p_stock_item_id: type === 'STOCK_ITEM' ? body.stockItemId : null,
    p_quantity: quantity, p_base_quantity: baseQuantity, p_reason: reason,
    p_packaging_used: type === 'MENU_ITEM' && body.packagingUsed === true,
    p_note: String(body.note || '').trim().slice(0, 500) || null, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to record wastage.' });
  return res.status(201).json({ success: true, wastageId: data });
}

async function deleteRecipeIngredient(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const { data, error } = await db.from('menu_item_recipes').delete()
    .eq('menu_item_id', body.menuItemId).eq('inventory_item_id', body.itemId)
    .select('menu_item_id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to remove this recipe ingredient.' });
  if (!data) return res.status(404).json({ error: 'Recipe ingredient not found.' });
  return res.status(200).json({ success: true });
}

async function setOpeningStock(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const outletId = String(body.outletId || '').trim();
  const rows = Array.isArray(body.items) ? body.items : [];
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!outletId || !rows.length || rows.length > 500) return res.status(400).json({ error: 'Select an outlet and enter at least one physical stock quantity.' });
  const itemIds = [...new Set(rows.map(row => String(row.itemId || '')))].filter(Boolean);
  const { data: items, error: itemError } = await db.from('inventory_items').select('id,base_unit,inventory_unit,active').in('id', itemIds).eq('active', true);
  if (itemError || items?.length !== itemIds.length) return res.status(400).json({ error: 'One or more opening stock items are invalid.' });
  const itemMap = new Map(items.map(item => [item.id, item]));
  const normalized = rows.map(row => {
    const item = itemMap.get(String(row.itemId));
    let quantity = Number(row.quantity);
    if ((item.inventory_unit || item.base_unit) === 'EACH') quantity = Math.round(quantity);
    return { item_id: item.id, quantity };
  });
  if (normalized.some(row => !(row.quantity >= 0))) return res.status(400).json({ error: 'Opening stock quantities must be zero or greater.' });
  const { data: previous } = await db.from('inventory_opening_stock_events').select('id').eq('outlet_id', outletId).limit(1);
  if (previous?.length && reason.length < 3) return res.status(400).json({ error: 'Enter a reason for this stock correction.' });
  const { data, error } = await db.rpc('set_inventory_opening_stock', { p_outlet_id: outletId, p_items: normalized, p_reason: reason || null, p_user: auth.user.id });
  if (error) return res.status(400).json({ error: error.message || 'Unable to confirm opening stock.' });
  return res.status(201).json({ success: true, eventId: data, correction: Boolean(previous?.length) });
}

async function setRequestProcessing(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const { error } = await db.rpc('set_stock_request_processing', { p_request_id: body.requestId, p_start: body.start !== false });
  if (error) return res.status(409).json({ error: error.message });
  const { data: request, error: readError } = await db.from('franchise_stock_requests').select('*,franchise_stock_request_items(*)').eq('id', body.requestId).single();
  if (readError) return res.status(500).json({ error: 'Unable to reload requirement. Refresh and try again.' });
  return res.status(200).json({ request });
}

async function cancelStockRequest(auth, body, res) {
  if (auth.profile.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
  const { data, error } = await db.from('franchise_stock_requests').update({
    status: 'CANCELLED', processing_started_at: null, updated_at: new Date().toISOString()
  }).eq('id', body.requestId).in('status', ['SUBMITTED','PARTIAL']).is('bill_id', null)
    .select('*,franchise_stock_request_items(*)').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to cancel this requirement.' });
  if (!data) return res.status(409).json({ error: 'Only an active requirement without a supply bill can be cancelled.' });
  return res.status(200).json({ request: data });
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
    const unit = (row.unit === 'EACH' ? 'PIECE' : row.unit) || stockRequestUnit(item);
    const quantity = Number(row.quantity);
    return { item_id: item.id, item_name: item.name, unit, quantity, fixed_unit_price: Number(item.default_supply_price || 0), billing_quantity: convertRequestToBilling(item, quantity), billing_unit: item.billing_unit || item.supply_unit, inventory_quantity: convertToInventory(item, quantity, 'request'), inventory_unit: item.inventory_unit || item.base_unit, request_to_inventory: Number(item.request_to_inventory || 1), billing_to_inventory: Number(item.billing_to_inventory || 1) };
  });
  const { data: requestId, error } = await db.rpc('submit_franchise_stock_request', {
    p_outlet_id: outletId, p_required_for: body.requiredFor, p_items: normalized,
    p_notes: String(body.notes || '').trim() || null, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to submit stock requirement.' });
  return res.status(201).json({ success: true, requestId });
}

async function saveStockRequest(auth, body, res) {
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
    const unit = (row.unit === 'EACH' ? 'PIECE' : row.unit) || stockRequestUnit(item);
    let quantity = Number(row.quantity);
    if (['PIECE','BOTTLE','PACK','CAN','BOX'].includes(unit)) quantity = Math.max(1, Math.round(quantity));
    return { item_id: item.id, item_name: item.name, unit, quantity, fixed_unit_price: Number(item.default_supply_price || 0), billing_quantity: convertRequestToBilling(item, quantity), billing_unit: item.billing_unit || item.supply_unit, inventory_quantity: convertToInventory(item, quantity, 'request'), inventory_unit: item.inventory_unit || item.base_unit, request_to_inventory: Number(item.request_to_inventory || 1), billing_to_inventory: Number(item.billing_to_inventory || 1) };
  });
  if (normalized.some(row => !(row.quantity > 0))) return res.status(400).json({ error: 'Every requirement quantity must be greater than zero.' });
  if (normalized.some(row => ![stockRequestUnit(itemMap.get(row.item_id)), itemMap.get(row.item_id).supply_unit, itemMap.get(row.item_id).request_unit].includes(row.unit))) return res.status(400).json({ error: 'Invalid requirement unit. Refresh and try again.' });
  const status = body.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT';
  const { data: requestId, error } = await db.rpc('save_franchise_stock_request', {
    p_request_id: body.requestId || null, p_outlet_id: outletId, p_required_for: body.requiredFor,
    p_items: normalized, p_notes: String(body.notes || '').trim() || null,
    p_status: status, p_user: auth.user.id
  });
  if (error) return res.status(400).json({ error: error.message || 'Unable to save stock requirement.' });
  return res.status(200).json({ success: true, requestId, status });
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
    if (req.method === 'GET') return await loadData(auth, req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const action = req.body?.action;
    if (action === 'create_item') return await createItem(auth, req.body, res);
    if (action === 'update_item') return await updateItem(auth, req.body, res);
    if (action === 'delete_item') return await deleteItem(auth, req.body, res);
    if (action === 'save_packaging_rule') return await savePackagingRule(auth, req.body, res);
    if (action === 'deactivate_packaging_rule') return await deactivatePackagingRule(auth, req.body, res);
    if (action === 'save_staff_consumable_rule') return await saveStaffConsumableRule(auth, req.body, res);
    if (action === 'deactivate_staff_consumable_rule') return await deactivateStaffConsumableRule(auth, req.body, res);
    if (action === 'confirm_staff_consumption') return await confirmStaffConsumption(auth, req.body, res);
    if (action === 'record_local_purchase') return await recordLocalPurchase(auth, req.body, res);
    if (action === 'issue_bill') return await issueBill(auth, req.body, res);
    if (action === 'confirm_receipt') return await confirmSupplyReceipt(auth, req.body, res);
    if (action === 'save_recipe') return await saveRecipeIngredient(auth, req.body, res);
    if (action === 'delete_recipe') return await deleteRecipeIngredient(auth, req.body, res);
    if (action === 'set_opening_stock') return await setOpeningStock(auth, req.body, res);
    if (action === 'set_request_processing') return await setRequestProcessing(auth, req.body, res);
    if (action === 'cancel_request') return await cancelStockRequest(auth, req.body, res);
    if (action === 'record_wastage') return await recordWastage(auth, req.body, res);
    if (action === 'submit_request') return await submitStockRequest(auth, req.body, res);
    if (action === 'save_request') return await saveStockRequest(auth, req.body, res);
    if (action === 'add_expense') return await addDailyExpense(auth, req.body, res);
    if (action === 'update_expense') return await updateDailyExpense(auth, req.body, res);
    if (action === 'delete_expense') return await deleteDailyExpense(auth, req.body, res);
    if (action === 'create_stock_category') return await createCategory(auth, req.body, res, 'stock');
    if (action === 'update_stock_category') return await updateCategory(auth, req.body, res, 'stock');
    if (action === 'delete_stock_category') return await deleteCategory(auth, req.body, res, 'stock');
    if (action === 'create_expense_category') return await createCategory(auth, req.body, res, 'expense');
    if (action === 'update_expense_category') return await updateCategory(auth, req.body, res, 'expense');
    if (action === 'delete_expense_category') return await deleteCategory(auth, req.body, res, 'expense');
    if (action === 'record_payment') return await recordPayment(auth, req.body, res);
    if (action === 'mark_notification') return await markNotification(auth, req.body, res);
    return res.status(400).json({ error: 'Unknown inventory action.' });
  } catch (error) {
    console.error('Inventory API error', error);
    return res.status(500).json({ error: 'Inventory service is temporarily unavailable.' });
  }
}

import { supabase } from './supabase.js';

const state = {
  session: null,
  profile: null,
  outlets: [],
  selectedOutlet: 'ALL',
  pos: {
    items: [],
    categories: [],
    activeCategory: 'ALL',
    orderType: 'TAKEAWAY',
    tableNumber: '',
    paymentMethod: 'CASH',
    cart: []
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .auth-gate{position:fixed;inset:0;z-index:9999;background:#080808;display:grid;place-items:center;padding:24px}
    .auth-gate.hidden{display:none}
    .auth-card{width:min(430px,100%);background:#0d0d0d;border:1px solid #292929;border-radius:18px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.45)}
    .auth-brand{font-weight:950;font-size:32px;letter-spacing:-2px;line-height:.85}.auth-brand span{display:block;color:#ffd21c;margin-top:5px}
    .auth-kicker{margin:18px 0 7px;color:#ffd21c;font-size:10px;font-weight:950;letter-spacing:2px;text-transform:uppercase}
    .auth-title{margin:0;font-size:25px;letter-spacing:-1px}.auth-copy{color:#888;font-size:12px;line-height:1.6;margin:9px 0 22px}
    .auth-form{display:grid;gap:10px}.auth-form input{width:100%;background:#090909;border:1px solid #303030;color:#fff;border-radius:10px;padding:13px 14px;outline:0;font-size:13px}.auth-form input:focus{border-color:#ffd21c}
    .auth-submit{border:0;background:#ffd21c;color:#080808;border-radius:10px;padding:13px 15px;font-size:11px;font-weight:950;letter-spacing:.6px;margin-top:3px}.auth-submit:disabled{opacity:.55;cursor:wait}
    .auth-error{display:none;color:#ff8c8c;background:#241111;border:1px solid #4a2020;border-radius:9px;padding:10px;font-size:11px;line-height:1.45}.auth-error.show{display:block}
    .outlet-grid{grid-template-columns:repeat(3,minmax(0,1fr));display:grid;gap:12px}
    .outlet-card{position:relative;min-height:205px;padding:18px;background:#0d0d0d;border:1px solid #242424;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.2);overflow:hidden}.outlet-card:before{content:"";position:absolute;left:0;top:0;width:100%;height:2px;background:linear-gradient(90deg,#ffd21c,transparent 58%)}
    .outlet-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.outlet-card h2{font-size:21px;letter-spacing:-.8px;margin:0}.outlet-status{font-size:8px;font-weight:950;letter-spacing:1px;padding:5px 7px;border-radius:6px;border:1px solid #253b25;color:#72d56b;background:#0d170d}.outlet-status.off{color:#ff8c8c;background:#1c0d0d;border-color:#482121}
    .outlet-address{color:#999;font-size:11px;line-height:1.5;margin:12px 0 11px;max-width:100%}.outlet-meta-row{display:flex;flex-wrap:wrap;gap:6px}.outlet-chip{border:1px solid #292929;background:#101010;color:#777;border-radius:7px;padding:6px 8px;font-size:8px;font-weight:800}.outlet-chip strong{color:#eee}
    .outlet-links{display:flex;gap:6px;margin-top:13px}.outlet-links button{border:1px solid #303030;background:#111;color:#ddd;border-radius:7px;padding:7px 9px;font-size:8px;font-weight:900}.outlet-links button:hover{border-color:#ffd21c;color:#ffd21c}
    .outlet-empty{grid-column:1/-1;border:1px dashed #303030;border-radius:14px;min-height:220px;display:grid;place-items:center;text-align:center;color:#777;padding:30px}.outlet-empty strong{display:block;color:#eee;font-size:15px}.outlet-empty span{display:block;font-size:11px;margin-top:6px}
    .modal-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:20px}.modal-backdrop.open{display:flex}
    .modal{width:min(680px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#0d0d0d;border:1px solid #303030;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.55)}
    .modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;padding:22px 24px;border-bottom:1px solid #242424}.modal-head h2{margin:0;font-size:22px;letter-spacing:-.8px}.modal-head p{margin:6px 0 0;color:#777;font-size:11px}.modal-close{width:32px;height:32px;border:1px solid #303030;border-radius:8px;background:#111;color:#aaa;font-size:18px}.modal-close:hover{color:#fff;border-color:#555}
    .outlet-form{padding:22px 24px;display:grid;gap:16px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{color:#aaa;font-size:10px;font-weight:900;letter-spacing:.8px;text-transform:uppercase}.field input,.field select{width:100%;background:#090909;border:1px solid #303030;color:#f5f5f0;border-radius:9px;padding:11px 12px;font-size:12px;outline:0}.field input:focus,.field select:focus{border-color:#ffd21c}.form-help{color:#666;font-size:10px;line-height:1.5;margin-top:-5px}.form-error{display:none;color:#ff9898;background:#211010;border:1px solid #482121;border-radius:9px;padding:10px;font-size:11px}.form-error.show{display:block}.form-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.form-footer button{padding:11px 15px;border-radius:9px;font-size:10px;font-weight:950}.form-cancel{background:#111;color:#ddd;border:1px solid #303030}.form-submit{background:#ffd21c;color:#080808;border:0}.form-submit:disabled{opacity:.55;cursor:wait}
    .toast{position:fixed;right:20px;bottom:20px;z-index:11000;display:none;max-width:380px;background:#111;border:1px solid #303030;color:#f5f5f0;border-radius:11px;padding:12px 14px;box-shadow:0 18px 50px rgba(0,0,0,.4);font-size:11px;font-weight:800}.toast.show{display:block}.toast.ok{border-color:#355535}.toast.bad{border-color:#542b2b}
    .session-user{cursor:pointer}.session-user:hover strong{color:#ffd21c}
    @media(max-width:1050px){.outlet-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.outlet-grid,.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.modal-head,.outlet-form{padding:18px}.outlet-card{min-height:0}.outlet-links{flex-wrap:wrap}}
  `;
  document.head.appendChild(style);
}

function buildAuthGate() {
  const gate = document.createElement('div');
  gate.className = 'auth-gate';
  gate.id = 'authGate';
  gate.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">OHHO<span>BURGERS</span></div>
      <div class="auth-kicker">Command Center</div>
      <h1 class="auth-title">Sign in to operations</h1>
      <p class="auth-copy">Admin access is required to manage outlets, menu availability and future POS operations.</p>
      <form class="auth-form" id="authForm">
        <input id="authEmail" type="email" autocomplete="email" placeholder="Admin email" required>
        <input id="authPassword" type="password" autocomplete="current-password" placeholder="Password" required>
        <div class="auth-error" id="authError"></div>
        <button class="auth-submit" id="authSubmit" type="submit">SIGN IN TO OHHO</button>
      </form>
    </div>`;
  document.body.prepend(gate);
  $('#authForm').addEventListener('submit', signIn);
}

function buildOutletModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'outletModal';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="outletModalTitle">
      <div class="modal-head">
        <div><h2 id="outletModalTitle">Add New Outlet</h2><p>Register a new OHHO location and configure all current menu items.</p></div>
        <button class="modal-close" type="button" aria-label="Close">×</button>
      </div>
      <form class="outlet-form" id="outletForm">
        <div class="form-grid">
          <div class="field"><label for="outletName">Outlet name</label><input id="outletName" name="name" placeholder="e.g. Kandhla" required></div>
          <div class="field"><label for="outletSlug">Slug</label><input id="outletSlug" name="slug" placeholder="kandhla"><div class="form-help">Leave blank to generate automatically.</div></div>
          <div class="field full"><label for="outletAddress">Full address</label><input id="outletAddress" name="address" placeholder="OHHO BURGERS, Main Market, Kandhla, Uttar Pradesh" required></div>
          <div class="field"><label for="outletPhone">Phone</label><input id="outletPhone" name="phone" inputmode="tel" placeholder="9650443642"></div>
          <div class="field"><label for="outletStatus">Status</label><select id="outletStatus" name="status"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
          <div class="field"><label for="openingTime">Opening time</label><input id="openingTime" name="openingTime" type="time" value="17:00" required></div>
          <div class="field"><label for="closingTime">Closing time</label><input id="closingTime" name="closingTime" type="time" value="01:00" required></div>
          <div class="field"><label for="mapsUrl">Google Maps URL</label><input id="mapsUrl" name="mapsUrl" type="url" placeholder="https://maps.google.com/..."></div>
          <div class="field"><label for="zomatoUrl">Zomato URL</label><input id="zomatoUrl" name="zomatoUrl" type="url" placeholder="https://www.zomato.com/..."></div>
          <div class="field full"><label for="swiggyUrl">Swiggy URL</label><input id="swiggyUrl" name="swiggyUrl" type="url" placeholder="https://www.swiggy.com/..."></div>
        </div>
        <div class="form-error" id="outletFormError"></div>
        <div class="form-footer"><button class="form-cancel" type="button">Cancel</button><button class="form-submit" id="outletSubmit" type="submit">CREATE OUTLET</button></div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  $('.modal-close', backdrop).addEventListener('click', closeOutletModal);
  $('.form-cancel', backdrop).addEventListener('click', closeOutletModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeOutletModal(); });
  $('#outletForm', backdrop).addEventListener('submit', createOutlet);
  $('#outletName', backdrop).addEventListener('input', event => {
    const slug = $('#outletSlug', backdrop);
    if (!slug.dataset.touched) slug.value = slugify(event.target.value);
  });
  $('#outletSlug', backdrop).addEventListener('input', event => { event.target.dataset.touched = '1'; });
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildToast() {
  const toast = document.createElement('div');
  toast.id = 'dashboardToast';
  toast.className = 'toast';
  document.body.appendChild(toast);
}

function toast(message, type = 'ok') {
  const node = $('#dashboardToast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = 'toast'; }, 3500);
}

function setAuthError(message) {
  const node = $('#authError');
  node.textContent = message;
  node.classList.toggle('show', Boolean(message));
}

async function signIn(event) {
  event.preventDefault();
  const button = $('#authSubmit');
  button.disabled = true;
  setAuthError('');
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setAuthError(error.message || 'Unable to sign in.');
  button.disabled = false;
}

async function signOut() {
  await supabase.auth.signOut();
}

async function loadProfile() {
  if (!state.session?.user?.id) return null;
  const { data, error } = await supabase.from('profiles').select('id,name,role').eq('id', state.session.user.id).single();
  if (error) throw new Error('Unable to load admin profile.');
  if (data.role !== 'ADMIN') throw new Error('Admin access required.');
  state.profile = data;
  return data;
}

async function apiRequest(method, body = null) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  if (import.meta.env.DEV) {
    if (method === 'GET') {
      const { data: outlets, error } = await supabase
        .from('outlets')
        .select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message || 'Unable to load outlets.');
      return { outlets: outlets || [] };
    }

    if (method === 'POST') {
      const name = String(body?.name || '').trim();
      const slug = String(body?.slug || name).trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const address = String(body?.address || '').trim();

      if (!name || !slug || !address) {
        throw new Error('Name, slug and address are required.');
      }

      const { data: outlet, error: outletError } = await supabase
        .from('outlets')
        .insert({
          name,
          slug,
          address,
          phone: String(body?.phone || '').trim() || null,
          opening_time: String(body?.openingTime || '17:00'),
          closing_time: String(body?.closingTime || '01:00'),
          maps_url: String(body?.mapsUrl || '').trim() || null,
          zomato_url: String(body?.zomatoUrl || '').trim() || null,
          swiggy_url: String(body?.swiggyUrl || '').trim() || null,
          status: body?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
        })
        .select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at')
        .single();

      if (outletError) throw new Error(outletError.code === '23505'
        ? 'An outlet with this name or slug already exists.'
        : outletError.message || 'Unable to create outlet.');

      const { data: menuItems, error: menuError } = await supabase
        .from('menu_items')
        .select('id')
        .order('display_order', { ascending: true });

      if (menuError) {
        await supabase.from('outlets').delete().eq('id', outlet.id);
        throw new Error('Unable to prepare outlet menu.');
      }

      if (menuItems?.length) {
        const rows = menuItems.map(item => ({
          outlet_id: outlet.id,
          menu_item_id: item.id,
          is_available: true
        }));

        const { error: menuLinkError } = await supabase
          .from('outlet_menu_items')
          .insert(rows);

        if (menuLinkError) {
          await supabase.from('outlets').delete().eq('id', outlet.id);
          throw new Error('Unable to configure outlet menu.');
        }
      }

      return {
        success: true,
        outlet,
        menuItemsConfigured: menuItems?.length || 0,
        createdBy: state.session.user.id
      };
    }

    if (method === 'PATCH') {
      const id = String(body?.id || '').trim();
      if (!id) throw new Error('Outlet id is required.');

      const updates = {};
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.address !== undefined) updates.address = String(body.address).trim();
      if (body.phone !== undefined) updates.phone = String(body.phone).trim() || null;
      if (body.openingTime !== undefined) updates.opening_time = String(body.openingTime);
      if (body.closingTime !== undefined) updates.closing_time = String(body.closingTime);
      if (body.mapsUrl !== undefined) updates.maps_url = String(body.mapsUrl).trim() || null;
      if (body.zomatoUrl !== undefined) updates.zomato_url = String(body.zomatoUrl).trim() || null;
      if (body.swiggyUrl !== undefined) updates.swiggy_url = String(body.swiggyUrl).trim() || null;
      if (body.status !== undefined) updates.status = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
      updates.updated_at = new Date().toISOString();

      const { data: outlet, error } = await supabase
        .from('outlets')
        .update(updates)
        .eq('id', id)
        .select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at')
        .single();

      if (error || !outlet) throw new Error(error?.message || 'Outlet not found.');
      return { success: true, outlet };
    }
  }

  const response = await fetch('/api/outlets', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Outlet request failed (${response.status}).`);
  return payload;
}

async function loadOutlets() {
  try {
    const payload = await apiRequest('GET');
    state.outlets = payload.outlets || [];
  } catch (apiError) {
    // Local Vite does not execute Vercel serverless functions, so use the authenticated
    // Supabase read path as a local-development fallback. Creation remains Preview/API based.
    const { data, error } = await supabase.from('outlets').select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at').order('created_at', { ascending: true });
    if (error) throw apiError;
    state.outlets = data || [];
  }
  renderOutletCards();
  renderOutletSelector();
  renderOverviewOutlets();
}


async function loadPosMenu() {
  const menuGrid = $('#posMenuGrid');
  if (!menuGrid) return;

  menuGrid.innerHTML = '<div class="pos-loading">Loading menu…</div>';

  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id,name,slug,display_order,active')
      .eq('active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id,category_id,name,slug,description,price,image_url,is_veg,is_available,is_favourite,display_order')
      .eq('is_available', true)
      .order('display_order', { ascending: true })
  ]);

  if (categoryError) throw categoryError;
  if (itemError) throw itemError;

  state.pos.categories = categories || [];

  let availability = [];
  if (state.selectedOutlet !== 'ALL') {
    const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);
    if (outlet) {
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .select('menu_item_id,is_available')
        .eq('outlet_id', outlet.id);

      if (error) throw error;
      availability = data || [];
    }
  }

  const availabilityMap = new Map(
    availability.map(row => [row.menu_item_id, row.is_available])
  );

  state.pos.items = (items || []).map(item => ({
    ...item,
    outletAvailable: state.selectedOutlet === 'ALL'
      ? true
      : availabilityMap.get(item.id) === true
  }));

  state.pos.activeCategory = 'ALL';
  renderPosCategories();
  renderPosMenu();
  updatePosOutletName();
  renderPosCart();
}

function renderPosCategories() {
  const container = $('#posCategories');
  if (!container) return;

  const counts = new Map();
  state.pos.items.forEach(item => {
    counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
  });

  container.innerHTML = `
    <button type="button" class="pos-category-btn active" data-category="ALL">
      ALL <span>${state.pos.items.length}</span>
    </button>
    ${state.pos.categories
      .filter(category => counts.has(category.id))
      .map(category => `
        <button type="button" class="pos-category-btn" data-category="${escapeHtml(category.id)}">
          ${escapeHtml(category.name)}
        </button>
      `).join('')}
  `;

  $$('.pos-category-btn', container).forEach(button => {
    button.addEventListener('click', () => {
      state.pos.activeCategory = button.dataset.category;
      $$('.pos-category-btn', container).forEach(btn =>
        btn.classList.toggle('active', btn === button)
      );
      renderPosMenu();
    });
  });
}

function renderPosMenu() {
  const grid = $('#posMenuGrid');
  if (!grid) return;

  const category = state.pos.activeCategory;
  const items = state.pos.items.filter(item =>
    category === 'ALL' || item.category_id === category
  );

  if (!items.length) {
    grid.innerHTML = '<div class="pos-menu-empty">No menu items in this category.</div>';
    return;
  }

  const categoryMap = new Map(
    state.pos.categories.map(item => [item.id, item.name])
  );

  grid.innerHTML = items.map(item => `
    <article class="pos-menu-card ${item.outletAvailable ? '' : 'off'}"
      data-menu-id="${escapeHtml(item.id)}"
      title="${item.outletAvailable ? 'Add to order' : 'Not available at this outlet'}">
      <div>
        <div class="pos-menu-card-top">
          <span class="pos-menu-category">${escapeHtml(categoryMap.get(item.category_id) || 'Menu')}</span>
          ${item.is_favourite ? '<span class="pos-menu-fav">★</span>' : ''}
        </div>
        <h3>${escapeHtml(item.name)}</h3>
      </div>
      <div>
        <span class="pos-menu-price">₹${Number(item.price).toFixed(0)}</span>
        ${item.outletAvailable
          ? '<button type="button" class="pos-menu-add" aria-label="Add item">+</button>'
          : '<span class="pos-unavailable">UNAVAILABLE</span>'}
      </div>
    </article>
  `).join('');

  $$('.pos-menu-card', grid).forEach(card => {
    if (card.classList.contains('off')) return;
    card.addEventListener('click', () => addPosItem(card.dataset.menuId));
  });
}

function updatePosOutletName() {
  const node = $('#posOutletName');
  if (!node) return;

  const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);
  node.textContent = outlet ? outlet.name : 'All Outlets';
}

function addPosItem(menuItemId) {
  const item = state.pos.items.find(entry => entry.id === menuItemId);
  if (!item || !item.outletAvailable) return;

  const existing = state.pos.cart.find(entry => entry.id === menuItemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.pos.cart.push({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: 1
    });
  }

  renderPosCart();
}

function changePosQuantity(menuItemId, delta) {
  const item = state.pos.cart.find(entry => entry.id === menuItemId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.pos.cart = state.pos.cart.filter(entry => entry.id !== menuItemId);
  }

  renderPosCart();
}

function renderPosCart() {
  const container = $('#posCartItems');
  const subtotalNode = $('#posSubtotal');
  const totalNode = $('#posTotal');
  const placeButton = $('#posPlaceOrderBtn');

  if (!container) return;

  if (!state.pos.cart.length) {
    container.innerHTML = `
      <div class="pos-empty-cart">
        <strong>Start an order</strong>
        <span>Select items from the menu.</span>
      </div>`;
  } else {
    container.innerHTML = state.pos.cart.map(item => `
      <div class="pos-cart-item">
        <div>
          <div class="pos-cart-item-name">${escapeHtml(item.name)}</div>
          <div class="pos-cart-item-price">₹${item.price.toFixed(0)} each</div>
        </div>
        <div class="pos-cart-item-right">
          <div class="pos-line-total">₹${(item.price * item.quantity).toFixed(0)}</div>
          <div class="pos-qty">
            <button type="button" data-pos-minus="${escapeHtml(item.id)}">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-pos-plus="${escapeHtml(item.id)}">+</button>
          </div>
        </div>
      </div>
    `).join('');

    $$('[data-pos-minus]', container).forEach(button =>
      button.addEventListener('click', () =>
        changePosQuantity(button.dataset.posMinus, -1)
      )
    );

    $$('[data-pos-plus]', container).forEach(button =>
      button.addEventListener('click', () =>
        changePosQuantity(button.dataset.posPlus, 1)
      )
    );
  }

  const subtotal = state.pos.cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (subtotalNode) subtotalNode.textContent = `₹${subtotal.toFixed(0)}`;
  if (totalNode) totalNode.textContent = `₹${subtotal.toFixed(0)}`;
  if (placeButton) placeButton.disabled = state.pos.cart.length === 0;
}

function resetPosOrder() {
  state.pos.cart = [];
  state.pos.orderType = 'TAKEAWAY';
  state.pos.tableNumber = '';
  state.pos.paymentMethod = 'CASH';

  $$('.pos-type-btn').forEach(button =>
    button.classList.toggle('active', button.dataset.orderType === 'TAKEAWAY')
  );
  $$('.pos-payment-btn').forEach(button =>
    button.classList.toggle('active', button.dataset.payment === 'CASH')
  );

  const tableWrap = $('#posTableWrap');
  const tableInput = $('#posTableNumber');
  if (tableWrap) tableWrap.classList.add('hidden');
  if (tableInput) tableInput.value = '';

  renderPosCart();
}

function wirePosActions() {
  $$('.pos-type-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.pos.orderType = button.dataset.orderType;
      $$('.pos-type-btn').forEach(btn =>
        btn.classList.toggle('active', btn === button)
      );

      const tableWrap = $('#posTableWrap');
      if (tableWrap) {
        tableWrap.classList.toggle('hidden', state.pos.orderType !== 'DINE_IN');
      }
    });
  });

  $$('.pos-payment-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.pos.paymentMethod = button.dataset.payment;
      $$('.pos-payment-btn').forEach(btn =>
        btn.classList.toggle('active', btn === button)
      );
    });
  });

  $('#posTableNumber')?.addEventListener('input', event => {
    state.pos.tableNumber = event.target.value;
  });

  $('#posClearBtn')?.addEventListener('click', resetPosOrder);
  $('#posNewOrderBtn')?.addEventListener('click', resetPosOrder);

  $('#posPlaceOrderBtn')?.addEventListener('click', async () => {
    if (state.selectedOutlet === 'ALL') {
      toast('Select a specific outlet before placing a POS order.', 'bad');
      return;
    }

    if (!state.pos.cart.length) {
      toast('Add at least one item to the order.', 'bad');
      return;
    }

    const button = $('#posPlaceOrderBtn');
    if (!button || button.disabled) return;

    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = 'PLACING ORDER…';

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const response = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          outletId: state.selectedOutlet,
          orderType: state.pos.orderType,
          tableNumber:
            state.pos.orderType === 'DINE_IN'
              ? Number(state.pos.tableNumber)
              : null,
          paymentMethod: state.pos.paymentMethod,
          items: state.pos.cart.map(item => ({
            menuItemId: item.id,
            quantity: item.quantity
          }))
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to create POS order.');
      }

      resetPosOrder();

      toast(
        `Order #${result.order.order_number} created for ${result.outlet.name}.`,
        'ok'
      );
    } catch (error) {
      console.error('Unable to create POS order:', error);
      toast(error.message || 'Unable to create POS order.', 'bad');
    } finally {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  });
}

function formatTime(value) {
  if (!value) return '—';
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function renderOutletCards() {
  const section = $('#outlets');
  if (!section) return;
  let grid = $('#outletGrid', section);
  if (!grid) {
    const cards = $('.cards', section);
    if (!cards) return;
    grid = document.createElement('div');
    grid.id = 'outletGrid';
    grid.className = 'outlet-grid';
    cards.replaceWith(grid);
  }
  if (!state.outlets.length) {
    grid.innerHTML = `<div class="outlet-empty"><div><strong>No outlets found</strong><span>Create the first OHHO outlet to start building the network.</span></div></div>`;
    return;
  }
  grid.innerHTML = state.outlets.map(outlet => `
    <article class="outlet-card">
      <div class="outlet-card-top"><div><div class="card-kicker">OHHO Outlet</div><h2>${escapeHtml(outlet.name)}</h2></div><span class="outlet-status ${outlet.status !== 'ACTIVE' ? 'off' : ''}">${escapeHtml(outlet.status)}</span></div>
      <div class="outlet-address">${escapeHtml(outlet.address)}</div>
      <div class="outlet-meta-row">
        <span class="outlet-chip"><strong>${formatTime(outlet.opening_time)}</strong> – <strong>${formatTime(outlet.closing_time)}</strong></span>
        ${outlet.phone ? `<span class="outlet-chip">☎ <strong>${escapeHtml(outlet.phone)}</strong></span>` : ''}
        <span class="outlet-chip">Menu <strong>17</strong> configured</span>
      </div>
      <div class="outlet-links">
        ${outlet.maps_url ? `<button type="button" data-url="${escapeHtml(outlet.maps_url)}">MAPS</button>` : ''}
        ${outlet.zomato_url ? `<button type="button" data-url="${escapeHtml(outlet.zomato_url)}">ZOMATO</button>` : ''}
        ${outlet.swiggy_url ? `<button type="button" data-url="${escapeHtml(outlet.swiggy_url)}">SWIGGY</button>` : ''}
      </div>
    </article>`).join('');
  $$('[data-url]', grid).forEach(button => button.addEventListener('click', () => window.open(button.dataset.url, '_blank', 'noopener,noreferrer')));
}

function renderOutletSelector() {
  const selector = $('.select');
  if (!selector) return;
  const current = selector.value || state.selectedOutlet || 'ALL';
  selector.innerHTML = `<option value="ALL">ALL OUTLETS</option>${state.outlets.map(o => `<option value="${escapeHtml(o.slug)}">${escapeHtml(o.name).toUpperCase()}</option>`).join('')}`;
  selector.value = state.outlets.some(o => o.slug === current) ? current : 'ALL';
  state.selectedOutlet = selector.value;
  selector.onchange = async () => {
    state.selectedOutlet = selector.value;
    renderOverviewOutlets();
    updateDashboardContext();
    try {
      await loadPosMenu();
    } catch (error) {
      console.error('Unable to refresh POS menu:', error);
      toast(error.message || 'Unable to load POS menu.', 'bad');
    }
  };
}

function renderOverviewOutlets() {
  const performance = $('.performance');
  if (!performance) return;
  const heading = $('.panel-head', performance);
  const existing = $$('.outlet', performance);
  existing.forEach(node => node.remove());
  const outlets = state.selectedOutlet === 'ALL' ? state.outlets : state.outlets.filter(o => o.slug === state.selectedOutlet);
  outlets.forEach(outlet => {
    const node = document.createElement('div');
    node.className = 'outlet';
    node.innerHTML = `<div class="outlet-top"><span class="outlet-name">${escapeHtml(outlet.name)}</span><span class="outlet-revenue">₹0</span></div><div class="outlet-meta">${formatTime(outlet.opening_time)} – ${formatTime(outlet.closing_time)} · ${escapeHtml(outlet.status)}</div><div class="progress"><span style="width:0%"></span></div><div class="outlet-foot"><span>0 orders today</span><span class="${outlet.status === 'ACTIVE' ? 'green' : ''}">${outlet.status}</span></div>`;
    performance.appendChild(node);
  });
  if (heading && !outlets.length) {
    const node = document.createElement('div');
    node.className = 'outlet';
    node.textContent = 'No outlet selected.';
    performance.appendChild(node);
  }
}

function updateDashboardContext() {
  const span = $('.context span');
  if (!span) return;
  const selected = state.outlets.find(o => o.slug === state.selectedOutlet);
  span.textContent = selected ? `${selected.name} · Live operations` : 'All outlets · Live operations';
}

function openOutletModal() {
  const modal = $('#outletModal');
  if (!modal) return;
  $('#outletFormError', modal).classList.remove('show');
  modal.classList.add('open');
  setTimeout(() => $('#outletName', modal)?.focus(), 30);
}

function closeOutletModal() {
  $('#outletModal')?.classList.remove('open');
}

async function createOutlet(event) {
  event.preventDefault();
  const modal = $('#outletModal');
  const form = event.currentTarget;
  const button = $('#outletSubmit', modal);
  const errorNode = $('#outletFormError', modal);
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  button.disabled = true;
  errorNode.classList.remove('show');
  try {
    const payload = await apiRequest('POST', body);
    state.outlets = [...state.outlets, payload.outlet];
    renderOutletCards();
    renderOutletSelector();
    renderOverviewOutlets();
    closeOutletModal();
    form.reset();
    $('#openingTime', modal).value = '17:00';
    $('#closingTime', modal).value = '01:00';
    $('#outletSlug', modal).dataset.touched = '';
    toast(`${payload.outlet.name} created with ${payload.menuItemsConfigured} menu items configured.`);
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.classList.add('show');
  } finally {
    button.disabled = false;
  }
}

function wireDashboardActions() {
  $$('[data-section="outlets"], .action-outlet').forEach(button => button.addEventListener('click', openOutletSection));
  const addOutletButton = $('#addNewOutletBtn');
  if (addOutletButton) {
    addOutletButton.addEventListener('click', event => {
      event.preventDefault();
      openOutletModal();
    });
  }
  const user = $('.user');
  if (user) {
    user.classList.add('session-user');
    user.title = 'Sign out';
    user.addEventListener('click', signOut);
  }

  wirePosActions();
}

function openOutletSection() {
  const section = $('#outlets');
  if (!section) return;
  $$('.section').forEach(node => node.classList.toggle('active', node === section));
  $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.section === 'outlets'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateUserCard() {
  const strong = $('.user strong');
  const span = $('.user span');
  if (strong) strong.textContent = state.profile?.name || 'OHHO Admin';
  if (span) span.textContent = 'Central Admin · Sign out';
}

async function startApp(session) {
  state.session = session;
  try {
    await loadProfile();
    updateUserCard();
    $('#authGate')?.classList.add('hidden');
    await loadOutlets();
    await loadPosMenu();
  } catch (error) {
    await supabase.auth.signOut();
    setAuthError(error.message || 'Unable to authorize this account.');
    $('#authGate')?.classList.remove('hidden');
  }
}

async function init() {
  injectStyles();
  buildAuthGate();
  buildOutletModal();
  buildToast();

  // Keep the dashboard hidden until authentication is confirmed.
  document.body.classList.add('dashboard-auth-pending');

  const gate = $('#authGate');
  gate?.classList.remove('hidden');

  // Wire actions after the dashboard DOM and modal exist.
  wireDashboardActions();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Unable to restore session:', error);
    setAuthError('Unable to restore your session. Please sign in again.');
    return;
  }

  if (data.session) {
    await startApp(data.session);
  } else {
    gate?.classList.remove('hidden');
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await startApp(session);
    } else {
      state.session = null;
      state.profile = null;
      closeOutletModal();
      gate?.classList.remove('hidden');
      document.body.classList.add('dashboard-auth-pending');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

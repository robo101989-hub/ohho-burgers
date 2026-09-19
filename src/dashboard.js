import { supabase } from './supabase.js';

const ROLE_PERMISSIONS = {
  ADMIN: ['overview', 'pos', 'orders', 'menu', 'outlets', 'staff', 'reports', 'settings'],
  OWNER: ['overview', 'pos', 'orders', 'menu', 'reports'],
  MANAGER: ['overview', 'pos', 'orders', 'menu', 'reports'],
  STAFF: ['overview', 'pos', 'orders', 'menu']
};


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

function safeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

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
    .auth-error{display:none;color:#ff8c8c;background:#241111;border:1px solid #4a2020;border-radius:9px;padding:10px;font-size:11px;line-height:1.45}.auth-error.show{display:block}\n    .auth-reset-link{display:block;text-align:center;margin-top:4px;color:#ffd21c;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.auth-reset-link:hover{text-decoration:underline}\n    .auth-reset-copy{color:#888;font-size:12px;line-height:1.6;margin:9px 0 22px}

    .orders-page-head{align-items:flex-end}
    .orders-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .orders-actions .search{min-width:190px}
    .orders-filter{height:38px;background:#0d0d0d;border:1px solid #303030;color:#eee;border-radius:9px;padding:0 11px;font-size:10px;font-weight:900;outline:0}
    .orders-filter:focus{border-color:#ffd21c}
    .orders-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 16px}
    .orders-summary>div{background:#0d0d0d;border:1px solid #242424;border-radius:12px;padding:15px 17px}
    .orders-summary span{display:block;color:#666;font:800 8px var(--mono);letter-spacing:1.5px;margin-bottom:7px}
    .orders-summary strong{font:900 24px var(--mono);color:#f5f5f0}
    .orders-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .order-card{position:relative;background:#0d0d0d;border:1px solid #242424;border-radius:14px;padding:17px;overflow:hidden}
    .order-card:before{content:"";position:absolute;left:0;top:0;width:100%;height:2px;background:linear-gradient(90deg,#ffd21c,transparent 62%)}
    .order-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .order-number{font:900 9px var(--mono);color:#ffd21c;letter-spacing:1.2px}
    .order-card h2{margin:5px 0 0;font-size:18px;letter-spacing:-.6px}
    .order-status{display:inline-flex;align-items:center;padding:6px 8px;border-radius:6px;background:#19150a;border:1px solid #4a3d13;color:#ffd21c;font:900 8px var(--mono);letter-spacing:.7px;white-space:nowrap}
    .order-status.completed{color:#72d56b;background:#0d170d;border-color:#253b25}
    .order-status.cancelled{color:#ff8c8c;background:#1c0d0d;border-color:#482121}
    .order-meta{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 13px}
    .order-meta span{border:1px solid #292929;background:#101010;color:#999;border-radius:6px;padding:6px 8px;font:800 8px var(--mono);letter-spacing:.3px}
    .order-items{border-top:1px solid #222;border-bottom:1px solid #222}
    .order-item-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;color:#bbb;font-size:11px}
    .order-item-row strong{color:#ffd21c;font-family:var(--mono)}
    .order-item-row+ .order-item-row{border-top:1px solid #1b1b1b}
    .order-card-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:14px}
    .order-time,.order-count{display:block;color:#666;font:800 8px var(--mono);letter-spacing:.4px}
    .order-count{margin-top:4px;color:#888}
    .order-total{font:900 20px var(--mono);color:#f5f5f0;white-space:nowrap}

    .order-action-btn{width:100%;margin-top:15px;border:1px solid #ffd21c;background:#ffd21c;color:#080808;border-radius:9px;padding:11px 13px;font:950 9px var(--mono);letter-spacing:.8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:transform .15s ease,background .15s ease}
    .order-action-btn span{font-size:14px;line-height:1}
    .order-action-btn:hover{transform:translateY(-1px);background:#ffe04a}
    .order-action-btn:active{transform:translateY(0)}
    .order-action-done{margin-top:15px;padding:10px 12px;text-align:center;border:1px solid #242424;border-radius:9px;color:#555;font:800 8px var(--mono);letter-spacing:1px}

    .orders-loading,.orders-empty{min-height:220px;grid-column:1/-1;display:grid;place-items:center;text-align:center;border:1px dashed #303030;border-radius:14px;color:#666;padding:30px}
    .orders-empty strong{display:block;color:#eee;font-size:15px}
    .orders-empty span{display:block;font-size:11px;margin-top:6px}
    @media(max-width:1050px){.orders-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){.orders-page-head{align-items:flex-start}.orders-actions{width:100%}.orders-actions .search{flex:1;min-width:0}.orders-filter{flex:1}.orders-summary{grid-template-columns:1fr}.orders-board{grid-template-columns:1fr}}

    .menu-page-head{align-items:flex-end}
    .menu-management-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 16px}
    .menu-stat-card{background:#0d0d0d;border:1px solid #242424;border-radius:12px;padding:15px 17px}
    .menu-stat-card span{display:block;color:#666;font:800 8px var(--mono);letter-spacing:1.5px;margin-bottom:7px}
    .menu-stat-card strong{font:900 25px var(--mono);color:#f5f5f0}

    .menu-management-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) repeat(3,minmax(150px,180px));gap:8px;margin-bottom:12px}
    .menu-search-wrap{height:40px;display:flex;align-items:center;gap:8px;background:#0d0d0d;border:1px solid #303030;border-radius:9px;padding:0 11px}
    .menu-search-wrap:focus-within{border-color:#ffd21c}
    .menu-search-wrap span{color:#666;font-size:18px;line-height:1}
    .menu-search-wrap input{width:100%;border:0;outline:0;background:transparent;color:#eee;font-size:11px}
    .menu-search-wrap input::placeholder{color:#555}
    .menu-management-filter{height:40px;background:#0d0d0d;border:1px solid #303030;color:#eee;border-radius:9px;padding:0 11px;font-size:9px;font-weight:900;outline:0}
    .menu-management-filter:focus{border-color:#ffd21c}

    .menu-management-table-wrap{background:#0d0d0d;border:1px solid #242424;border-radius:14px;overflow:hidden}
    .menu-management-table-head{display:grid;grid-template-columns:var(--menu-grid-columns,minmax(220px,1.7fr) minmax(130px,1fr) 90px 110px 90px 90px 62px);gap:10px;align-items:center;padding:11px 15px;border-bottom:1px solid #242424;background:#0a0a0a;color:#555;font:900 8px var(--mono);letter-spacing:1.1px}
    .menu-management-list{display:block}
    .menu-management-row{display:grid;grid-template-columns:var(--menu-grid-columns,minmax(220px,1.7fr) minmax(130px,1fr) 90px 110px 90px 90px 62px);gap:10px;align-items:center;padding:13px 15px;border-bottom:1px solid #1c1c1c;min-height:68px}
    .menu-management-row:last-child{border-bottom:0}
    .menu-management-row:hover{background:#111}
    .menu-item-main{display:flex;align-items:center;gap:11px;min-width:0}
    .menu-item-thumb{width:38px;height:38px;flex:0 0 38px;border-radius:8px;background:#151515;border:1px solid #292929;display:grid;place-items:center;color:#555;font:900 9px var(--mono);overflow:hidden}
    .menu-item-thumb img{width:100%;height:100%;object-fit:cover}
    .menu-item-copy{min-width:0}
    .menu-item-copy strong{display:block;color:#eee;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .menu-item-copy span{display:block;margin-top:4px;color:#666;font:700 8px var(--mono);letter-spacing:.4px}
    .menu-category-name{color:#aaa;font-size:10px}
    .menu-price-value{font:900 12px var(--mono);color:#ffd21c}
    .menu-status-pill,.menu-outlet-pill{display:inline-flex;align-items:center;justify-content:center;width:max-content;border-radius:6px;padding:5px 7px;font:900 7px var(--mono);letter-spacing:.6px}
    .menu-status-pill.on,.menu-outlet-pill.on{color:#72d56b;background:#0d170d;border:1px solid #253b25}
    .menu-status-pill.off,.menu-outlet-pill.off{color:#ff8c8c;background:#1c0d0d;border:1px solid #482121}
    .menu-outlet-pill{cursor:pointer;min-width:43px}
    .menu-outlet-pill:hover{border-color:#ffd21c;color:#ffd21c}
    .menu-favourite-star{color:#ffd21c;font-size:12px;margin-left:4px}
    .menu-edit-btn{width:100%;border:1px solid #303030;background:#111;color:#ddd;border-radius:7px;padding:8px 7px;font:900 7px var(--mono);letter-spacing:.6px;cursor:pointer}
    .menu-edit-btn:hover{border-color:#ffd21c;color:#ffd21c}
    .menu-management-loading,.menu-management-empty{padding:50px 20px;text-align:center;color:#666;font-size:11px}
    .menu-management-empty strong{display:block;color:#eee;font-size:14px;margin-bottom:6px}

    .menu-item-modal{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:20px}
    .menu-item-modal.hidden{display:none}
    .menu-item-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.78)}
    .menu-item-modal-panel{position:relative;width:min(620px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#0d0d0d;border:1px solid #303030;border-radius:15px;box-shadow:0 30px 90px rgba(0,0,0,.65)}
    .menu-item-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:20px;border-bottom:1px solid #242424}
    .menu-item-modal-head h2{margin:5px 0 0;font-size:23px;letter-spacing:-.8px}
    .menu-modal-close{border:1px solid #303030;background:#111;color:#aaa;width:32px;height:32px;border-radius:8px;font-size:20px;cursor:pointer}
    .menu-modal-close:hover{border-color:#ffd21c;color:#ffd21c}
    .menu-item-form{padding:20px}
    .menu-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .menu-field{display:grid;gap:7px}
    .menu-field-full{grid-column:1/-1}
    .menu-field>span,.menu-form-label{color:#666;font:900 8px var(--mono);letter-spacing:1px}
    .menu-field input,.menu-field select,.menu-field textarea{width:100%;background:#090909;border:1px solid #303030;color:#eee;border-radius:9px;padding:11px 12px;outline:0;font-size:12px;font-family:inherit}
    .menu-field textarea{resize:vertical;min-height:90px;line-height:1.5}
    .menu-field input:focus,.menu-field select:focus,.menu-field textarea:focus{border-color:#ffd21c}
    .menu-form-options{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #242424}
    .menu-toggle-field{display:flex;align-items:center;gap:7px;border:1px solid #292929;background:#101010;border-radius:8px;padding:8px 10px;color:#aaa;font:900 8px var(--mono);cursor:pointer}
    .menu-toggle-field input{position:absolute;opacity:0;pointer-events:none}
    .menu-toggle-ui{width:27px;height:15px;border-radius:99px;background:#292929;position:relative}
    .menu-toggle-ui:after{content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;background:#777;transition:.15s}
    .menu-toggle-field input:checked + .menu-toggle-ui{background:#ffd21c}
    .menu-toggle-field input:checked + .menu-toggle-ui:after{left:14px;background:#080808}
    .menu-form-image{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:16px;padding:13px;border:1px dashed #303030;border-radius:10px}
    .menu-form-image p{margin:5px 0 0;color:#666;font-size:9px}
    .menu-image-preview-wrap{display:flex;align-items:center;gap:12px;min-width:0}
    .menu-image-preview{width:64px;height:64px;flex:0 0 64px;border:1px solid #303030;border-radius:8px;background:#090909;color:#555;display:grid;place-items:center;text-align:center;font:800 7px var(--mono);letter-spacing:.5px;overflow:hidden}
    .menu-image-preview.has-image{border-color:#3a3a3a}
    .menu-image-preview img{display:block;width:100%;height:100%;object-fit:contain}
    .menu-image-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
    .menu-image-actions button{white-space:nowrap}
    .menu-item-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #242424}

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
    @media(max-width:1050px){
      .menu-management-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
      .menu-management-toolbar{grid-template-columns:1fr 1fr}
      .menu-search-wrap{grid-column:1/-1}
      .menu-management-table-head{display:none}
      .menu-management-row{grid-template-columns:minmax(0,1fr) auto auto;gap:8px;padding:15px}
      .menu-item-main{grid-column:1/-1}
      .menu-category-name{grid-column:1}
      .menu-price-value{grid-column:2}
      .menu-status-cell{grid-column:3}
      .menu-outlet-cell{grid-column:auto}
      .menu-row-actions{grid-column:auto}
    }

    @media(max-width:760px){
      .menu-status-cell,.menu-outlet-cell,.menu-row-actions{min-width:0;width:100%}
      .menu-status-cell,.menu-outlet-cell{display:flex;align-items:center}
      .menu-status-pill,.menu-outlet-pill{min-height:34px;padding:8px 10px;width:100%;justify-content:center}
      .menu-edit-btn{width:100%;min-height:36px;padding:9px 10px;border:1px solid #303030;background:#111;color:#ddd;border-radius:7px;font:900 8px var(--mono);letter-spacing:.6px}
      .menu-row-actions button{width:100%;min-height:36px;padding:9px 10px;border:1px solid #303030;background:#111;color:#aaa;border-radius:7px;font:900 8px var(--mono);letter-spacing:.6px;cursor:pointer}
      .menu-row-actions button:hover{border-color:#ffd21c;color:#ffd21c}

      .menu-page-head{align-items:flex-start;width:100%;text-align:left}
      .menu-page-head>div:first-child{width:100%;margin-left:0}
      .menu-page-head .primary{width:100%;margin-top:4px}
      .menu-management-summary{grid-template-columns:1fr 1fr}
      .menu-management-toolbar{grid-template-columns:1fr}
      .menu-search-wrap{grid-column:auto}
      .menu-management-row{grid-template-columns:1fr 1fr;gap:9px}
      .menu-item-main{grid-column:1/-1}
      .menu-category-name{grid-column:1}
      .menu-price-value{grid-column:2;text-align:right}
      .menu-status-cell{grid-column:1}
      .menu-outlet-cell{grid-column:auto}
      .menu-row-actions{grid-column:1/-1}
      .menu-edit-btn{padding:10px}
      .menu-item-modal{padding:10px}
      .menu-item-modal-panel{max-height:calc(100vh - 20px)}
      .menu-form-grid{grid-template-columns:1fr}
      .menu-field-full{grid-column:auto}
      .menu-form-options{display:grid;grid-template-columns:1fr}
      .menu-form-image{align-items:flex-start;flex-direction:column}
      .menu-item-modal-actions{display:grid;grid-template-columns:1fr 1fr}
    }
    @media(max-width:560px){
      .orders-page-head{margin-bottom:16px}
      .orders-actions{display:grid;grid-template-columns:1fr;gap:8px}
      .orders-actions .search,.orders-filter{width:100%;height:44px}
      .orders-summary{grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}
      .orders-summary>div{padding:11px 10px}
      .orders-summary span{font-size:7px;margin-bottom:5px}
      .orders-summary strong{font-size:18px}
      .orders-board{gap:9px}
      .order-card{padding:14px;border-radius:12px}
      .order-card h2{font-size:16px}
      .order-meta{margin:11px 0 12px;gap:5px}
      .order-meta span{padding:7px 8px;font-size:7px}
      .order-item-row{padding:11px 0;font-size:10px}
      .order-card-bottom{margin-top:12px}
      .order-total{font-size:18px}
      .order-action-btn{min-height:44px;padding:12px;font-size:9px}
    }
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
        <a href="#" class="auth-reset-link" id="authResetLink">Forgot password?</a>
        <div class="auth-error" id="authError"></div>
        <button class="auth-submit" id="authSubmit" type="submit">SIGN IN TO OHHO</button>
      </form>
    </div>`;
  document.body.prepend(gate);
  $('#authForm').addEventListener('submit', signIn);
  $('#authResetLink').addEventListener('click', requestPasswordReset);
}

function buildStaffModal() {
  if ($('#staffModal')) return;

  const modal = document.createElement('div');
  modal.id = 'staffModal';
  modal.className = 'menu-item-modal hidden';
  modal.setAttribute('aria-hidden', 'true');

  modal.innerHTML = `
    <div class="menu-item-modal-backdrop" data-staff-modal-close></div>

    <div class="menu-item-modal-panel staff-modal-panel"
         role="dialog"
         aria-modal="true"
         aria-labelledby="staffModalTitle">

      <div class="menu-item-modal-head">
        <div>
          <div class="eyebrow">Team access</div>
          <h2 id="staffModalTitle">Add Staff</h2>
        </div>

        <button type="button"
                class="menu-modal-close"
                data-staff-modal-close
                aria-label="Close">×</button>
      </div>

      <form id="staffForm" class="menu-item-form">

        <div class="menu-form-grid">

          <label class="menu-field">
            <span>FULL NAME</span>
            <input id="staffName"
                   type="text"
                   required
                   autocomplete="name"
                   placeholder="e.g. Rahul Kumar">
          </label>

          <label class="menu-field">
            <span>PHONE</span>
            <input id="staffPhone"
                   type="tel"
                   autocomplete="tel"
                   placeholder="e.g. 9876543210">
          </label>

          <label class="menu-field menu-field-full">
            <span>LOGIN EMAIL</span>
            <input id="staffEmail"
                   type="email"
                   required
                   autocomplete="email"
                   placeholder="staff@ohhoburgers.in">
          </label>

          <label class="menu-field">
            <span>ROLE</span>
            <select id="staffRole" required>
              <option value="STAFF">STAFF</option>
              <option value="MANAGER">MANAGER</option>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          <label class="menu-field">
            <span>TEMPORARY PASSWORD</span>
            <input id="staffPassword"
                   type="password"
                   minlength="8"
                   autocomplete="new-password"
                   placeholder="Minimum 8 characters">
          </label>

          <div class="menu-field menu-field-full">
            <span>OUTLET ACCESS</span>

            <div id="staffOutletOptions" class="staff-outlet-options">
              <div class="staff-outlet-loading">Loading outlets…</div>
            </div>
          </div>

          <label class="menu-field" id="staffStatusField">
            <span>ACCOUNT STATUS</span>
            <select id="staffIsActive">
              <option value="true">ACTIVE</option>
              <option value="false">INACTIVE</option>
            </select>
          </label>

        </div>

        <div class="staff-form-note">
          <strong>Secure account creation</strong>
          <span>
            The staff member will receive dashboard access using this email and
            temporary password. ADMIN has access to all outlets; other roles are
            limited to their assigned outlet(s).
          </span>
        </div>

        <div class="menu-item-modal-actions">
          <button type="button"
                  class="secondary"
                  data-staff-modal-close>
            CANCEL
          </button>

          <button id="staffSaveBtn"
                  type="submit"
                  class="primary">
            CREATE STAFF
          </button>
        </div>

      </form>
    </div>
  `;

  document.body.appendChild(modal);

  $$('[data-staff-modal-close]').forEach(button => {
    button.addEventListener('click', closeStaffModal);
  });

  $('#staffForm')?.addEventListener('submit', handleStaffSubmit);
  $('#staffRole')?.addEventListener('change', updateStaffOutletVisibility);
}

function renderStaffOutletOptions(selectedIds = []) {
  const container = $('#staffOutletOptions');
  if (!container) return;

  const outlets = state.outlets.filter(outlet => outlet.status === 'ACTIVE');

  if (!outlets.length) {
    container.innerHTML = `
      <div class="staff-outlet-loading">
        No active outlets available.
      </div>
    `;
    return;
  }

  container.innerHTML = outlets.map(outlet => `
    <label class="staff-outlet-option">
      <input
        type="checkbox"
        value="${escapeHtml(outlet.id)}"
        ${selectedIds.includes(outlet.id) ? 'checked' : ''}
      >
      <span class="staff-outlet-check"></span>
      <span class="staff-outlet-option-copy">
        <strong>${escapeHtml(outlet.name)}</strong>
        <small>${escapeHtml(outlet.address || 'Active outlet')}</small>
      </span>
    </label>
  `).join('');
}

function updateStaffOutletVisibility() {
  const role = $('#staffRole')?.value;
  const outletField = $('#staffOutletOptions')?.closest('.menu-field');
  if (!outletField) return;

  const isAdmin = role === 'ADMIN';
  outletField.style.display = isAdmin ? 'none' : '';

  if (isAdmin) {
    $('#staffOutletOptions')
      ?.querySelectorAll('input[type="checkbox"]')
      .forEach(input => {
        input.checked = false;
      });
  }
}

function openStaffModal(member = null) {
  if (state.profile?.role !== 'ADMIN') {
    toast('Admin access required.', 'bad');
    return;
  }

  const modal = $('#staffModal');
  if (!modal) return;

  const form = $('#staffForm');
  const title = $('#staffModalTitle');
  const saveButton = $('#staffSaveBtn');

  if (!form || !title || !saveButton) return;

  form.dataset.staffId = member?.id || '';

  title.textContent = member ? 'Edit Staff' : 'Add Staff';
  saveButton.textContent = member ? 'SAVE CHANGES' : 'CREATE STAFF';

  $('#staffName').value = member?.name || '';
  $('#staffPhone').value = member?.phone || '';
  $('#staffEmail').value = member?.email || '';
  $('#staffRole').value = member?.role || 'STAFF';
  $('#staffPassword').value = '';
  $('#staffIsActive').value = member?.is_active === false ? 'false' : 'true';

  $('#staffEmail').disabled = Boolean(member);

  renderStaffOutletOptions(member?.outlet_ids || []);
  updateStaffOutletVisibility();

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  setTimeout(() => $('#staffName')?.focus(), 50);
}

function closeStaffModal() {
  const modal = $('#staffModal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  const form = $('#staffForm');
  if (form) {
    form.reset();
    delete form.dataset.staffId;
  }

  const email = $('#staffEmail');
  if (email) email.disabled = false;
}

async function handleStaffSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const staffId = form.dataset.staffId || '';

  const selectedOutletIds = [
    ...form.querySelectorAll('#staffOutletOptions input[type="checkbox"]:checked')
  ].map(input => input.value);

  const payload = {
    name: $('#staffName')?.value.trim(),
    phone: $('#staffPhone')?.value.trim() || null,
    email: $('#staffEmail')?.value.trim(),
    role: $('#staffRole')?.value,
    password: $('#staffPassword')?.value || null,
    is_active: $('#staffIsActive')?.value !== 'false',
    outlet_ids: selectedOutletIds
  };

  if (!payload.name || !payload.email || !payload.role) {
    toast('Please complete all required staff fields.', 'bad');
    return;
  }

  if (!staffId && (!payload.password || payload.password.length < 8)) {
    toast('Temporary password must be at least 8 characters.', 'bad');
    return;
  }

  if (payload.role !== 'ADMIN' && !payload.outlet_ids.length) {
    toast('Assign at least one outlet for this role.', 'bad');
    return;
  }

  const saveButton = $('#staffSaveBtn');

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = staffId ? 'SAVING…' : 'CREATING…';
  }

  try {
    const requestBody = {
      ...payload,
      ...(staffId ? { id: staffId, is_active: payload.is_active } : {})
    };

    if (staffId) {
      delete requestBody.email;
      delete requestBody.password;
    }

    const result = await staffApiRequest(
      staffId ? 'PATCH' : 'POST',
      requestBody
    );

    const savedStaff = result.staff;

    if (staffId) {
      state.staff = state.staff.map(member =>
        member.id === savedStaff.id
          ? { ...member, ...savedStaff }
          : member
      );
      toast('Staff member updated successfully.', 'ok');
    } else {
      state.staff = [savedStaff, ...state.staff];
      toast('Staff account created successfully.', 'ok');
    }

    renderStaffList();
    closeStaffModal();
  } catch (error) {
    console.error('Staff save error:', error);
    toast(error?.message || 'Unable to save staff member.', 'bad');
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = staffId ? 'SAVE CHANGES' : 'CREATE STAFF';
    }
  }
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

async function requestPasswordReset(event) {
  event.preventDefault();

  const email = $('#authEmail').value.trim();

  if (!email) {
    setAuthError('Enter your email address first.');
    return;
  }

  setAuthError('');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/dashboard`
  });

  if (error) {
    setAuthError(error.message || 'Unable to send password reset email.');
    return;
  }

  setAuthError('Password reset email sent. Check your inbox.');
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

  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,phone,role,is_active')
    .eq('id', state.session.user.id)
    .single();

  if (error) throw new Error('Unable to load your OHHO profile.');
  if (!data) throw new Error('OHHO profile not found.');

  if (data.is_active === false) {
    throw new Error('Your OHHO account is inactive. Please contact an administrator.');
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('outlet_users')
    .select('outlet_id')
    .eq('user_id', state.session.user.id);

  if (assignmentError) {
    throw new Error('Unable to load your outlet access.');
  }

  const allowedRoles = ['ADMIN', 'OWNER', 'MANAGER', 'STAFF'];

  if (!allowedRoles.includes(data.role)) {
    throw new Error('Your OHHO account does not have dashboard access.');
  }

  state.profile = {
    ...data,
    outlet_ids: data.role === 'ADMIN'
      ? []
      : (assignments || []).map(row => row.outlet_id)
  };


  return state.profile;
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
    const allOutlets = payload.outlets || [];
    state.outlets = state.profile?.role === 'ADMIN'
      ? allOutlets
      : allOutlets.filter(outlet =>
          (state.profile?.outlet_ids || []).includes(outlet.id)
        );

    if (state.profile?.role !== 'ADMIN') {
      if (state.outlets.length === 0) {
        throw new Error('No outlet has been assigned to your account.');
      }
      state.selectedOutlet = state.outlets.length === 1
        ? state.outlets[0].slug
        : state.selectedOutlet;
    }
  } catch (apiError) {
    // Local Vite does not execute Vercel serverless functions, so use the authenticated
    // Supabase read path only during local development. Production API failures must surface.
    if (!import.meta.env.DEV) throw apiError;

    const { data, error } = await supabase.from('outlets').select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at').order('created_at', { ascending: true });
    if (error) throw apiError;
    const allOutlets = data || [];
    state.outlets = state.profile?.role === 'ADMIN'
      ? allOutlets
      : allOutlets.filter(outlet =>
          (state.profile?.outlet_ids || []).includes(outlet.id)
        );

    if (state.profile?.role !== 'ADMIN' && state.outlets.length === 0) {
      throw new Error('No outlet has been assigned to your account.');
    }

    if (state.profile?.role !== 'ADMIN' && state.outlets.length === 1) {
      state.selectedOutlet = state.outlets[0].slug;
    }
  }
  renderOutletCards();
  renderOutletSelector();
  renderOverviewOutlets();
}


async function staffApiRequest(method, body = null) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch('/api/staff', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || `Staff request failed (${response.status}).`
    );
  }

  return payload;
}

async function loadStaff() {
  const list = $('#staffList');
  if (!list) return;

  list.innerHTML = `
    <div class="staff-empty">
      <strong>Loading staff…</strong>
      <span>Fetching team access and outlet assignments.</span>
    </div>
  `;

  try {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult?.data?.session?.access_token;

    if (!token) throw new Error('No active session.');

    const response = await fetch('/api/staff', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Staff request failed (${response.status}).`);
    }

    state.staff = payload.staff || [];
  } catch (apiError) {
    throw apiError;
  }

  renderStaffFilters();
  renderStaffList();
}

function renderStaffFilters() {
  const outletFilter = $('#staffOutletFilter');
  if (!outletFilter) return;

  const current = outletFilter.value || 'ALL';

  outletFilter.innerHTML = `
    <option value="ALL">ALL OUTLETS</option>
    ${state.outlets
      .filter(outlet => outlet.status === 'ACTIVE')
      .map(outlet => `
        <option value="${escapeHtml(outlet.id)}">${escapeHtml(outlet.name).toUpperCase()}</option>
      `)
      .join('')}
  `;

  outletFilter.value =
    [...outletFilter.options].some(option => option.value === current)
      ? current
      : 'ALL';
}

function getStaffOutletNames(staffMember) {
  const ids = Array.isArray(staffMember.outlet_ids)
    ? staffMember.outlet_ids
    : [];

  return ids
    .map(id => state.outlets.find(outlet => outlet.id === id))
    .filter(Boolean);
}

function staffInitials(name) {
  const parts = String(name || 'Staff')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function renderStaffList() {
  const list = $('#staffList');
  const resultCount = $('#staffResultCount');
  const totalCount = $('#staffTotalCount');
  const activeCount = $('#staffActiveCount');
  const managerCount = $('#staffManagerCount');
  const outletCount = $('#staffOutletCount');

  if (!list) return;

  const search = String($('#staffSearch')?.value || '').trim().toLowerCase();
  const role = $('#staffRoleFilter')?.value || 'ALL';
  const outletId = $('#staffOutletFilter')?.value || 'ALL';

  const staff = Array.isArray(state.staff) ? state.staff : [];

  if (totalCount) totalCount.textContent = staff.length;
  if (activeCount) activeCount.textContent = staff.filter(member => member.is_active !== false).length;
  if (managerCount) {
    managerCount.textContent = staff.filter(
      member => member.role === 'MANAGER' || member.role === 'OWNER'
    ).length;
  }
  if (outletCount) {
    outletCount.textContent = state.outlets.filter(
      outlet => outlet.status === 'ACTIVE'
    ).length;
  }

  const filtered = staff.filter(member => {
    const outletNames = getStaffOutletNames(member);
    const searchable = [
      member.name,
      member.phone,
      member.role,
      ...outletNames.map(outlet => outlet.name)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesRole = role === 'ALL' || member.role === role;
    const matchesOutlet =
      outletId === 'ALL' ||
      (Array.isArray(member.outlet_ids) &&
        member.outlet_ids.includes(outletId));

    return matchesSearch && matchesRole && matchesOutlet;
  });

  if (resultCount) {
    resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'PERSON' : 'PEOPLE'}`;
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="staff-empty">
        <strong>${staff.length ? 'No matching staff' : 'No staff found'}</strong>
        <span>${staff.length
          ? 'Try changing the search or filters.'
          : 'Add your first team member to start managing access.'}</span>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(member => {
    const outletNames = getStaffOutletNames(member);
    const roleClass = String(member.role || 'STAFF').toLowerCase();

    const outletMarkup = outletNames.length
      ? outletNames.map(outlet => `
          <span class="staff-outlet-chip">${escapeHtml(outlet.name)}</span>
        `).join('')
      : `<span class="staff-outlet-chip all">NO OUTLET ASSIGNED</span>`;

    return `
      <article class="staff-row">
        <div class="staff-person">
          <div class="staff-avatar">${escapeHtml(staffInitials(member.name))}</div>
          <div class="staff-person-info">
            <strong>${escapeHtml(member.name || 'Unnamed staff')}</strong>
            <span>${escapeHtml(member.phone || 'No phone number')}</span>
          </div>
        </div>

        <span class="staff-role ${escapeHtml(roleClass)}">
          ${escapeHtml(member.role || 'STAFF')}
        </span>

        <div class="staff-outlets">
          ${outletMarkup}
        </div>

        <div class="staff-status ${member.is_active !== false ? 'active' : 'inactive'}">
          <span class="staff-status-dot"></span>
          ${member.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
        </div>

        <div class="staff-row-actions">
          <button
            type="button"
            class="staff-edit-btn"
            data-staff-edit="${escapeHtml(member.id)}"
          >
            EDIT
          </button>
        </div>
      </article>
    `;
  }).join('');

  list.querySelectorAll('[data-staff-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const member = state.staff.find(
        item => item.id === button.dataset.staffEdit
      );

      if (member) {
        openStaffModal(member);
      }
    });
  });
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
      ${item.image_url
        ? `<div class="pos-menu-card-image"><img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}"></div>`
        : ''}
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
    if (existing.quantity >= 99) {
      toast('Maximum quantity is 99 per item.', 'bad');
      return;
    }
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



async function ohhoPrinterRequest(path, options = {}) {
  // Android OHHO POS native Bluetooth printer
  if (window.OHHOPrinter) {
    if (path === '/health') {
      return JSON.parse(window.OHHOPrinter.health());
    }

    if (path === '/connect') {
      return JSON.parse(window.OHHOPrinter.connect());
    }

    if (path === '/print') {
      const body = options.body || '';
      return JSON.parse(window.OHHOPrinter.print(body));
    }
  }

  // Desktop fallback for the legacy local printer adapter.
  const baseUrl = 'http://127.0.0.1:8765';

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Printer request failed.');
  }

  return data;
}

function ohhoBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildOhhoTestReceipt() {
  return [
    'OHHO BURGERS',
    'PRINTER TEST',
    '==============================',
    'Bluetooth printer bridge OK',
    '==============================',
    '',
    '',
    ''
  ].join('\n');
}

function buildOhhoReceipt(order, outlet, cart) {
  const orderType = String(order?.order_type || 'TAKEAWAY').toUpperCase();
  const paymentMethod = String(order?.payment_method || 'CASH').toUpperCase();

  const lines = [
    'OHHO BURGERS',
    outlet?.name || 'Outlet',
    '==============================',
    `ORDER #${order?.order_number || ''}`,
    `TYPE: ${orderType}`,
    ...(orderType === 'DINE_IN' && order?.table_number
      ? [`TABLE: ${order.table_number}`]
      : []),
    `PAYMENT: ${paymentMethod}`,
    '------------------------------'
  ];

  cart.forEach(item => {
    const total = Number(item.price) * Number(item.quantity);
    lines.push(`${item.name} x${item.quantity}`, `₹${total.toFixed(0)}`);
  });

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );

  lines.push(
    '------------------------------',
    `TOTAL: ₹${total.toFixed(0)}`,
    '==============================',
    'Thank you!',
    '',
    '',
    ''
  );

  return lines.join('\n');
}

async function connectOhhoPrinter() {
  const button = $('#posPrinterBtn');
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'CONNECTING PRINTER…';

  try {
    if (window.OHHOPrinter) {
      JSON.parse(window.OHHOPrinter.connect());

      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = JSON.parse(window.OHHOPrinter.health());

        if (result.connected) {
          button.textContent = '🟢 PRINTER CONNECTED';
          toast('58mm printer connected successfully.', 'ok');
          button.disabled = false;
          return;
        }
      }

      throw new Error('58mm printer could not be connected.');
    }

    const result = await ohhoPrinterRequest('/health');

    if (!result.connected) {
      throw new Error('Printer adapter is running, but no printer is connected.');
    }

    button.textContent = '🟢 PRINTER CONNECTED';
    toast('OHHO printer connected successfully.', 'ok');
  } catch (error) {
    console.error('Printer connection failed:', error);
    button.textContent = originalText;
    toast(
      error.message || 'Connect the Bluetooth printer and try again.',
      'bad'
    );
  } finally {
    button.disabled = false;
  }
}

async function printOhhoReceipt(order, outlet, cart) {
  const receipt = buildOhhoReceipt(order, outlet, cart);
  return ohhoPrinterRequest('/print', {
    method: 'POST',
    body: ohhoBase64(receipt)
  });
}

function wirePosActions() {
  $('#posPrinterBtn')?.addEventListener('click', connectOhhoPrinter);


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
          outletId: state.outlets.find(o => o.slug === state.selectedOutlet)?.id,
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

      const completedCart = state.pos.cart.map(item => ({ ...item }));
      const completedOutlet = result.outlet;

      resetPosOrder();

      toast(
        `Order #${result.order.order_number} created for ${result.outlet.name}.`,
        'ok'
      );

      try {
        await printOhhoReceipt(
          result.order,
          completedOutlet,
          completedCart
        );

        toast(
          `Order #${result.order.order_number} sent to printer.`,
          'ok'
        );
      } catch (printError) {
        console.error('Unable to print POS order:', printError);

        toast(
          `Order created, but printing failed: ${printError.message || 'Printer unavailable.'}`,
          'bad'
        );
      }
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
        ${safeUrl(outlet.maps_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.maps_url))}">MAPS</button>` : ''}
        ${safeUrl(outlet.zomato_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.zomato_url))}">ZOMATO</button>` : ''}
        ${safeUrl(outlet.swiggy_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.swiggy_url))}">SWIGGY</button>` : ''}
      </div>
    </article>`).join('');
  $$('[data-url]', grid).forEach(button => button.addEventListener('click', () => window.open(button.dataset.url, '_blank', 'noopener,noreferrer')));
}

function renderOutletSelector() {
  const selector = $('.select');
  if (!selector) return;

  const isAdmin = state.profile?.role === 'ADMIN';
  const current = selector.value || state.selectedOutlet || (isAdmin ? 'ALL' : '');

  selector.innerHTML = `
    ${isAdmin ? '<option value="ALL">ALL OUTLETS</option>' : ''}
    ${state.outlets
      .map(o => `<option value="${escapeHtml(o.slug)}">${escapeHtml(o.name).toUpperCase()}</option>`)
      .join('')}
  `;

  const validCurrent = state.outlets.some(o => o.slug === current);
  selector.value = validCurrent
    ? current
    : (isAdmin ? 'ALL' : (state.outlets[0]?.slug || ''));

  state.selectedOutlet = selector.value;
  selector.onchange = async () => {
    state.selectedOutlet = selector.value;
    renderOverviewOutlets();
    updateDashboardContext();
    try {
      await loadPosMenu();
      await loadOrders();
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
    node.innerHTML = `<div class="outlet-top"><span class="outlet-name">${escapeHtml(outlet.name)}</span><span class="outlet-revenue">₹0</span></div><div class="outlet-meta">${formatTime(outlet.opening_time)} – ${formatTime(outlet.closing_time)} · ${escapeHtml(outlet.status)}</div><div class="progress"><span style="width:0%"></span></div><div class="outlet-foot"><span>0 orders today</span><span class="${outlet.status === 'ACTIVE' ? 'green' : ''}">${escapeHtml(outlet.status)}</span></div>`;
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
  if (state.profile?.role !== 'ADMIN') {
    toast('Admin access required.', 'bad');
    return;
  }

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



function renderOrderAction(order) {
  const actions = {
    NEW: ['ACCEPTED', 'ACCEPT ORDER'],
    ACCEPTED: ['PREPARING', 'START PREPARING'],
    PREPARING: ['READY', 'MARK READY'],
    READY: ['COMPLETED', 'COMPLETE ORDER']
  };

  const action = actions[order.order_status];

  if (!action) {
    return '<div class="order-action-done">NO FURTHER ACTION</div>';
  }

  return `
    <button
      type="button"
      class="order-action-btn"
      data-order-id="${escapeHtml(order.id)}"
      data-next-status="${action[0]}"
    >
      ${escapeHtml(action[1])}
      <span>→</span>
    </button>
  `;
}


async function updateOrderStatus(orderId, nextStatus) {
  const allowed = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];

  if (!allowed.includes(nextStatus)) {
    toast('Invalid order status.', 'bad');
    return;
  }

  const button = $(`.order-action-btn[data-order-id="${orderId}"]`);
  if (button) {
    button.disabled = true;
    button.innerHTML = 'UPDATING…';
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', orderId);

  if (error) {
    console.error('Unable to update order status:', error);
    toast(error.message || 'Unable to update order status.', 'bad');
    renderOrders();
    return;
  }

  await loadOrders();
  toast(`Order updated to ${nextStatus.replaceAll('_', ' ')}.`, 'ok');
}

function wireOrdersActions() {
  const search = $('#ordersSearch');
  const status = $('#ordersStatusFilter');

  search?.addEventListener('input', renderOrders);
  status?.addEventListener('change', renderOrders);

  $('#ordersBoard')?.addEventListener('click', event => {
    const button = event.target.closest('.order-action-btn');
    if (!button) return;

    updateOrderStatus(
      button.dataset.orderId,
      button.dataset.nextStatus
    );
  });
}


const menuManagementState = {
  items: [],
  categories: [],
  outletAvailability: new Map(),
  editingId: null,
  imageRemoved: false
};

async function loadMenuManagement() {
  const list = $('#menuManagementList');
  if (list) {
    list.innerHTML = '<div class="menu-management-loading">Loading menu…</div>';
  }

  const [
    { data: categories, error: categoryError },
    { data: items, error: itemError },
    { data: outletRows, error: outletError }
  ] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id,name,slug,display_order,active')
      .order('display_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id,category_id,name,slug,description,price,image_url,is_veg,is_available,is_favourite,is_archived,display_order,created_at,updated_at')
      .order('display_order', { ascending: true }),
    supabase
      .from('outlet_menu_items')
      .select('outlet_id,menu_item_id,is_available')
  ]);

  if (categoryError) throw categoryError;
  if (itemError) throw itemError;
  if (outletError) throw outletError;

  menuManagementState.categories = categories || [];
  menuManagementState.items = items || [];

  menuManagementState.outletAvailability = new Map(
    (outletRows || []).map(row => [
      `${row.outlet_id}:${row.menu_item_id}`,
      row.is_available === true
    ])
  );

  renderMenuManagement();
  populateMenuCategoryControls();
}

function renderMenuManagementTableHead() {
  const head = $('#menuManagementTableHead');
  if (!head) return;

  const role = state.profile?.role;
  const menuOutlets = ['ADMIN', 'OWNER', 'MANAGER'].includes(role) ? state.outlets : [];
  const canManageMenu = ['ADMIN', 'OWNER'].includes(role);

  const outletColumns = menuOutlets.length;
  const actionColumns = canManageMenu ? 1 : 0;
  const gridTemplate = `minmax(220px,1.7fr) minmax(130px,1fr) 90px 110px repeat(${outletColumns}, 90px) ${actionColumns ? '62px' : ''}`.trim();

  head.style.setProperty('--menu-grid-columns', gridTemplate);
  head.innerHTML = `
    <div>ITEM</div>
    <div>CATEGORY</div>
    <div>PRICE</div>
    <div>STATUS</div>
    ${menuOutlets.map(outlet => `<div>${escapeHtml(outlet.name || outlet.slug || 'OUTLET')}</div>`).join('')}
    ${canManageMenu ? '<div></div>' : ''}
  `;
}

function renderMenuManagement() {
  const list = $('#menuManagementList');
  if (!list) return;

  renderMenuManagementTableHead();

  const search = ($('#menuManagementSearch')?.value || '').trim().toLowerCase();
  const category = $('#menuCategoryFilter')?.value || 'ALL';
  const availability = $('#menuAvailabilityFilter')?.value || 'ALL';
  const favourite = $('#menuFavouriteFilter')?.value || 'ALL';

  const categoryMap = new Map(
    menuManagementState.categories.map(item => [item.id, item.name])
  );

  const categoryOrder = new Map(
    menuManagementState.categories.map(category => [category.id, category.display_order])
  );

  const filtered = menuManagementState.items.filter(item => {
    const isArchived = item.is_archived === true;

    const matchesArchive =
      availability === 'ARCHIVED'
        ? isArchived
        : !isArchived;

    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search) ||
      (item.description || '').toLowerCase().includes(search);

    const matchesCategory =
      category === 'ALL' || item.category_id === category;

    const matchesAvailability =
      availability === 'ALL' ||
      availability === 'ARCHIVED' ||
      (availability === 'AVAILABLE' && item.is_available) ||
      (availability === 'UNAVAILABLE' && !item.is_available);

    const matchesFavourite =
      favourite === 'ALL' ||
      (favourite === 'FAVOURITE' && item.is_favourite) ||
      (favourite === 'STANDARD' && !item.is_favourite);

    return matchesSearch && matchesCategory && matchesArchive && matchesAvailability && matchesFavourite;
  });

  const canManageOutletAvailability = ['ADMIN', 'OWNER', 'MANAGER'].includes(state.profile?.role);

  filtered.sort((a, b) => {
    const categoryDiff = (categoryOrder.get(a.category_id) ?? 999) - (categoryOrder.get(b.category_id) ?? 999);
    if (categoryDiff !== 0) return categoryDiff;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="menu-management-empty">
        <strong>No menu items found</strong>
        <span>Try changing your search or filters.</span>
      </div>`;
    updateMenuStats();
    return;
  }

  list.innerHTML = filtered.map(item => {
    const menuOutlets = canManageOutletAvailability ? state.outlets : [];

    return `
      <article class="menu-management-row">
        <div class="menu-item-main">
          <div class="menu-item-thumb">
            ${item.image_url
              ? `<img src="${escapeHtml(item.image_url)}" alt="">`
              : 'OHHO'}
          </div>
          <div class="menu-item-copy">
            <strong>${escapeHtml(item.name)} ${item.is_favourite ? '<span class="menu-favourite-star">★</span>' : ''}</strong>
            <span>${item.is_veg ? 'VEG' : 'NON-VEG'} · #${item.display_order}</span>
          </div>
        </div>

        <div class="menu-category-name">
          ${escapeHtml(categoryMap.get(item.category_id) || 'Uncategorised')}
        </div>

        <div class="menu-price-value">
          ₹${Number(item.price).toLocaleString('en-IN')}
        </div>

        <div class="menu-status-cell">
          <span class="menu-status-pill ${item.is_available ? 'on' : 'off'}">
            ${item.is_available ? 'ACTIVE' : 'OFF'}
          </span>
        </div>

        ${menuOutlets.map(outlet => {
          const available = menuManagementState.outletAvailability.get(`${outlet.id}:${item.id}`) === true;
          return `<div class="menu-outlet-cell">
            <button type="button" class="menu-outlet-pill ${available ? 'on' : 'off'}" data-menu-outlet="${escapeHtml(outlet.id)}" data-menu-item="${escapeHtml(item.id)}" data-menu-outlet-name="${escapeHtml(outlet.name || outlet.slug || 'OUTLET')}">${available ? 'ON' : 'OFF'}</button>
          </div>`;
        }).join('')}

        ${['ADMIN', 'OWNER'].includes(state.profile?.role)
          ? `<div class="menu-row-actions">
              <button type="button" class="menu-edit-btn" data-menu-edit="${escapeHtml(item.id)}">EDIT</button>
              <button type="button" class="menu-archive-btn" data-menu-archive="${escapeHtml(item.id)}">${item.is_archived ? 'RESTORE' : 'ARCHIVE'}</button>
            </div>`
          : '<div class="menu-row-actions"></div>'}
      </article>`;
  }).join('');

  updateMenuStats();
}

function updateMenuStats() {
  const active = menuManagementState.items.filter(item => item.is_available).length;
  const favourites = menuManagementState.items.filter(item => item.is_favourite).length;

  const activeNode = $('#menuActiveCount');
  const categoryNode = $('#menuCategoryCount');
  const favouriteNode = $('#menuFavouriteCount');
  const outletNode = $('#menuOutletCount');

  if (activeNode) activeNode.textContent = active;
  if (categoryNode) categoryNode.textContent = menuManagementState.categories.filter(item => item.active).length;
  if (favouriteNode) favouriteNode.textContent = favourites;
  if (outletNode) outletNode.textContent = state.outlets.filter(item => item.status === 'ACTIVE').length;
}

function populateMenuCategoryControls() {
  const filter = $('#menuCategoryFilter');
  const formCategory = $('#menuItemCategory');

  if (filter) {
    filter.innerHTML = `
      <option value="ALL">ALL CATEGORIES</option>
      ${menuManagementState.categories
        .filter(category => category.active)
        .map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
        .join('')}`;
  }

  if (formCategory) {
    formCategory.innerHTML = menuManagementState.categories
      .filter(category => category.active)
      .map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
      .join('');
  }
}

function openMenuItemModal(itemId = null) {
  const modal = $('#menuItemModal');
  const form = $('#menuItemForm');
  if (!modal || !form) return;

  menuManagementState.editingId = itemId;
  menuManagementState.imageRemoved = false;

  const item = itemId
    ? menuManagementState.items.find(entry => entry.id === itemId)
    : null;

  $('#menuItemModalTitle').textContent = item ? 'Edit Menu Item' : 'Add New Item';
  $('#menuItemName').value = item?.name || '';
  $('#menuItemCategory').value = item?.category_id || menuManagementState.categories[0]?.id || '';
  $('#menuItemPrice').value = item?.price ?? '';
  $('#menuItemOrder').value = item?.display_order ?? 0;
  $('#menuItemDescription').value = item?.description || '';
  $('#menuItemVeg').checked = item?.is_veg === true;
  $('#menuItemFavourite').checked = item?.is_favourite === true;
  $('#menuItemAvailable').checked = item?.is_available !== false;

  const imageInput = $('#menuItemImage');
  const imagePreview = $('#menuItemImagePreview');
  const imageRemove = $('#menuItemImageRemove');
  const imageStatus = $('#menuItemImageStatus');

  if (imageInput && imagePreview && imageRemove && imageStatus) {
    imageInput.value = '';

    if (item?.image_url) {
      imagePreview.innerHTML = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name || 'Menu item')}">`;
      imagePreview.classList.add('has-image');
      imageRemove.classList.remove('hidden');
      imageStatus.textContent = 'Current image · Choose a new file to replace it';
    } else {
      imagePreview.textContent = 'NO IMAGE';
      imagePreview.classList.remove('has-image');
      imageRemove.classList.add('hidden');
      imageStatus.textContent = 'JPG, PNG or WEBP · Max 5MB';
    }
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  $('#menuItemName')?.focus();
}

function closeMenuItemModal() {
  const modal = $('#menuItemModal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  menuManagementState.editingId = null;
}

function wireMenuImagePicker() {
  const input = $('#menuItemImage');
  const button = $('#menuItemImageBtn');
  const removeButton = $('#menuItemImageRemove');
  const preview = $('#menuItemImagePreview');
  const status = $('#menuItemImageStatus');

  if (!input || !button || !removeButton || !preview || !status) return;

  button.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      input.value = '';
      toast('Please choose a JPG, PNG or WEBP image.', 'bad');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      toast('Image must be 5MB or smaller.', 'bad');
      return;
    }

    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Selected menu image">`;
    preview.classList.add('has-image');
    removeButton.classList.remove('hidden');
    status.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  });

  removeButton.addEventListener('click', () => {
    input.value = '';
    menuManagementState.imageRemoved = true;
    preview.textContent = 'NO IMAGE';
    preview.classList.remove('has-image');
    removeButton.classList.add('hidden');
    status.textContent = 'JPG, PNG or WEBP · Max 5MB';
  });
}


async function uploadMenuItemImage(file, itemKey) {
  if (!file) return null;

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeKey = String(itemKey || 'menu-item').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const path = `${safeKey}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase
    .storage
    .from('menu-images')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });

  if (uploadError) throw uploadError;

  const { data } = supabase
    .storage
    .from('menu-images')
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Image uploaded but public URL could not be generated.');
  }

  return data.publicUrl;
}

function wireMenuManagementActions() {
  $('#menuManagementSearch')?.addEventListener('input', renderMenuManagement);
  $('#menuCategoryFilter')?.addEventListener('change', renderMenuManagement);
  $('#menuAvailabilityFilter')?.addEventListener('change', renderMenuManagement);
  $('#menuFavouriteFilter')?.addEventListener('change', renderMenuManagement);

  const canManageMenu = ['ADMIN', 'OWNER'].includes(state.profile?.role);
  const addMenuButton = $('#menuAddItemBtn');
  if (addMenuButton) {
    addMenuButton.style.display = canManageMenu ? '' : 'none';
    if (canManageMenu) {
      addMenuButton.addEventListener('click', () => openMenuItemModal());
    }
  }

  $('#menuManagementList')?.addEventListener('click', async event => {
    const editButton = event.target.closest('[data-menu-edit]');
    if (editButton) {
      openMenuItemModal(editButton.dataset.menuEdit);
      return;
    }

    const archiveButton = event.target.closest('[data-menu-archive]');
    if (archiveButton) {
      await toggleMenuItemArchive(archiveButton.dataset.menuArchive);
      return;
    }

    const outletButton = event.target.closest('[data-menu-outlet]');
    if (!outletButton) return;

    await toggleMenuOutletAvailability(
      outletButton.dataset.menuOutlet,
      outletButton.dataset.menuItem,
      outletButton.dataset.menuOutletName
    );
  });

  $$('[data-menu-modal-close]').forEach(button => {
    button.addEventListener('click', closeMenuItemModal);
  });

  $('#menuItemForm')?.addEventListener('submit', saveMenuItem);
  wireMenuImagePicker();
}

async function saveMenuItem(event) {
  event.preventDefault();

  if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
    toast('You do not have permission to manage menu items.', 'bad');
    return;
  }

  const form = $('#menuItemForm');
  const submitButton = form?.querySelector('button[type="submit"]');
  if (!form || !submitButton) return;

  const name = $('#menuItemName')?.value.trim();
  const categoryId = $('#menuItemCategory')?.value;
  const price = Number($('#menuItemPrice')?.value);
  const displayOrder = Number($('#menuItemOrder')?.value || 0);
  const description = $('#menuItemDescription')?.value.trim() || null;
  const isVeg = $('#menuItemVeg')?.checked === true;
  const isFavourite = $('#menuItemFavourite')?.checked === true;
  const isAvailable = $('#menuItemAvailable')?.checked === true;

  if (!name) {
    toast('Item name is required.', 'bad');
    return;
  }

  if (!categoryId) {
    toast('Please select a category.', 'bad');
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    toast('Enter a valid price.', 'bad');
    return;
  }

  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    toast('Display order must be a whole number.', 'bad');
    return;
  }

  const editingId = menuManagementState.editingId;
  const existingItem = editingId
    ? menuManagementState.items.find(item => item.id === editingId)
    : null;

  submitButton.disabled = true;
  submitButton.textContent = editingId ? 'SAVING…' : 'CREATING…';

  try {
    if (editingId && !existingItem) {
      throw new Error('Menu item could not be found. Please refresh and try again.');
    }

    const imageFile = $('#menuItemImage')?.files?.[0] || null;
    let imageUrl = existingItem?.image_url || null;

    if (menuManagementState.imageRemoved) {
      imageUrl = null;
    }

    if (imageFile) {
      submitButton.textContent = editingId ? 'UPLOADING…' : 'UPLOADING…';
      imageUrl = await uploadMenuItemImage(
        imageFile,
        existingItem?.slug || slugify(name)
      );
    }

    if (editingId) {
      const { error } = await supabase
        .from('menu_items')
        .update({
          category_id: categoryId,
          name,
          description,
          price,
          is_veg: isVeg,
          is_available: isAvailable,
          is_favourite: isFavourite,
          display_order: displayOrder,
          image_url: imageUrl
        })
        .eq('id', editingId);

      if (error) {
        if (error.code === '23505') {
          throw new Error('Another menu item already uses this name/slug.');
        }
        throw error;
      }

      closeMenuItemModal();
      await loadMenuManagement();
      await loadPosMenu();
      toast(`${name} updated successfully.`, 'ok');
      return;
    }

    let slug = slugify(name);

    if (!slug) {
      throw new Error('Item name must contain letters or numbers.');
    }

    const { data: slugMatches, error: slugError } = await supabase
      .from('menu_items')
      .select('id, slug')
      .ilike('slug', `${slug}%`);

    if (slugError) throw slugError;

    const usedSlugs = new Set((slugMatches || []).map(item => item.slug));
    const baseSlug = slug;
    let suffix = 2;

    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const { data: newItem, error: insertError } = await supabase
      .from('menu_items')
      .insert({
        category_id: categoryId,
        name,
        slug,
        description,
        price,
        is_veg: isVeg,
        is_available: isAvailable,
        is_favourite: isFavourite,
        display_order: displayOrder,
        image_url: imageUrl
      })
      .select('id,category_id,name,slug,description,price,image_url,is_veg,is_available,is_favourite,display_order')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('A menu item with this slug already exists. Please try again.');
      }
      throw insertError;
    }

    const activeOutlets = state.outlets.filter(outlet => outlet.status === 'ACTIVE');

    if (activeOutlets.length) {
      const outletRows = activeOutlets.map(outlet => ({
        outlet_id: outlet.id,
        menu_item_id: newItem.id,
        is_available: isAvailable
      }));

      const { error: outletError } = await supabase
        .from('outlet_menu_items')
        .insert(outletRows);

      if (outletError) {
        await supabase.from('menu_items').delete().eq('id', newItem.id);
        throw outletError;
      }
    }

    closeMenuItemModal();
    await loadMenuManagement();
    await loadPosMenu();
    toast(`${name} added successfully.`, 'ok');
  } catch (error) {
    console.error('Unable to save menu item:', error);
    toast(error.message || 'Unable to save menu item.', 'bad');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = menuManagementState.editingId ? 'SAVE CHANGES' : 'SAVE ITEM';
  }
}

async function toggleMenuItemArchive(itemId) {
  if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
    toast('You do not have permission to manage menu items.', 'bad');
    return;
  }

  const item = menuManagementState.items.find(entry => entry.id === itemId);
  if (!item) {
    toast('Menu item not found. Please refresh and try again.', 'bad');
    return;
  }

  const nextArchived = !item.is_archived;
  const action = nextArchived ? 'archive' : 'restore';

  const confirmed = window.confirm(
    nextArchived
      ? `Archive "${item.name}"? It will be removed from the active menu and POS.`
      : `Restore "${item.name}"? It will become available in the menu again.`
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from('menu_items')
    .update({
      is_archived: nextArchived,
      is_available: nextArchived ? false : true
    })
    .eq('id', itemId);

  if (error) {
    console.error(`Unable to ${action} menu item:`, error);
    toast(error.message || `Unable to ${action} menu item.`, 'bad');
    return;
  }

  const { error: outletError } = await supabase
    .from('outlet_menu_items')
    .update({ is_available: false })
    .eq('menu_item_id', itemId);

  if (outletError) {
    console.error('Unable to disable archived item at outlets:', outletError);
    toast(outletError.message || 'Item was updated but outlet availability could not be updated.', 'bad');
    return;
  }

  await loadMenuManagement();
  await loadPosMenu();

  toast(
    nextArchived
      ? `${item.name} archived.`
      : `${item.name} restored and enabled.`,
    'ok'
  );
}

async function toggleMenuOutletAvailability(outletId, menuItemId, outletName) {
  const role = state.profile?.role;
  if (!['ADMIN', 'OWNER', 'MANAGER'].includes(role)) {
    toast('You do not have permission to change outlet menu availability.', 'bad');
    return;
  }

  if (role !== 'ADMIN' && !state.profile?.outlet_ids?.includes(outletId)) {
    toast('You are not assigned to this outlet.', 'bad');
    return;
  }

  const key = `${outletId}:${menuItemId}`;
  const current = menuManagementState.outletAvailability.get(key) === true;
  const next = !current;

  const { error } = await supabase
    .from('outlet_menu_items')
    .update({ is_available: next })
    .eq('outlet_id', outletId)
    .eq('menu_item_id', menuItemId);

  if (error) {
    toast(error.message || `Unable to update ${outletName}.`, 'bad');
    return;
  }

  menuManagementState.outletAvailability.set(key, next);
  renderMenuManagement();
  await loadPosMenu();
  toast(`${outletName} · ${next ? 'item enabled' : 'item disabled'}.`, 'ok');
}


function wireDashboardActions() {
  const sections = $$('.section');
  $$('.nav-btn[data-section]').forEach(button => button.addEventListener('click', () => {
    let id = button.dataset.section;
    const role = state.profile?.role || '';
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (!permissions.includes(id)) id = permissions[0] || 'overview';
    sections.forEach(section => section.classList.toggle('active', section.id === id));
    $$('.nav-btn').forEach(navButton => navButton.classList.toggle('active', navButton.dataset.section === id));
    state.selectedSection = id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  $$('[data-section="outlets"], .action-outlet').forEach(button => button.addEventListener('click', openOutletSection));
  const addOutletButton = $('#addNewOutletBtn');
  if (addOutletButton) {
    addOutletButton.addEventListener('click', event => {
      event.preventDefault();
      openOutletModal();
    });
  }
  const user = $('#signOutBtn');
  if (user) {
    user.classList.add('session-user');
    user.title = 'Sign out';
    user.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await signOut();
      } catch (error) {
        console.error('Sign out error:', error);
        toast(error?.message || 'Unable to sign out.', 'bad');
      }
    });
  }

  const staffAddButton = $('#staffAddBtn');
  if (staffAddButton) {
    staffAddButton.addEventListener('click', event => {
      event.preventDefault();
      openStaffModal();
    });
  }

  $('#staffSearch')?.addEventListener('input', renderStaffList);
  $('#staffRoleFilter')?.addEventListener('change', renderStaffList);
  $('#staffOutletFilter')?.addEventListener('change', renderStaffList);

  wirePosActions();
  wireOrdersActions();
  wireMenuManagementActions();
}


async function loadOrders() {
  const board = $('#ordersBoard');
  if (board) {
    board.innerHTML = '<div class="orders-loading">Loading orders…</div>';
  }

  let query = supabase
    .from('orders')
    .select('id, order_number, order_type, status, payment_method, payment_status, order_source, table_number, subtotal, total, created_at, outlet_id')
    .order('created_at', { ascending: false })
    .limit(100);

  if (state.selectedOutlet !== 'ALL') {
    const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);
    if (outlet?.id) query = query.eq('outlet_id', outlet.id);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error('Unable to load orders:', error);
    if (board) {
      board.innerHTML = '<div class="orders-empty"><strong>Unable to load orders</strong><span>Please refresh and try again.</span></div>';
    }
    toast(error.message || 'Unable to load orders.', 'bad');
    return;
  }

  const orderIds = (orders || []).map(order => order.id);

  let items = [];

  if (orderIds.length) {
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('id, order_id, quantity, item_name, unit_price, line_total')
      .in('order_id', orderIds);

    if (itemsError) {
      console.error('Unable to load order items:', itemsError);
      toast(itemsError.message || 'Unable to load order items.', 'bad');
    } else {
      items = orderItems || [];
    }
  }

  const itemsByOrder = new Map();

  items.forEach(item => {
    if (!itemsByOrder.has(item.order_id)) {
      itemsByOrder.set(item.order_id, []);
    }
    itemsByOrder.get(item.order_id).push(item);
  });

  const outletsById = new Map(
    state.outlets.map(outlet => [outlet.id, outlet])
  );

  state.orders = (orders || []).map(order => ({
    ...order,
    order_status: order.status,
    total_amount: order.total,
    outlets: outletsById.get(order.outlet_id) || null,
    order_items: itemsByOrder.get(order.id) || []
  }));

  renderOrders();
}


function formatOrderTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatOrderDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString([], {
    day: '2-digit',
    month: 'short'
  });
}

function renderOrders() {
  const board = $('#ordersBoard');
  if (!board) return;

  const search = ($('#ordersSearch')?.value || '').trim().toLowerCase();
  const status = $('#ordersStatusFilter')?.value || 'ALL';

  const orders = (state.orders || []).filter(order => {
    const matchesStatus = status === 'ALL' || order.order_status === status;
    if (!matchesStatus) return false;

    if (!search) return true;

    const orderNumber = String(order.order_number || '').toLowerCase();
    const outletName = String(order.outlets?.name || '').toLowerCase();
    const source = String(order.order_source || '').toLowerCase();
    const type = String(order.order_type || '').toLowerCase();
    const itemNames = (order.order_items || [])
      .map(item => String(item.item_name || item.menu_items?.name || '').toLowerCase())
      .join(' ');

    return (
      orderNumber.includes(search) ||
      outletName.includes(search) ||
      source.includes(search) ||
      type.includes(search) ||
      itemNames.includes(search)
    );
  });

  const todayKey = new Date().toDateString();

  const todayOrders = (state.orders || []).filter(order =>
    new Date(order.created_at).toDateString() === todayKey
  );

  const liveOrders = (state.orders || []).filter(order =>
    ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.order_status)
  );

  const todaySales = todayOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const liveCount = $('#ordersLiveCount');
  const todayCount = $('#ordersTodayCount');
  const sales = $('#ordersTodaySales');

  if (liveCount) liveCount.textContent = String(liveOrders.length);
  if (todayCount) todayCount.textContent = String(todayOrders.length);
  if (sales) sales.textContent = `₹${todaySales.toLocaleString('en-IN')}`;

  if (!orders.length) {
    board.innerHTML = `
      <div class="orders-empty">
        <strong>No orders found</strong>
        <span>Try changing the filters or create a new POS order.</span>
      </div>
    `;
    return;
  }

  board.innerHTML = orders.map(order => {
    const items = order.order_items || [];
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const statusClass = String(order.order_status || '').toLowerCase().replaceAll('_', '-');

    return `
      <article class="order-card">
        <div class="order-card-top">
          <div>
            <div class="order-number">ORDER #${escapeHtml(order.order_number)}</div>
            <h2>${escapeHtml(order.outlets?.name || 'OHHO Outlet')}</h2>
          </div>
          <span class="order-status ${statusClass}">${escapeHtml(order.order_status || 'NEW')}</span>
        </div>

        <div class="order-meta">
          <span>${escapeHtml(order.order_type || 'TAKEAWAY')}</span>
          <span>${escapeHtml(order.order_source || 'POS')}</span>
          <span>${escapeHtml(order.payment_method || 'CASH')}</span>
          ${order.table_number ? `<span>TABLE ${escapeHtml(order.table_number)}</span>` : ''}
        </div>

        <div class="order-items">
          ${items.map(item => `
            <div class="order-item-row">
              <span><strong>${escapeHtml(item.quantity)}</strong> × ${escapeHtml(item.item_name || item.menu_items?.name || 'Menu Item')}</span>
              <span>₹${Number(item.line_total || 0).toLocaleString('en-IN')}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-card-bottom">
          <div>
            <span class="order-time">${formatOrderDate(order.created_at)} · ${formatOrderTime(order.created_at)}</span>
            <span class="order-count">${itemCount} item${itemCount === 1 ? '' : 's'}</span>
          </div>
          <strong class="order-total">₹${Number(order.total_amount || 0).toLocaleString('en-IN')}</strong>
        </div>

        ${renderOrderAction(order)}
      </article>
    `;
  }).join('');
}

function openOutletSection() {
  const section = $('#outlets');
  if (!section) return;
  $$('.section').forEach(node => node.classList.toggle('active', node === section));
  $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.section === 'outlets'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyRolePermissions() {
  const role = state.profile?.role || '';
  const permissions = ROLE_PERMISSIONS[role] || [];

  document.querySelectorAll('.nav-btn[data-section]').forEach(button => {
    const section = button.dataset.section;
    button.style.display = permissions.includes(section) ? '' : 'none';
  });

  if (!permissions.includes(state.selectedSection || 'overview')) {
    state.selectedSection = permissions[0] || 'overview';
  }
}

function updateUserCard() {
  const strong = $('.user strong');
  const span = $('.user span');
  if (strong) strong.textContent = state.profile?.name || 'OHHO Admin';
  if (span) span.textContent = `${state.profile?.role || 'UNKNOWN'} · Sign out`;
}

async function startApp(session) {
  state.session = session;
  try {
    await loadProfile();
    applyRolePermissions();
    updateUserCard();
    $('#authGate')?.classList.add('hidden');
    await loadOutlets();
    if (state.profile?.role === 'ADMIN') {
      await loadStaff();
    }
    await loadMenuManagement();
    await loadPosMenu();
    await loadOrders();
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
  buildStaffModal();
  buildToast();

  // Keep the dashboard hidden until authentication is confirmed.
  document.body.classList.add('dashboard-auth-pending');

  const gate = $('#authGate');
  gate?.classList.remove('hidden');

  // Wire actions after the dashboard DOM and modal exist.
  wireDashboardActions();

  // Explicitly complete Supabase PKCE callbacks before normal auth handling.
  const callbackCode = new URL(window.location.href).searchParams.get('code');
  if (callbackCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(callbackCode);

    // Remove the one-time callback code from the address bar.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

    if (error) {
      setAuthError(error.message || 'Unable to complete authentication.');
    }
  }

  // Handle token-hash recovery links without consuming the token on page load.
  const recoveryUrl = new URL(window.location.href);
  const recoveryTokenHash = recoveryUrl.searchParams.get("token_hash");
  const recoveryType = recoveryUrl.searchParams.get("type");

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" && recoveryTokenHash && recoveryType === "recovery") {
      gate?.classList.remove("hidden");
      document.body.classList.add("dashboard-auth-pending");

      gate.innerHTML = `
        <div class="auth-card">
          <div class="auth-brand">OHHO<span>BURGERS</span></div>
          <div class="auth-kicker">Account Recovery</div>
          <h1 class="auth-title">Reset your password</h1>
          <p class="auth-copy">Click below to continue securely to password reset.</p>
          <div class="auth-error" id="authError"></div>
          <button class="auth-submit" id="continueRecovery" type="button">CONTINUE</button>
        </div>`;

      $("#continueRecovery").addEventListener("click", async () => {
        const button = $("#continueRecovery");
        button.disabled = true;
        setAuthError("");

        const { error } = await supabase.auth.verifyOtp({
          token_hash: recoveryTokenHash,
          type: "recovery"
        });

        if (error) {
          setAuthError(error.message || "This recovery link is invalid or has expired.");
          button.disabled = false;
          return;
        }

        recoveryUrl.searchParams.delete("token_hash");
        recoveryUrl.searchParams.delete("type");
        window.history.replaceState(
          {},
          document.title,
          recoveryUrl.pathname + recoveryUrl.search + recoveryUrl.hash
        );
      });

      return;
    }
    if (event === "PASSWORD_RECOVERY") {
      // Recovery is intentionally handled outside the normal dashboard startup.
      state.session = session;
      gate?.classList.remove("hidden");
      document.body.classList.add("dashboard-auth-pending");

      gate.innerHTML = `
        <div class="auth-card">
          <div class="auth-brand">OHHO<span>BURGERS</span></div>
          <div class="auth-kicker">Account Recovery</div>
          <h1 class="auth-title">Set a new password</h1>
          <p class="auth-copy">Choose a new password for your OHHO operations account.</p>
          <form class="auth-form" id="passwordResetForm">
            <input id="newPassword" type="password" autocomplete="new-password" placeholder="New password" minlength="8" required>
            <input id="confirmPassword" type="password" autocomplete="new-password" placeholder="Confirm new password" minlength="8" required>
            <div class="auth-error" id="authError"></div>
            <button class="auth-submit" id="updatePasswordSubmit" type="submit">UPDATE PASSWORD</button>
          </form>
        </div>`;

      $("#passwordResetForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = $("#newPassword").value;
        const confirmPassword = $("#confirmPassword").value;

        if (password.length < 8) {
          setAuthError("Password must be at least 8 characters.");
          return;
        }

        if (password !== confirmPassword) {
          setAuthError("Passwords do not match.");
          return;
        }

        const button = $("#updatePasswordSubmit");
        button.disabled = true;
        setAuthError("");

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          setAuthError(error.message || "Unable to update password.");
          button.disabled = false;
          return;
        }

        setAuthError("Password updated successfully. Please sign in with your new password.");
        await supabase.auth.signOut();
        window.location.reload();
      });

      return;
    }

    if (session) {
      void startApp(session);
    } else if (event !== "INITIAL_SESSION") {
      state.session = null;
      state.profile = null;
      closeOutletModal();
      gate?.classList.remove('hidden');
      document.body.classList.add('dashboard-auth-pending');
    }
  });

}

document.addEventListener('DOMContentLoaded', init);

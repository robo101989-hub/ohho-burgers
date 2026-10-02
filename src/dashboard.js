import { cleanPrizes, normalizePrize, rewardDiscount } from '../lib/spin-rewards.js';
import { installSectionDisclosures } from './section-disclosures.js';
import { stockHistoryRows, orderUtilisation, recipeCostLines } from '../lib/inventory-reporting.js';
import { groupExpenseSessions } from '../lib/expense-sessions.js';
import { supabase } from './supabase.js';
import { historyBounds } from '../lib/history.js';
import { normalizeLocalPurchase } from '../lib/local-purchases.js';
import { calculateSuggestedRequirements, closedSessionRequirementReview } from '../lib/stock-requirements.js';
import { createStockValueCalculator } from '../lib/inventory-valuation.js';
import { defaultNetQuantity, standardConversion, unitLabel, stockRequestUnit, requestSupplyQuantities } from '../lib/inventory-measurements.js';
import { recordIsInOpenSessions, recordIsInSessions, selectCompletedSessions } from '../lib/session-reporting.js';

const ROLE_PERMISSIONS = {
  ADMIN: ['overview', 'pos', 'orders', 'menu', 'costing', 'inventory', 'daily-expenses', 'outlets', 'staff', 'reports', 'settings'],
  OWNER: ['overview', 'pos', 'orders', 'menu', 'costing', 'inventory', 'daily-expenses', 'outlets', 'reports'],
  MANAGER: ['overview', 'pos', 'orders', 'menu', 'costing', 'inventory', 'reports'],
  STAFF: ['overview', 'pos', 'orders', 'menu']
};


const state = {
  session: null,
  profile: null,
  outlets: [],
  selectedOutlet: 'ALL',
  orders: [],
  salesReports: [],
  reportOrders: [],
  reportItems: [],
  reportRange: 'SESSION',
  overviewOperationsFrom: '',
  overviewOperationsTo: '',
  overviewOperationsMode: 'SESSION',
  ordersArchiveOpen: false,
  orderHistoryRecords: null,
  orderHistoryRangeLabel: 'Latest order history',
  liveRefreshTimer: null,
  liveRefreshBusy: false,
  versionCheckTimer: null,
  versionUpdatePending: false,
  spinSettings: [],
  spinHistory: [],
  customerReviews: [],
  customerReviewsError: '',
  editingOutletId: null,
  inventory: { items: [], itemById: new Map(), stockCategories: [], expenseCategories: [], menuItems: [], menuCategories: [], recipes: [], packagingRules: [], staffRules: [], staffEvents: [], openSessions: [], outlets: [], balances: [], bills: [], movements: [], notifications: [], requests: [], expenses: [], openingStockEvents: [], openingStockDrafts: {}, billLines: [], requestLines: [], activeRequestId: null, activeDraftId: null, editingExpenseId: null, editingItemId: null, editingPackagingRuleId: null, editingStaffRuleId: null, localPurchaseEditingBillId: null, historyItemId: null, historyMode: 'ALL', historyFrom: '', historyTo: '', expenseHistoryMode: 'ALL', expenseHistoryFrom: '', expenseHistoryTo: '', activeView: 'work', loaded: false },
  orderEdit: {
    orderId: null,
    items: []
  },
  pos: {
    items: [],
    categories: [],
    activeCategory: 'ALL',
    search: '',
    orderType: 'TAKEAWAY',
    tableNumber: '',
    customerName: '',
    customerPhone: '',
    paymentMethod: 'CASH',
    orderSource: 'POS',
    spinReward: null,
    cart: [],
    submitting: false,
    menuLoaded: false,
    loadedOutlet: null,
    mobileCartExpanded: false
  }
};

let restoringDashboardHistory = false;
let dashboardLastInteractionAt = Date.now();

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
    .order-spin-discount{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:10px 11px;border:1px solid #574711;border-radius:8px;background:#191509}
    .order-spin-discount span{display:block;color:#ffd21c;font:900 8px var(--mono);letter-spacing:.75px}.order-spin-discount small{display:block;margin-top:4px;color:#aaa;font-size:8px}.order-spin-discount strong{color:#ffd21c;font:900 14px var(--mono);white-space:nowrap}
    .order-card-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:14px}
    .order-time,.order-count{display:block;color:#666;font:800 8px var(--mono);letter-spacing:.4px}
    .order-count{margin-top:4px;color:#888}
    .order-total{font:900 20px var(--mono);color:#f5f5f0;white-space:nowrap}

    .order-action-btn{width:100%;margin-top:15px;border:1px solid #ffd21c;background:#ffd21c;color:#080808;border-radius:9px;padding:11px 13px;font:950 9px var(--mono);letter-spacing:.8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:transform .15s ease,background .15s ease}
    .order-action-btn span{font-size:14px;line-height:1}
    .order-action-btn:hover{transform:translateY(-1px);background:#ffe04a}
    .order-action-btn:active{transform:translateY(0)}
    .order-action-done{margin-top:15px;padding:10px 12px;text-align:center;border:1px solid #242424;border-radius:9px;color:#555;font:800 8px var(--mono);letter-spacing:1px}
    .order-edit-btn{width:100%;margin-top:10px;border:1px solid #3a3a3a;background:#131313;color:#eee;border-radius:9px;padding:10px 12px;font:900 8px var(--mono);letter-spacing:.7px}.order-edit-btn:hover{border-color:#ffd21c;color:#ffd21c}
    .order-edit-list{display:grid;gap:7px}.order-edit-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid #292929;border-radius:9px;background:#101010}.order-edit-row strong{display:block;font-size:11px}.order-edit-row small{display:block;margin-top:4px;color:#777;font-size:9px}.order-edit-qty{display:flex;align-items:center;gap:6px}.order-edit-qty button,.order-edit-remove{width:28px;height:28px;border:1px solid #343434;border-radius:6px;background:#171717;color:#eee;font-weight:900}.order-edit-qty span{min-width:22px;text-align:center;font:900 10px var(--mono)}.order-edit-remove{color:#ff8c8c;border-color:#4b2828}.order-edit-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:12px}.order-edit-add select{min-width:0;background:#0b0b0b;border:1px solid #303030;color:#eee;border-radius:8px;padding:10px;font-size:10px}.order-edit-add button{border:0;border-radius:8px;background:#ffd21c;color:#111;padding:10px 14px;font:900 8px var(--mono)}.order-edit-total{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:13px;border-top:1px solid #292929}.order-edit-total span{color:#888;font-size:10px}.order-edit-total strong{color:#ffd21c;font:900 20px var(--mono)}.order-edit-empty{padding:18px;text-align:center;color:#777;border:1px dashed #303030;border-radius:9px}.order-edit-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 22px;border-top:1px solid #242424}.order-edit-footer button{padding:11px 14px;border-radius:8px;font:900 9px var(--mono)}.order-edit-cancel{border:1px solid #333;background:#111;color:#ddd}.order-edit-save{border:0;background:#ffd21c;color:#111}.order-edit-save:disabled{opacity:.5}.order-edit-body{padding:18px 22px;max-height:60vh;overflow:auto}

    .orders-history-head,.reports-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:30px 0 12px;padding-top:20px;border-top:1px solid #242424}.orders-history-head h2,.reports-head h2{margin:3px 0 0;font-size:20px}.orders-history-head>span,.reports-head>span{color:#666;font-size:9px}.orders-history-board{opacity:.92}.reports-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.reports-summary>div{background:#0d0d0d;border:1px solid #242424;border-radius:12px;padding:15px 17px}.reports-summary span{display:block;color:#666;font:800 8px var(--mono);letter-spacing:1.5px;margin-bottom:7px}.reports-summary strong{font:900 24px var(--mono);color:#f5f5f0}.sales-reports-list{display:grid;gap:10px}.sales-report-card{background:#0d0d0d;border:1px solid #242424;border-radius:13px;padding:16px}.sales-report-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sales-report-top h3{margin:0;font-size:16px}.sales-report-window{color:#777;font-size:9px;margin-top:5px}.sales-report-total{font:900 22px var(--mono);color:#ffd21c}.sales-report-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}.sales-report-grid div{background:#101010;border:1px solid #252525;border-radius:8px;padding:9px}.sales-report-grid span{display:block;color:#666;font:800 7px var(--mono);letter-spacing:1px}.sales-report-grid strong{display:block;margin-top:5px;font:900 11px var(--mono);color:#eee}@media(max-width:760px){.reports-summary{grid-template-columns:1fr}.sales-report-grid{grid-template-columns:repeat(2,1fr)}.orders-history-head,.reports-head{align-items:flex-start;flex-direction:column}}
    .orders-archive{margin-top:18px}.orders-archive-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #292929;border-radius:12px;background:#0d0d0d;color:#eee;text-align:left}.orders-archive-toggle:hover{border-color:#444;background:#101010}.orders-archive-title{display:flex;align-items:center;gap:12px}.orders-archive-icon{width:38px;height:34px;display:grid;place-items:center;border:1px solid #3b3417;border-radius:8px;background:#171407;color:#ffd21c;font-size:17px}.orders-archive-copy strong{display:block;font-size:13px}.orders-archive-copy span{display:block;margin-top:4px;color:#666;font-size:9px}.orders-archive-action{display:flex;align-items:center;gap:10px}.orders-archive-count{color:#888;font:800 8px var(--mono);letter-spacing:.5px}.orders-archive-open{min-width:58px;color:#ffd21c;font:900 8px var(--mono);text-align:right}.orders-archive-panel{margin-top:10px;padding:14px;border:1px solid #292929;border-radius:12px;background:#090909}.orders-archive-search-hint{margin:0 0 12px;color:#666;font-size:9px}.orders-history-board{opacity:.94}
    .orders-history-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.orders-history-toolbar button{height:38px;padding:0 12px;font:900 8px var(--mono);letter-spacing:.5px;white-space:nowrap}.orders-history-toolbar>span{margin-left:auto;color:#888;font:800 8px var(--mono);letter-spacing:.4px}.orders-custom-date-panel{display:flex;align-items:flex-end;gap:9px;flex-wrap:wrap;margin:0 0 13px;padding:12px;border:1px solid #2d2d2d;border-radius:10px;background:#0d0d0d}.orders-custom-date-panel.hidden{display:none}.orders-custom-date-panel label{display:grid;gap:6px}.orders-custom-date-panel label span{color:#777;font:800 7px var(--mono);letter-spacing:.8px}.orders-custom-date-panel input{height:38px;min-width:155px;padding:0 10px;border:1px solid #303030;border-radius:8px;background:#101010;color:#eee;color-scheme:dark}.orders-custom-date-panel button{height:38px;padding:0 12px;font:900 8px var(--mono)}
    .orders-loading,.orders-empty{min-height:220px;grid-column:1/-1;display:grid;place-items:center;text-align:center;border:1px dashed #303030;border-radius:14px;color:#666;padding:30px}
    .orders-empty strong{display:block;color:#eee;font-size:15px}
    .orders-empty span{display:block;font-size:11px;margin-top:6px}
    @media(max-width:1050px){.orders-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){.orders-page-head{align-items:flex-start}.orders-actions{width:100%}.orders-actions .search{flex:1;min-width:0}.orders-filter{flex:1}.orders-summary{grid-template-columns:1fr}.orders-board{grid-template-columns:1fr}.orders-archive-toggle{padding:12px}.orders-archive-count{display:none}.orders-archive-panel{padding:10px}.orders-history-toolbar{display:grid;grid-template-columns:1fr 1fr}.orders-history-toolbar button{width:100%}.orders-history-toolbar>span{grid-column:1/-1;margin:2px 0 0}.orders-custom-date-panel{display:grid;grid-template-columns:1fr 1fr}.orders-custom-date-panel label{grid-column:1/-1}.orders-custom-date-panel input{width:100%}}

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
    .menu-row-actions{display:grid;gap:5px;min-width:0}
    .menu-row-actions button{width:100%;min-width:0;height:28px;padding:0 4px;border:1px solid #303030;background:#111;color:#aaa;border-radius:7px;font:900 7px var(--mono);letter-spacing:.45px;white-space:nowrap;cursor:pointer}
    .menu-row-actions button:hover:not(:disabled){border-color:#ffd21c;color:#ffd21c}
    .menu-row-actions button:disabled{opacity:.6;cursor:wait}
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
    .outlet-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.outlet-status-control{display:flex;align-items:flex-end;flex-direction:column;gap:7px;flex:0 0 auto}.outlet-state-row{display:flex;align-items:center;justify-content:flex-end;gap:7px}.outlet-state-label{color:#666;font:900 7px var(--mono);letter-spacing:.8px}.outlet-card h2{font-size:21px;letter-spacing:-.8px;margin:0}.outlet-status{font-size:8px;font-weight:950;letter-spacing:1px;padding:5px 7px;border-radius:6px;border:1px solid #253b25;color:#72d56b;background:#0d170d}.outlet-status.off{color:#ff8c8c;background:#1c0d0d;border-color:#482121}.outlet-admin-actions{display:flex;gap:8px;margin-top:12px}.outlet-toggle-btn,.order-delete-btn{border:1px solid #383838;background:#111;color:#eee;border-radius:8px;padding:8px 10px;font:900 8px var(--mono);letter-spacing:.7px;cursor:pointer}.outlet-toggle-btn:hover{border-color:#ffd21c;color:#ffd21c}.order-delete-btn{border-color:#552525;color:#ff8c8c;background:#190d0d}.order-delete-btn:hover{border-color:#ff6b6b;color:#fff}.outlet-toggle-btn:disabled,.order-delete-btn:disabled{opacity:.55;cursor:wait}
    .outlet-address{color:#999;font-size:11px;line-height:1.5;margin:12px 0 11px;max-width:100%}.outlet-meta-row{display:flex;flex-wrap:wrap;gap:6px}.outlet-chip{border:1px solid #292929;background:#101010;color:#777;border-radius:7px;padding:6px 8px;font-size:8px;font-weight:800}.outlet-chip strong{color:#eee}
    .outlet-links{display:flex;gap:6px;margin-top:13px}.outlet-links button{border:1px solid #303030;background:#111;color:#ddd;border-radius:7px;padding:7px 9px;font-size:8px;font-weight:900}.outlet-links button:hover{border-color:#ffd21c;color:#ffd21c}
    .outlet-links .outlet-edit-btn{border-color:#665510;background:#191507;color:#ffd21c}
    .outlet-toggle-btn.website-on{border-color:#2f4f2f;color:#72d56b;background:#0d170d}.outlet-toggle-btn.website-off{border-color:#5a2b2b;color:#ff8c8c;background:#190d0d}
    .pos-outlet-toggle-btn{min-width:92px}.pos-outlet-toggle-btn.is-off{border-color:#5a2b2b!important;color:#ff8c8c!important;background:#190d0d!important}.pos-outlet-toggle-btn.is-on{border-color:#2f4f2f!important;color:#72d56b!important;background:#0d170d!important}
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
      .menu-row-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
      .menu-row-actions button{height:32px;padding:0 8px;font-size:8px}

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
    .inventory-head-actions{display:flex;gap:8px;flex-wrap:wrap}.inventory-filterbar{display:grid;grid-template-columns:minmax(180px,1fr) 160px 160px repeat(3,auto);gap:9px;align-items:end;margin-bottom:13px}.inventory-filter-status{grid-column:1/-1}.inventory-filterbar label,.inventory-form-grid label,.inventory-notes{display:grid;gap:6px}.inventory-filterbar label span,.inventory-form-grid label span,.inventory-notes span{color:#777;font:900 7px var(--mono);letter-spacing:1px}.inventory-filterbar input,.inventory-filterbar select,.inventory-form-grid input,.inventory-form-grid select,.inventory-notes input{height:40px;width:100%;border:1px solid #303030;border-radius:8px;background:#0d0d0d;color:#eee;padding:0 11px;outline:0;color-scheme:dark}.inventory-filterbar input:focus,.inventory-filterbar select:focus,.inventory-form-grid input:focus,.inventory-form-grid select:focus,.inventory-notes input:focus{border-color:#ffd21c}.inventory-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:13px}.inventory-summary article{background:#0d0d0d;border:1px solid #252525;border-radius:13px;padding:16px}.inventory-summary span{display:block;color:#777;font:900 7px var(--mono);letter-spacing:1px}.inventory-summary strong{display:block;margin-top:7px;color:#f5f5f0;font:950 24px var(--mono)}.inventory-summary small{display:block;margin-top:5px;color:#5f5f5f;font-size:9px}.inventory-admin-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:12px;margin-bottom:12px}.inventory-panel{background:#0d0d0d;border:1px solid #252525;border-radius:14px;padding:17px}.inventory-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}.inventory-panel-head h2{margin:3px 0 0;font-size:18px}.inventory-panel-head>span{color:#777;font:800 8px var(--mono)}.inventory-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.item-create-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inventory-wide-btn{width:100%;margin-top:10px}.inventory-notes{margin-top:10px}.supply-lines{display:grid;gap:7px;margin-top:11px}.supply-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:9px 10px;border:1px solid #282828;border-radius:8px;background:#101010}.supply-line strong{font-size:10px}.supply-line small{display:block;color:#777;margin-top:3px;font-size:8px}.supply-line b{color:#ffd21c;font:900 10px var(--mono)}.supply-line button{border:1px solid #492525;background:#1a0d0d;color:#ff8c8c;border-radius:6px;padding:6px 8px}.supply-empty{padding:18px;text-align:center;border:1px dashed #303030;border-radius:8px;color:#666;font-size:9px}.supply-total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid #272727}.supply-total span{color:#777;font:900 8px var(--mono)}.supply-total strong{color:#ffd21c;font:950 22px var(--mono)}.adjustment-head{margin-top:25px;padding-top:18px;border-top:1px solid #292929}.inventory-table-panel{margin-top:12px}.inventory-table-wrap{overflow-x:auto}.inventory-table-head,.inventory-stock-row{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(120px,1fr) 110px 110px 120px 105px;gap:10px;align-items:center;min-width:760px}.inventory-table-head{padding:9px 11px;color:#5e5e5e;font:900 7px var(--mono);letter-spacing:.8px;border-bottom:1px solid #282828}.inventory-stock-row{padding:12px 11px;border-bottom:1px solid #202020;color:#aaa;font-size:10px}.inventory-stock-row:last-child{border-bottom:0}.inventory-stock-row strong{color:#eee}.inventory-qty{color:#ffd21c;font:900 11px var(--mono)}.inventory-status{width:max-content;border-radius:6px;padding:5px 7px;font:900 7px var(--mono);letter-spacing:.5px}.inventory-status.in{color:#72d56b;background:#0d170d;border:1px solid #253b25}.inventory-status.low{color:#ffd21c;background:#191509;border:1px solid #4c411b}.inventory-status.out{color:#ff8c8c;background:#1c0d0d;border:1px solid #482121}.inventory-bills-list,.inventory-movement-list{display:grid;gap:8px}.inventory-bill{border:1px solid #292929;border-radius:10px;padding:13px;background:#101010}.inventory-bill-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.inventory-bill h3{margin:0;font-size:13px}.inventory-bill-meta{color:#777;font-size:8px;margin-top:5px}.inventory-bill-total{text-align:right}.inventory-bill-total strong{display:block;color:#ffd21c;font:950 17px var(--mono)}.inventory-bill-total span{display:block;margin-top:3px;color:#888;font:900 7px var(--mono)}.inventory-bill-items{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.inventory-bill-items span{border:1px solid #2c2c2c;border-radius:6px;padding:6px 8px;color:#aaa;font-size:8px}.inventory-bill-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.inventory-bill-actions button{padding:8px 10px;font:900 7px var(--mono)}.inventory-movement{display:grid;grid-template-columns:120px minmax(130px,1fr) 130px 100px minmax(140px,1fr);gap:10px;padding:11px;border-bottom:1px solid #202020;align-items:center;color:#888;font-size:9px}.inventory-movement strong{color:#eee}.inventory-movement .positive{color:#72d56b}.inventory-movement .negative{color:#ff8c8c}.inventory-empty{padding:35px;text-align:center;border:1px dashed #303030;border-radius:10px;color:#666;font-size:10px}.inventory-admin-grid.owner-view{grid-template-columns:1fr}.inventory-admin-grid.owner-view>article:first-child{display:none}
    .inventory-master-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.inventory-master-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px;border:1px solid #292929;border-radius:9px;background:#101010}.inventory-master-item strong{display:block;font-size:10px}.inventory-master-item small{display:block;margin-top:4px;color:#777;font-size:8px}.inventory-master-rate{text-align:right}.inventory-master-rate b{display:block;color:#ffd21c;font:900 11px var(--mono)}.inventory-master-rate button{margin-top:5px;border:0;background:transparent;color:#aaa;font:900 7px var(--mono);cursor:pointer}.inventory-master-rate button:hover{color:#ffd21c}.pos-supply-notice{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:13px;padding:14px 16px;border:1px solid #5b4a0f;border-radius:12px;background:linear-gradient(105deg,#211b05,#111);box-shadow:0 10px 30px rgba(0,0,0,.25)}.pos-supply-notice.hidden{display:none}.pos-supply-notice strong{display:block;color:#ffd21c;font-size:12px}.pos-supply-notice span{display:block;margin-top:4px;color:#bbb;font-size:9px}.pos-supply-notice-actions{display:flex;gap:7px;flex-shrink:0}.pos-supply-notice button{padding:9px 11px;font:900 7px var(--mono)}.request-date-row{display:grid;grid-template-columns:180px 180px 1fr;gap:9px;margin-bottom:13px}.request-date-row label{display:grid;gap:6px}.request-date-row span{color:#777;font:900 7px var(--mono);letter-spacing:1px}.request-date-row input,.request-date-row select{height:40px;border:1px solid #303030;border-radius:8px;background:#101010;color:#eee;padding:0 11px;color-scheme:dark}.request-group+.request-group{margin-top:16px}.request-group h3{margin:0 0 8px;color:#ffd21c;font:900 9px var(--mono);letter-spacing:1px}.request-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.request-item{display:grid;grid-template-columns:minmax(0,1fr) 90px;gap:9px;align-items:center;padding:11px;border:1px solid #292929;border-radius:9px;background:#101010}.request-item strong{display:block;font-size:10px}.request-item small{display:block;margin-top:4px;color:#777;font-size:8px}.request-item input{width:100%;height:36px;border:1px solid #343434;border-radius:7px;background:#080808;color:#fff;padding:0 9px}.stock-request-list,.daily-expense-list{display:grid;gap:8px}.stock-request-card{padding:13px;border:1px solid #292929;border-radius:10px;background:#101010}.stock-request-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.stock-request-top strong{display:block;font-size:12px}.stock-request-top span{display:block;margin-top:4px;color:#777;font-size:8px}.stock-request-items{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.stock-request-items span{padding:6px 8px;border:1px solid #303030;border-radius:6px;color:#bbb;font-size:8px}.stock-request-card button{margin-top:10px;padding:8px 10px;font:900 7px var(--mono)}.inventory-expense-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.daily-expense-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px;border-bottom:1px solid #242424}.daily-expense-row strong{display:block;font-size:10px}.daily-expense-row span{display:block;margin-top:4px;color:#777;font-size:8px}.daily-expense-row b{color:#ffcf2c;font:900 11px var(--mono)}
    @media(max-width:1000px){.inventory-filterbar{grid-template-columns:1fr 1fr 1fr}.inventory-admin-grid,.inventory-expense-grid{grid-template-columns:1fr}.inventory-summary{grid-template-columns:repeat(2,1fr)}.inventory-master-list,.request-items{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:650px){.inventory-head-actions{width:100%}.inventory-head-actions button{flex:1}.inventory-filterbar{grid-template-columns:1fr 1fr}.inventory-filterbar label:first-child{grid-column:1/-1}.inventory-summary{grid-template-columns:1fr 1fr}.inventory-summary article{padding:13px}.inventory-summary strong{font-size:19px}.inventory-form-grid,.item-create-grid,.request-date-row{grid-template-columns:1fr}.inventory-panel{padding:13px}.inventory-movement{grid-template-columns:1fr 1fr}.inventory-movement span:last-child{grid-column:1/-1}.inventory-bill-top{display:block}.inventory-bill-total{text-align:left;margin-top:9px}.inventory-master-list,.request-items{grid-template-columns:1fr}.pos-supply-notice{align-items:flex-start;flex-direction:column}.pos-supply-notice-actions{width:100%}.pos-supply-notice button{flex:1}}
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
  if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
    toast('Admin or Owner access required.', 'bad');
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
          <div class="field"><label for="outletStatus">Initial POS session</label><select id="outletStatus" name="status"><option value="ACTIVE">OPEN</option><option value="INACTIVE">CLOSED</option></select></div>
          <div class="field"><label for="outletWebsiteEnabled">Customer website</label><select id="outletWebsiteEnabled" name="websiteEnabled"><option value="true">VISIBLE</option><option value="false">HIDDEN</option></select></div>
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
  $('#outletForm', backdrop).addEventListener('submit', saveOutlet);
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

function buildOrderEditModal() {
  if ($('#orderEditModal')) return;
  const modal = document.createElement('div');
  modal.id = 'orderEditModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="orderEditTitle">
      <div class="modal-head"><div><div class="eyebrow">Active order</div><h2 id="orderEditTitle">Edit Order</h2><p>Add, remove or change item quantities.</p></div><button class="modal-close" type="button" data-order-edit-close>×</button></div>
      <div class="order-edit-body">
        <div id="orderEditList" class="order-edit-list"></div>
        <div class="order-edit-add"><select id="orderEditMenuSelect" aria-label="Menu item"></select><button id="orderEditAddBtn" type="button">＋ ADD ITEM</button></div>
        <div class="order-edit-total"><span>UPDATED TOTAL</span><strong id="orderEditTotal">₹0</strong></div>
      </div>
      <div class="order-edit-footer"><button class="order-edit-cancel" type="button" data-order-edit-close>CANCEL</button><button id="orderEditSaveBtn" class="order-edit-save" type="button">SAVE ORDER</button></div>
    </div>
  `;
  document.body.appendChild(modal);
  $$('[data-order-edit-close]', modal).forEach(button => button.addEventListener('click', closeOrderEditModal));
  modal.addEventListener('click', event => { if (event.target === modal) closeOrderEditModal(); });
  $('#orderEditAddBtn', modal)?.addEventListener('click', addSelectedOrderEditItem);
  $('#orderEditSaveBtn', modal)?.addEventListener('click', saveOrderEdit);
  $('#orderEditList', modal)?.addEventListener('click', handleOrderEditItemAction);
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
        .select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,website_enabled,current_session_started_at,created_at,updated_at')
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

    const { data, error } = await supabase.from('outlets').select('id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,website_enabled,current_session_started_at,created_at,updated_at').order('created_at', { ascending: true });
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
  renderSettings();
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
  if (state.posMenuLoadPromise) {
    await state.posMenuLoadPromise;
    if (state.pos.loadedOutlet !== state.selectedOutlet) return loadPosMenu();
    return;
  }

  const menuGrid = $('#posMenuGrid');
  if (!menuGrid) return;

  menuGrid.innerHTML = '<div class="pos-loading">Loading menu…</div>';
  const requestedOutlet = state.selectedOutlet;

  const request = (async () => {
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
  if (requestedOutlet !== 'ALL') {
    const outlet = state.outlets.find(o => o.slug === requestedOutlet);
    if (outlet) {
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .select('menu_item_id,is_available')
        .eq('outlet_id', outlet.id);

      if (error) throw error;
      availability = data || [];
    }
  }

  if (requestedOutlet !== state.selectedOutlet) return;

  const availabilityMap = new Map(
    availability.map(row => [row.menu_item_id, row.is_available])
  );

  state.pos.items = (items || []).map(item => ({
    ...item,
    outletAvailable: requestedOutlet === 'ALL'
      ? true
      : availabilityMap.get(item.id) === true
  }));
  state.pos.menuLoaded = true;
  state.pos.loadedOutlet = requestedOutlet;

  renderPosCategories();
  renderPosMenu();
  updatePosOutletName();
  renderPosCart();
  })();

  state.posMenuLoadPromise = request;
  try {
    await request;
  } finally {
    if (state.posMenuLoadPromise === request) state.posMenuLoadPromise = null;
  }
  if (state.pos.loadedOutlet !== state.selectedOutlet) return loadPosMenu();
}

function renderPosCategories() {
  const container = $('#posCategories');
  if (!container) return;

  const counts = new Map();
  state.pos.items.forEach(item => {
    counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
  });

  container.innerHTML = `
    <button type="button" class="pos-category-btn${state.pos.activeCategory === 'ALL' ? ' active' : ''}" data-category="ALL">
      ALL <span>${state.pos.items.length}</span>
    </button>
    ${state.pos.categories
      .filter(category => counts.has(category.id))
      .map(category => `
        <button type="button" class="pos-category-btn${state.pos.activeCategory === category.id ? ' active' : ''}" data-category="${escapeHtml(category.id)}">
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
  const query = String(state.pos.search || '').trim().toLocaleLowerCase();
  const items = state.pos.items.filter(item =>
    (category === 'ALL' || item.category_id === category) &&
    (!query || item.name.toLocaleLowerCase().includes(query) || item.slug?.toLocaleLowerCase().includes(query))
  );

  if (!items.length) {
    grid.innerHTML = '<div class="pos-menu-empty">No menu items in this category.</div>';
    return;
  }

  const categoryMap = new Map(
    state.pos.categories.map(item => [item.id, item.name])
  );

  grid.innerHTML = items.map(item => `
    <article class="pos-menu-card ${state.selectedOutlet !== 'ALL' && item.outletAvailable ? '' : 'off'}"
      data-menu-id="${escapeHtml(item.id)}"
      title="${state.selectedOutlet === 'ALL' ? 'Select a specific outlet before adding items' : item.outletAvailable ? 'Add to order' : 'Not available at this outlet'}">
      ${item.image_url
        ? `<div class="pos-menu-card-image"><img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async"></div>`
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
        ${state.selectedOutlet !== 'ALL' && item.outletAvailable
          ? '<button type="button" class="pos-menu-add" aria-label="Add item">+</button>'
          : `<span class="pos-unavailable">${state.selectedOutlet === 'ALL' ? 'SELECT OUTLET' : 'UNAVAILABLE'}</span>`}
      </div>
    </article>
  `).join('');

  $$('.pos-menu-card', grid).forEach(card => {
    if (card.classList.contains('off')) return;
    card.addEventListener('click', () => addPosItem(card.dataset.menuId));
  });
}

function updatePosOutletControl() {
  const button = $('#posOutletToggleBtn');
  if (!button) return;

  const canControl = ['ADMIN', 'OWNER'].includes(state.profile?.role);
  const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);

  button.hidden = !canControl || !outlet;

  if (!outlet) return;

  const isActive = outlet.status === 'ACTIVE';
  button.textContent = isActive ? 'POS SESSION ON' : 'POS SESSION OFF';
  button.classList.toggle('is-on', isActive);
  button.classList.toggle('is-off', !isActive);
  button.title = isActive
    ? 'Close this POS sales session'
    : 'Start a new POS sales session';
}

function updatePosOutletName() {
  const node = $('#posOutletName');
  if (!node) return;

  const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);
  node.textContent = outlet ? outlet.name : 'All Outlets';
  updatePosOutletControl();
}

function addPosItem(menuItemId) {
  const item = state.pos.items.find(entry => entry.id === menuItemId);
  if (!item || state.selectedOutlet === 'ALL' || !item.outletAvailable) return;

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

  item.quantity = Math.min(99, item.quantity + delta);
  if (item.quantity <= 0) {
    state.pos.cart = state.pos.cart.filter(entry => entry.id !== menuItemId);
  }

  renderPosCart();
}

function setPosQuantity(menuItemId, value) {
  const item = state.pos.cart.find(entry => entry.id === menuItemId);
  if (!item) return;

  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    renderPosCart();
    return;
  }

  item.quantity = Math.min(99, Math.max(1, Math.floor(quantity)));
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
            <input type="number" min="1" max="99" step="1" inputmode="numeric" value="${item.quantity}" data-pos-quantity="${escapeHtml(item.id)}" aria-label="Quantity for ${escapeHtml(item.name)}">
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

  const spinReward = state.pos.spinReward;
  let discount = 0;
  let rewardError = '';
  try { discount = rewardDiscount(spinReward, state.pos.cart, subtotal); }
  catch (error) { rewardError = error.message; }
  if (spinReward?.type === 'FREE_ITEM' && subtotal - discount < Number(spinReward.minimumOrder || 0)) rewardError = `Add ₹${spinReward.minimumOrder} of paid items, excluding the free reward.`;
  if (spinReward && $('#posSpinHint')) $('#posSpinHint').textContent = rewardError || `${spinReward.label} ready — one code per order.`;

  if (subtotalNode) subtotalNode.textContent = `₹${subtotal.toFixed(0)}`;
  if ($('#posDiscount')) $('#posDiscount').textContent = discount ? `−₹${discount.toFixed(0)}` : spinReward?.type === 'FREE_ITEM' ? spinReward.label : '₹0';
  if (totalNode) totalNode.textContent = `₹${Math.max(0, subtotal - discount).toFixed(0)}`;
  const itemCount = state.pos.cart.reduce((sum, item) => sum + item.quantity, 0);
  if ($('#posMobileCartCount')) $('#posMobileCartCount').textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  if ($('#posMobileCartTotal')) $('#posMobileCartTotal').textContent = `₹${Math.max(0, subtotal - discount).toFixed(0)}`;
  const mobileCartToggle = $('#posMobileCartToggle');
  const cartPanel = mobileCartToggle?.closest('.pos-cart-panel');
  if (cartPanel) cartPanel.classList.toggle('is-mobile-expanded', Boolean(state.pos.mobileCartExpanded));
  mobileCartToggle?.setAttribute('aria-expanded', String(Boolean(state.pos.mobileCartExpanded)));
  const selectedOutlet = state.outlets.some(outlet => outlet.slug === state.selectedOutlet);
  if (placeButton) {
    placeButton.disabled = state.pos.submitting || state.pos.cart.length === 0 || Boolean(rewardError) || !selectedOutlet;
    placeButton.innerHTML = selectedOutlet ? 'PLACE ORDER <span>→</span>' : 'SELECT OUTLET FIRST';
  }
}

function resetPosOrder() {
  state.pos.cart = [];
  state.pos.mobileCartExpanded = false;
  state.pos.orderType = 'TAKEAWAY';
  state.pos.tableNumber = '';
  state.pos.customerName = '';
  state.pos.customerPhone = '';
  state.pos.paymentMethod = 'CASH';
  state.pos.orderSource = 'POS';
  state.pos.spinReward = null;

  $$('.pos-type-btn').forEach(button =>
    button.classList.toggle('active', button.dataset.orderType === 'TAKEAWAY')
  );
  $$('.pos-payment-btn').forEach(button =>
    button.classList.toggle('active', button.dataset.payment === 'CASH')
  );
  $$('.pos-source-card').forEach(button =>
    button.classList.toggle('active', button.dataset.orderSource === 'POS')
  );

  $('#posPaymentGrid')?.classList.remove('is-locked');
  $('#posComplimentaryNote')?.classList.add('hidden');

  const tableWrap = $('#posTableWrap');
  const tableInput = $('#posTableNumber');
  if (tableWrap) tableWrap.classList.add('hidden');
  if (tableInput) tableInput.value = '';
  if ($('#posCustomerName')) $('#posCustomerName').value = '';
  if ($('#posCustomerPhone')) $('#posCustomerPhone').value = '';
  if ($('#posSpinCode')) $('#posSpinCode').value = '';
  $('#posSpinReward')?.classList.remove('active');
  if ($('#posSpinHint')) $('#posSpinHint').textContent = 'Enter the customer’s cart Spin & Win code.';

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
    `CATEGORY: ${String(order?.order_source || 'POS').replaceAll('_', ' ')}`,
    ...(order?.customer_name ? [`NAME: ${order.customer_name}`] : []),
    ...(order?.customer_phone ? [`MOBILE: ${order.customer_phone}`] : []),
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
  $('#posMobileCartToggle')?.addEventListener('click', () => {
    state.pos.mobileCartExpanded = !state.pos.mobileCartExpanded;
    renderPosCart();
  });
  $('#posCartItems')?.addEventListener('change', event => {
    const input = event.target.closest('[data-pos-quantity]');
    if (input) setPosQuantity(input.dataset.posQuantity, input.value);
  });
  $('#posMenuSearch')?.addEventListener('input', event => {
    state.pos.search = event.target.value;
    renderPosMenu();
  });

  $('#posOutletToggleBtn')?.addEventListener('click', async () => {
    const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);

    if (!outlet) {
      toast('Select a specific outlet first.', 'bad');
      return;
    }

    const button = $('#posOutletToggleBtn');
    if (button) button.disabled = true;

    await toggleOutletStatus(outlet.id);

    if (button) button.disabled = false;
  });


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

  $('#posApplySpinBtn')?.addEventListener('click', async () => {
    const outlet = state.outlets.find(item => item.slug === state.selectedOutlet);
    const code = $('#posSpinCode')?.value.trim();
    if (!outlet) return toast('Select the customer’s outlet first.', 'bad');
    if (!code) return toast('Enter the Spin & Win code.', 'bad');
    const button = $('#posApplySpinBtn');
    button.disabled = true;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error('Your session has expired. Please log in again.');
      const response = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ action: 'verify', outletId: outlet.id, code, orderSubtotal: state.pos.cart.reduce((sum, item) => sum + item.price * item.quantity, 0) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Reward could not be verified.');
      if (result.reward.type === 'FREE_ITEM') {
        const gift = state.pos.items.find(item => item.id === result.reward.menuItemId && item.outletAvailable);
        if (!gift) throw new Error('The reward item is unavailable at this outlet.');
        if (!state.pos.cart.some(item => item.id === gift.id)) addPosItem(gift.id);
      }
      state.pos.spinReward = result.reward;
      $('#posSpinCode').value = result.reward.code;
      $('#posSpinReward')?.classList.add('active');
      if ($('#posSpinHint')) $('#posSpinHint').textContent = `${result.reward.label} ready — it will be redeemed when this order is placed.`;
      renderPosCart();
      toast(`${result.reward.label} applied.`, 'ok');
    } catch (error) {
      state.pos.spinReward = null;
      $('#posSpinReward')?.classList.remove('active');
      renderPosCart();
      toast(error.message || 'Reward could not be verified.', 'bad');
    } finally {
      button.disabled = false;
    }
  });

  $$('.pos-source-card').forEach(button => {
    button.addEventListener('click', () => {
      const source = button.dataset.orderSource;
      state.pos.orderSource = source;
      $$('.pos-source-card').forEach(card =>
        card.classList.toggle('active', card === button)
      );

      const complimentary = source === 'FAMILY_FRIENDS';
      state.pos.paymentMethod = complimentary ? 'COMPLIMENTARY' : 'CASH';
      $$('.pos-payment-btn').forEach(paymentButton =>
        paymentButton.classList.toggle(
          'active',
          !complimentary && paymentButton.dataset.payment === 'CASH'
        )
      );
      $('.pos-payment-grid')?.classList.toggle('is-locked', complimentary);
      $('#posComplimentaryNote')?.classList.toggle('hidden', !complimentary);
    });
  });

  $('#posTableNumber')?.addEventListener('input', event => {
    state.pos.tableNumber = event.target.value;
  });
  $('#posCustomerName')?.addEventListener('input', event => {
    state.pos.customerName = event.target.value;
  });
  $('#posCustomerPhone')?.addEventListener('input', event => {
    state.pos.customerPhone = event.target.value;
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

    state.pos.submitting = true;
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
              ? (state.pos.tableNumber ? Number(state.pos.tableNumber) : null)
              : null,
          paymentMethod: state.pos.paymentMethod,
          orderSource: state.pos.orderSource,
          customerName: state.pos.customerName.trim(),
          customerPhone: state.pos.customerPhone.trim(),
          spinRewardCode: state.pos.spinReward?.code || null,
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

      void printOhhoReceipt(result.order, completedOutlet, completedCart)
        .then(() => toast(`Order #${result.order.order_number} sent to printer.`, 'ok'))
        .catch(printError => {
          console.error('Unable to print POS order:', printError);
          toast(`Order created, but printing failed: ${printError.message || 'Printer unavailable.'}`, 'bad');
        });
      void Promise.all([loadOrders(), loadReports()]).catch(refreshError => {
        console.error('Unable to refresh live session sales:', refreshError);
      });
    } catch (error) {
      console.error('Unable to create POS order:', error);
      toast(error.message || 'Unable to create POS order.', 'bad');
    } finally {
      state.pos.submitting = false;
      button.innerHTML = originalText;
      renderPosCart();
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

async function toggleOutletStatus(outletId) {
  if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
    toast('Admin or Owner access required.', 'bad');
    return;
  }

  const outlet = state.outlets.find(item => item.id === outletId);
  if (!outlet) return;

  const nextStatus = outlet.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  try {
    const payload = await apiRequest('PATCH', {
      id: outlet.id,
      status: nextStatus
    });

    state.outlets = state.outlets.map(item =>
      item.id === outlet.id ? payload.outlet : item
    );

    renderOutletCards();
    renderOutletSelector();
    renderOverviewOutlets();
    updatePosOutletName();
    renderSettings();
    await loadOrders();
    await loadReports();
    toast(
      nextStatus === 'ACTIVE'
        ? `${payload.outlet.name} POS session started.`
        : `${payload.outlet.name} POS session closed and report generated.`,
      'ok'
    );
  } catch (error) {
    console.error('Unable to change outlet status:', error);
    toast(error.message || 'Unable to change outlet status.', 'bad');
  }
}

async function toggleWebsiteAvailability(outletId) {
  if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
    toast('Admin or Owner access required.', 'bad');
    return;
  }

  const outlet = state.outlets.find(item => item.id === outletId);
  if (!outlet) return;

  const nextWebsiteEnabled = outlet.website_enabled !== true;

  try {
    const payload = await apiRequest('PATCH', {
      id: outlet.id,
      websiteEnabled: nextWebsiteEnabled
    });

    state.outlets = state.outlets.map(item =>
      item.id === outlet.id ? payload.outlet : item
    );

    renderOutletCards();
    renderSettings();
    toast(
      `${payload.outlet.name} is now ${nextWebsiteEnabled ? 'visible on' : 'hidden from'} the customer website.`,
      'ok'
    );
  } catch (error) {
    console.error('Unable to change website availability:', error);
    toast(error.message || 'Unable to change website availability.', 'bad');
  }
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
      <div class="outlet-card-top">
        <div><div class="card-kicker">OHHO Outlet</div><h2>${escapeHtml(outlet.name)}</h2></div>
        <div class="outlet-status-control">
          <div class="outlet-state-row"><span class="outlet-state-label">POS</span><span class="outlet-status ${outlet.status !== 'ACTIVE' ? 'off' : ''}">${outlet.status === 'ACTIVE' ? 'SESSION OPEN' : 'SESSION CLOSED'}</span></div>
          <div class="outlet-state-row"><span class="outlet-state-label">WEBSITE</span><span class="outlet-status ${outlet.website_enabled !== true ? 'off' : ''}">${outlet.website_enabled === true ? 'VISIBLE' : 'HIDDEN'}</span></div>
          ${['ADMIN', 'OWNER'].includes(state.profile?.role) ? `
            <button type="button" class="outlet-toggle-btn ${outlet.website_enabled === true ? 'website-on' : 'website-off'}" data-website-toggle="${escapeHtml(outlet.id)}">
              ${outlet.website_enabled === true ? 'WEBSITE ON · CLICK TO HIDE' : 'WEBSITE OFF · CLICK TO SHOW'}
            </button>
          ` : ''}
        </div>
      </div>
      <div class="outlet-address">${escapeHtml(outlet.address)}</div>
      <div class="outlet-meta-row">
        <span class="outlet-chip"><strong>${formatTime(outlet.opening_time)}</strong> – <strong>${formatTime(outlet.closing_time)}</strong></span>
        ${outlet.phone ? `<span class="outlet-chip">☎ <strong>${escapeHtml(outlet.phone)}</strong></span>` : ''}
        <span class="outlet-chip">Menu <strong>17</strong> configured</span>
      </div>
      <div class="outlet-links">
        ${['ADMIN', 'OWNER'].includes(state.profile?.role) ? `<button type="button" class="outlet-edit-btn" data-outlet-edit="${escapeHtml(outlet.id)}">EDIT DETAILS</button>` : ''}
        ${safeUrl(outlet.maps_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.maps_url))}">MAPS</button>` : ''}
        ${safeUrl(outlet.zomato_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.zomato_url))}">ZOMATO</button>` : ''}
        ${safeUrl(outlet.swiggy_url) ? `<button type="button" data-url="${escapeHtml(safeUrl(outlet.swiggy_url))}">SWIGGY</button>` : ''}
      </div>
    </article>`).join('');
  $$('[data-url]', grid).forEach(button => button.addEventListener('click', () => window.open(button.dataset.url, '_blank', 'noopener,noreferrer')));
  $$('[data-outlet-edit]', grid).forEach(button => button.addEventListener('click', () => openOutletModal(button.dataset.outletEdit)));
  $$('[data-website-toggle]', grid).forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    await toggleWebsiteAvailability(button.dataset.websiteToggle);
  }));
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
    state.orderHistoryRecords = null;
    state.orderHistoryRangeLabel = 'Latest order history';
    renderOverviewOutlets();
    updateDashboardContext();
    try {
      await loadPosMenu();
      await loadOrders();
      await loadReports();
    } catch (error) {
      console.error('Unable to refresh POS menu:', error);
      toast(error.message || 'Unable to load POS menu.', 'bad');
    }
  };
}

function renderOverviewOutlets() {
  renderOverview();
}

function renderOverview() {
  if (!$('#overview')) return;

  const scopedOutlets = state.selectedOutlet === 'ALL'
    ? (state.outlets || [])
    : (state.outlets || []).filter(outlet => outlet.slug === state.selectedOutlet);
  const scopedOutletIds = new Set(scopedOutlets.map(outlet => outlet.id));
  const sessionOrders = (state.orders || []).filter(order =>
    scopedOutletIds.has(order.outlet_id) && isCurrentSessionOrder(order)
  );
  const paidOrders = sessionOrders.filter(order =>
    order.payment_status === 'PAID' &&
    order.order_status !== 'CANCELLED' &&
    !isFamilyFriendsOrder(order)
  );
  const liveOrders = sessionOrders.filter(order =>
    ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.order_status)
  );
  const sessionSales = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const averageOrder = paidOrders.length ? sessionSales / paidOrders.length : 0;

  const globalLiveItems = (menuManagementState.items || []).filter(item =>
    item.is_available === true && item.is_archived !== true
  );
  let liveMenuCount = globalLiveItems.length;
  if (state.selectedOutlet !== 'ALL' && scopedOutlets[0]) {
    const outletId = scopedOutlets[0].id;
    liveMenuCount = globalLiveItems.filter(item =>
      menuManagementState.outletAvailability.get(`${outletId}:${item.id}`) === true
    ).length;
  }

  if ($('#overviewSessionSales')) $('#overviewSessionSales').textContent = formatReportMoney(sessionSales);
  if ($('#overviewSessionOrders')) $('#overviewSessionOrders').textContent = String(sessionOrders.length);
  if ($('#overviewAverageOrder')) $('#overviewAverageOrder').textContent = formatReportMoney(averageOrder);
  if ($('#overviewMenuCount')) $('#overviewMenuCount').textContent = String(liveMenuCount);
  if ($('#overviewLiveOrderFoot')) $('#overviewLiveOrderFoot').textContent = `${liveOrders.length} live order${liveOrders.length === 1 ? '' : 's'}`;
  if ($('#overviewMenuFoot')) $('#overviewMenuFoot').textContent = `${liveMenuCount} active item${liveMenuCount === 1 ? '' : 's'}`;
  if ($('#overviewLiveCount')) $('#overviewLiveCount').textContent = `${liveOrders.length} LIVE`;

  const liveList = $('#overviewLiveOrders');
  if (liveList) {
    liveList.innerHTML = liveOrders.length
      ? liveOrders.slice(0, 8).map(order => {
          const itemCount = (order.order_items || []).reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
          );
          return `
            <div class="overview-order-row">
              <div class="overview-order-main"><strong>Order #${escapeHtml(order.order_number)} · ${escapeHtml(order.outlets?.name || 'OHHO Outlet')}</strong><span>${escapeHtml(order.order_type || 'TAKEAWAY')} · ${itemCount} item${itemCount === 1 ? '' : 's'}</span></div>
              <span class="overview-order-status">${escapeHtml(order.order_status || 'NEW')}</span>
              <div class="overview-order-total"><strong>${formatReportMoney(order.total_amount)}</strong><span>${formatOrderTime(order.created_at)}</span></div>
            </div>
          `;
        }).join('')
      : '<div class="empty"><div><div class="empty-icon">⌁</div><strong>Your order queue is clear.</strong><p>New POS orders will appear here automatically.</p></div></div>';
  }

  const openOutlets = scopedOutlets.filter(outlet => outlet.status === 'ACTIVE');
  if ($('#overviewOpenOutlets')) $('#overviewOpenOutlets').textContent = String(openOutlets.length);
  if ($('#overviewPulseItems')) $('#overviewPulseItems').textContent = String(liveMenuCount);
  if ($('#overviewPulseOrders')) $('#overviewPulseOrders').textContent = String(liveOrders.length);
  if ($('#overviewActiveOutlets')) $('#overviewActiveOutlets').textContent = `${openOutlets.length} active`;
  if ($('#overviewPulseLabel')) $('#overviewPulseLabel').textContent = openOutlets.length ? '● LIVE' : '● CLOSED';
  if ($('#overviewPulseTitle')) $('#overviewPulseTitle').textContent = openOutlets.length ? 'Ready to serve.' : 'Outlets are closed.';
  if ($('#overviewPulseCopy')) {
    $('#overviewPulseCopy').textContent = openOutlets.length
      ? `${openOutlets.length} of ${scopedOutlets.length} outlet${scopedOutlets.length === 1 ? '' : 's'} open with ${liveOrders.length} live order${liveOrders.length === 1 ? '' : 's'}.`
      : 'Turn an outlet ON to begin a new sales session.';
  }
  if ($('#overviewPulseTrack')) {
    const openShare = scopedOutlets.length ? (openOutlets.length / scopedOutlets.length) * 100 : 0;
    $('#overviewPulseTrack').style.width = `${openShare}%`;
  }

  const outletList = $('.overview-outlet-list');
  if (outletList) {
    outletList.innerHTML = scopedOutlets.map(outlet => {
      const outletPaidOrders = paidOrders.filter(order => order.outlet_id === outlet.id);
      const outletSales = outletPaidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      const share = sessionSales ? (outletSales / sessionSales) * 100 : 0;
      return `
        <div class="outlet">
          <div class="outlet-top"><span class="outlet-name">${escapeHtml(outlet.name)}</span><span class="outlet-revenue">${formatReportMoney(outletSales)}</span></div>
          <div class="outlet-meta">${outletPaidOrders.length} paid order${outletPaidOrders.length === 1 ? '' : 's'} · ${formatTime(outlet.opening_time)} – ${formatTime(outlet.closing_time)}</div>
          <div class="progress"><span style="width:${Math.min(100, share)}%"></span></div>
          <div class="outlet-foot"><span>${Math.round(share)}% of session sales</span><span class="${outlet.status === 'ACTIVE' ? 'green' : ''}">${escapeHtml(outlet.status === 'ACTIVE' ? 'OPEN' : 'CLOSED')}</span></div>
        </div>
      `;
    }).join('');
  }

  const paymentTotal = method => paidOrders
    .filter(order => order.payment_method === method)
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const cash = paymentTotal('CASH');
  const upi = paymentTotal('UPI');
  const card = paymentTotal('CARD');
  const setPayment = (valueId, barId, value) => {
    if ($(valueId)) $(valueId).textContent = formatReportMoney(value);
    if ($(barId)) $(barId).style.width = `${sessionSales ? (value / sessionSales) * 100 : 0}%`;
  };
  if ($('#overviewPaymentTotal')) $('#overviewPaymentTotal').textContent = `${formatReportMoney(sessionSales)} total`;
  setPayment('#overviewCash', '#overviewCashBar', cash);
  setPayment('#overviewUpi', '#overviewUpiBar', upi);
  setPayment('#overviewCard', '#overviewCardBar', card);
  renderOverviewOperations();

  const topStatus = $('.topbar .status');
  if (topStatus) topStatus.innerHTML = `<i></i>${openOutlets.length ? `${openOutlets.length} OPEN` : 'CLOSED'}`;
}

function updateDashboardContext() {
  const span = $('.context span');
  if (!span) return;
  const selected = state.outlets.find(o => o.slug === state.selectedOutlet);
  const date = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
  span.textContent = `${date} · ${selected ? selected.name : 'All outlets'} · Live operations`;
}

function openOutletModal(outletId = null) {
  const editing = Boolean(outletId);
  if (editing ? !['ADMIN', 'OWNER'].includes(state.profile?.role) : state.profile?.role !== 'ADMIN') {
    toast(editing ? 'Admin or Owner access required.' : 'Admin access required.', 'bad');
    return;
  }

  const modal = $('#outletModal');
  if (!modal) return;
  const form = $('#outletForm', modal);
  const outlet = editing ? state.outlets.find(item => item.id === outletId) : null;
  if (editing && !outlet) return;
  state.editingOutletId = outlet?.id || null;
  form.reset();
  $('#outletName', modal).value = outlet?.name || '';
  $('#outletSlug', modal).value = outlet?.slug || '';
  $('#outletSlug', modal).dataset.touched = editing ? '1' : '';
  $('#outletAddress', modal).value = outlet?.address || '';
  $('#outletPhone', modal).value = outlet?.phone || '';
  $('#outletStatus', modal).value = outlet?.status || 'ACTIVE';
  $('#outletWebsiteEnabled', modal).value = String(outlet?.website_enabled !== false);
  $('#openingTime', modal).value = outlet?.opening_time?.slice(0, 5) || '17:00';
  $('#closingTime', modal).value = outlet?.closing_time?.slice(0, 5) || '01:00';
  $('#mapsUrl', modal).value = outlet?.maps_url || '';
  $('#zomatoUrl', modal).value = outlet?.zomato_url || '';
  $('#swiggyUrl', modal).value = outlet?.swiggy_url || '';
  $('#outletModalTitle', modal).textContent = editing ? 'Edit Outlet Details' : 'Add New Outlet';
  $('.modal-head p', modal).textContent = editing
    ? 'Update the details shown in POS and on the customer website.'
    : 'Register a new OHHO location and configure all current menu items.';
  $('#outletSubmit', modal).textContent = editing ? 'SAVE CHANGES' : 'CREATE OUTLET';
  $('#outletFormError', modal).classList.remove('show');
  modal.classList.add('open');
  setTimeout(() => $('#outletName', modal)?.focus(), 30);
}

function closeOutletModal() {
  $('#outletModal')?.classList.remove('open');
  state.editingOutletId = null;
}

async function saveOutlet(event) {
  event.preventDefault();
  const modal = $('#outletModal');
  const form = event.currentTarget;
  const button = $('#outletSubmit', modal);
  const errorNode = $('#outletFormError', modal);
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  const editingId = state.editingOutletId;
  if (editingId) body.id = editingId;
  button.disabled = true;
  errorNode.classList.remove('show');
  try {
    const payload = await apiRequest(editingId ? 'PATCH' : 'POST', body);
    state.outlets = editingId
      ? state.outlets.map(item => item.id === editingId ? payload.outlet : item)
      : [...state.outlets, payload.outlet];
    renderOutletCards();
    renderOutletSelector();
    renderOverviewOutlets();
    renderSettings();
    updatePosOutletName();
    closeOutletModal();
    toast(editingId
      ? `${payload.outlet.name} details updated on POS and website.`
      : `${payload.outlet.name} created with ${payload.menuItemsConfigured} menu items configured.`, 'ok');
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

async function deleteOrderAsAdmin(orderId, orderNumber = '') {
  if (state.profile?.role !== 'ADMIN') {
    toast('Admin access required.', 'bad');
    return;
  }

  const confirmed = window.confirm(
    `Remove order #${orderNumber || orderId}? This cannot be undone.`
  );
  if (!confirmed) return;

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData?.session?.access_token) {
    toast('Your session has expired. Please log in again.', 'bad');
    return;
  }

  try {
    const response = await fetch('/api/pos/orders', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({ orderId })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Unable to remove order.');
    }

    await loadOrders();
    toast(`Order #${orderNumber || ''} removed.`, 'ok');
  } catch (error) {
    console.error('Unable to remove order:', error);
    toast(error.message || 'Unable to remove order.', 'bad');
  }
}

function closeOrderEditModal() {
  $('#orderEditModal')?.classList.remove('open');
  state.orderEdit.orderId = null;
  state.orderEdit.items = [];
}

function availableItemsForOrder(order) {
  return (menuManagementState.items || []).filter(item =>
    item.is_available === true &&
    item.is_archived !== true &&
    menuManagementState.outletAvailability.get(`${order.outlet_id}:${item.id}`) === true
  );
}

function openOrderEditModal(orderId) {
  const order = (state.orders || []).find(item => item.id === orderId);
  if (!order || ['COMPLETED', 'CANCELLED'].includes(order.order_status)) {
    toast('This order can no longer be edited.', 'bad');
    return;
  }

  state.orderEdit.orderId = order.id;
  state.orderEdit.items = (order.order_items || []).map(item => ({
    menuItemId: item.menu_item_id,
    name: item.item_name || 'Menu Item',
    price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0)
  })).filter(item => item.menuItemId && item.quantity > 0);
  $('#orderEditTitle').textContent = `Edit Order #${order.order_number}`;
  $('#orderEditModal')?.classList.add('open');
  renderOrderEditModal();
}

function renderOrderEditModal() {
  const list = $('#orderEditList');
  const select = $('#orderEditMenuSelect');
  const total = $('#orderEditTotal');
  const save = $('#orderEditSaveBtn');
  const order = (state.orders || []).find(item => item.id === state.orderEdit.orderId);
  if (!list || !select || !order) return;

  list.innerHTML = state.orderEdit.items.length
    ? state.orderEdit.items.map(item => `
        <div class="order-edit-row">
          <div><strong>${escapeHtml(item.name)}</strong><small>${formatReportMoney(item.price)} each</small></div>
          <div class="order-edit-qty"><button type="button" data-edit-action="decrease" data-menu-item-id="${escapeHtml(item.menuItemId)}">−</button><span>${item.quantity}</span><button type="button" data-edit-action="increase" data-menu-item-id="${escapeHtml(item.menuItemId)}">＋</button></div>
          <button type="button" class="order-edit-remove" data-edit-action="remove" data-menu-item-id="${escapeHtml(item.menuItemId)}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
        </div>
      `).join('')
    : '<div class="order-edit-empty">Add at least one menu item to this order.</div>';

  const selectedIds = new Set(state.orderEdit.items.map(item => item.menuItemId));
  const available = availableItemsForOrder(order).filter(item => !selectedIds.has(item.id));
  select.innerHTML = available.length
    ? available.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${formatReportMoney(item.price)}</option>`).join('')
    : '<option value="">No more available items</option>';
  $('#orderEditAddBtn').disabled = !available.length;

  const updatedTotal = state.orderEdit.items.reduce(
    (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)),
    0
  );
  if (total) total.textContent = formatReportMoney(updatedTotal);
  if (save) save.disabled = !state.orderEdit.items.length;
}

function handleOrderEditItemAction(event) {
  const button = event.target.closest('[data-edit-action]');
  if (!button) return;
  const item = state.orderEdit.items.find(entry => entry.menuItemId === button.dataset.menuItemId);
  if (!item) return;

  if (button.dataset.editAction === 'increase' && item.quantity < 99) item.quantity += 1;
  if (button.dataset.editAction === 'decrease') {
    if (item.quantity > 1) item.quantity -= 1;
    else state.orderEdit.items = state.orderEdit.items.filter(entry => entry !== item);
  }
  if (button.dataset.editAction === 'remove') {
    state.orderEdit.items = state.orderEdit.items.filter(entry => entry !== item);
  }
  renderOrderEditModal();
}

function addSelectedOrderEditItem() {
  const menuItemId = $('#orderEditMenuSelect')?.value;
  const order = (state.orders || []).find(item => item.id === state.orderEdit.orderId);
  const menuItem = order
    ? availableItemsForOrder(order).find(item => item.id === menuItemId)
    : null;
  if (!menuItem || state.orderEdit.items.some(item => item.menuItemId === menuItem.id)) return;
  state.orderEdit.items.push({
    menuItemId: menuItem.id,
    name: menuItem.name,
    price: Number(menuItem.price || 0),
    quantity: 1
  });
  renderOrderEditModal();
}

async function saveOrderEdit() {
  if (!state.orderEdit.orderId || !state.orderEdit.items.length) return;
  const button = $('#orderEditSaveBtn');
  if (!button || button.disabled) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'SAVING…';

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const response = await fetch('/api/pos/orders', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({
        orderId: state.orderEdit.orderId,
        items: state.orderEdit.items.map(item => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity
        }))
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to edit this order.');
    closeOrderEditModal();
    await Promise.all([loadOrders({ silent: true }), loadReports()]);
    toast(`Order #${result.order?.order_number || ''} updated.`, 'ok');
  } catch (error) {
    console.error('Unable to edit order:', error);
    toast(error.message || 'Unable to edit this order.', 'bad');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function wireOrdersActions() {
  const search = $('#ordersSearch');
  const status = $('#ordersStatusFilter');

  search?.addEventListener('input', () => {
    if (search.value.trim()) state.ordersArchiveOpen = true;
    renderOrders();
  });
  status?.addEventListener('change', renderOrders);

  $('#ordersArchiveToggle')?.addEventListener('click', () => {
    state.ordersArchiveOpen = !state.ordersArchiveOpen;
    renderOrders();
  });

  $('#ordersCustomDateToggle')?.addEventListener('click', () => {
    const panel = $('#ordersCustomDatePanel');
    const button = $('#ordersCustomDateToggle');
    const willOpen = panel?.classList.contains('hidden');
    panel?.classList.toggle('hidden', !willOpen);
    button?.setAttribute('aria-expanded', String(Boolean(willOpen)));
    if (willOpen) {
      const today = localDateInputValue();
      if ($('#ordersDateFrom') && !$('#ordersDateFrom').value) $('#ordersDateFrom').value = today;
      if ($('#ordersDateTo') && !$('#ordersDateTo').value) $('#ordersDateTo').value = today;
    }
  });
  $('#ordersApplyDateBtn')?.addEventListener('click', () => loadCompleteOrderHistory({ custom: true }));
  $('#ordersShowAllBtn')?.addEventListener('click', () => loadCompleteOrderHistory({ custom: false }));
  $('#ordersClearDateBtn')?.addEventListener('click', clearCompleteOrderHistory);
  $('#ordersHistoryDownloadBtn')?.addEventListener('click', downloadOrderHistoryCsv);

  $('#ordersBoard')?.addEventListener('click', event => {
    const editButton = event.target.closest('[data-order-edit]');
    if (editButton) {
      openOrderEditModal(editButton.dataset.orderEdit);
      return;
    }
    const deleteButton = event.target.closest('.order-delete-btn');
    if (deleteButton) {
      deleteOrderAsAdmin(
        deleteButton.dataset.orderId,
        deleteButton.dataset.orderNumber
      );
      return;
    }

    const button = event.target.closest('.order-action-btn');
    if (!button) return;

    updateOrderStatus(
      button.dataset.orderId,
      button.dataset.nextStatus
    );
  });

  $('#ordersHistoryBoard')?.addEventListener('click', event => {
    const deleteButton = event.target.closest('.order-delete-btn');
    if (!deleteButton) return;
    deleteOrderAsAdmin(
      deleteButton.dataset.orderId,
      deleteButton.dataset.orderNumber
    );
  });
}


const menuManagementState = {
  items: [],
  categories: [],
  outletAvailability: new Map(),
  pendingOutletAvailability: new Set(),
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
  renderSettings();
  renderOverview();
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

  const canManageMenu = ['ADMIN', 'OWNER'].includes(state.profile?.role);
  const addMenuButton = $('#menuAddItemBtn');
  if (addMenuButton) addMenuButton.classList.toggle('hidden', !canManageMenu);

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
          const key = `${outlet.id}:${item.id}`;
          const available = menuManagementState.outletAvailability.get(key) === true;
          const pending = menuManagementState.pendingOutletAvailability.has(key);
          return `<div class="menu-outlet-cell">
            <button type="button" class="menu-outlet-pill ${available ? 'on' : 'off'}" data-menu-outlet="${escapeHtml(outlet.id)}" data-menu-item="${escapeHtml(item.id)}" data-menu-outlet-name="${escapeHtml(outlet.name || outlet.slug || 'OUTLET')}" aria-label="${escapeHtml(outlet.name || outlet.slug || 'Outlet')} availability for ${escapeHtml(item.name)}" aria-busy="${pending}" ${pending ? 'disabled' : ''}>${pending ? 'SAVING' : available ? 'ON' : 'OFF'}</button>
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


async function optimizeMenuItemImage(file) {
  if (!file || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 800;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = type => new Promise(resolve => canvas.toBlob(resolve, type, 0.82));
    let blob = await encode('image/webp');
    if (!blob || !['image/webp', 'image/jpeg'].includes(blob.type)) blob = await encode('image/jpeg');
    if (!blob || blob.size >= file.size || !['image/webp', 'image/jpeg'].includes(blob.type)) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'menu-image';
    return new File([blob], `${baseName}.${extension}`, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

async function uploadMenuItemImage(file, itemKey) {
  if (!file) return null;

  const uploadFile = await optimizeMenuItemImage(file);
  const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeKey = String(itemKey || 'menu-item').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const path = `${safeKey}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase
    .storage
    .from('menu-images')
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: uploadFile.type
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

  const addMenuButton = $('#menuAddItemBtn');
  if (addMenuButton) {
    addMenuButton.addEventListener('click', () => {
      if (!['ADMIN', 'OWNER'].includes(state.profile?.role)) {
        toast('You do not have permission to add menu items.', 'bad');
        return;
      }
      openMenuItemModal();
    });
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
  if (menuManagementState.pendingOutletAvailability.has(key)) return;
  const current = menuManagementState.outletAvailability.get(key) === true;
  const next = !current;

  menuManagementState.pendingOutletAvailability.add(key);
  renderMenuManagement();

  try {
    let result;
    if (['ADMIN', 'OWNER'].includes(role)) {
      result = await supabase
        .from('outlet_menu_items')
        .upsert({ outlet_id: outletId, menu_item_id: menuItemId, is_available: next }, {
          onConflict: 'outlet_id,menu_item_id'
        })
        .select('outlet_id,menu_item_id,is_available')
        .single();
    } else {
      result = await supabase
        .from('outlet_menu_items')
        .update({ is_available: next })
        .eq('outlet_id', outletId)
        .eq('menu_item_id', menuItemId)
        .select('outlet_id,menu_item_id,is_available')
        .maybeSingle();
    }

    if (result.error) throw result.error;
    if (!result.data) {
      throw new Error(`No saved availability record exists for ${outletName}. Ask an Admin or Owner to toggle this item once to create its outlet mapping.`);
    }

    menuManagementState.outletAvailability.set(key, result.data.is_available === true);
    toast(`${outletName} · item ${result.data.is_available ? 'enabled' : 'disabled'}.`, 'ok');
    loadPosMenu().catch(error => console.error('Unable to refresh POS menu availability:', error));
  } catch (error) {
    console.error('Unable to change outlet menu availability:', error);
    toast(error.message || `Unable to update ${outletName}.`, 'bad');
  } finally {
    menuManagementState.pendingOutletAvailability.delete(key);
    renderMenuManagement();
  }
}

async function inventoryApi(method = 'GET', body = null, params = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const url = new URL('/api/outlets', window.location.origin);
  url.searchParams.set('resource', 'inventory');
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to complete inventory request.');
  return payload;
}

function inventoryItem(id) { return state.inventory.itemById?.get(id) || state.inventory.items.find(item => item.id === id); }
function inventoryOutlet(id) { return state.inventory.outlets.find(outlet => outlet.id === id); }
function inventoryDisplayQuantity(item, baseQuantity) {
  const value = Number(baseQuantity || 0);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value / 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value / 1000;
  return value;
}
function inventoryBaseQuantity(item, displayQuantity) {
  const value = Number(displayQuantity);
  if (item?.base_unit === 'G' && item?.display_unit === 'KG') return value * 1000;
  if (item?.base_unit === 'ML' && item?.display_unit === 'L') return value * 1000;
  return value;
}
function inventoryQty(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}
function inventoryMeasurementLabel(item) {
  return `${unitLabel(item?.supply_unit || item?.billing_unit)} supply → ${unitLabel(item?.inventory_unit || item?.base_unit)} inventory`;
}
function inventoryBillingUnit(item) { return unitLabel(item?.supply_unit || item?.billing_unit, 1); }
function inventoryInternalUnit(item, quantity = 2) { return unitLabel(item?.inventory_unit || item?.base_unit, quantity); }
function inventoryDate(value) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
function inventorySelectedOutletId() { return $('#inventoryOutletFilter')?.value || ''; }
function applyInventoryViewVisibility() {
  const view = state.inventory.activeView || 'work';
  $$('[data-inventory-view]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.inventoryView !== view));
  $$('#inventoryQuickNav [data-inventory-tab]').forEach(button => {
    const selected = button.dataset.inventoryTab === view;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('active', selected);
  });
}
function setInventoryView(view, { scroll = false } = {}) {
  const allowedView = view === 'setup' && state.profile?.role !== 'ADMIN' ? 'work' : view;
  state.inventory.activeView = ['work', 'stock', 'history', 'setup'].includes(allowedView) ? allowedView : 'work';
  applyInventoryViewVisibility();
  if (state.selectedSection === 'inventory' && state.inventory.loaded) renderInventory();
  if (scroll) {
    const firstPanel = $(`[data-inventory-view="${state.inventory.activeView}"]:not(.hidden)`);
    firstPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function completedInventorySessions(outletId, from = '', to = '') {
  const reports = (state.salesReports || []).filter(report => !outletId || report.outlet_id === outletId);
  return selectCompletedSessions(reports, { range: from || to ? 'CUSTOM' : 'ALL', from, to });
}
function inventorySessionRows(rows, field, outletId, from = '', to = '') {
  const bounds = completedInventorySessions(outletId, from, to);
  if (bounds.invalid) throw new Error('Choose both session closing dates, with From on or before To.');
  return (rows || []).filter(row => (!outletId || row.outlet_id === outletId) && recordIsInSessions(row, field, bounds.sessions));
}
function inventoryHistorySessions() {
  return [...new Map([...(state.salesReports || []), ...(state.inventory.openSessions || []).map(s => ({ ...s, closed_at:null }))].map(s => [`${s.outlet_id}:${s.opened_at}`,s])).values()];
}
function inventoryHistoryRows(rows, field) {
  return stockHistoryRows(rows, field, { mode:state.inventory.historyMode, outletId:inventorySelectedOutletId(), sessions:inventoryHistorySessions(), from:state.inventory.historyFrom, to:state.inventory.historyTo });
}
function centralSupplyHistoryRows() {
  return inventoryHistoryRows(state.inventory.bills, 'supplied_at').filter(row => (row.purchase_source || 'CENTRAL') === 'CENTRAL');
}

function currentInventorySessionRows(rows, field, outletId = '') {
  return (rows || []).filter(row => (!outletId || row.outlet_id === outletId) && recordIsInOpenSessions(row, field, state.inventory.outlets));
}

function inventorySelectOptions(select, items, selected = '') {
  if (!select) return;
  select.innerHTML = items.map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('');
  if (selected && [...select.options].some(option => option.value === selected)) select.value = selected;
}

function fillInventoryControls() {
  const previousFilter = $('#inventoryOutletFilter')?.value || '';
  const outletOptions = state.inventory.outlets.map(outlet => ({ value: outlet.id, label: outlet.name }));
  inventorySelectOptions($('#inventoryOutletFilter'), state.profile?.role === 'ADMIN' ? [{ value: '', label: 'All outlets' }, ...outletOptions] : outletOptions, previousFilter);
  inventorySelectOptions($('#supplyOutlet'), outletOptions, $('#supplyOutlet')?.value);
  inventorySelectOptions($('#localPurchaseOutlet'), outletOptions, $('#localPurchaseOutlet')?.value);
  inventorySelectOptions($('#openingStockOutlet'), outletOptions, $('#openingStockOutlet')?.value);
  inventorySelectOptions($('#expenseOutlet'), outletOptions, $('#expenseOutlet')?.value);
  inventorySelectOptions($('#expenseOutletFilter'), state.profile?.role === 'ADMIN' ? [{ value: '', label: 'All outlets' }, ...outletOptions] : outletOptions, $('#expenseOutletFilter')?.value);
  inventorySelectOptions($('#stockRequestOutlet'), outletOptions, $('#stockRequestOutlet')?.value);
  inventorySelectOptions($('#inventoryItemCategory'), state.inventory.stockCategories.filter(row => row.active !== false).map(row => ({ value: row.id, label: row.name })), $('#inventoryItemCategory')?.value);
  inventorySelectOptions($('#inventoryMasterCategory'), [{ value: '', label: 'All categories' }, ...state.inventory.stockCategories.map(row => ({ value: row.id, label: row.name }))], $('#inventoryMasterCategory')?.value);
  inventorySelectOptions($('#stockRequestCategory'), state.inventory.stockCategories.filter(row => row.active !== false).map(row => ({ value: row.id, label: row.name })), $('#stockRequestCategory')?.value);
  inventorySelectOptions($('#expenseCategory'), state.inventory.expenseCategories.filter(row => row.active !== false).map(row => ({ value: row.id, label: row.name })), $('#expenseCategory')?.value);
  const activeMenuCategories = state.inventory.menuCategories.filter(row => row.active !== false);
  const previousRecipeMenuCategory = $('#recipeMenuCategory')?.value || '';
  inventorySelectOptions($('#recipeMenuCategory'), activeMenuCategories.map(row => ({ value: row.id, label: row.name })), previousRecipeMenuCategory);
  const recipeMenuCategoryId = $('#recipeMenuCategory')?.value || '';
  const recipeMenuItems = state.inventory.menuItems.filter(row => !recipeMenuCategoryId || row.category_id === recipeMenuCategoryId);
  inventorySelectOptions($('#recipeMenuItem'), recipeMenuItems.map(row => ({ value: row.id, label: row.name })), $('#recipeMenuItem')?.value);
  const previousRecipeCategory = $('#recipeStockCategory')?.value || '';
  inventorySelectOptions($('#recipeStockCategory'), state.inventory.stockCategories.filter(row => row.active !== false).map(row => ({ value: row.id, label: row.name })), previousRecipeCategory);
  const recipeCategoryId = $('#recipeStockCategory')?.value || '';
  const recipeStockItems = state.inventory.items.filter(row => row.active !== false && (!recipeCategoryId || row.category_id === recipeCategoryId));
  inventorySelectOptions($('#recipeStockItem'), recipeStockItems.map(row => ({ value: row.id, label: `${row.name} · ${inventoryInternalUnit(row)}` })), $('#recipeStockItem')?.value);
  const previousMonitorCategory = $('#recipeMonitorCategory')?.value || '';
  inventorySelectOptions($('#recipeMonitorCategory'), [{ value: '', label: 'All menu categories' }, ...activeMenuCategories.map(row => ({ value: row.id, label: row.name }))], previousMonitorCategory);
  const monitorCategoryId = $('#recipeMonitorCategory')?.value || '';
  const recipeMenuIds = new Set(state.inventory.recipes.map(row => row.menu_item_id));
  const monitorMenuItems = state.inventory.menuItems.filter(row => recipeMenuIds.has(row.id) && (!monitorCategoryId || row.category_id === monitorCategoryId));
  inventorySelectOptions($('#recipeMonitorItem'), [{ value: '', label: 'All saved recipes' }, ...monitorMenuItems.map(row => ({ value: row.id, label: row.name }))], $('#recipeMonitorItem')?.value);
  inventorySelectOptions($('#wastageMenuItem'), state.inventory.menuItems.map(row => ({ value: row.id, label: row.name })), $('#wastageMenuItem')?.value);
  inventorySelectOptions($('#wastageStockItem'), state.inventory.items.filter(row => row.active !== false).map(row => ({ value: row.id, label: `${row.name} · ${inventoryInternalUnit(row)}` })), $('#wastageStockItem')?.value);
  inventorySelectOptions($('#packagingRuleItem'), state.inventory.items.filter(row => row.active !== false).map(row => ({ value: row.id, label: `${row.name} · ${inventoryInternalUnit(row)}` })), $('#packagingRuleItem')?.value);
  inventorySelectOptions($('#packagingMenuItem'), state.inventory.menuItems.map(row => ({ value: row.id, label: row.name })), $('#packagingMenuItem')?.value);
  inventorySelectOptions($('#packagingMenuCategory'), state.inventory.menuCategories.map(row => ({ value: row.id, label: row.name })), $('#packagingMenuCategory')?.value);
  const previousStaffCategory = $('#staffRuleCategory')?.value || '';
  inventorySelectOptions($('#staffRuleCategory'), state.inventory.stockCategories.filter(row => row.active !== false).map(row => ({ value: row.id, label: row.name })), previousStaffCategory);
  const staffCategoryId = $('#staffRuleCategory')?.value || '';
  const staffItems = state.inventory.items.filter(row => row.active !== false && (!staffCategoryId || row.category_id === staffCategoryId));
  inventorySelectOptions($('#staffRuleItem'), staffItems.map(row => ({ value: row.id, label: `${row.name} · ${inventoryInternalUnit(row)}` })), $('#staffRuleItem')?.value);
  inventorySelectOptions($('#staffConsumptionOutlet'), outletOptions, $('#staffConsumptionOutlet')?.value || inventorySelectedOutletId());
  const selectedSupplyItem = inventoryItem($('#supplyItem')?.value);
  if (!selectedSupplyItem && $('#supplyItem')) $('#supplyItem').value = '';
  if (selectedSupplyItem && $('#supplyItemSearch') && !$('#supplyItemSearch').value) $('#supplyItemSearch').value = selectedSupplyItem.name;
  renderSupplyItemPicker($('#supplyItemSearch')?.value || '', false);
  updateSupplyDefaultPrice();
  const admin = state.profile?.role === 'ADMIN';
  const owner = state.profile?.role === 'OWNER';
  $('#packagingRulesPanel')?.classList.toggle('hidden', !admin);
  if ($('#inventoryAdminWorkspace')) $('#inventoryAdminWorkspace').style.display = admin ? '' : 'none';
  if ($('#staffConsumptionPanel')) $('#staffConsumptionPanel').style.display = ['ADMIN','OWNER','MANAGER'].includes(state.profile?.role) ? '' : 'none';
  if ($('#staffRuleSetupPanel')) $('#staffRuleSetupPanel').style.display = (admin || owner) ? '' : 'none';
  if ($('#requestOperationsToolbar')) $('#requestOperationsToolbar').style.display = admin ? '' : 'none';
  $$('#inventoryQuickNav [data-admin-only]').forEach(button => button.classList.toggle('hidden', !admin));
  applyInventoryViewVisibility();
  if ($('#inventoryPageTitle')) $('#inventoryPageTitle').textContent = admin ? 'Stock & Supply Management' : 'Stock Requirements & Supply Bills';
  if ($('#inventoryMasterPanel')) $('#inventoryMasterPanel').style.display = admin ? '' : 'none';
  if ($('#openingStockPanel')) $('#openingStockPanel').style.display = admin ? '' : 'none';
  if ($('#stockRequestCreatePanel')) $('#stockRequestCreatePanel').style.display = owner ? '' : 'none';
  if ($('#wastagePanel')) $('#wastagePanel').style.display = owner ? '' : 'none';
  if ($('#stockRequestAdminPanel')) $('#stockRequestAdminPanel').style.display = admin || owner ? '' : 'none';
  if ($('#stockRequestHistoryHint')) $('#stockRequestHistoryHint').textContent = owner ? 'Latest first · Edit before Admin starts processing' : 'Use a request to prepare its supply bill';
  if ($('#expenseCategoryAdminPanel')) $('#expenseCategoryAdminPanel').style.display = admin ? '' : 'none';
  if ($('#ownerExpenseEntryPanel')) $('#ownerExpenseEntryPanel').style.display = owner ? '' : 'none';
  if ($('#expenseDate') && !$('#expenseDate').value) $('#expenseDate').value = new Date().toLocaleDateString('en-CA');
  if ($('#stockRequestDate') && !$('#stockRequestDate').value) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    $('#stockRequestDate').value = tomorrow.toLocaleDateString('en-CA');
  }
}

function renderStockRequestCatalogue() {
  const list = $('#stockRequestCatalogue');
  if (!list) return;
  const categoryId = $('#stockRequestCategory')?.value || state.inventory.stockCategories.find(row => row.active !== false)?.id || '';
  const choices = state.inventory.items.filter(item => item.active !== false && !item.local_outlet_id && (!categoryId || item.category_id === categoryId));
  inventorySelectOptions($('#stockRequestItem'), choices.map(item => ({ value: item.id, label: `${item.name} · ${unitLabel(stockRequestUnit(item))}` })), $('#stockRequestItem')?.value);
  const selected = state.inventory.requestLines;
  list.innerHTML = selected.length ? selected.map(row => {
    const item = inventoryItem(row.itemId) || {};
    const supplyUnit = row.unit || stockRequestUnit(item);
    const step = ['PIECE','PACK','CAN','BOX','BOTTLE'].includes(supplyUnit) ? '1' : '0.001';
    return `<div class="stock-request-selected-row"><strong>${escapeHtml(item.name || 'Item')}${row.suggested ? '<small> · SUGGESTED</small>' : ''}</strong><label><input type="number" min="${step}" step="${step}" value="${Number(row.quantity)}" data-request-line-quantity="${row.itemId}"> ${escapeHtml(unitLabel(supplyUnit))}</label><button type="button" data-remove-request-item="${row.itemId}">REMOVE</button></div>`;
  }).join('') : `<div class="inventory-empty">${escapeHtml(state.inventory.requirementMessage || 'Generate suggestions or choose an item and quantity above.')}</div>`;
}

function canEditStockRequest(request) {
  return state.profile?.role === 'OWNER' && request.created_by === state.session?.user?.id &&
    ['DRAFT','SUBMITTED'].includes(request.status) && !request.bill_id && !request.processing_started_at;
}

function stockRequestCard(request, latest = false) {
  const owner = state.profile?.role === 'OWNER';
  const label = request.processing_started_at && request.status === 'SUBMITTED' ? 'PROCESSING' : request.status;
  const editable = canEditStockRequest(request);
  const items = request.franchise_stock_request_items || [];
  const relatedBill = request.bill_id ? (state.inventory.bills || []).find(bill => bill.id === request.bill_id) : null;
  const suppliedItemIds = new Set((relatedBill?.supply_bill_items || []).map(item => item.item_id));
  const pendingItems = request.bill_id ? items.filter(item => !suppliedItemIds.has(item.item_id)) : items;
  const fulfilmentSummary = request.bill_id
    ? `<p class="stock-request-note">${items.length - pendingItems.length} of ${items.length} requested items supplied${pendingItems.length ? ` · Pending: ${pendingItems.map(item => escapeHtml(item.item_name)).join(', ')}` : ''}</p>`
    : '';
  const statusClass = request.status === 'FULFILLED' ? 'in' : request.status === 'CANCELLED' ? 'out' : 'low';
  const lines = items.map(item => `
    <div class="stock-request-line">
      <strong>${escapeHtml(item.item_name)}</strong>
      <span><small>REQUESTED</small>${inventoryQty(item.quantity)} ${escapeHtml(unitLabel(item.unit, item.quantity))}</span>
      <span><small>BILLING</small>${Number(item.billing_quantity) > 0 ? `${inventoryQty(item.billing_quantity)} ${escapeHtml(unitLabel(item.billing_unit, item.billing_quantity))}` : 'Pending'}</span>
      <span><small>INVENTORY</small>${Number(item.inventory_quantity) > 0 ? `+${inventoryQty(item.inventory_quantity)} ${escapeHtml(unitLabel(item.inventory_unit, item.inventory_quantity))}` : 'Pending'}</span>
    </div>`).join('');
  const ownerActions = owner ? (editable
    ? `<button class="primary" type="button" data-edit-stock-draft="${request.id}">EDIT REQUIREMENT</button><p>You can change this requirement until Admin starts preparing the supply.</p>`
    : `<button class="secondary" type="button" disabled>EDIT UNAVAILABLE</button><p>${request.created_by !== state.session?.user?.id ? 'Only the Owner who created this requirement can edit it.' : 'This requirement is being processed or has been completed. Contact Admin for changes.'}</p>`) : '';
  const adminActions = state.profile?.role === 'ADMIN' && ['SUBMITTED','PARTIAL'].includes(request.status)
    ? `<button class="primary" type="button" data-use-stock-request="${request.id}">${request.processing_started_at ? 'CONTINUE' : 'PREPARE'} SUPPLY BILL</button>${request.processing_started_at && !request.bill_id ? `<button class="secondary" type="button" data-release-stock-request="${request.id}">ALLOW OWNER TO EDIT</button>` : ''}${!request.bill_id ? `<button class="secondary danger" type="button" data-cancel-stock-request="${request.id}">CANCEL REQUEST</button>` : ''}` : '';
  const recordActions = `${request.bill_id ? `<button class="secondary" type="button" data-request-view-bill="${request.bill_id}">VIEW RELATED BILL</button>` : ''}${state.profile?.role === 'ADMIN' ? `<button class="secondary" type="button" data-request-view-stock="${request.outlet_id}">VIEW OUTLET INVENTORY</button>` : ''}`;
  return `<article class="stock-request-card${latest ? ' is-latest' : ''}"><div class="stock-request-top"><div><strong>${latest ? 'LATEST · ' : ''}${escapeHtml(inventoryOutlet(request.outlet_id)?.name || 'Outlet')} · Needed ${escapeHtml(request.required_for)}</strong><span>Updated ${inventoryDate(request.updated_at || request.created_at)} · ${items.length} item${items.length === 1 ? '' : 's'}</span></div><span class="inventory-status ${statusClass}">${escapeHtml(label)}</span></div>${request.notes ? `<p class="stock-request-note">${escapeHtml(request.notes)}</p>` : ''}${fulfilmentSummary}<details class="stock-request-detail"><summary>${items.length} REQUESTED ITEM${items.length === 1 ? '' : 'S'}</summary><div class="stock-request-lines">${lines}</div></details>${ownerActions || adminActions || recordActions ? `<div class="stock-request-actions">${adminActions}${ownerActions}${recordActions}</div>` : ''}</article>`;
}

function renderStockRequests() {
  const owner = state.profile?.role === 'OWNER';
  const requests = [...(state.inventory.requests || [])].filter(request => state.profile?.role !== 'ADMIN' || request.status !== 'DRAFT')
    .sort((a,b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  const outletId = inventorySelectedOutletId();
  const visible = requests.filter(request => !outletId || request.outlet_id === outletId);
  const active = visible.filter(request => !['FULFILLED','CANCELLED'].includes(request.status));
  const history = visible.filter(request => ['FULFILLED','CANCELLED'].includes(request.status));
  if ($('#stockRequestList')) $('#stockRequestList').innerHTML = visible.length ? `
    <div class="request-queue-head"><strong>ACTIVE REQUESTS</strong><span>${active.length} awaiting action</span></div>
    ${active.length ? active.map((request, index) => stockRequestCard(request, index === 0)).join('') : '<div class="inventory-empty">No active stock requirements.</div>'}
    ${history.length ? `<details class="request-history"><summary><strong>COMPLETED REQUESTS</strong><span>${history.length} previous request${history.length === 1 ? '' : 's'} · OPEN +</span></summary><div class="request-history-list">${history.map(request => stockRequestCard(request)).join('')}</div></details>` : ''}` : '<div class="inventory-empty">No requirements yet. Generate suggestions, then save or send your first requirement.</div>';
  if ($('#ownerLatestRequirementPanel')) $('#ownerLatestRequirementPanel').style.display = owner ? '' : 'none';
  if ($('#ownerLatestRequirement')) $('#ownerLatestRequirement').innerHTML = requests.length ? stockRequestCard(requests[0], true) : '<div class="inventory-empty">No requirements yet. Open Stock Requirements to create one.</div>';
}

function resetStockRequestEditor() {
  state.inventory.activeDraftId = null;
  state.inventory.requestLines = [];
  if ($('#stockRequestNotes')) $('#stockRequestNotes').value = '';
  if ($('#stockRequestEditorTitle')) $('#stockRequestEditorTitle').textContent = "Review tomorrow's stock";
  $('#stockRequestEditingNotice')?.classList.add('hidden');
  $('#cancelStockRequestEdit')?.classList.add('hidden');
  if ($('#stockRequestOutlet')) $('#stockRequestOutlet').disabled = false;
  if ($('#saveStockRequestDraft')) $('#saveStockRequestDraft').classList.remove('hidden');
  if ($('#submitStockRequest')) $('#submitStockRequest').textContent = 'CONFIRM & SEND';
  renderStockRequestCatalogue();
}

function renderDailyExpenses() {
  const list = $('#dailyExpenseList');
  if (!list) return;
  const outletId = $('#expenseOutletFilter')?.value || '';
  const from = state.inventory.expenseHistoryFrom || '';
  const to = state.inventory.expenseHistoryTo || '';
  const owner = state.profile?.role === 'OWNER';
  const mode = state.inventory.expenseHistoryMode;
  const currentMode = mode === 'CURRENT';
  const customMode = mode === 'CUSTOM';
  const sessions = [...(state.salesReports || []), ...(state.inventory.openSessions || []).map(row => ({ ...row, closed_at: null }))];
  const uniqueSessions = [...new Map(sessions.map(row => [`${row.outlet_id}:${row.opened_at}`, row])).values()];
  const groups = groupExpenseSessions(state.inventory.expenses, uniqueSessions, { mode, outletId, from, to });
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const count = groups.reduce((sum, group) => sum + group.expenses.length, 0);
  if ($('#expenseTodayTotal')) $('#expenseTodayTotal').textContent = formatReportMoney(total);
  if ($('#dailyExpenseHeading')) $('#dailyExpenseHeading').textContent = currentMode ? 'Current session expenses' : 'Expense history by session';
  if ($('#expenseFilterStatus')) $('#expenseFilterStatus').textContent = `${groups.filter(group => !group.unmatched).length} sessions · ${count} expenses · ${formatReportMoney(total)}`;
  for (const [id, active] of [['expenseCurrentSession', currentMode], ['expenseAllRecords', !currentMode && !customMode], ['expenseApplyFilter', customMode]]) {
    const button = $('#' + id);
    button?.classList.toggle('primary', active);
    button?.classList.toggle('secondary', !active);
    button?.setAttribute('aria-pressed', String(active));
  }
  list.innerHTML = groups.length ? groups.map(group => `<section class="expense-session-group">
    <div class="inventory-panel-head"><div><h3>${escapeHtml(inventoryOutlet(group.outlet_id)?.name || 'Outlet')} · ${group.unmatched ? 'Unassigned historical expenses' : group.closed_at ? 'Closed session' : 'Open session'}</h3><p>${group.unmatched ? 'These expense timestamps fall outside recorded sessions.' : `Opened ${inventoryDate(group.opened_at)} · ${group.closed_at ? `Closed ${inventoryDate(group.closed_at)}` : 'Still open'}`}</p></div><strong>${formatReportMoney(group.total)}</strong></div>
    <div class="expense-table-scroll"><table class="expense-session-table"><thead><tr><th>Date & time</th><th>Category</th><th>Note</th><th>Amount</th>${owner ? '<th>Actions</th>' : ''}</tr></thead><tbody>
    ${group.expenses.length ? group.expenses.slice().sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at)).map(row => `<tr><td>${inventoryDate(row.occurred_at)}</td><td>${escapeHtml(row.category_name || row.category || 'Other')}</td><td>${escapeHtml(row.description || '—')}</td><td>${formatReportMoney(row.amount)}</td>${owner ? `<td><button class="secondary" data-edit-expense="${row.id}">EDIT</button> <button class="secondary" data-delete-expense="${row.id}">DELETE</button></td>` : ''}</tr>`).join('') : `<tr><td colspan="${owner ? 5 : 4}">No expenses recorded in this session.</td></tr>`}
    </tbody><tfoot><tr><th colspan="3">Session total</th><th>${formatReportMoney(group.total)}</th>${owner ? '<td></td>' : ''}</tr></tfoot></table></div></section>`).join('') : '<div class="inventory-empty">No sessions in this range. Custom dates select sessions by opening date.</div>';

}

function renderStockCategories() {
  const list = $('#stockCategoryList');
  if (!list) return;
  const categories = state.inventory.stockCategories.filter(row => row.active !== false);
  list.innerHTML = categories.length ? categories.map(row => `<div class="daily-expense-row"><div><strong>${escapeHtml(row.name)}</strong><span>Active</span></div><div class="inventory-row-actions"><button class="secondary" type="button" data-edit-stock-category="${row.id}">EDIT</button><button class="secondary danger" type="button" data-delete-stock-category="${row.id}">DELETE</button></div></div>`).join('') : '<div class="inventory-empty">Create the first stock category.</div>';
}

function renderExpenseCategories() {
  const list = $('#expenseCategoryList');
  if (!list) return;
  const categories = state.inventory.expenseCategories.filter(row => row.active !== false);
  list.innerHTML = categories.length ? categories.map(row => `<div class="daily-expense-row"><div><strong>${escapeHtml(row.name)}</strong><span>Active</span></div><div class="inventory-row-actions"><button class="secondary" type="button" data-edit-expense-category="${row.id}">EDIT</button><button class="secondary danger" type="button" data-delete-expense-category="${row.id}">DELETE</button></div></div>`).join('') : '<div class="inventory-empty">Create the first expense category.</div>';
}

function recipeIngredientRow(row) {
  const item = inventoryItem(row.inventory_item_id) || {};
  const stockCategory = state.inventory.stockCategories.find(category => category.id === item.category_id)?.name || 'Uncategorised stock';
  const quantity = Number(row.base_quantity || 0);
  const usageType = row.usage_type || (row.is_packaging ? 'TAKEAWAY_DELIVERY' : 'FOOD');
  const usageLabel = usageType === 'DINE_IN' ? 'DINE-IN SERVICE ITEM' : usageType === 'TAKEAWAY_DELIVERY' ? 'TAKEAWAY / DELIVERY PACKAGING' : 'FOOD / STOCK INGREDIENT';
  return `<div class="daily-expense-row"><div><strong>${escapeHtml(item.name || 'Stock item')}</strong><span>${escapeHtml(stockCategory)} · ${inventoryQty(quantity)} ${escapeHtml(inventoryInternalUnit(item, quantity))} per menu item · ${usageLabel}</span></div><div class="inventory-row-actions"><button class="secondary" type="button" data-edit-recipe-menu="${row.menu_item_id}" data-edit-recipe-item="${row.inventory_item_id}">EDIT</button><button class="secondary danger" type="button" data-delete-recipe-menu="${row.menu_item_id}" data-delete-recipe-item="${row.inventory_item_id}">REMOVE</button></div></div>`;
}

function renderRecipeIngredients() {
  const list = $('#recipeIngredientList');
  if (!list) return;
  const menuItemId = $('#recipeMenuItem')?.value || '';
  const rows = state.inventory.recipes.filter(row => row.menu_item_id === menuItemId);
  list.innerHTML = rows.length ? rows.map(recipeIngredientRow).join('') : '<div class="inventory-empty">No recipe ingredients configured for this menu item. Choose another menu item or use Saved Recipe Monitor below.</div>';
}

function renderRecipeMonitor() {
  const list = $('#recipeMonitorList');
  if (!list) return;
  const categoryId = $('#recipeMonitorCategory')?.value || '';
  const menuItemId = $('#recipeMonitorItem')?.value || '';
  const menuItems = state.inventory.menuItems
    .filter(menu => (!categoryId || menu.category_id === categoryId) && (!menuItemId || menu.id === menuItemId))
    .map(menu => ({ menu, rows: state.inventory.recipes.filter(row => row.menu_item_id === menu.id) }))
    .filter(group => group.rows.length)
    .sort((a, b) => a.menu.name.localeCompare(b.menu.name));
  const ingredientCount = menuItems.reduce((sum, group) => sum + group.rows.length, 0);
  if ($('#recipeMonitorCount')) $('#recipeMonitorCount').textContent = `${menuItems.length} menu item${menuItems.length === 1 ? '' : 's'} · ${ingredientCount} ingredient${ingredientCount === 1 ? '' : 's'}`;
  if (!menuItems.length) {
    list.innerHTML = '<div class="inventory-empty">No saved recipes match these filters.</div>';
    return;
  }
  const categoryName = menu => state.inventory.menuCategories.find(category => category.id === menu.category_id)?.name || 'Other menu items';
  const categories = [...new Set(menuItems.map(group => categoryName(group.menu)))].sort((a, b) => a.localeCompare(b));
  list.innerHTML = categories.map(name => {
    const groups = menuItems.filter(group => categoryName(group.menu) === name);
    return `<div class="request-group"><h3>${escapeHtml(name)}</h3>${groups.map(group => `<details class="recipe-monitor-group"${menuItemId ? ' open' : ''}><summary><div><strong>${escapeHtml(group.menu.name)}</strong><span>${group.rows.length} saved ingredient${group.rows.length === 1 ? '' : 's'}</span></div><b>${group.rows.length} ITEMS</b></summary><div class="recipe-monitor-lines">${group.rows.map(recipeIngredientRow).join('')}</div></details>`).join('')}</div>`;
  }).join('');
}

function updatePackagingRuleFields() {
  const type = $('#packagingConsumptionType')?.value || 'PER_ORDER';
  const sizeRule = ['PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'].includes(type);
  $('#packagingMenuItemField')?.classList.toggle('hidden', !['PER_MENU_ITEM','MINIMUM_ITEM_SIZE'].includes(type));
  $('#packagingMenuCategoryField')?.classList.toggle('hidden', !['PER_MENU_CATEGORY','MINIMUM_CATEGORY_SIZE'].includes(type));
  $('#packagingGroupField')?.classList.toggle('hidden', !sizeRule);
  $('#packagingOrderSizeField')?.classList.toggle('hidden', !sizeRule);
  $('#packagingItemCountField')?.classList.toggle('hidden', type !== 'PER_ORDER_SIZE');
  $('#packagingItemCountMaxField')?.classList.toggle('hidden', type !== 'PER_ORDER_SIZE');
  if ($('#packagingOrderSizeLabel')) $('#packagingOrderSizeLabel').textContent = type === 'PER_ORDER_SIZE' ? 'PACKAGE SIZE' : 'MINIMUM PACKAGE SIZE';
  if ($('#packagingQuantityLabel')) $('#packagingQuantityLabel').textContent = type === 'MINIMUM_ITEM_SIZE' || type === 'MINIMUM_CATEGORY_SIZE' ? 'BAGS PER MATCHING MENU ITEM' : type === 'PER_ORDER_SIZE' ? 'BAGS PER ORDER' : 'QUANTITY';
}

function renderPackagingRules() {
  const list = $('#packagingRuleList');
  if (!list) return;
  const rules = state.inventory.packagingRules || [];
  list.innerHTML = rules.length ? rules.map(rule => {
    const item = inventoryItem(rule.item_id) || {};
    const target = rule.consumption_type === 'PER_ORDER_SIZE'
      ? `${({ SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large' })[rule.order_size_tier] || 'Package size'} · ${Number(rule.minimum_order_item_count || 1)}${rule.maximum_order_item_count == null ? '+' : `–${Number(rule.maximum_order_item_count)}`} items`
      : ['MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'].includes(rule.consumption_type)
      ? `minimum ${rule.order_size_tier?.toLowerCase() || 'size'} for ${rule.consumption_type === 'MINIMUM_ITEM_SIZE' ? state.inventory.menuItems.find(row => row.id === rule.menu_item_id)?.name || 'menu item' : state.inventory.menuCategories.find(row => row.id === rule.menu_category_id)?.name || 'category'}`
      : rule.consumption_type === 'PER_MENU_ITEM'
      ? state.inventory.menuItems.find(row => row.id === rule.menu_item_id)?.name
      : rule.consumption_type === 'PER_MENU_CATEGORY'
        ? state.inventory.menuCategories.find(row => row.id === rule.menu_category_id)?.name : 'whole order';
    const group = ({ BROWN_BAG: 'Brown bag', CARRY_BAG: 'Carry bag', PIZZA_PACKAGING: 'Pizza packaging' })[rule.packaging_group];
    return `<div class="daily-expense-row"><div><strong>${escapeHtml(item.name || 'Stock item')}</strong><span>${group ? `${escapeHtml(group)} · ` : ''}${escapeHtml((rule.order_types || []).join(' · '))} · ${escapeHtml(rule.consumption_type.replaceAll('_',' '))} · ${inventoryQty(rule.consumption_quantity)} ${escapeHtml(inventoryInternalUnit(item, rule.consumption_quantity))} · ${escapeHtml(target || 'Unknown mapping')}${rule.active === false ? ' · INACTIVE' : ''}</span></div><div class="inventory-row-actions"><button class="secondary" type="button" data-edit-packaging-rule="${rule.id}">EDIT</button><button class="secondary danger" type="button" data-deactivate-packaging-rule="${rule.id}">DEACTIVATE</button></div></div>`;
  }).join('') : '<div class="inventory-empty">No order-use stock rules configured.</div>';
}

function updateStaffRuleUnit() {
  const item = inventoryItem($('#staffRuleItem')?.value);
  const unit = inventoryInternalUnit(item, 2) || 'unit';
  const perSession = $('#staffRuleBasis')?.value === 'PER_SESSION';
  if ($('#staffRuleUnit')) $('#staffRuleUnit').textContent = unit;
  if ($('#staffRuleQuantityLabel')) $('#staffRuleQuantityLabel').textContent = `${perSession ? 'QUANTITY USED PER SESSION' : 'QUANTITY USED BY ONE STAFF'} · ${unit.toUpperCase()}`;
  if ($('#staffRuleQuantity')) $('#staffRuleQuantity').step = (item?.inventory_unit || item?.base_unit) === 'EACH' ? '1' : '0.001';
}

function resetStaffRuleEditor() {
  state.inventory.editingStaffRuleId = null;
  if ($('#staffRuleQuantity')) $('#staffRuleQuantity').value = '';
  if ($('#staffRuleBasis')) $('#staffRuleBasis').value = 'PER_STAFF';
  if ($('#saveStaffRule')) $('#saveStaffRule').textContent = 'SAVE CONSUMPTION RULE';
  $('#cancelStaffRuleEdit')?.classList.add('hidden');
  updateStaffRuleUnit();
}

function renderStaffRules() {
  const list = $('#staffRuleList');
  if (!list) return;
  const rules = state.inventory.staffRules || [];
  list.innerHTML = rules.length ? rules.map(rule => {
    const item = inventoryItem(rule.item_id) || {};
    const basis = rule.consumption_basis === 'PER_SESSION' ? 'per session' : 'per working staff';
    return `<div class="daily-expense-row"><div><strong>${escapeHtml(item.name || 'Consumable')}</strong><span>${inventoryQty(rule.quantity_per_staff)} ${escapeHtml(inventoryInternalUnit(item, rule.quantity_per_staff))} ${basis}${rule.active === false ? ' · INACTIVE' : ''}</span></div><div class="inventory-row-actions"><button class="secondary" type="button" data-edit-staff-rule="${rule.id}">EDIT</button><button class="secondary danger" type="button" data-deactivate-staff-rule="${rule.id}">DEACTIVATE</button></div></div>`;
  }).join('') : '<div class="inventory-empty">No staff daily-use consumables configured.</div>';
}

function editStaffRule(rule) {
  const item = inventoryItem(rule.item_id);
  if (!item) return;
  state.inventory.editingStaffRuleId = rule.id;
  if ($('#staffRuleCategory')) $('#staffRuleCategory').value = item.category_id || '';
  fillInventoryControls();
  if ($('#staffRuleItem')) $('#staffRuleItem').value = item.id;
  if ($('#staffRuleBasis')) $('#staffRuleBasis').value = rule.consumption_basis === 'PER_SESSION' ? 'PER_SESSION' : 'PER_STAFF';
  if ($('#staffRuleQuantity')) $('#staffRuleQuantity').value = String(Number(rule.quantity_per_staff || 0));
  if ($('#saveStaffRule')) $('#saveStaffRule').textContent = 'UPDATE CONSUMPTION RULE';
  $('#cancelStaffRuleEdit')?.classList.remove('hidden');
  updateStaffRuleUnit();
}

async function saveStaffRule() {
  const button = $('#saveStaffRule');
  const itemId = $('#staffRuleItem')?.value;
  const consumptionBasis = $('#staffRuleBasis')?.value;
  const quantityPerStaff = Number($('#staffRuleQuantity')?.value);
  if (!itemId || !(quantityPerStaff > 0)) return toast('Choose a consumable and enter its consumption quantity.', 'bad');
  button.disabled = true;
  try {
    await inventoryApi('POST', { action: 'save_staff_consumable_rule', ruleId: state.inventory.editingStaffRuleId, itemId, quantityPerStaff, consumptionBasis });
    resetStaffRuleEditor();
    await loadInventory();
    toast('Staff consumable rule saved.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

async function deactivateStaffRule(ruleId) {
  if (!ruleId || !window.confirm('Deactivate this staff consumable rule?')) return;
  try {
    await inventoryApi('POST', { action: 'deactivate_staff_consumable_rule', ruleId });
    await loadInventory();
    toast('Staff consumable rule deactivated.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

function renderStaffConsumption() {
  const preview = $('#staffConsumptionPreview');
  const history = $('#staffConsumptionHistory');
  if (!preview || !history) return;
  const outletId = $('#staffConsumptionOutlet')?.value || '';
  const count = Number($('#staffWorkingCount')?.value || 0);
  const activeRules = (state.inventory.staffRules || []).filter(rule => rule.active !== false);
  const openSession = (state.inventory.openSessions || []).find(session => session.outlet_id === outletId);
  const confirmed = openSession && (state.inventory.staffEvents || []).find(event => event.session_id === openSession.id);
  const canConfirm = Boolean(openSession && !confirmed && activeRules.length && Number.isInteger(count) && count > 0);
  if ($('#confirmStaffConsumption')) $('#confirmStaffConsumption').disabled = !canConfirm;
  if ($('#staffConsumptionStatus')) $('#staffConsumptionStatus').textContent = !openSession ? 'No open session for this outlet' : confirmed ? `Confirmed for ${confirmed.staff_count} staff` : 'Awaiting confirmation for current session';
  preview.innerHTML = count > 0 && activeRules.length ? activeRules.map(rule => {
    const item = inventoryItem(rule.item_id) || {};
    const perSession = rule.consumption_basis === 'PER_SESSION';
    const total = Number(rule.quantity_per_staff || 0) * (perSession ? 1 : count);
    const calculation = perSession ? `${inventoryQty(rule.quantity_per_staff)} per session` : `${inventoryQty(rule.quantity_per_staff)} × ${count} staff`;
    return `<div class="daily-expense-row"><div><strong>${escapeHtml(item.name || 'Consumable')}</strong><span>${calculation}</span></div><b>${inventoryQty(total)} ${escapeHtml(inventoryInternalUnit(item, total))}</b></div>`;
  }).join('') : `<div class="inventory-empty">${activeRules.length ? 'Enter the number of staff to preview consumption.' : ['ADMIN','OWNER'].includes(state.profile?.role) ? 'Set the quantity used by one staff member above, then save it.' : 'Admin or Owner must configure staff consumable rules first.'}</div>`;
  const events = (state.inventory.staffEvents || []).filter(event => !outletId || event.outlet_id === outletId).slice(0, 8);
  history.innerHTML = events.length ? `<div class="request-group"><h3>RECENT CONFIRMATIONS</h3>${events.map(event => `<div class="daily-expense-row"><div><strong>${event.staff_count} staff confirmed</strong><span>${inventoryDate(event.confirmed_at)} · ${(event.staff_consumption_event_items || []).length} consumables</span></div></div>`).join('')}</div>` : '';
}

async function confirmStaffConsumption() {
  const button = $('#confirmStaffConsumption');
  const outletId = $('#staffConsumptionOutlet')?.value;
  const staffCount = Number($('#staffWorkingCount')?.value);
  if (!outletId || !Number.isInteger(staffCount) || staffCount <= 0) return toast('Select an outlet and enter the number of staff working.', 'bad');
  if (!window.confirm(`Confirm daily-use consumables for ${staffCount} working staff? This deducts stock once for the current session.`)) return;
  button.disabled = true;
  try {
    await inventoryApi('POST', { action: 'confirm_staff_consumption', outletId, staffCount });
    await loadInventory();
    toast('Staff consumption confirmed and stock deducted.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

function editPackagingRule(rule) {
  state.inventory.editingPackagingRuleId = rule.id;
  if ($('#packagingRuleItem')) $('#packagingRuleItem').value = rule.item_id;
  if ($('#packagingConsumptionType')) $('#packagingConsumptionType').value = rule.consumption_type;
  if ($('#packagingGroup')) $('#packagingGroup').value = rule.packaging_group || 'BROWN_BAG';
  if ($('#packagingQuantity')) $('#packagingQuantity').value = Number(rule.consumption_quantity);
  if ($('#packagingMenuItem')) $('#packagingMenuItem').value = rule.menu_item_id || '';
  if ($('#packagingMenuCategory')) $('#packagingMenuCategory').value = rule.menu_category_id || '';
  if ($('#packagingOrderSizeTier')) $('#packagingOrderSizeTier').value = rule.order_size_tier || 'SMALL';
  if ($('#packagingItemCount')) $('#packagingItemCount').value = rule.minimum_order_item_count || '';
  if ($('#packagingItemCountMax')) $('#packagingItemCountMax').value = rule.maximum_order_item_count ?? '';
  if ($('#packagingDineIn')) $('#packagingDineIn').checked = rule.order_types?.includes('DINE_IN');
  if ($('#packagingTakeaway')) $('#packagingTakeaway').checked = rule.order_types?.includes('TAKEAWAY');
  if ($('#packagingDelivery')) $('#packagingDelivery').checked = rule.order_types?.includes('DELIVERY');
  if ($('#savePackagingRule')) $('#savePackagingRule').textContent = 'SAVE USAGE CHANGES';
  updatePackagingRuleFields();
}

async function savePackagingRule() {
  const orderTypes = [['DINE_IN','#packagingDineIn'],['TAKEAWAY','#packagingTakeaway'],['DELIVERY','#packagingDelivery']].filter(([,selector]) => $(selector)?.checked).map(([value]) => value);
  const button = $('#savePackagingRule'); button.disabled = true;
  try {
    await inventoryApi('POST', { action: 'save_packaging_rule', ruleId: state.inventory.editingPackagingRuleId, itemId: $('#packagingRuleItem')?.value, orderTypes, consumptionType: $('#packagingConsumptionType')?.value, packagingGroup: $('#packagingGroup')?.value, orderSizeTier: $('#packagingOrderSizeTier')?.value, minimumOrderItemCount: $('#packagingItemCount')?.value, maximumOrderItemCount: $('#packagingItemCountMax')?.value, quantity: $('#packagingQuantity')?.value, menuItemId: $('#packagingMenuItem')?.value, menuCategoryId: $('#packagingMenuCategory')?.value });
    state.inventory.editingPackagingRuleId = null;
    button.textContent = 'SAVE USAGE RULE';
    await loadInventory();
    toast('Usage rule saved. It applies to the selected order types on future orders.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

async function deactivatePackagingRule(ruleId) {
  try {
    await inventoryApi('POST', { action: 'deactivate_packaging_rule', ruleId });
    await loadInventory();
    toast('Usage rule deactivated. Previous order history is unchanged.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

function renderOpeningStock() {
  const list = $('#openingStockItems');
  if (!list || state.profile?.role !== 'ADMIN') return;
  const outletId = $('#openingStockOutlet')?.value || state.inventory.outlets[0]?.id || '';
  const previous = state.inventory.openingStockEvents.find(row => row.outlet_id === outletId);
  const draft = state.inventory.openingStockDrafts[outletId] || {};
  if ($('#openingStockStatus')) $('#openingStockStatus').textContent = previous ? `Confirmed ${inventoryDate(previous.confirmed_at)} · corrections require a reason` : 'Enter the physical stock currently available';
  if ($('#confirmOpeningStock')) $('#confirmOpeningStock').textContent = previous ? 'SAVE PHYSICAL STOCK CORRECTION' : 'CONFIRM OPENING STOCK';
  $('#clearOpeningStock')?.classList.toggle('hidden', !previous);
  if ($('#openingStockReason')) $('#openingStockReason').placeholder = previous ? 'Required: explain this correction' : 'Optional opening note';
  const items = state.inventory.items.filter(item => item.active !== false);
  const categoryName = item => state.inventory.stockCategories.find(category => category.id === item.category_id)?.name || 'Uncategorised stock';
  const categories = [...new Set(items.map(categoryName))].sort((a, b) => a.localeCompare(b));
  list.innerHTML = items.length ? categories.map(category => {
    const categoryItems = items.filter(item => categoryName(item) === category).sort((a, b) => a.name.localeCompare(b.name));
    return `<details class="recipe-monitor-group" open><summary><div><strong>${escapeHtml(category)}</strong><span>Opening stock items</span></div><b>${categoryItems.length} ITEMS</b></summary><div class="recipe-monitor-lines">${categoryItems.map(item => {
      const balance = state.inventory.balances.find(row => row.outlet_id === outletId && row.item_id === item.id);
      const value = Object.hasOwn(draft, item.id) ? draft[item.id] : previous ? Number(balance?.quantity_on_hand || 0) : '';
      const unit = inventoryInternalUnit(item);
      return `<div class="daily-expense-row"><div><strong>${escapeHtml(item.name)}</strong><span>Physical quantity in ${escapeHtml(unit)}</span></div><div class="supply-line-actual"><input type="number" min="0" step="${(item.inventory_unit || item.base_unit) === 'EACH' ? '1' : '0.001'}" value="${value}" placeholder="0" data-opening-item="${item.id}"><span>${escapeHtml(unit)}</span></div></div>`;
    }).join('')}</div></details>`;
  }).join('') : '<div class="inventory-empty">Create stock items before entering opening stock.</div>';
}

async function clearOpeningStock() {
  const outletId = $('#openingStockOutlet')?.value;
  const outlet = state.inventory.outlets.find(row => row.id === outletId);
  const previous = state.inventory.openingStockEvents.some(row => row.outlet_id === outletId);
  const items = state.inventory.items.filter(item => item.active !== false);
  if (!outletId || !previous || !items.length) return toast('There is no confirmed opening stock to clear for this outlet.', 'bad');
  if (!window.confirm(`Set all ${items.length} active stock item balances at ${outlet?.name || 'this outlet'} to zero? This records an audited physical stock correction; existing stock history remains.`)) return;
  const button = $('#clearOpeningStock'); button.disabled = true;
  try {
    await inventoryApi('POST', {
      action: 'set_opening_stock', outletId,
      items: items.map(item => ({ itemId: item.id, quantity: 0 })),
      reason: 'Clear test opening stock data'
    });
    delete state.inventory.openingStockDrafts[outletId];
    await loadInventory();
    toast(`Test opening stock cleared for ${outlet?.name || 'this outlet'}; the correction is recorded.`, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

async function confirmOpeningStock() {
  const outletId = $('#openingStockOutlet')?.value;
  const previous = state.inventory.openingStockEvents.some(row => row.outlet_id === outletId);
  const reason = String($('#openingStockReason')?.value || '').trim();
  const inputs = [...document.querySelectorAll('[data-opening-item]')];
  const items = inputs.filter(input => input.value !== '').map(input => ({ itemId: input.dataset.openingItem, quantity: Number(input.value) }));
  if (!outletId || !items.length) return toast('Select an outlet and enter its physical stock.', 'bad');
  if (items.some(row => !(row.quantity >= 0))) return toast('Physical stock cannot be negative.', 'bad');
  if (previous && reason.length < 3) return toast('Enter a reason for this stock correction.', 'bad');
  const warning = previous
    ? 'This will replace the selected outlet’s live balances with these physical quantities and record every change. Continue?'
    : 'Confirm these physical quantities as the outlet opening stock? This creates the starting audit record.';
  if (!window.confirm(warning)) return;
  const button = $('#confirmOpeningStock'); button.disabled = true;
  try {
    const result = await inventoryApi('POST', { action: 'set_opening_stock', outletId, items, reason });
    delete state.inventory.openingStockDrafts[outletId];
    if ($('#openingStockReason')) $('#openingStockReason').value = '';
    await loadInventory();
    toast(result.correction ? 'Physical stock correction saved with its reason.' : 'Opening stock confirmed. Automatic stock is ready.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

function updateRecipeQuantityUnit() {
  const item = inventoryItem($('#recipeStockItem')?.value);
  const unit = inventoryInternalUnit(item, 2) || 'unit';
  if ($('#recipeQuantityUnit')) $('#recipeQuantityUnit').textContent = unit;
  if ($('#recipeQuantityLabel')) $('#recipeQuantityLabel').textContent = `RECIPE CONSUMPTION · ${unit.toUpperCase()}`;
  if ($('#recipeQuantity')) $('#recipeQuantity').step = (item?.inventory_unit || item?.base_unit) === 'EACH' ? '1' : '0.001';
}

async function saveRecipeIngredient() {
  const button = $('#saveRecipeIngredient');
  const menuItemId = $('#recipeMenuItem')?.value;
  const itemId = $('#recipeStockItem')?.value;
  const quantity = Number($('#recipeQuantity')?.value);
  if (!menuItemId || !itemId || !(quantity > 0)) return toast('Choose both items and enter the quantity used for one menu item.', 'bad');
  button.disabled = true;
  try {
    const item = inventoryItem(itemId);
    await inventoryApi('POST', { action: 'save_recipe', menuItemId, itemId, quantity, quantityUnit: item?.inventory_unit || item?.base_unit, usageType: $('#recipePackaging')?.value || 'FOOD' });
    resetRecipeEditor();
    await loadInventory();
    toast('Recipe ingredient saved.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

function resetRecipeEditor() {
  if ($('#recipeQuantity')) $('#recipeQuantity').value = '';
  if ($('#recipePackaging')) $('#recipePackaging').value = 'FOOD';
  if ($('#saveRecipeIngredient')) $('#saveRecipeIngredient').textContent = 'ADD INGREDIENT';
  $('#cancelRecipeEdit')?.classList.add('hidden');
}

function editRecipeIngredient(menuItemId, itemId) {
  const row = state.inventory.recipes.find(recipe => recipe.menu_item_id === menuItemId && recipe.inventory_item_id === itemId);
  const menu = state.inventory.menuItems.find(entry => entry.id === menuItemId);
  const item = inventoryItem(itemId);
  if (!row || !menu || !item) return toast('This saved recipe ingredient could not be opened.', 'bad');
  setInventoryView('setup');
  if ($('#recipeMenuCategory')) $('#recipeMenuCategory').value = menu.category_id || '';
  fillInventoryControls();
  if ($('#recipeMenuItem')) $('#recipeMenuItem').value = menuItemId;
  if ($('#recipeStockCategory')) $('#recipeStockCategory').value = item.category_id || '';
  fillInventoryControls();
  if ($('#recipeMenuItem')) $('#recipeMenuItem').value = menuItemId;
  if ($('#recipeStockItem')) $('#recipeStockItem').value = itemId;
  if ($('#recipeQuantity')) $('#recipeQuantity').value = String(Number(row.base_quantity || 0));
  if ($('#recipePackaging')) $('#recipePackaging').value = row.usage_type || (row.is_packaging ? 'TAKEAWAY_DELIVERY' : 'FOOD');
  if ($('#saveRecipeIngredient')) $('#saveRecipeIngredient').textContent = 'SAVE INGREDIENT CHANGES';
  $('#cancelRecipeEdit')?.classList.remove('hidden');
  renderRecipeIngredients();
  updateRecipeQuantityUnit();
  revealAndScroll($('#recipeMenuCategory')?.closest('.inventory-tool-card'));
}

function updateWastageFields() {
  const stock = $('#wastageType')?.value === 'STOCK_ITEM';
  $('#wastageMenuField')?.classList.toggle('hidden', stock);
  $('#wastageStockField')?.classList.toggle('hidden', !stock);
  $('#wastagePackagingField')?.classList.toggle('hidden', stock);
}

async function saveWastage() {
  const button = $('#saveWastage');
  const type = $('#wastageType')?.value || 'MENU_ITEM';
  const outletId = inventorySelectedOutletId() || state.inventory.outlets[0]?.id;
  if (!outletId) return toast('No assigned outlet is available.', 'bad');
  button.disabled = true;
  try {
    await inventoryApi('POST', {
      action: 'record_wastage', outletId, type,
      menuItemId: $('#wastageMenuItem')?.value,
      stockItemId: $('#wastageStockItem')?.value,
      quantity: $('#wastageQuantity')?.value,
      reason: $('#wastageReason')?.value,
      packagingUsed: $('#wastagePackaging')?.value === 'YES',
      note: $('#wastageNote')?.value || ''
    });
    if ($('#wastageQuantity')) $('#wastageQuantity').value = '';
    if ($('#wastageNote')) $('#wastageNote').value = '';
    await loadInventory();
    toast('Wastage saved and inventory deducted.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

async function deleteRecipeIngredient(menuItemId, itemId) {
  if (!menuItemId || !itemId || !window.confirm('Remove this ingredient from the menu recipe?')) return;
  try {
    await inventoryApi('POST', { action: 'delete_recipe', menuItemId, itemId });
    resetRecipeEditor();
    await loadInventory();
    toast('Recipe ingredient removed.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

function renderSupplyNotification() {
  const panel = $('#posSupplyNotice');
  if (!panel) return;
  const notification = state.inventory.notifications.find(row => !row.read_at);
  const show = state.profile?.role !== 'ADMIN' && Boolean(notification);
  panel.classList.toggle('hidden', !show);
  if (!show) { panel.innerHTML = ''; return; }
  panel.innerHTML = `<div><strong>● ${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.message)} · ${inventoryDate(notification.created_at)}</span></div><div class="pos-supply-notice-actions"><button class="primary" type="button" data-supply-notice-view="${notification.id}">VIEW BILL</button><button class="secondary" type="button" data-supply-notice-dismiss="${notification.id}">DISMISS</button></div>`;
}

function inventoryMovementTotals(totals, outletId, itemId) {
  const current = totals.get(`${outletId}:${itemId}`) || { received: 0, used: 0 };
  return { received: current.received, used: Math.abs(current.used) };
}

function renderInventory() {
  if (state.selectedSection === 'costing') { renderCostingScreen(); return; }
  if (state.selectedSection === 'daily-expenses') { fillInventoryControls(); renderExpenseCategories(); renderDailyExpenses(); return; }
  if (state.selectedSection === 'reports') { renderReportDashboard(); return; }
  if (state.selectedSection !== 'inventory') { renderOverviewOperations(); return; }

  fillInventoryControls();
  const view = state.inventory.activeView || 'work';
  const outletId = inventorySelectedOutletId();
  const balances = state.inventory.balances.filter(row => (!outletId || row.outlet_id === outletId) && inventoryItem(row.item_id)?.active !== false);
  const bills = centralSupplyHistoryRows();
  const allMovements = view === 'history' ? inventoryHistoryRows(state.inventory.movements, 'occurred_at') : [];
  const movements = state.inventory.historyItemId ? allMovements.filter(row => row.item_id === state.inventory.historyItemId) : allMovements;
  const calculateStockValue = createStockValueCalculator({ items: state.inventory.items, bills: state.inventory.bills, movements: state.inventory.movements });
  const stockValueKey = `${inventoryLoadVersion}:${outletId}`;
  let stockValue = inventoryStockValueCache.get(stockValueKey);
  if (stockValue === undefined) {
    stockValue = calculateStockValue(balances, outletId);
    inventoryStockValueCache.set(stockValueKey, stockValue);
  }
  const lowCount = balances.filter(row => {
    const item = inventoryItem(row.item_id);
    return inventoryDisplayQuantity(item, row.quantity_on_hand) <= Number(item?.low_stock_threshold || 0);
  }).length;
  const due = state.inventory.bills.filter(row => !outletId || row.outlet_id === outletId).reduce((sum, bill) => sum + Math.max(0, Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)), 0);
  const currentMovements = currentInventorySessionRows(state.inventory.movements, 'occurred_at', outletId);
  const movementTotals = new Map();
  let sessionReceived = 0;
  for (const row of currentMovements) {
    if (row.movement_type === 'STOCK_RECEIVED') {
      sessionReceived += 1;
    }
    if (view === 'stock') {
      const key = `${row.outlet_id}:${row.item_id}`;
      const totals = movementTotals.get(key) || { received: 0, used: 0 };
      if (row.movement_type === 'STOCK_RECEIVED') totals.received += Number(row.quantity_delta || 0);
      else if (['USAGE', 'WASTE', 'SALE_DEDUCTION', 'PACKAGING_CONSUMPTION', 'STAFF_CONSUMPTION'].includes(row.movement_type)) totals.used += Number(row.quantity_delta || 0);
      movementTotals.set(key, totals);
    }
  }
  if ($('#inventoryStockValue')) $('#inventoryStockValue').textContent = formatReportMoney(stockValue);
  if ($('#inventoryLowCount')) $('#inventoryLowCount').textContent = String(lowCount);
  if ($('#inventoryDue')) $('#inventoryDue').textContent = formatReportMoney(due);
  if ($('#inventoryToday')) $('#inventoryToday').textContent = String(sessionReceived);
  if ($('#inventoryStockCount')) $('#inventoryStockCount').textContent = `${balances.length} item${balances.length === 1 ? '' : 's'}`;
  if ($('#inventoryBillCount')) $('#inventoryBillCount').textContent = `${bills.length} bill${bills.length === 1 ? '' : 's'}`;
  const currentHistory = state.inventory.historyMode === 'CURRENT';
  const scopeSessions = inventoryHistorySessions().filter(s => !outletId || s.outlet_id === outletId);
  const range = state.inventory.historyMode === 'CUSTOM' ? historyBounds(state.inventory.historyFrom, state.inventory.historyTo) : {};
  const sessionCount = scopeSessions.filter(s => currentHistory ? !s.closed_at : (!range.start || new Date(s.opened_at).getTime() >= range.start) && (!range.end || new Date(s.opened_at).getTime() < range.end)).length;
  if ($('#inventoryFilterStatus')) $('#inventoryFilterStatus').textContent = `${sessionCount} session${sessionCount === 1 ? '' : 's'} · ${bills.length} bill${bills.length === 1 ? '' : 's'}${view === 'history' ? ` · ${movements.length} movement${movements.length === 1 ? '' : 's'}` : ''}`;
  if ($('#supplyHistoryRangeLabel')) {
    const from = state.inventory.historyFrom || '';
    const to = state.inventory.historyTo || '';
    $('#supplyHistoryRangeLabel').textContent = currentHistory ? 'Current open sessions' : (from || to ? `Sessions opened ${from} to ${to} · including open sessions` : 'All central supply bills and stock history');
  }

  const masterList = $('#inventoryMasterList');
  if (view === 'setup' && masterList) {
    const categoryNames = new Map(state.inventory.stockCategories.map(row => [row.id, row.name]));
    const groupName = item => categoryNames.get(item.category_id) || 'Other items';
    const categoryId = $('#inventoryMasterCategory')?.value || '';
    const search = String($('#inventoryMasterSearch')?.value || '').trim().toLowerCase();
    const filteredItems = state.inventory.items.filter(item => item.active !== false && (!categoryId || item.category_id === categoryId) && (!search || item.name.toLowerCase().includes(search) || item.sku.toLowerCase().includes(search)));
    const names = [...new Set(filteredItems.map(groupName))];
    masterList.innerHTML = filteredItems.length ? names.map(label => { const items = filteredItems.filter(item => groupName(item) === label); return `<div class="request-group"><h3>${escapeHtml(label)}</h3><div class="inventory-master-list">${items.map(item => `<div class="inventory-master-item"><div><strong>${escapeHtml(item.name)}${item.active === false ? ' · INACTIVE' : ''}</strong><small>${escapeHtml(item.sku)} · REQUEST ${escapeHtml(unitLabel(item.request_unit).toUpperCase())} × ${inventoryQty(item.request_to_inventory || 1)} → ${escapeHtml(inventoryInternalUnit(item).toUpperCase())} · BILL ${escapeHtml(unitLabel(item.billing_unit || item.supply_unit).toUpperCase())} × ${inventoryQty(item.billing_to_inventory || 1)} → ${escapeHtml(inventoryInternalUnit(item).toUpperCase())} · LOW ${inventoryQty(item.low_stock_threshold)} · TARGET ${inventoryQty(item.target_stock_level)}</small></div><div class="inventory-master-rate"><b>${Number(item.default_supply_price) > 0 ? `${formatReportMoney(item.default_supply_price)} / ${inventoryBillingUnit(item)}` : 'SET RATE'}</b><div class="inventory-row-actions"><button type="button" data-inventory-edit-item="${item.id}">EDIT</button><button class="danger" type="button" data-inventory-delete-item="${item.id}">DEACTIVATE</button></div></div></div>`).join('')}</div></div>`; }).join('') : '<div class="inventory-empty">No matching stock items.</div>';
  }

  const stockList = $('#inventoryStockList');
  if (view === 'stock' && stockList) {
  const selectedCategory = $('#liveStockCategory')?.value || '';
  inventorySelectOptions($('#liveStockCategory'), [{ value: '', label: 'All categories' }, ...state.inventory.stockCategories.map(c => ({ value:c.id, label:c.name })), { value:'unassigned', label:'Unassigned' }], selectedCategory);
  const searchStock = ($('#liveStockSearch')?.value || '').trim().toLowerCase();
  const selectedStatus = $('#liveStockStatus')?.value || '';
  const stockGroups = new Map();
  for (const row of balances) {
    const item = inventoryItem(row.item_id) || {};
    const category = state.inventory.stockCategories.find(c => c.id === item.category_id);
    const key = category?.id || 'unassigned';
    const quantity = inventoryDisplayQuantity(item, row.quantity_on_hand);
    const status = quantity <= 0 ? 'out' : quantity <= Number(item.low_stock_threshold || 0) ? 'low' : 'in';
    if (selectedCategory && selectedCategory !== key || selectedStatus && selectedStatus !== status || searchStock && !`${item.name || ''} ${item.sku || ''}`.toLowerCase().includes(searchStock)) continue;
    if (!stockGroups.has(key)) stockGroups.set(key, { name:category?.name || 'Unassigned', rows:[] });
    stockGroups.get(key).rows.push(row);
  }
  if (stockList) stockList.innerHTML = stockGroups.size ? [...stockGroups.values()].sort((a,b) => a.name.localeCompare(b.name)).map(group => {
    const value = calculateStockValue(group.rows);
    return `<details class="request-group" data-disclosure-key="${escapeHtml(group.name)}"><summary><strong>${escapeHtml(group.name)}</strong> · ${group.rows.length} items · ${formatReportMoney(value)}</summary>${group.rows.sort((a,b) => (inventoryItem(a.item_id)?.name || '').localeCompare(inventoryItem(b.item_id)?.name || '')).map(row => {
    const item = inventoryItem(row.item_id) || {};
    const outlet = inventoryOutlet(row.outlet_id) || {};
    const quantity = inventoryDisplayQuantity(item, row.quantity_on_hand);
    const threshold = Number(item.low_stock_threshold || 0);
    const status = quantity <= 0 ? ['OUT OF STOCK', 'out'] : quantity <= threshold ? ['LOW STOCK', 'low'] : ['IN STOCK', 'in'];
    const totals = inventoryMovementTotals(movementTotals, row.outlet_id, row.item_id);
    return `<div class="inventory-stock-row"><strong>${escapeHtml(item.name || 'Item')}<button class="inventory-history-link" type="button" data-view-item-history="${row.item_id}">VIEW HISTORY</button></strong><span>${escapeHtml(outlet.name || 'Outlet')}</span><span>${inventoryQty(inventoryDisplayQuantity(item, totals.received))} ${escapeHtml(item.display_unit || '')}</span><span>${inventoryQty(inventoryDisplayQuantity(item, totals.used))} ${escapeHtml(item.display_unit || '')}</span><span class="inventory-qty">${inventoryQty(quantity)} ${escapeHtml(item.display_unit || '')}</span><span class="inventory-status ${status[1]}">${status[0]}</span></div>`;
    }).join('')}</details>`;
  }).join('') : '<div class="inventory-empty">No stock matches these filters.</div>';
  if ($('#inventoryStockCount')) $('#inventoryStockCount').textContent = `${[...stockGroups.values()].reduce((sum, group) => sum + group.rows.length, 0)} of ${balances.length} items`;
  }

  const billsList = $('#inventoryBillsList');
  if (view === 'history' && billsList) billsList.innerHTML = bills.length ? bills.map(bill => {
    const outstanding = Math.max(0, Number(bill.total_amount || 0) - Number(bill.paid_amount || 0));
    const receiptStatus = bill.receipt_status || 'RECEIVED';
    const lines = bill.supply_bill_items || [];
    return `<div class="inventory-bill"><div class="inventory-bill-top"><div><h3>${escapeHtml(bill.bill_number)} <span class="bill-source">Central supply</span></h3><div class="inventory-bill-meta">${escapeHtml(inventoryOutlet(bill.outlet_id)?.name || 'Outlet')} · ${inventoryDate(bill.supplied_at)} · <span class="inventory-status ${receiptStatus === 'RECEIVED' ? 'in' : 'low'}">${receiptStatus === 'RECEIVED' ? 'RECEIVED' : 'AWAITING RECEIPT'}</span></div></div><div class="inventory-bill-total"><strong>${formatReportMoney(bill.total_amount)}</strong><span>${escapeHtml(bill.payment_status)} · DUE ${formatReportMoney(outstanding)}</span></div></div><details class="inventory-bill-detail"><summary>${lines.length} ITEM${lines.length === 1 ? '' : 'S'} IN THIS BILL</summary><div class="inventory-bill-items">${lines.map(line => { const item = inventoryItem(line.item_id); const billed = `${inventoryQty(line.quantity)} ${unitLabel(line.unit, line.quantity)}`; return `<span>${escapeHtml(line.item_name)} · Inventory +${inventoryQty(line.base_quantity)} ${escapeHtml(unitLabel(line.inventory_unit || item?.inventory_unit || item?.base_unit, line.base_quantity))} · Supply ${billed} × ${formatReportMoney(line.unit_price)}</span>`; }).join('')}</div></details><div class="inventory-bill-actions"><button class="secondary" data-inventory-view="${bill.id}">VIEW BILL</button><button class="secondary" data-inventory-print="${bill.id}">PRINT / SAVE PDF</button><button class="secondary" data-inventory-bill-csv="${bill.id}">DOWNLOAD CSV</button>${state.profile?.role === 'OWNER' && receiptStatus === 'PENDING' ? `<button class="primary" data-inventory-receive="${bill.id}">CONFIRM STOCK RECEIPT</button>` : ''}${state.profile?.role === 'ADMIN' && outstanding > 0 ? `<button class="primary" data-inventory-pay="${bill.id}">RECORD PAYMENT</button>` : ''}</div></div>`;
  }).join('') : '<div class="inventory-empty">No central supply bills in this period.</div>';

  const movementList = $('#inventoryMovementList');
  if (view === 'history' && movementList) movementList.innerHTML = movements.length ? '<div class="inventory-movement inventory-movement-heading"><span>Date / time</span><span>Stock item</span><span>Outlet</span><span>Change</span><span>Activity / note</span></div>' + movements.map(row => {
    const item = inventoryItem(row.item_id) || {};
    const snapshotUnit = row.inventory_unit_snapshot;
    const delta = snapshotUnit ? Number(row.quantity_delta) : inventoryDisplayQuantity(item, row.quantity_delta);
    return `<div class="inventory-movement"><span>${inventoryDate(row.occurred_at)}</span><strong>${escapeHtml(row.item_name_snapshot || item.name || 'Item')}</strong><span>${escapeHtml(inventoryOutlet(row.outlet_id)?.name || 'Outlet')}</span><span class="${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${inventoryQty(delta)} ${escapeHtml(unitLabel(snapshotUnit || item.display_unit || '', delta))}</span><span>${escapeHtml(row.movement_type.replaceAll('_', ' '))}${row.notes ? ` · ${escapeHtml(row.notes)}` : ''}</span></div>`;
  }).join('') : '<div class="inventory-empty">No stock movements in this period.</div>';
  const historyItem = inventoryItem(state.inventory.historyItemId);
  if (view === 'history') {
    if ($('#inventoryMovementFilterLabel')) $('#inventoryMovementFilterLabel').textContent = historyItem ? `${historyItem.name} · ${movements.length} movements` : 'Every receipt, usage and adjustment';
    $('#inventoryMovementClearItem')?.classList.toggle('hidden', !historyItem);
    renderLocalPurchases({ historyOnly: true });
  }
  renderSupplyNotification();
  if (view === 'work') {
    renderSupplyLines();
    renderLocalPurchases({ formOnly: true });
    prepareClosedSessionRequirements();
    renderStockRequestCatalogue();
    renderStockRequests();
    renderStaffConsumption();
    updateStaffRuleUnit();
  }
  if (view === 'setup') {
    renderStockCategories();
    renderRecipeIngredients();
    renderRecipeMonitor();
    renderPackagingRules();
    renderStaffRules();
    updateRecipeQuantityUnit();
    renderOpeningStock();
  }
}

let inventoryLoadVersion = 0;
const inventoryStockValueCache = new Map();
let overviewLoadVersion = 0;
async function loadOverviewOperationsData(from = '', to = '') {
  const version = ++overviewLoadVersion;
  const params = { scope: 'overview' };
  if (from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    params.from = start.toISOString();
    params.to = end.toISOString();
  }
  const payload = await inventoryApi('GET', null, params);
  if (version !== overviewLoadVersion) return;

  state.inventory.outlets = [...new Map([...(state.inventory.outlets || []), ...(payload.outlets || [])].map(row => [row.id, row])).values()];
  state.inventory.openSessions = payload.openSessions || [];
  if ((payload.salesReports || []).length) {
    state.salesReports = [...new Map([...(state.salesReports || []), ...payload.salesReports].map(row => [row.id, row])).values()];
  }
  state.inventory.bills = [...new Map([...(state.inventory.bills || []), ...(payload.bills || [])].map(row => [row.id, row])).values()];
  state.inventory.expenses = [...new Map([...(state.inventory.expenses || []), ...(payload.expenses || [])].map(row => [row.id, row])).values()];
  if (state.selectedSection === 'overview') renderOverviewOperations();
}

async function loadInventory() {
  // Keep one complete, authorized snapshot so one screen's filters cannot erase
  // records needed by Expenses, Financial Summary, or another outlet selection.
  const version = ++inventoryLoadVersion;
  inventoryStockValueCache.clear();
  const payload = await inventoryApi('GET');
  if (version !== inventoryLoadVersion) return;
  state.inventory.items = payload.items || [];
  state.inventory.itemById = new Map(state.inventory.items.map(item => [item.id, item]));
  state.inventory.stockCategories = payload.stockCategories || [];
  state.inventory.expenseCategories = payload.expenseCategories || [];
  state.inventory.menuItems = payload.menuItems || [];
  state.inventory.menuCategories = payload.menuCategories || [];
  state.inventory.recipes = payload.recipes || [];
  state.inventory.packagingRules = payload.packagingRules || [];
  state.inventory.staffRules = payload.staffRules || [];
  state.inventory.staffEvents = payload.staffEvents || [];
  state.inventory.openSessions = payload.openSessions || [];
  state.inventory.latestSessions = payload.latestSessions || [];
  state.inventory.outlets = payload.outlets || [];
  state.inventory.balances = payload.inventory || [];
  state.inventory.bills = payload.bills || [];
  state.inventory.movements = payload.movements || [];
  state.inventory.notifications = payload.notifications || [];
  state.inventory.requests = payload.requests || [];
  state.inventory.expenses = payload.expenses || [];
  state.inventory.openingStockEvents = payload.openingStockEvents || [];
  inventoryStockValueCache.clear();
  state.inventory.loaded = true;
  renderInventory();
}

function updateSupplyDefaultPrice() {
  const item = inventoryItem($('#supplyItem')?.value);
  if (item && $('#supplyPrice')) $('#supplyPrice').value = Number(item.default_supply_price || 0) > 0 ? Number(item.default_supply_price).toFixed(2) : '';
  if ($('#supplyQuantityLabel')) $('#supplyQuantityLabel').textContent = `SUPPLY QUANTITY · ${unitLabel(item?.supply_unit || item?.billing_unit).toUpperCase()}`;
  if ($('#supplyNetQuantityLabel')) $('#supplyNetQuantityLabel').textContent = `ACTUAL NET INVENTORY · ${inventoryInternalUnit(item).toUpperCase()}`;
  if ($('#supplyBillingQuantity')) $('#supplyBillingQuantity').value = defaultNetQuantity(item?.supply_unit || item?.billing_unit, item?.inventory_unit || item?.base_unit, $('#supplyQuantity')?.value);
}

function renderSupplyItemPicker(query = '', open = true) {
  const menu = $('#supplyItemMenu');
  if (!menu) return;
  const term = String(query || '').trim().toLowerCase();
  const items = state.inventory.items.filter(item => item.active !== false && (!term || item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term))).slice(0, 12);
  menu.innerHTML = items.length ? items.map(item => {
    const category = state.inventory.stockCategories.find(row => row.id === item.category_id)?.name || 'Stock item';
    const unit = inventoryBillingUnit(item);
    const price = Number(item.default_supply_price) > 0 ? `${formatReportMoney(item.default_supply_price)} / ${unit}` : 'Price not set';
    return `<button type="button" class="supply-item-option${$('#supplyItem')?.value === item.id ? ' active' : ''}" data-supply-item-option="${item.id}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(category)} · Billed per ${unit}</small></span><b>${escapeHtml(price)}</b></button>`;
  }).join('') : '<div class="supply-item-menu-empty">No matching stock item</div>';
  menu.classList.toggle('hidden', !open);
  $('#supplyItemSearch')?.setAttribute('aria-expanded', String(open));
}

function selectSupplyItem(itemId) {
  const item = inventoryItem(itemId);
  if (!item) return;
  if ($('#supplyItem')) $('#supplyItem').value = item.id;
  if ($('#supplyItemSearch')) $('#supplyItemSearch').value = item.name;
  $('#supplyItemMenu')?.classList.add('hidden');
  $('#supplyItemSearch')?.setAttribute('aria-expanded', 'false');
  updateSupplyDefaultPrice();
}

function renderSupplyLines() {
  const list = $('#supplyBillLines');
  const total = state.inventory.billLines.reduce((sum, line) => sum + Number(line.billingQuantity || 0) * line.unitPrice, 0);
  if (list) list.innerHTML = state.inventory.billLines.length ? state.inventory.billLines.map((line, index) => {
    const item = inventoryItem(line.itemId) || {};
    const stockUnit = inventoryInternalUnit(item);
    const billingUnit = inventoryBillingUnit(item);
    return `<div class="supply-line"><div><strong>${escapeHtml(line.name)}</strong><small>${line.requestedQuantity ? `Requested ${inventoryQty(line.requestedQuantity)} ${unitLabel(line.requestedUnit)} · ` : ''}${escapeHtml(inventoryMeasurementLabel(item))} · ${formatReportMoney(line.unitPrice)} / ${billingUnit}</small></div><div class="supply-line-actual"><input type="number" min="0.001" step="0.001" value="${line.billingQuantity || ''}" placeholder="Supply" data-supply-billing-quantity="${index}" aria-label="Supply quantity"><span>${billingUnit}</span><input type="number" min="0" step="${(item.inventory_unit || item.base_unit) === 'EACH' ? '1' : '0.001'}" value="${line.inventoryQuantity ?? ''}" placeholder="Net" data-supply-inventory-quantity="${index}" aria-label="Actual net inventory"><span>${stockUnit}</span></div><b>${formatReportMoney(Number(line.billingQuantity || 0) * line.unitPrice)}</b><button type="button" data-supply-remove="${index}">×</button></div>`;
  }).join('') : '<div class="supply-empty">Add stock items to build this bill.</div>';
  if ($('#supplyBillTotal')) $('#supplyBillTotal').textContent = formatReportMoney(total);
}

function addSupplyLine() {
  const item = inventoryItem($('#supplyItem')?.value);
  const billingQuantity = Number($('#supplyQuantity')?.value);
  let inventoryQuantity = Number($('#supplyBillingQuantity')?.value);
  const unitPrice = Number($('#supplyPrice')?.value);
  if (!item || !(inventoryQuantity > 0) || !(billingQuantity > 0)) return toast('Enter both the supplied quantity and billing quantity.', 'bad');
  if ((item.inventory_unit || item.base_unit) === 'EACH') inventoryQuantity = Math.max(1, Math.round(inventoryQuantity));
  if (!(unitPrice > 0)) return toast(`Set the fixed price per ${inventoryBillingUnit(item)} for ${item.name} first.`, 'bad');
  const existing = state.inventory.billLines.find(line => line.itemId === item.id);
  if (existing) { existing.inventoryQuantity += inventoryQuantity; existing.billingQuantity += billingQuantity; existing.unitPrice = unitPrice; }
  else state.inventory.billLines.push({ itemId: item.id, name: item.name, inventoryQuantity, billingQuantity, unitPrice });
  if ($('#supplyQuantity')) $('#supplyQuantity').value = '';
  if ($('#supplyBillingQuantity')) $('#supplyBillingQuantity').value = '';
  renderSupplyLines();
}

function editInventoryItemPrice(item) {
  state.inventory.editingItemId = item.id;
  const unitOptions = ['KG','G','L','ML','PIECE','BOTTLE','PACK','CAN','BOX'].map(value => ({ value, label: unitLabel(value, 1) }));
  inventorySelectOptions($('#editInventoryCategory'), state.inventory.stockCategories.filter(row => row.active !== false || row.id === item.category_id).map(row => ({ value: row.id, label: row.name })), item.category_id);
  inventorySelectOptions($('#editInventoryRequestUnit'), unitOptions, item.request_unit);
  inventorySelectOptions($('#editInventoryBillingUnit'), unitOptions, item.supply_unit || item.billing_unit);
  $('#editInventoryName').value = item.name;
  $('#editInventoryUnit').value = item.inventory_unit || item.base_unit;
  $('#editInventoryRequestConversion').value = Number(item.request_to_inventory || 1);
  $('#editInventoryBillingConversion').value = Number(item.billing_to_inventory || 1);
  $('#editInventoryPrice').value = Number(item.default_supply_price || 0);
  $('#editInventoryThreshold').value = Number(item.low_stock_threshold || 0);
  $('#editInventoryTarget').value = Number(item.target_stock_level || 0);
  $('#editInventoryActive').checked = item.active !== false;
  $('#inventoryItemModal').classList.remove('hidden');
  $('#inventoryItemModal').setAttribute('aria-hidden', 'false');
}

function closeInventoryItemModal() {
  state.inventory.editingItemId = null;
  $('#inventoryItemModal')?.classList.add('hidden');
  $('#inventoryItemModal')?.setAttribute('aria-hidden', 'true');
}

async function saveInventoryItemChanges() {
  const item = inventoryItem(state.inventory.editingItemId);
  if (!item) return;
  const button = $('#saveInventoryItemChanges'); button.disabled = true;
  try {
    await inventoryApi('POST', { action: 'update_item', itemId: item.id, name: $('#editInventoryName').value, categoryId: $('#editInventoryCategory').value, requestUnit: $('#editInventoryRequestUnit').value, supplyUnit: $('#editInventoryBillingUnit').value, inventoryUnit: $('#editInventoryUnit').value, requestConversion: $('#editInventoryRequestConversion').value, billingConversion: $('#editInventoryBillingConversion').value, defaultSupplyPrice: $('#editInventoryPrice').value, lowStockThreshold: $('#editInventoryThreshold').value, targetStockLevel: $('#editInventoryTarget').value, active: $('#editInventoryActive').checked });
    closeInventoryItemModal();
    await loadInventory();
    toast(`${item.name} Master Item updated. Previous transaction snapshots were preserved.`, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

async function markSupplyNotification(notificationId, openInventory = false) {
  const notification = state.inventory.notifications.find(row => row.id === notificationId);
  if (openInventory) {
    const bill = state.inventory.bills.find(row => row.id === notification?.bill_id);
    if (!bill) return toast('Refresh Stock & Supply to load this bill.', 'bad');
    printSupplyBill(bill, false);
  }
  try {
    await inventoryApi('POST', { action: 'mark_notification', notificationId });
    if (notification) notification.read_at = new Date().toISOString();
    renderSupplyNotification();
  renderLocalPurchases();
  } catch (error) { toast(error.message, 'bad'); }
}

async function generateSupplyBill(receiveNow = false) {
  const button = receiveNow ? $('#supplyReceiveDirect') : $('#supplyGenerateBill');
  const otherButton = receiveNow ? $('#supplyGenerateBill') : $('#supplyReceiveDirect');
  const outletId = $('#supplyOutlet')?.value;
  if (!outletId || !state.inventory.billLines.length) return toast('Select an outlet and add at least one item.', 'bad');
  if (state.inventory.billLines.some(line => !(Number(line.inventoryQuantity) > 0) || !(Number(line.billingQuantity) > 0))) return toast('Enter the supplied quantity and billing quantity for every item.', 'bad');
  if (receiveNow && !window.confirm('Add this stock directly now? A supply bill and audited stock receipt will be created together.')) return;
  button.disabled = true;
  if (otherButton) otherButton.disabled = true;
  try {
    await inventoryApi('POST', { action: 'issue_bill', outletId, items: state.inventory.billLines, notes: $('#supplyNotes')?.value || '', requestId: state.inventory.activeRequestId, requestUpdatedAt: state.inventory.activeRequestUpdatedAt, receiveNow });
    state.inventory.billLines = [];
    state.inventory.activeRequestId = null;
    state.inventory.activeRequestUpdatedAt = null;
    if ($('#supplyNotes')) $('#supplyNotes').value = '';
    await loadInventory();
    toast(receiveNow ? 'Supply bill saved and inventory added directly.' : 'Supply bill generated. The Owner must confirm physical receipt before stock is added.', 'ok');
  } catch (error) { toast(error.message, 'bad'); } finally { button.disabled = false; if (otherButton) otherButton.disabled = false; }
}

function prepareClosedSessionRequirements() {
  if (state.profile?.role !== 'OWNER' || state.inventory.activeDraftId || state.inventory.requestLines.length) return;
  const outletId = $('#stockRequestOutlet')?.value;
  const review = closedSessionRequirementReview({ sessions: state.inventory.latestSessions, outletId, requests: state.inventory.requests });
  if (!review || state.inventory.requirementReviewKey === review.key) return;
  state.inventory.requirementReviewKey = review.key;
  if (review.existing) {
    state.inventory.requirementMessage = 'A requirement already exists for the next session. Review it in Stock requirements above.';
    return;
  }
  if ($('#stockRequestDate')) $('#stockRequestDate').value = review.requiredFor;
  const suggestions = calculateSuggestedRequirements({ ...state.inventory, outletId });
  state.inventory.requestLines = suggestions.map(row => ({ itemId: row.itemId, quantity: row.quantity, suggested: true }));
  state.inventory.requirementMessage = state.inventory.items.some(item => item.active !== false && Number(item.target_stock_level) > 0)
    ? 'No replenishment needed for configured targets after considering current stock and pending supply. Items without targets need manual review.'
    : 'Automatic requirements need stock targets. Ask Admin to set target levels in Setup → Items, or add items manually.';
}

function generateStockSuggestions() {
  const outletId = $('#stockRequestOutlet')?.value;
  if (!outletId) return toast('Choose an outlet first.', 'bad');
  const suggestions = calculateSuggestedRequirements({
    items: state.inventory.items,
    balances: state.inventory.balances,
    bills: state.inventory.bills,
    outletId
  });
  if (!state.inventory.activeDraftId) resetStockRequestEditor();
  state.inventory.requestLines = suggestions.map(row => ({ itemId: row.itemId, quantity: row.quantity, suggested: true }));
  renderStockRequestCatalogue();
  toast(suggestions.length ? `${suggestions.length} stock suggestion${suggestions.length === 1 ? '' : 's'} ready for review.` : 'Stock already meets its targets, or Admin has not set target levels yet.', suggestions.length ? 'ok' : 'bad');
}

function editStockDraft(request) {
  if (!canEditStockRequest(request)) return toast('This requirement can no longer be edited. Refresh to see its latest status.', 'bad');
  $('.nav-btn[data-section="inventory"]')?.click();
  setInventoryView('work');
  state.inventory.activeDraftId = request.id;
  state.inventory.requestLines = (request.franchise_stock_request_items || []).map(row => ({ itemId: row.item_id, quantity: Number(row.quantity), unit: row.unit }));
  if ($('#stockRequestOutlet')) $('#stockRequestOutlet').value = request.outlet_id;
  if ($('#stockRequestDate')) $('#stockRequestDate').value = request.required_for;
  if ($('#stockRequestNotes')) $('#stockRequestNotes').value = request.notes || '';
  $('#stockRequestEditorTitle').textContent = 'Edit requirement';
  $('#stockRequestEditingNotice').textContent = `Editing existing requirement · Needed ${request.required_for}. Saving updates this same requirement.`;
  $('#stockRequestEditingNotice').classList.remove('hidden');
  $('#cancelStockRequestEdit').classList.remove('hidden');
  $('#stockRequestOutlet').disabled = true;
  $('#saveStockRequestDraft').classList.toggle('hidden', request.status === 'SUBMITTED');
  $('#submitStockRequest').textContent = request.status === 'SUBMITTED' ? 'SAVE CHANGES' : 'CONFIRM & SEND';
  renderStockRequestCatalogue();
  revealAndScroll($('#stockRequestCreatePanel'));
  toast('Requirement loaded. Edit quantities and save your changes.', 'ok');
}

async function saveStockRequirement(status) {
  const outletId = $('#stockRequestOutlet')?.value;
  const items = state.inventory.requestLines.map(row => ({ itemId: row.itemId, quantity: Number(row.quantity), unit: row.unit })).filter(row => row.quantity > 0);
  const requiredFor = $('#stockRequestDate')?.value;
  if (!outletId || !requiredFor || !items.length) return toast('Enter a quantity for at least one item.', 'bad');
  const editingSent = state.inventory.requests.find(row => row.id === state.inventory.activeDraftId)?.status === 'SUBMITTED';
  const button = status === 'DRAFT' ? $('#saveStockRequestDraft') : $('#submitStockRequest');
  if (button) button.disabled = true;
  try {
    const result = await inventoryApi('POST', { action: 'save_request', requestId: state.inventory.activeDraftId, outletId, requiredFor, items, notes: $('#stockRequestNotes')?.value || '', status });
    state.inventory.activeDraftId = status === 'DRAFT' ? result.requestId : null;
    if (status === 'SUBMITTED') {
      resetStockRequestEditor();
    }
    await loadInventory();
    toast(status === 'DRAFT' ? 'Stock requirement draft saved.' : editingSent ? 'Requirement updated. Admin will see your changes.' : 'Stock requirement sent to Admin.', 'ok');
  } catch (error) { toast(error.message, 'bad'); } finally { if (button) button.disabled = false; }
}

function submitStockRequirement() { return saveStockRequirement('SUBMITTED'); }
function saveStockRequirementDraft() { return saveStockRequirement('DRAFT'); }

function addStockRequestItem() {
  const item = inventoryItem($('#stockRequestItem')?.value);
  let quantity = Number($('#stockRequestQuantity')?.value);
  const existingLine = state.inventory.requestLines.find(row => row.itemId === item?.id);
  if (existingLine?.unit && existingLine.unit !== stockRequestUnit(item)) return toast('Edit this item quantity directly in the existing requirement below.', 'bad');
  if (!item || !(quantity > 0)) return toast('Choose an item and enter a quantity.', 'bad');
  if (['PIECE','BOTTLE','PACK','CAN','BOX'].includes(stockRequestUnit(item))) quantity = Math.max(1, Math.round(quantity));
  const existing = state.inventory.requestLines.find(row => row.itemId === item.id);
  if (existing) existing.quantity += quantity;
  else state.inventory.requestLines.push({ itemId: item.id, quantity, suggested: false });
  if ($('#stockRequestQuantity')) $('#stockRequestQuantity').value = '';
  renderStockRequestCatalogue();
}

async function useStockRequest(request) {
  try {
    const result = await inventoryApi('POST', { action: 'set_request_processing', requestId: request.id, start: true });
    request = result.request;
    await loadInventory();
  } catch (error) { return toast(error.message, 'bad'); }
  setInventoryView('work');
  state.inventory.activeRequestId = request.id;
  state.inventory.activeRequestUpdatedAt = request.updated_at;
  state.inventory.billLines = (request.franchise_stock_request_items || []).map(row => {
    const item = inventoryItem(row.item_id) || {};
    const requestUnit = row.unit === 'EACH' ? 'PIECE' : row.unit;
    const supplyQuantity = Number(row.quantity);
    const calculated = requestSupplyQuantities(item, requestUnit, supplyQuantity);
    const inventoryQuantity = Number(row.inventory_quantity) > 0 ? Number(row.inventory_quantity) : calculated.inventoryQuantity;
    const billingQuantity = Number(row.billing_quantity) > 0 ? Number(row.billing_quantity) : calculated.billingQuantity;
    return { itemId: row.item_id, name: row.item_name, inventoryQuantity, billingQuantity, requestedQuantity: supplyQuantity, requestedUnit: requestUnit, unitPrice: Number(item.default_supply_price || row.fixed_unit_price || 0) };
  });
  if ($('#supplyOutlet')) $('#supplyOutlet').value = request.outlet_id;
  if ($('#supplyNotes')) $('#supplyNotes').value = `From franchise requirement for ${request.required_for}${request.notes ? ` · ${request.notes}` : ''}`;
  renderSupplyLines();
  revealAndScroll($('#inventoryAdminWorkspace'));
  toast('Request loaded into the supply bill.', 'ok');
}

async function saveDailyExpense() {
  const button = $('#saveDailyExpense');
  button.disabled = true;
  try {
    const editing = state.inventory.editingExpenseId;
    const selectedDate = $('#expenseDate')?.value;
    const existingExpense = state.inventory.expenses.find(row => row.id === editing);
    const today = new Date().toLocaleDateString('en-CA');
    const occurredAt = existingExpense && new Date(existingExpense.occurred_at).toLocaleDateString('en-CA') === selectedDate
      ? existingExpense.occurred_at
      : !selectedDate || selectedDate === today ? new Date().toISOString() : new Date(`${selectedDate}T12:00:00+05:30`).toISOString();
    await inventoryApi('POST', { action: editing ? 'update_expense' : 'add_expense', expenseId: editing, outletId: $('#expenseOutlet')?.value, categoryId: $('#expenseCategory')?.value, description: $('#expenseDescription')?.value, amount: $('#expenseAmount')?.value, occurredAt });
    if ($('#expenseDescription')) $('#expenseDescription').value = '';
    if ($('#expenseAmount')) $('#expenseAmount').value = '';
    resetExpenseForm();
    await loadInventory();
    toast(editing ? 'Daily expense updated.' : 'Daily expense saved in the outlet book.', 'ok');
  } catch (error) { toast(error.message, 'bad'); } finally { button.disabled = false; }
}

function resetExpenseForm() {
  state.inventory.editingExpenseId = null;
  if ($('#expenseFormTitle')) $('#expenseFormTitle').textContent = 'Add daily expense';
  if ($('#saveDailyExpense')) $('#saveDailyExpense').textContent = 'SAVE DAILY EXPENSE';
  $('#cancelExpenseEdit')?.classList.add('hidden');
  if ($('#expenseDescription')) $('#expenseDescription').value = '';
  if ($('#expenseAmount')) $('#expenseAmount').value = '';
  if ($('#expenseDate')) $('#expenseDate').value = new Date().toLocaleDateString('en-CA');
}

function editDailyExpense(expense) {
  state.inventory.editingExpenseId = expense.id;
  if ($('#expenseOutlet')) $('#expenseOutlet').value = expense.outlet_id;
  if ($('#expenseCategory')) $('#expenseCategory').value = expense.category_id || '';
  if ($('#expenseDescription')) $('#expenseDescription').value = expense.description || '';
  if ($('#expenseAmount')) $('#expenseAmount').value = Number(expense.amount || 0);
  if ($('#expenseDate')) $('#expenseDate').value = new Date(expense.occurred_at).toLocaleDateString('en-CA');
  if ($('#expenseFormTitle')) $('#expenseFormTitle').textContent = 'Edit daily expense';
  if ($('#saveDailyExpense')) $('#saveDailyExpense').textContent = 'UPDATE DAILY EXPENSE';
  $('#cancelExpenseEdit')?.classList.remove('hidden');
  revealAndScroll($('#ownerExpenseEntryPanel'));
}

async function deleteDailyExpense(expense) {
  if (!window.confirm(`Delete this ${formatReportMoney(expense.amount)} expense?`)) return;
  try {
    await inventoryApi('POST', { action: 'delete_expense', expenseId: expense.id });
    if (state.inventory.editingExpenseId === expense.id) resetExpenseForm();
    await loadInventory();
    toast('Daily expense deleted.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

async function createManagedCategory(type) {
  const stock = type === 'stock';
  const input = $(stock ? '#stockCategoryName' : '#expenseCategoryName');
  const name = String(input?.value || '').trim();
  if (!name) return toast('Enter a category name.', 'bad');
  try {
    await inventoryApi('POST', { action: stock ? 'create_stock_category' : 'create_expense_category', name });
    input.value = '';
    await loadInventory();
    toast(`${stock ? 'Stock' : 'Expense'} category created.`, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

async function editManagedCategory(type, row) {
  const name = String(window.prompt('Category name:', row.name) || '').trim();
  if (!name) return;
  const active = window.confirm('Keep this category active? Choose Cancel to hide it from new entries.');
  try {
    await inventoryApi('POST', { action: type === 'stock' ? 'update_stock_category' : 'update_expense_category', categoryId: row.id, name, active });
    await loadInventory();
    toast('Category updated.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

async function deleteInventoryItem(item) {
  if (!window.confirm(`Deactivate ${item.name}?\n\nIt will be hidden from new requirements, bills and recipes. Previous records remain unchanged.`)) return;
  try {
    await inventoryApi('POST', { action: 'delete_item', itemId: item.id });
    await loadInventory();
    toast(`${item.name} deactivated. You can reactivate it from Edit.`, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

async function deleteManagedCategory(type, row) {
  if (!window.confirm(`Delete the category “${row.name}”?`)) return;
  try {
    const result = await inventoryApi('POST', { action: type === 'stock' ? 'delete_stock_category' : 'delete_expense_category', categoryId: row.id });
    await loadInventory();
    toast(result.archived ? `${row.name} archived to preserve previous records.` : `${row.name} deleted.`, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
}

function renderLocalPurchases({ formOnly = false, historyOnly = false } = {}) {
  const renderForm = !historyOnly && (formOnly || state.inventory.activeView === 'work');
  const renderHistory = !formOnly && (historyOnly || state.inventory.activeView === 'history');
  if (renderForm) {
  const outletId = $('#localPurchaseOutlet')?.value;
  const editingBill = state.inventory.bills.find(row => row.id === state.inventory.localPurchaseEditingBillId);
  const editingItemId = editingBill?.supply_bill_items?.[0]?.item_id;
  const availableItems = state.inventory.items.filter(item => (item.active !== false || item.id === editingItemId) && (!item.local_outlet_id || item.local_outlet_id === outletId));
  const categories = state.inventory.stockCategories.filter(row => row.active !== false || availableItems.some(item => item.category_id === row.id)).map(row => ({ value: row.id, label: row.name }));
  if (availableItems.some(item => !categories.some(category => category.value === item.category_id))) categories.push({ value: 'UNCATEGORIZED', label: 'Uncategorized' });
  categories.sort((a,b) => a.label.localeCompare(b.label));
  inventorySelectOptions($('#localPurchaseCategory'), [{ value: '', label: 'Choose a category' }, ...categories], $('#localPurchaseCategory')?.value);
  const categoryId = $('#localPurchaseCategory')?.value;
  const items = availableItems.filter(item => categoryId === 'UNCATEGORIZED' ? !categories.some(category => category.value === item.category_id) : item.category_id === categoryId).sort((a,b) => a.name.localeCompare(b.name));
  const canAddItem = state.inventory.stockCategories.some(row => row.id === categoryId && row.active !== false);
  inventorySelectOptions($('#localPurchaseItem'), [{ value: '', label: categoryId ? 'Choose an item' : 'Choose a category first' }, ...(categoryId ? items.map(item => ({ value: item.id, label: item.name })) : []), ...(canAddItem ? [{ value: 'NEW', label: '+ Add item to this category' }] : [])], $('#localPurchaseItem')?.value);
  if ($('#localPurchaseItem')) $('#localPurchaseItem').disabled = !categoryId;
  if ($('#localPurchaseOutlet')) $('#localPurchaseOutlet').disabled = Boolean(editingBill);
  updateLocalPurchaseFields();
  const open = state.inventory.openSessions.some(row => row.outlet_id === outletId);
  if ($('#localPurchaseSessionHint')) $('#localPurchaseSessionHint').textContent = open ? 'Recording in the current open session.' : 'Open an outlet session to record a purchase.';
  if ($('#saveLocalPurchase')) {
    $('#saveLocalPurchase').disabled = (!open && !editingBill) || Boolean(state.inventory.localPurchaseSaving);
    $('#saveLocalPurchase').textContent = editingBill ? 'Update purchase' : 'Save purchase & add stock';
  }
  }
  if (renderHistory) {
  const bills = inventoryHistoryRows(state.inventory.bills, 'supplied_at').filter(row => row.purchase_source === 'LOCAL' && row.status !== 'VOID');
  if ($('#localPurchaseTotal')) $('#localPurchaseTotal').textContent = formatReportMoney(bills.reduce((sum, bill) => sum + Number(bill.total_amount), 0));
  if ($('#localPurchaseHistory')) $('#localPurchaseHistory').innerHTML = bills.length ? `<table><thead><tr><th>Date / receipt</th><th>Outlet</th><th>Item</th><th>Received</th><th>Total paid</th><th>Actions</th></tr></thead><tbody>${bills.flatMap(bill => (bill.supply_bill_items || []).map(line => `<tr><td>${escapeHtml(inventoryDate(bill.supplied_at))}<br>${escapeHtml(bill.bill_number)}</td><td>${escapeHtml(inventoryOutlet(bill.outlet_id)?.name || '')}</td><td>${escapeHtml(line.item_name)}</td><td>${inventoryQty(line.quantity)} ${escapeHtml(unitLabel(line.unit))}</td><td>${formatReportMoney(line.line_total)}</td><td><button class="secondary" type="button" data-local-purchase-edit="${escapeHtml(bill.id)}">${state.inventory.localPurchaseEditingBillId === bill.id ? 'CANCEL' : 'EDIT'}</button> <button class="secondary" type="button" data-local-purchase-remove="${escapeHtml(bill.id)}">REMOVE</button></td></tr>`)).join('')}</tbody></table>` : '<div class="inventory-empty">No local purchases in the selected outlet/session range.</div>';
  }
}

function editLocalPurchase(billId) {
  if (state.inventory.localPurchaseEditingBillId === billId) return cancelLocalPurchaseEdit();
  const bill = state.inventory.bills.find(row => row.id === billId && row.purchase_source === 'LOCAL' && row.status !== 'VOID');
  const line = bill?.supply_bill_items?.[0];
  const item = line && inventoryItem(line.item_id);
  if (!bill || !line || !item) return toast('This local purchase is no longer available to edit.', 'bad');
  state.inventory.localPurchaseEditingBillId = bill.id;
  setInventoryView('work');
  $('#localPurchaseOutlet').value = bill.outlet_id;
  renderLocalPurchases();
  $('#localPurchaseCategory').value = item.category_id || '';
  renderLocalPurchases();
  $('#localPurchaseItem').value = item.id;
  updateLocalPurchaseFields();
  $('#localPurchaseQuantity').value = line.quantity;
  $('#localPurchaseUnit').value = line.unit;
  $('#localPurchaseCost').value = Number(bill.total_amount).toFixed(2);
  $('#localPurchasePayment').value = bill.supply_bill_payments?.[0]?.payment_method || 'OTHER';
  $('#localPurchaseNote').value = String(bill.notes || '').replace(/^Local purchase\s*·?\s*/i, '');
  $('#localPurchaseQuantity')?.focus();
  $('#localPurchasesPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelLocalPurchaseEdit() {
  state.inventory.localPurchaseEditingBillId = null;
  ['#localPurchaseQuantity','#localPurchaseCost','#localPurchaseName','#localPurchaseNote'].forEach(selector => { if ($(selector)) $(selector).value = ''; });
  if ($('#localPurchasePayment')) $('#localPurchasePayment').value = 'CASH';
  if ($('#localPurchaseCategory')) $('#localPurchaseCategory').value = '';
  if ($('#localPurchaseItem')) $('#localPurchaseItem').value = '';
  if ($('#localPurchaseOutlet')) $('#localPurchaseOutlet').disabled = false;
  renderLocalPurchases();
}

async function removeLocalPurchase(billId) {
  const bill = state.inventory.bills.find(row => row.id === billId && row.purchase_source === 'LOCAL' && row.status !== 'VOID');
  if (!bill) return toast('This local purchase is no longer available.', 'bad');
  if (!window.confirm(`Remove local purchase ${bill.bill_number}?\n\nThis will reverse its stock quantity, remove it from totals, and keep an audit record. It cannot be removed if that stock has already been used.`)) return;
  try {
    await inventoryApi('POST', { action: 'void_local_purchase', billId });
    if (state.inventory.localPurchaseEditingBillId === billId) cancelLocalPurchaseEdit();
    await loadInventory();
    toast('Local purchase removed and stock corrected.', 'ok');
  } catch (error) { toast(error.message || 'Unable to remove the local purchase.', 'bad'); }
}

function updateLocalPurchaseFields() {
  const selected = $('#localPurchaseItem')?.value;
  $('#localPurchaseNameField')?.classList.toggle('hidden', selected !== 'NEW');
  const item = inventoryItem(selected);
  const base = item?.inventory_unit || item?.base_unit;
  const units = base === 'G' ? ['KG','G'] : base === 'ML' ? ['L','ML'] : base === 'EACH' ? ['PIECE'] : ['KG','G','L','ML','PIECE'];
  inventorySelectOptions($('#localPurchaseUnit'), units.map(unit => ({ value: unit, label: unitLabel(unit) })), $('#localPurchaseUnit')?.value);
}

async function saveLocalPurchase() {
  if (state.inventory.localPurchaseSaving) return;
  const editingBillId = state.inventory.localPurchaseEditingBillId;
  const selected = $('#localPurchaseItem')?.value;
  if (!selected) return toast('Choose a stock item or add a missing item.', 'bad');
  const body = { action: editingBillId ? 'edit_local_purchase' : 'record_local_purchase', billId: editingBillId, outletId: $('#localPurchaseOutlet')?.value, itemId: selected === 'NEW' ? null : selected, name: $('#localPurchaseName')?.value, categoryId: $('#localPurchaseCategory')?.value, quantity: $('#localPurchaseQuantity')?.value, unit: $('#localPurchaseUnit')?.value, cost: $('#localPurchaseCost')?.value, paymentMethod: $('#localPurchasePayment')?.value, notes: $('#localPurchaseNote')?.value };
  try { normalizeLocalPurchase(body, state.inventory.items); } catch (error) { return toast(error.message, 'bad'); }
  if (!editingBillId) {
    const fingerprint = JSON.stringify(body);
    if (state.inventory.localPurchaseFingerprint !== fingerprint) {
      state.inventory.localPurchaseFingerprint = fingerprint;
      state.inventory.localPurchaseKey = crypto.randomUUID();
    }
    body.entryKey = state.inventory.localPurchaseKey;
  }
  state.inventory.localPurchaseSaving = true;
  $('#saveLocalPurchase').disabled = true;
  let saved = false;
  try {
    await inventoryApi('POST', body);
    saved = true;
    ['#localPurchaseQuantity','#localPurchaseCost','#localPurchaseName','#localPurchaseNote'].forEach(selector => { $(selector).value = ''; });
    state.inventory.localPurchaseEditingBillId = null;
    state.inventory.localPurchaseFingerprint = null;
    state.inventory.localPurchaseKey = null;
    toast(editingBillId ? 'Local purchase updated. Stock totals were corrected.' : 'Local purchase saved. Stock and session purchase costs updated.', 'ok');
    await loadInventory();
  } catch (error) { toast(saved ? 'Purchase saved, but the list could not refresh. Refresh the page to view it.' : error.message, 'bad'); }
  finally { state.inventory.localPurchaseSaving = false; renderLocalPurchases(); }
}

async function createInventoryItem() {
  const button = $('#inventoryCreateItem'); button.disabled = true;
  try {
    await inventoryApi('POST', { action: 'create_item', name: $('#inventoryItemName')?.value, sku: $('#inventoryItemSku')?.value, categoryId: $('#inventoryItemCategory')?.value, requestUnit: $('#inventoryRequestUnit')?.value, supplyUnit: $('#inventorySupplyUnit')?.value, inventoryUnit: $('#inventoryInternalUnit')?.value, requestConversion: $('#inventoryRequestConversion')?.value, billingConversion: $('#inventoryBillingConversion')?.value, lowStockThreshold: $('#inventoryItemThreshold')?.value, targetStockLevel: $('#inventoryItemTarget')?.value, defaultSupplyPrice: $('#inventoryItemPrice')?.value });
    ['inventoryItemName','inventoryItemSku','inventoryItemThreshold','inventoryItemTarget','inventoryItemPrice'].forEach(id => { if ($(`#${id}`)) $(`#${id}`).value = ''; });
    await loadInventory(); toast('Stock item created.', 'ok');
  } catch (error) { toast(error.message, 'bad'); } finally { button.disabled = false; }
}

function syncCreateConversionDefaults() {
  const inventoryUnit = $('#inventoryInternalUnit')?.value;
  const request = standardConversion($('#inventoryRequestUnit')?.value, inventoryUnit);
  const billing = standardConversion($('#inventorySupplyUnit')?.value, inventoryUnit);
  if ($('#inventoryRequestConversion')) $('#inventoryRequestConversion').value = request > 0 ? request : '';
  if ($('#inventoryBillingConversion')) $('#inventoryBillingConversion').value = billing > 0 ? billing : '';
}

async function confirmInventoryReceipt(bill, button) {
  if (!window.confirm(`Confirm that ${bill.bill_number} was physically received? Stock will be added now.`)) return;
  button.disabled = true;
  try {
    const result = await inventoryApi('POST', { action: 'confirm_receipt', billId: bill.id });
    await loadInventory();
    toast(result.alreadyReceived ? 'This supply was already received.' : 'Stock receipt confirmed and cart inventory updated.', 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  finally { button.disabled = false; }
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function downloadInventoryReport() {
  const rows = [['Date','Outlet','Type','Item','Quantity','Unit','Balance','Notes'], ...inventoryHistoryRows(state.inventory.movements, 'occurred_at').map(row => { const item = inventoryItem(row.item_id) || {}; const snapshotUnit = row.inventory_unit_snapshot; return [inventoryDate(row.occurred_at), inventoryOutlet(row.outlet_id)?.name || '', row.movement_type, row.item_name_snapshot || item.name || '', snapshotUnit ? Number(row.quantity_delta) : inventoryDisplayQuantity(item, row.quantity_delta), snapshotUnit || item.display_unit || '', snapshotUnit ? Number(row.balance_after) : inventoryDisplayQuantity(item, row.balance_after), row.notes || '']; })];
  downloadCsv(`ohho-inventory-${new Date().toISOString().slice(0,10)}.csv`, rows);
}

function downloadSupplyBillCsv(bill) {
  downloadCsv(`${bill.bill_number}.csv`, [['Bill Number',bill.bill_number],['Outlet',inventoryOutlet(bill.outlet_id)?.name || ''],['Supplied At',inventoryDate(bill.supplied_at)],['Receipt Status',bill.receipt_status || 'RECEIVED'],['Payment Status',bill.payment_status],[],['Item','Inventory Quantity','Inventory Unit','Supply Quantity','Supply Unit','Rate','Total'],...(bill.supply_bill_items || []).map(line => { const item = inventoryItem(line.item_id) || {}; return [line.item_name,line.base_quantity,item.inventory_unit || item.base_unit,line.quantity,line.unit,line.unit_price,line.line_total]; }),[],['Bill Total',bill.total_amount],['Paid',bill.paid_amount],['Due',Number(bill.total_amount)-Number(bill.paid_amount)]]);
}

function downloadSupplyHistoryCsv() {
  const bills = centralSupplyHistoryRows();
  if (!bills.length) return toast('There are no central supply bills to download for this range.', 'bad');
  const rows = [
    ['OHHO BURGERS CENTRAL SUPPLY BILL HISTORY'],
    ['Session selection', state.inventory.historyMode === 'CURRENT' ? 'Current open sessions' : state.inventory.historyMode === 'ALL' ? 'All completed sessions' : 'Completed sessions by closing date'],
    ['Session closed from', state.inventory.historyFrom || 'Beginning'],
    ['Session closed to', state.inventory.historyTo || 'Latest'],
    ['Generated At', new Date().toLocaleString('en-IN')],
    [],
    ['Bill Number','Date','Outlet','Item','Inventory Quantity','Inventory Unit','Billing Quantity','Billing Unit','Rate','Line Total','Bill Total','Receipt Status','Payment Status','Paid','Due'],
    ...bills.flatMap(bill => {
      const lines = bill.supply_bill_items || [];
      const due = Math.max(0, Number(bill.total_amount || 0) - Number(bill.paid_amount || 0));
      if (!lines.length) return [[bill.bill_number, inventoryDate(bill.supplied_at), inventoryOutlet(bill.outlet_id)?.name || '', '', '', '', '', '', '', '', bill.total_amount, bill.receipt_status || 'RECEIVED', bill.payment_status || '', bill.paid_amount || 0, due]];
      return lines.map(line => {
        const item = inventoryItem(line.item_id) || {};
        return [bill.bill_number, inventoryDate(bill.supplied_at), inventoryOutlet(bill.outlet_id)?.name || '', line.item_name, line.base_quantity, item.inventory_unit || item.base_unit || '', line.quantity, line.unit, line.unit_price, line.line_total, bill.total_amount, bill.receipt_status || 'RECEIVED', bill.payment_status || '', bill.paid_amount || 0, due];
      });
    })
  ];
  downloadCsv(`ohho-central-supply-bill-history-${new Date().toISOString().slice(0,10)}.csv`, rows);
}

function printSupplyBill(bill, autoPrint = true) {
  const outlet = inventoryOutlet(bill.outlet_id);
  const popup = window.open('', '_blank', 'width=760,height=850');
  if (!popup) return toast('Allow pop-ups to view or print the invoice.', 'bad');
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(bill.bill_number)}</title><style>body{font-family:Arial,sans-serif;padding:36px;color:#111}@media print{.invoice-tools{display:none}}h1{margin:0}.brand{font-weight:900;font-size:26px}.brand span{color:#d4a900}.meta{margin:20px 0;line-height:1.7}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.total{text-align:right;font-size:20px;font-weight:900;margin-top:20px}.status{margin-top:8px;text-align:right}</style></head><body><div class="invoice-tools"><button onclick="window.print()">Print / Save PDF</button></div><div class="brand">OHHO <span>BURGERS</span></div><h1>${bill.purchase_source === 'LOCAL' ? 'Local Purchase Receipt' : 'Franchise Supply Invoice'}</h1><div class="meta"><strong>${escapeHtml(bill.bill_number)}</strong><br>${escapeHtml(outlet?.name || 'Outlet')}<br>${inventoryDate(bill.supplied_at)}<br>Receipt: ${escapeHtml(bill.receipt_status || 'RECEIVED')}</div><table><thead><tr><th>Item</th><th>Inventory added</th><th>Supply quantity</th><th>Rate</th><th>Total</th></tr></thead><tbody>${(bill.supply_bill_items || []).map(line => { const item = inventoryItem(line.item_id) || {}; return `<tr><td>${escapeHtml(line.item_name)}</td><td>${inventoryQty(line.base_quantity)} ${escapeHtml(unitLabel(line.inventory_unit || item.inventory_unit || item.base_unit,line.base_quantity))}</td><td>${inventoryQty(line.quantity)} ${escapeHtml(unitLabel(line.unit,line.quantity))}</td><td>${formatReportMoney(line.unit_price)}</td><td>${formatReportMoney(line.line_total)}</td></tr>`; }).join('')}</tbody></table><div class="total">Total: ${formatReportMoney(bill.total_amount)}</div><div class="status">Paid: ${formatReportMoney(bill.paid_amount)} · Due: ${formatReportMoney(Number(bill.total_amount)-Number(bill.paid_amount))}</div>${autoPrint ? '<script>window.onload=()=>window.print()<\/script>' : ''}</body></html>`);
  popup.document.close();
}

async function recordInventoryPayment(bill) {
  const due = Math.max(0, Number(bill.total_amount) - Number(bill.paid_amount));
  const amount = Number(window.prompt(`Enter payment amount (due ${formatReportMoney(due)}):`, due.toFixed(2)));
  if (!(amount > 0)) return;
  const method = String(window.prompt('Payment method: CASH, UPI, BANK or OTHER', 'UPI') || '').toUpperCase();
  if (!['CASH','UPI','BANK','OTHER'].includes(method)) return toast('Use CASH, UPI, BANK or OTHER.', 'bad');
  try { await inventoryApi('POST', { action: 'record_payment', billId: bill.id, amount, method }); await loadInventory(); toast('Payment recorded.', 'ok'); }
  catch (error) { toast(error.message, 'bad'); }
}

function wireInventoryActions() {
  const refreshSessionRecords = async () => { await loadSalesReports(); await loadInventory(); };
  $('#inventoryQuickNav')?.addEventListener('click', event => {
    const button = event.target.closest('[data-inventory-tab]');
    if (button) setInventoryView(button.dataset.inventoryTab);
  });
  $$('#inventoryAdminWorkspace .inventory-tool-card').forEach(section => section.addEventListener('toggle', () => {
    if (!section.open) return;
    $$('#inventoryAdminWorkspace .inventory-tool-card').forEach(other => { if (other !== section) other.open = false; });
  }));
  $('#inventoryRefreshBtn')?.addEventListener('click', () => refreshSessionRecords().catch(error => toast(error.message, 'bad')));
  $('#inventoryApplyFilter')?.addEventListener('click', () => {
    try {
      const from = $('#inventoryFrom')?.value || '';
      const to = $('#inventoryTo')?.value || '';
      if (!from || !to) throw new Error('Choose both session opening dates.');
      const dateBounds = historyBounds(from, to);
      const bounds = { sessions:inventoryHistorySessions().filter(s => new Date(s.opened_at).getTime() >= dateBounds.start && new Date(s.opened_at).getTime() < dateBounds.end) };
      if (bounds.invalid) throw new Error('The From date must be on or before the To date.');
      state.inventory.historyMode = 'CUSTOM';
      state.inventory.historyFrom = from;
      state.inventory.historyTo = to;
      setInventoryView('history');
      const bills = centralSupplyHistoryRows().length;
      const movements = inventoryHistoryRows(state.inventory.movements, 'occurred_at').length;
      revealAndScroll($('#inventoryRecords'));
      toast(`Showing ${bounds.sessions.length} session${bounds.sessions.length === 1 ? '' : 's'}, ${bills} bill${bills === 1 ? '' : 's'} and ${movements} stock movement${movements === 1 ? '' : 's'}.`, 'ok');
    } catch (error) { toast(error.message, 'bad'); }
  });
  $('#inventoryAllRecords')?.addEventListener('click', () => {
    if ($('#inventoryFrom')) $('#inventoryFrom').value = '';
    if ($('#inventoryTo')) $('#inventoryTo').value = '';
    state.inventory.historyMode = 'ALL';
    state.inventory.historyFrom = '';
    state.inventory.historyTo = '';
    setInventoryView('history');
    revealAndScroll($('#inventoryRecords'));
    toast(`Showing all stock history: ${centralSupplyHistoryRows().length} supply bills and ${inventoryHistoryRows(state.inventory.movements, 'occurred_at').length} stock movements.`, 'ok');
  });
  $('#inventoryCurrentSession')?.addEventListener('click', () => {
    if ($('#inventoryFrom')) $('#inventoryFrom').value = '';
    if ($('#inventoryTo')) $('#inventoryTo').value = '';
    state.inventory.historyMode = 'CURRENT';
    state.inventory.historyFrom = '';
    state.inventory.historyTo = '';
    setInventoryView('history');
    revealAndScroll($('#inventoryRecords'));
    toast('Showing current open-session stock records.', 'ok');
  });
  $('#supplyHistoryCustomToggle')?.addEventListener('click', () => {
    const panel = $('#supplyHistoryCustomPanel');
    const open = panel?.classList.contains('hidden');
    panel?.classList.toggle('hidden', !open);
    $('#supplyHistoryCustomToggle')?.setAttribute('aria-expanded', String(Boolean(open)));
    if (open) {
      const today = localDateInputValue();
      if ($('#supplyHistoryFrom') && !$('#supplyHistoryFrom').value) $('#supplyHistoryFrom').value = state.inventory.historyFrom || today;
      if ($('#supplyHistoryTo') && !$('#supplyHistoryTo').value) $('#supplyHistoryTo').value = state.inventory.historyTo || today;
    }
  });
  $('#supplyHistoryApply')?.addEventListener('click', () => {
    const from = $('#supplyHistoryFrom')?.value || '';
    const to = $('#supplyHistoryTo')?.value || '';
    try {
      if (!from || !to) throw new Error('Choose both session opening dates.');
      const dateBounds = historyBounds(from, to);
      const bounds = { sessions:inventoryHistorySessions().filter(s => new Date(s.opened_at).getTime() >= dateBounds.start && new Date(s.opened_at).getTime() < dateBounds.end) };
      if (bounds.invalid) throw new Error('The From date must be on or before the To date.');
      state.inventory.historyMode = 'CUSTOM';
      state.inventory.historyFrom = from;
      state.inventory.historyTo = to;
      if ($('#inventoryFrom')) $('#inventoryFrom').value = from;
      if ($('#inventoryTo')) $('#inventoryTo').value = to;
      setInventoryView('history');
      toast(`Showing records from ${bounds.sessions.length} session${bounds.sessions.length === 1 ? '' : 's'}.`, 'ok');
    } catch (error) { toast(error.message, 'bad'); }
  });
  $('#supplyHistoryShowAll')?.addEventListener('click', () => {
    state.inventory.historyMode = 'ALL';
    state.inventory.historyFrom = '';
    state.inventory.historyTo = '';
    if ($('#inventoryFrom')) $('#inventoryFrom').value = '';
    if ($('#inventoryTo')) $('#inventoryTo').value = '';
    if ($('#supplyHistoryFrom')) $('#supplyHistoryFrom').value = '';
    if ($('#supplyHistoryTo')) $('#supplyHistoryTo').value = '';
    setInventoryView('history');
  });
  $('#supplyHistoryCurrentSession')?.addEventListener('click', () => {
    state.inventory.historyMode = 'CURRENT';
    state.inventory.historyFrom = '';
    state.inventory.historyTo = '';
    if ($('#inventoryFrom')) $('#inventoryFrom').value = '';
    if ($('#inventoryTo')) $('#inventoryTo').value = '';
    if ($('#supplyHistoryFrom')) $('#supplyHistoryFrom').value = '';
    if ($('#supplyHistoryTo')) $('#supplyHistoryTo').value = '';
    setInventoryView('history');
  });
  $('#supplyHistoryClear')?.addEventListener('click', () => {
    state.inventory.historyMode = 'ALL';
    state.inventory.historyFrom = '';
    state.inventory.historyTo = '';
    if ($('#inventoryFrom')) $('#inventoryFrom').value = '';
    if ($('#inventoryTo')) $('#inventoryTo').value = '';
    setInventoryView('history');
    if ($('#supplyHistoryFrom')) $('#supplyHistoryFrom').value = '';
    if ($('#supplyHistoryTo')) $('#supplyHistoryTo').value = '';
    $('#supplyHistoryCustomPanel')?.classList.add('hidden');
    $('#supplyHistoryCustomToggle')?.setAttribute('aria-expanded', 'false');
  });
  $('#supplyHistoryDownload')?.addEventListener('click', downloadSupplyHistoryCsv);
  $('#inventoryOutletFilter')?.addEventListener('change', () => refreshSessionRecords().catch(error => toast(error.message, 'bad')));
  $('#inventoryDownloadBtn')?.addEventListener('click', () => { try { downloadInventoryReport(); } catch (error) { toast(error.message, 'bad'); } });
  $('#supplyItemSearch')?.addEventListener('focus', event => renderSupplyItemPicker(event.target.value, true));
  $('#supplyItemSearch')?.addEventListener('input', event => { if ($('#supplyItem')) $('#supplyItem').value = ''; if ($('#supplyPrice')) $('#supplyPrice').value = ''; renderSupplyItemPicker(event.target.value, true); });
  $('#supplyItemSearch')?.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#supplyItemMenu')?.classList.add('hidden'); event.target.setAttribute('aria-expanded', 'false'); } if (event.key === 'Enter') { const first = $('#supplyItemMenu [data-supply-item-option]'); if (first) { event.preventDefault(); selectSupplyItem(first.dataset.supplyItemOption); } } });
  $('#supplyItemMenu')?.addEventListener('click', event => { const button = event.target.closest('[data-supply-item-option]'); if (button) selectSupplyItem(button.dataset.supplyItemOption); });
  document.addEventListener('click', event => { if (!event.target.closest('.supply-item-combobox')) { $('#supplyItemMenu')?.classList.add('hidden'); $('#supplyItemSearch')?.setAttribute('aria-expanded', 'false'); } });
  $('#supplyAddLine')?.addEventListener('click', addSupplyLine);
  $('#supplyQuantity')?.addEventListener('input', () => {
    const item = inventoryItem($('#supplyItem')?.value);
    const suggested = defaultNetQuantity(item?.supply_unit || item?.billing_unit, item?.inventory_unit || item?.base_unit, $('#supplyQuantity')?.value);
    if ($('#supplyBillingQuantity') && suggested !== '') $('#supplyBillingQuantity').value = suggested;
  });
  $('#supplyGenerateBill')?.addEventListener('click', () => generateSupplyBill(false));
  $('#supplyReceiveDirect')?.addEventListener('click', () => generateSupplyBill(true));
  $('#saveLocalPurchase')?.addEventListener('click', saveLocalPurchase);
  $('#localPurchaseOutlet')?.addEventListener('change', renderLocalPurchases);
  $('#localPurchaseItem')?.addEventListener('change', updateLocalPurchaseFields);
  $('#localPurchaseCategory')?.addEventListener('change', renderLocalPurchases);
  $('#localPurchaseHistory')?.addEventListener('click', event => {
    const edit = event.target.closest('[data-local-purchase-edit]');
    const remove = event.target.closest('[data-local-purchase-remove]');
    if (edit) editLocalPurchase(edit.dataset.localPurchaseEdit);
    if (remove) removeLocalPurchase(remove.dataset.localPurchaseRemove);
  });
  $('#inventoryCreateItem')?.addEventListener('click', createInventoryItem);
  ['#inventoryRequestUnit','#inventorySupplyUnit','#inventoryInternalUnit'].forEach(selector => $(selector)?.addEventListener('change', syncCreateConversionDefaults));
  $('#recipeMenuCategory')?.addEventListener('change', () => { fillInventoryControls(); resetRecipeEditor(); renderRecipeIngredients(); });
  $('#recipeMenuItem')?.addEventListener('change', () => { resetRecipeEditor(); renderRecipeIngredients(); });
  $('#recipeStockCategory')?.addEventListener('change', () => { fillInventoryControls(); updateRecipeQuantityUnit(); });
  $('#recipeStockItem')?.addEventListener('change', updateRecipeQuantityUnit);
  $('#saveRecipeIngredient')?.addEventListener('click', saveRecipeIngredient);
  $('#cancelRecipeEdit')?.addEventListener('click', resetRecipeEditor);
  $('#recipeMonitorCategory')?.addEventListener('change', () => { fillInventoryControls(); renderRecipeMonitor(); });
  $('#recipeMonitorItem')?.addEventListener('change', renderRecipeMonitor);
  $('#packagingConsumptionType')?.addEventListener('change', updatePackagingRuleFields);
  $('#savePackagingRule')?.addEventListener('click', savePackagingRule);
  $('#packagingRuleList')?.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-packaging-rule]');
    const deactivate = event.target.closest('[data-deactivate-packaging-rule]');
    const rule = state.inventory.packagingRules.find(row => row.id === (edit?.dataset.editPackagingRule || deactivate?.dataset.deactivatePackagingRule));
    if (edit && rule) editPackagingRule(rule);
    if (deactivate && rule) deactivatePackagingRule(rule.id);
  });
  $('#staffRuleCategory')?.addEventListener('change', () => { fillInventoryControls(); updateStaffRuleUnit(); });
  $('#staffRuleItem')?.addEventListener('change', updateStaffRuleUnit);
  $('#staffRuleBasis')?.addEventListener('change', updateStaffRuleUnit);
  $('#saveStaffRule')?.addEventListener('click', saveStaffRule);
  $('#cancelStaffRuleEdit')?.addEventListener('click', resetStaffRuleEditor);
  $('#staffRuleList')?.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-staff-rule]');
    const deactivate = event.target.closest('[data-deactivate-staff-rule]');
    const ruleId = edit?.dataset.editStaffRule || deactivate?.dataset.deactivateStaffRule;
    const rule = state.inventory.staffRules.find(row => row.id === ruleId);
    if (edit && rule) editStaffRule(rule);
    if (deactivate && rule) deactivateStaffRule(rule.id);
  });
  $('#staffConsumptionOutlet')?.addEventListener('change', renderStaffConsumption);
  $('#staffWorkingCount')?.addEventListener('input', renderStaffConsumption);
  $('#confirmStaffConsumption')?.addEventListener('click', confirmStaffConsumption);
  $$('[data-inventory-modal-close]').forEach(button => button.addEventListener('click', closeInventoryItemModal));
  $('#saveInventoryItemChanges')?.addEventListener('click', saveInventoryItemChanges);
  $('#openingStockOutlet')?.addEventListener('change', renderOpeningStock);
  $('#openingStockItems')?.addEventListener('input', event => {
    const input = event.target.closest('[data-opening-item]');
    if (!input) return;
    const outletId = $('#openingStockOutlet')?.value || state.inventory.outlets[0]?.id || '';
    if (!outletId) return;
    const draft = state.inventory.openingStockDrafts[outletId] ||= {};
    draft[input.dataset.openingItem] = input.value;
  });
  $('#confirmOpeningStock')?.addEventListener('click', confirmOpeningStock);
  $('#clearOpeningStock')?.addEventListener('click', clearOpeningStock);
  ['#recipeIngredientList', '#recipeMonitorList'].forEach(selector => $(selector)?.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-recipe-item]');
    const remove = event.target.closest('[data-delete-recipe-item]');
    if (edit) editRecipeIngredient(edit.dataset.editRecipeMenu, edit.dataset.editRecipeItem);
    if (remove) deleteRecipeIngredient(remove.dataset.deleteRecipeMenu, remove.dataset.deleteRecipeItem);
  }));
  $('#wastageType')?.addEventListener('change', updateWastageFields);
  $('#saveWastage')?.addEventListener('click', saveWastage);
  updateWastageFields();
  updatePackagingRuleFields();
  syncCreateConversionDefaults();
  $('#generateStockSuggestions')?.addEventListener('click', generateStockSuggestions);
  $('#saveStockRequestDraft')?.addEventListener('click', saveStockRequirementDraft);
  $('#submitStockRequest')?.addEventListener('click', submitStockRequirement);
  $('#addStockRequestItem')?.addEventListener('click', addStockRequestItem);
  $('#stockRequestCategory')?.addEventListener('change', renderStockRequestCatalogue);
  $('#stockRequestCatalogue')?.addEventListener('click', event => { const button = event.target.closest('[data-remove-request-item]'); if (!button) return; state.inventory.requestLines = state.inventory.requestLines.filter(row => row.itemId !== button.dataset.removeRequestItem); renderStockRequestCatalogue(); });
  $('#stockRequestCatalogue')?.addEventListener('change', event => {
    const input = event.target.closest('[data-request-line-quantity]');
    if (!input) return;
    const row = state.inventory.requestLines.find(entry => entry.itemId === input.dataset.requestLineQuantity);
    const item = row && inventoryItem(row.itemId);
    if (!row || !item) return;
    let quantity = Number(input.value);
    if (['PIECE','EACH','BOTTLE','PACK','CAN','BOX'].includes(row.unit || stockRequestUnit(item))) quantity = Math.max(1, Math.round(quantity));
    if (!(quantity > 0)) return renderStockRequestCatalogue();
    row.quantity = quantity;
    row.suggested = false;
    renderStockRequestCatalogue();
  });
  $('#stockRequestOutlet')?.addEventListener('change', () => { state.inventory.activeDraftId = null; state.inventory.requestLines = []; state.inventory.requirementReviewKey = null; state.inventory.requirementMessage = ''; prepareClosedSessionRequirements(); renderStockRequestCatalogue(); });
  $('#saveDailyExpense')?.addEventListener('click', saveDailyExpense);
  $('#cancelExpenseEdit')?.addEventListener('click', resetExpenseForm);
  $('#expenseRefreshBtn')?.addEventListener('click', () => refreshSessionRecords().catch(error => toast(error.message, 'bad')));
  $('#expenseApplyFilter')?.addEventListener('click', () => {
    try {
      const from = $('#expenseFrom')?.value || '';
      const to = $('#expenseTo')?.value || '';
      if (!from || !to) throw new Error('Choose both session opening dates.');
      historyBounds(from, to);
      state.inventory.expenseHistoryMode = 'CUSTOM';
      state.inventory.expenseHistoryFrom = from;
      state.inventory.expenseHistoryTo = to;
      renderDailyExpenses();
      revealAndScroll($('#dailyExpenseList'));
      toast('Showing complete sessions opened in the selected dates.', 'ok');
    } catch (error) { toast(error.message, 'bad'); }
  });
  $('#expenseOutletFilter')?.addEventListener('change', renderDailyExpenses);
  $('#expenseAllRecords')?.addEventListener('click', () => {
    if ($('#expenseFrom')) $('#expenseFrom').value = '';
    if ($('#expenseTo')) $('#expenseTo').value = '';
    state.inventory.expenseHistoryMode = 'ALL';
    state.inventory.expenseHistoryFrom = '';
    state.inventory.expenseHistoryTo = '';
    renderDailyExpenses();
    revealAndScroll($('#dailyExpenseList'));
    toast('Showing all expenses grouped by session, including open sessions.', 'ok');
  });
  $('#expenseCurrentSession')?.addEventListener('click', () => {
    if ($('#expenseFrom')) $('#expenseFrom').value = '';
    if ($('#expenseTo')) $('#expenseTo').value = '';
    state.inventory.expenseHistoryMode = 'CURRENT';
    state.inventory.expenseHistoryFrom = '';
    state.inventory.expenseHistoryTo = '';
    renderDailyExpenses();
    revealAndScroll($('#dailyExpenseList'));
    toast('Showing current open-session expenses.', 'ok');
  });
  $('#createStockCategory')?.addEventListener('click', () => createManagedCategory('stock'));
  $('#createExpenseCategory')?.addEventListener('click', () => createManagedCategory('expense'));
  $('#cancelStockRequestEdit')?.addEventListener('click', resetStockRequestEditor);
  $('#ownerViewRequirements')?.addEventListener('click', () => {
    $('.nav-btn[data-section="inventory"]')?.click();
    setInventoryView('work');
    revealAndScroll($('#stockRequestAdminPanel'));
  });
  const requestAction = async event => {
    const use = event.target.closest('[data-use-stock-request]');
    const edit = event.target.closest('[data-edit-stock-draft]');
    const release = event.target.closest('[data-release-stock-request]');
    const cancel = event.target.closest('[data-cancel-stock-request]');
    const viewBill = event.target.closest('[data-request-view-bill]');
    const viewStock = event.target.closest('[data-request-view-stock]');
    if (viewBill) {
      const bill = state.inventory.bills.find(row => row.id === viewBill.dataset.requestViewBill);
      if (bill) printSupplyBill(bill, false);
      else toast('This bill is outside the loaded history. Use All Supply Bills.', 'bad');
      return;
    }
    if (viewStock) {
      if ($('#inventoryOutletFilter')) $('#inventoryOutletFilter').value = viewStock.dataset.requestViewStock;
      setInventoryView('stock');
      revealAndScroll($('#outletStockPanel'));
      return;
    }
    const id = use?.dataset.useStockRequest || edit?.dataset.editStockDraft || release?.dataset.releaseStockRequest || cancel?.dataset.cancelStockRequest;
    const request = id && state.inventory.requests.find(row => row.id === id);
    if (!request) return;
    if (use) await useStockRequest(request);
    if (edit) editStockDraft(request);
    if (release) {
      try {
        await inventoryApi('POST', { action: 'set_request_processing', requestId: id, start: false });
        if (state.inventory.activeRequestId === id) { state.inventory.activeRequestId = null; state.inventory.billLines = []; renderSupplyLines(); }
        await loadInventory();
        toast('Owner can edit this requirement again.', 'ok');
      } catch (error) { toast(error.message, 'bad'); }
    }
    if (cancel) {
      if (!window.confirm('Cancel this stock requirement? It will stay in completed history for audit.')) return;
      try {
        await inventoryApi('POST', { action: 'cancel_request', requestId: id });
        if (state.inventory.activeRequestId === id) { state.inventory.activeRequestId = null; state.inventory.billLines = []; renderSupplyLines(); }
        await loadInventory();
        toast('Requirement cancelled and moved to completed history.', 'ok');
      } catch (error) { toast(error.message, 'bad'); }
    }
  };
  $('#stockRequestList')?.addEventListener('click', requestAction);
  $('#ownerLatestRequirement')?.addEventListener('click', requestAction);
  $('#requestDirectStock')?.addEventListener('click', () => {
    setInventoryView('work');
    state.inventory.activeRequestId = null;
    state.inventory.activeRequestUpdatedAt = null;
    state.inventory.billLines = [];
    if ($('#supplyNotes')) $('#supplyNotes').value = 'Direct Admin inventory entry';
    renderSupplyLines();
    revealAndScroll($('#inventoryBillingPanel'));
    $('#supplyItemSearch')?.focus();
    toast('Direct entry ready. Add actual supplied and inventory quantities, then choose Add & Receive Directly.', 'ok');
  });
  $('#requestViewLiveStock')?.addEventListener('click', () => { setInventoryView('stock'); revealAndScroll($('#outletStockPanel')); });
  $('#requestViewStockHistory')?.addEventListener('click', () => { setInventoryView('history'); revealAndScroll($('#inventoryMovementPanel')); });
  $('#requestViewCurrentBills')?.addEventListener('click', () => {
    state.inventory.historyMode = 'CURRENT'; state.inventory.historyFrom = ''; state.inventory.historyTo = '';
    setInventoryView('history'); revealAndScroll($('#inventoryRecords'));
  });
  $('#requestViewAllBills')?.addEventListener('click', () => {
    state.inventory.historyMode = 'ALL'; state.inventory.historyFrom = ''; state.inventory.historyTo = '';
    setInventoryView('history'); revealAndScroll($('#inventoryRecords'));
  });
  $('#requestViewCustomBills')?.addEventListener('click', () => {
    $('#supplyHistoryCustomPanel')?.classList.remove('hidden');
    $('#supplyHistoryCustomToggle')?.setAttribute('aria-expanded', 'true');
    const today = localDateInputValue();
    if ($('#supplyHistoryFrom') && !$('#supplyHistoryFrom').value) $('#supplyHistoryFrom').value = state.inventory.historyFrom || today;
    if ($('#supplyHistoryTo') && !$('#supplyHistoryTo').value) $('#supplyHistoryTo').value = state.inventory.historyTo || today;
    setInventoryView('history'); revealAndScroll($('#inventoryRecords'));
  });
  $('#inventoryMasterList')?.addEventListener('click', event => { const edit = event.target.closest('[data-inventory-edit-item]'); const remove = event.target.closest('[data-inventory-delete-item]'); const id = edit?.dataset.inventoryEditItem || remove?.dataset.inventoryDeleteItem; const item = id && inventoryItem(id); if (!item) return; if (edit) editInventoryItemPrice(item); if (remove) deleteInventoryItem(item); });
  $('#inventoryStockList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-view-item-history]');
    if (!button) return;
    state.inventory.historyItemId = button.dataset.viewItemHistory;
    setInventoryView('history');
    revealAndScroll($('#inventoryMovementPanel'));
  });
  $('#inventoryMovementClearItem')?.addEventListener('click', () => { state.inventory.historyItemId = null; renderInventory(); });
  $('#inventoryMasterCategory')?.addEventListener('change', renderInventory);
  $('#inventoryMasterSearch')?.addEventListener('input', renderInventory);
  $('#liveStockSearch')?.addEventListener('input', renderInventory);
  $('#liveStockCategory')?.addEventListener('change', renderInventory);
  $('#liveStockStatus')?.addEventListener('change', renderInventory);
  $('#stockCategoryList')?.addEventListener('click', event => { const edit = event.target.closest('[data-edit-stock-category]'); const remove = event.target.closest('[data-delete-stock-category]'); const id = edit?.dataset.editStockCategory || remove?.dataset.deleteStockCategory; const row = id && state.inventory.stockCategories.find(item => item.id === id); if (!row) return; if (edit) editManagedCategory('stock', row); if (remove) deleteManagedCategory('stock', row); });
  $('#expenseCategoryList')?.addEventListener('click', event => { const edit = event.target.closest('[data-edit-expense-category]'); const remove = event.target.closest('[data-delete-expense-category]'); const id = edit?.dataset.editExpenseCategory || remove?.dataset.deleteExpenseCategory; const row = id && state.inventory.expenseCategories.find(item => item.id === id); if (!row) return; if (edit) editManagedCategory('expense', row); if (remove) deleteManagedCategory('expense', row); });
  $('#dailyExpenseList')?.addEventListener('click', event => { const edit = event.target.closest('[data-edit-expense]'); const remove = event.target.closest('[data-delete-expense]'); const id = edit?.dataset.editExpense || remove?.dataset.deleteExpense; const expense = id && state.inventory.expenses.find(row => row.id === id); if (!expense) return; if (edit) editDailyExpense(expense); if (remove) deleteDailyExpense(expense); });
  $('#posSupplyNotice')?.addEventListener('click', event => { const view = event.target.closest('[data-supply-notice-view]'); const dismiss = event.target.closest('[data-supply-notice-dismiss]'); if (view) markSupplyNotification(view.dataset.supplyNoticeView, true); if (dismiss) markSupplyNotification(dismiss.dataset.supplyNoticeDismiss, false); });
  $('#supplyBillLines')?.addEventListener('click', event => { const button = event.target.closest('[data-supply-remove]'); if (!button) return; state.inventory.billLines.splice(Number(button.dataset.supplyRemove), 1); renderSupplyLines(); });
  $('#supplyBillLines')?.addEventListener('change', event => {
    const stockInput = event.target.closest('[data-supply-inventory-quantity]');
    const billingInput = event.target.closest('[data-supply-billing-quantity]');
    const index = Number(stockInput?.dataset.supplyInventoryQuantity ?? billingInput?.dataset.supplyBillingQuantity);
    const line = state.inventory.billLines[index];
    if (!line) return;
    const item = inventoryItem(line.itemId) || {};
    if (stockInput) line.inventoryQuantity = (item.inventory_unit || item.base_unit) === 'EACH' ? Math.max(1, Math.round(Number(stockInput.value))) : Number(stockInput.value);
    if (billingInput) line.billingQuantity = Number(billingInput.value);
    if (!(line.inventoryQuantity > 0) || !(line.billingQuantity > 0)) toast('Both quantities must be greater than zero.', 'bad');
    renderSupplyLines();
  });
  $('#inventoryBillsList')?.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const id = button.dataset.inventoryView || button.dataset.inventoryPrint || button.dataset.inventoryBillCsv || button.dataset.inventoryPay || button.dataset.inventoryReceive;
    const bill = state.inventory.bills.find(row => row.id === id); if (!bill) return;
    if (button.dataset.inventoryView) printSupplyBill(bill, false);
    if (button.dataset.inventoryPrint) printSupplyBill(bill);
    if (button.dataset.inventoryBillCsv) downloadSupplyBillCsv(bill);
    if (button.dataset.inventoryPay) recordInventoryPayment(bill);
    if (button.dataset.inventoryReceive) confirmInventoryReceipt(bill, button);
  });
}


function wireDashboardActions() {
  const sections = $$('.section');
  $('#overviewOperationsCustomToggle')?.addEventListener('click', () => {
    const panel = $('#overviewOperationsCustomPanel');
    const open = panel?.classList.contains('hidden');
    panel?.classList.toggle('hidden', !open);
    $('#overviewOperationsCustomToggle')?.setAttribute('aria-expanded', String(Boolean(open)));
    if (open) {
      const today = localDateInputValue();
      if ($('#overviewOperationsFrom') && !$('#overviewOperationsFrom').value) $('#overviewOperationsFrom').value = today;
      if ($('#overviewOperationsTo') && !$('#overviewOperationsTo').value) $('#overviewOperationsTo').value = today;
    }
  });
  $('#overviewOperationsApply')?.addEventListener('click', () => {
    const from = $('#overviewOperationsFrom')?.value || '';
    const to = $('#overviewOperationsTo')?.value || '';
    try {
      historyBounds(from, to);
      if (!from || !to) throw new Error('Select both From and To dates.');
      state.overviewOperationsMode = 'CUSTOM';
      state.overviewOperationsFrom = from;
      state.overviewOperationsTo = to;
      renderOverviewOperations();
      loadOverviewOperationsData(from, to).catch(error => toast(error.message || 'Unable to refresh session operations.', 'bad'));
    } catch (error) { toast(error.message, 'bad'); }
  });
  $('#overviewOperationsToday')?.addEventListener('click', () => {
    state.overviewOperationsMode = 'SESSION';
    renderOverviewOperations();
    loadOverviewOperationsData().catch(error => console.error('Unable to refresh current session operations:', error));
  });
  $('#overviewOperationsClear')?.addEventListener('click', () => {
    state.overviewOperationsMode = 'SESSION';
    state.overviewOperationsFrom = '';
    state.overviewOperationsTo = '';
    $('#overviewOperationsCustomPanel')?.classList.add('hidden');
    $('#overviewOperationsCustomToggle')?.setAttribute('aria-expanded', 'false');
    renderOverviewOperations();
    loadOverviewOperationsData().catch(error => console.error('Unable to refresh current session operations:', error));
  });
  $('#overviewOperationsDownload')?.addEventListener('click', () => {
    const bounds = overviewOperationsBounds();
    const label = bounds.session ? 'Current open session' : (bounds.from === bounds.to ? bounds.from : `${bounds.from} to ${bounds.to}`);
    downloadOperationsHistory(operationsSnapshot(bounds), label, 'overview-operations');
  });
  $('#spinSettingsOutlet')?.addEventListener('change', fillSpinSettingForm);
  $('#saveSpinSettingsBtn')?.addEventListener('click', saveSpinSettings);
  $('#addCustomerReviewBtn')?.addEventListener('click', addCustomerReview);
  $('#customerReviewList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-review-delete]');
    if (button && !button.disabled) void deleteCustomerReview(button.dataset.reviewDelete, button);
    if (event.target.closest('[data-review-retry]')) void loadCustomerReviews();
  });
  $$('[data-cost-history]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.costHistory;
    $('#costingCustomDates').hidden = mode !== 'CUSTOM';
    $('#costingMode').value = 'order';
    if (mode === 'CUSTOM') { renderCostingScreen(); return; }
    state.costingHistoryMode = mode;
    renderCostingScreen();
  }));
  $('#costingHistoryApply')?.addEventListener('click', () => {
    const from = $('#costingHistoryFrom').value, to = $('#costingHistoryTo').value;
    if (!from || !to || from > to) return toast('Choose both dates, with From on or before To.', 'bad');
    $('#costingMode').value = 'order';
    state.costingHistoryFrom = from; state.costingHistoryTo = to; state.costingHistoryMode = 'CUSTOM';
    renderCostingScreen();
  });
  $('#costingOrderSearch')?.addEventListener('input',renderCostingScreen);
  $('#costingContent')?.addEventListener('click', event => { const button = event.target.closest('[data-cost-order]'); if (button) { state.costingOrderId = button.dataset.costOrder; const scroll = $('#costingOrderList')?.scrollTop || 0; renderCostingScreen(); if ($('#costingOrderList')) $('#costingOrderList').scrollTop = scroll; } });
  $$('[data-cost-view]').forEach(button => button.addEventListener('click', () => { $('#costingMode').value = button.dataset.costView; renderCostingScreen(); }));
  ['#costingOutlet','#costingCategory','#costingMenu','#costingService','#costingMode','#costingOrderStatus'].forEach(id => $(id)?.addEventListener('change',renderCostingScreen));
  $$('.nav-btn[data-section]').forEach(button => button.addEventListener('click', () => {
    let id = button.dataset.section;
    const previousSection = state.selectedSection;
    const role = state.profile?.role || '';
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (!permissions.includes(id)) id = permissions[0] || 'overview';
    sections.forEach(section => section.classList.toggle('active', section.id === id));
    $$('.nav-btn').forEach(navButton => navButton.classList.toggle('active', navButton.dataset.section === id));
    state.selectedSection = id;
    if (!restoringDashboardHistory && previousSection !== id) {
      const url = new URL(window.location.href);
      url.hash = id;
      window.history.pushState({ ohhoDashboardSection: id }, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'settings') renderSettings();
    if (id === 'reports') {
      loadReports().catch(error => {
        console.error('Unable to refresh reports:', error);
        toast(error.message || 'Unable to refresh reports.', 'bad');
      });
    }
    if (id === 'costing') loadReports().then(renderCostingScreen).catch(error => toast(error.message, 'bad'));
    if (id === 'costing' || id === 'inventory' || id === 'daily-expenses' || id === 'reports') loadInventory().catch(error => { console.error('Unable to load stock and expense records:', error); toast(error.message || 'Unable to load records.', 'bad'); });
    if (id === 'overview' && ['ADMIN','OWNER','MANAGER'].includes(state.profile?.role)) {
      loadOverviewOperationsData().catch(error => console.error('Unable to load overview operations:', error));
    }
    if (id === 'pos' && !state.pos.menuLoaded) loadPosMenu().catch(error => toast(error.message || 'Unable to load the POS menu.', 'bad'));
    if (id === 'orders') loadOrders().catch(error => toast(error.message || 'Unable to load orders.', 'bad'));
    if (id === 'menu') loadMenuManagement().catch(error => toast(error.message || 'Unable to load menu management.', 'bad'));
    if (id === 'staff' && state.profile?.role === 'ADMIN') loadStaff().catch(error => toast(error.message || 'Unable to load staff.', 'bad'));
    if (id === 'settings') {
      Promise.allSettled([loadSpinSettings(), loadCustomerReviews()]).then(results => results.forEach(result => {
        if (result.status === 'rejected') console.error('Unable to load settings data:', result.reason);
      }));
    }
  }));

  window.addEventListener('popstate', event => {
    const sectionId = event.state?.ohhoDashboardSection;
    if (!sectionId) return;
    const button = $(`.nav-btn[data-section="${sectionId}"]`);
    if (!button) return;
    restoringDashboardHistory = true;
    button.click();
    restoringDashboardHistory = false;
  });

  $$('#overview [data-section]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.section;
    if (target === 'outlets') return;
    $(`.nav-btn[data-section="${target}"]`)?.click();
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
  $('#reportsRefreshBtn')?.addEventListener('click', loadReports);
  $$('[data-report-range]').forEach(button => {
    button.addEventListener('click', () => activateReportRange(button.dataset.reportRange || 'SESSION'));
  });
  $('#applyCustomDateBtn')?.addEventListener('click', () => {
    const from = $('#reportDateFrom')?.value;
    const to = $('#reportDateTo')?.value;
    if (!from || !to) {
      toast('Select both From and To dates.', 'bad');
      return;
    }
    if (from > to) {
      toast('From date must be before To date.', 'bad');
      return;
    }
    renderReportDashboard();
  });
  $('#sessionHistoryCustomToggle')?.addEventListener('click', () => {
    const panel = $('#sessionHistoryCustomPanel');
    const button = $('#sessionHistoryCustomToggle');
    const willOpen = panel?.classList.contains('hidden');
    panel?.classList.toggle('hidden', !willOpen);
    button?.setAttribute('aria-expanded', String(Boolean(willOpen)));
    if (willOpen) {
      const today = localDateInputValue();
      if ($('#sessionHistoryDateFrom') && !$('#sessionHistoryDateFrom').value) $('#sessionHistoryDateFrom').value = today;
      if ($('#sessionHistoryDateTo') && !$('#sessionHistoryDateTo').value) $('#sessionHistoryDateTo').value = today;
    }
  });
  $('#sessionHistoryApplyBtn')?.addEventListener('click', applySessionHistoryDates);
  $('#sessionHistoryShowAllBtn')?.addEventListener('click', () => {
    activateReportRange('ALL');
    $('#sessionHistoryCustomPanel')?.classList.add('hidden');
    $('#sessionHistoryCustomToggle')?.setAttribute('aria-expanded', 'false');
  });
  $('#sessionHistoryClearBtn')?.addEventListener('click', () => {
    if ($('#sessionHistoryDateFrom')) $('#sessionHistoryDateFrom').value = '';
    if ($('#sessionHistoryDateTo')) $('#sessionHistoryDateTo').value = '';
    $('#sessionHistoryCustomPanel')?.classList.add('hidden');
    $('#sessionHistoryCustomToggle')?.setAttribute('aria-expanded', 'false');
    activateReportRange('SESSION');
  });
  $('#sessionHistoryDownloadBtn')?.addEventListener('click', downloadCombinedSessionHistoryCsv);
  $('#reportsExportBtn')?.addEventListener('click', exportSessionReports);
  $('#reportsOperationsDownload')?.addEventListener('click', () => {
    const { rangeLabel } = reportExportScope();
    downloadOperationsHistory(operationsSnapshot(reportDateBounds()), rangeLabel, 'report-operations');
  });
  $('#reportsClearLogBtn')?.addEventListener('click', clearSelectedReportLogs);

  wirePosActions();
  wireOrdersActions();
  wireMenuManagementActions();
  wireInventoryActions();
}


async function loadOrders({ silent = false } = {}) {
  const board = $('#ordersBoard');
  if (board && !silent) {
    board.innerHTML = '<div class="orders-loading">Loading orders…</div>';
  }

  let query = supabase
    .from('orders')
    .select('id, order_number, token_number, order_type, status, payment_method, payment_status, order_source, table_number, customer_note, subtotal, discount, total, created_at, outlet_id')
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
      .select('id, order_id, menu_item_id, quantity, item_name, unit_price, line_total')
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
    database_order_number: order.order_number,
    order_number: order.token_number || order.order_number,
    ...parsePosCustomer(order.customer_note),
    order_status: order.status,
    total_amount: order.total,
    outlets: outletsById.get(order.outlet_id) || null,
    order_items: itemsByOrder.get(order.id) || []
  }));

  renderOrders();
  renderOverview();
}

async function hydrateOrderHistoryRows(orders) {
  const orderIds = orders.map(order => order.id);
  const items = [];
  for (let index = 0; index < orderIds.length; index += 200) {
    const { data, error } = await supabase
      .from('order_items')
      .select('id, order_id, menu_item_id, quantity, item_name, unit_price, line_total')
      .in('order_id', orderIds.slice(index, index + 200));
    if (error) throw error;
    items.push(...(data || []));
  }

  const itemsByOrder = new Map();
  items.forEach(item => {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  });
  const outletsById = new Map(state.outlets.map(outlet => [outlet.id, outlet]));
  return orders.map(order => ({
    ...order,
    database_order_number: order.order_number,
    order_number: order.token_number || order.order_number,
    ...parsePosCustomer(order.customer_note),
    order_status: order.status,
    total_amount: order.total,
    outlets: outletsById.get(order.outlet_id) || null,
    order_items: itemsByOrder.get(order.id) || []
  }));
}

async function loadCompleteOrderHistory({ custom }) {
  const fromValue = $('#ordersDateFrom')?.value || '';
  const toValue = $('#ordersDateTo')?.value || '';
  if (custom && (!fromValue || !toValue || fromValue > toValue)) {
    toast('Choose a valid From and To date.', 'bad');
    return;
  }

  const buttons = ['#ordersApplyDateBtn', '#ordersShowAllBtn', '#ordersHistoryDownloadBtn']
    .map(selector => $(selector)).filter(Boolean);
  buttons.forEach(button => { button.disabled = true; });
  state.ordersArchiveOpen = true;
  const board = $('#ordersHistoryBoard');
  if (board) board.innerHTML = '<div class="orders-loading">Loading complete order history…</div>';

  try {
    const pageSize = 1000;
    const orders = [];
    const start = custom ? new Date(`${fromValue}T00:00:00`) : null;
    const end = custom ? new Date(`${toValue}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1);

    for (let offset = 0; ; offset += pageSize) {
      let query = supabase
        .from('orders')
        .select('id, order_number, token_number, order_type, status, payment_method, payment_status, order_source, table_number, customer_note, subtotal, discount, total, created_at, outlet_id')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (state.selectedOutlet !== 'ALL') {
        const outlet = state.outlets.find(item => item.slug === state.selectedOutlet);
        if (outlet?.id) query = query.eq('outlet_id', outlet.id);
      }
      if (start) query = query.gte('created_at', start.toISOString());
      if (end) query = query.lt('created_at', end.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      orders.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    state.orderHistoryRecords = await hydrateOrderHistoryRows(orders);
    state.orderHistoryRangeLabel = custom
      ? `${new Date(`${fromValue}T00:00:00`).toLocaleDateString('en-IN')} – ${new Date(`${toValue}T00:00:00`).toLocaleDateString('en-IN')}`
      : 'All records';
    renderOrders();
    toast(`${orders.length} order record${orders.length === 1 ? '' : 's'} loaded.`, 'ok');
  } catch (error) {
    console.error('Unable to load complete order history:', error);
    toast(error.message || 'Unable to load complete order history.', 'bad');
    renderOrders();
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function clearCompleteOrderHistory() {
  state.orderHistoryRecords = null;
  state.orderHistoryRangeLabel = 'Latest order history';
  if ($('#ordersDateFrom')) $('#ordersDateFrom').value = '';
  if ($('#ordersDateTo')) $('#ordersDateTo').value = '';
  $('#ordersCustomDatePanel')?.classList.add('hidden');
  $('#ordersCustomDateToggle')?.setAttribute('aria-expanded', 'false');
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

function parsePosCustomer(value) {
  if (!value) return { customer_name: '', customer_phone: '', spin_reward: null };
  try {
    const customer = JSON.parse(value);
    return {
      customer_name: String(customer?.customerName || '').trim(),
      customer_phone: String(customer?.customerPhone || '').trim(),
      spin_reward: customer?.spinReward && typeof customer.spinReward === 'object'
        ? { code: String(customer.spinReward.code || '').trim(), label: String(customer.spinReward.label || '').trim(), discount: Number(customer.spinReward.discount || 0) }
        : null
    };
  } catch {
    return { customer_name: '', customer_phone: '', spin_reward: null };
  }
}

function orderMatchesSearch(order, search) {
  if (!search) return true;

  const orderNumber = String(order.order_number || '').toLowerCase();
  const outletName = String(order.outlets?.name || '').toLowerCase();
  const source = String(order.order_source || '').toLowerCase();
  const type = String(order.order_type || '').toLowerCase();
  const customerName = String(order.customer_name || '').toLowerCase();
  const customerPhone = String(order.customer_phone || '').toLowerCase();
  const createdAt = new Date(order.created_at);
  const dateAndTime = Number.isNaN(createdAt.getTime())
    ? ''
    : [
        createdAt.toLocaleString(),
        createdAt.toLocaleDateString('en-IN'),
        createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
        createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt.toISOString().slice(0, 10)
      ].join(' ').toLowerCase();
  const itemNames = (order.order_items || [])
    .map(item => String(item.item_name || item.menu_items?.name || '').toLowerCase())
    .join(' ');

  return (
    orderNumber.includes(search) ||
    outletName.includes(search) ||
    source.includes(search) ||
    type.includes(search) ||
    customerName.includes(search) ||
    customerPhone.includes(search) ||
    dateAndTime.includes(search) ||
    itemNames.includes(search)
  );
}

function isCurrentSessionOrder(order) {
  const outlet = order.outlets;
  if (!outlet || outlet.status !== 'ACTIVE') return false;

  const startedAt = outlet.current_session_started_at || outlet.updated_at;
  if (!startedAt) return false;

  return new Date(order.created_at).getTime() >= new Date(startedAt).getTime();
}

function renderOrderCards(orders, { archived = false } = {}) {
  if (!orders.length) {
    return `
      <div class="orders-empty">
        <strong>${archived ? 'No order history yet' : 'No orders in the current session'}</strong>
        <span>${archived ? 'Orders move here when an outlet session closes.' : 'New POS orders will appear here.'}</span>
      </div>
    `;
  }

  return orders.map(order => {
    const items = order.order_items || [];
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const statusClass = String(order.order_status || '').toLowerCase().replaceAll('_', '-');
    const spinDiscount = Math.max(0, Number(order.discount || 0));
    const spinTrace = order.spin_reward || null;

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
          ${order.customer_name ? `<span>${escapeHtml(order.customer_name)}</span>` : ''}
          ${order.customer_phone ? `<span>${escapeHtml(order.customer_phone)}</span>` : ''}
          ${archived ? '<span>HISTORY</span>' : ''}
        </div>

        <div class="order-items">
          ${items.map(item => `
            <div class="order-item-row">
              <span><strong>${escapeHtml(item.quantity)}</strong> × ${escapeHtml(item.item_name || item.menu_items?.name || 'Menu Item')}</span>
              <span>₹${Number(item.line_total || 0).toLocaleString('en-IN')}</span>
            </div>
          `).join('')}
        </div>

        ${spinDiscount > 0 ? `
          <div class="order-spin-discount">
            <div><span>OHHO SPIN &amp; WIN APPLIED</span><small>${escapeHtml(spinTrace?.label || 'Reward discount')}${spinTrace?.code ? ` · ${escapeHtml(spinTrace.code)}` : ''}</small></div>
            <strong>−₹${spinDiscount.toLocaleString('en-IN')}</strong>
          </div>
        ` : ''}

        <div class="order-card-bottom">
          <div>
            <span class="order-time">${formatOrderDate(order.created_at)} · ${formatOrderTime(order.created_at)}</span>
            <span class="order-count">${itemCount} item${itemCount === 1 ? '' : 's'}</span>
          </div>
          <strong class="order-total">₹${Number(order.total_amount || 0).toLocaleString('en-IN')}</strong>
        </div>

        ${!archived && !['COMPLETED', 'CANCELLED'].includes(order.order_status) ? `
          <button type="button" class="order-edit-btn" data-order-edit="${escapeHtml(order.id)}">EDIT ORDER</button>
        ` : ''}
        ${archived ? '' : renderOrderAction(order)}
        ${state.profile?.role === 'ADMIN' ? `
          <button
            type="button"
            class="order-delete-btn"
            data-order-id="${escapeHtml(order.id)}"
            data-order-number="${escapeHtml(order.order_number || '')}"
          >REMOVE ORDER</button>
        ` : ''}
      </article>
    `;
  }).join('');
}

function orderHistoryRows({ filtered = true } = {}) {
  const rows = Array.isArray(state.orderHistoryRecords)
    ? state.orderHistoryRecords
    : (state.orders || []).filter(order => !isCurrentSessionOrder(order));
  if (!filtered) return rows;
  const search = ($('#ordersSearch')?.value || '').trim().toLowerCase();
  const status = $('#ordersStatusFilter')?.value || 'ALL';
  return rows.filter(order =>
    (status === 'ALL' || order.order_status === status) &&
    orderMatchesSearch(order, search)
  );
}

function renderOrders() {
  const board = $('#ordersBoard');
  const historyBoard = $('#ordersHistoryBoard');
  if (!board) return;

  const search = ($('#ordersSearch')?.value || '').trim().toLowerCase();
  const status = $('#ordersStatusFilter')?.value || 'ALL';

  const matchesFilters = order =>
    (status === 'ALL' || order.order_status === status) &&
    orderMatchesSearch(order, search);

  const currentSessionOrders = (state.orders || []).filter(isCurrentSessionOrder);
  const historyOrders = orderHistoryRows({ filtered: false });

  const filteredCurrent = currentSessionOrders.filter(matchesFilters);
  const filteredHistory = orderHistoryRows();

  const liveOrders = currentSessionOrders.filter(order =>
    ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.order_status)
  );

  const sessionSales = currentSessionOrders
    .filter(order =>
      order.payment_status === 'PAID' &&
      order.order_status !== 'CANCELLED' &&
      order.payment_method !== 'COMPLIMENTARY' &&
      order.order_source !== 'FAMILY_FRIENDS'
    )
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const liveCount = $('#ordersLiveCount');
  const sessionCount = $('#ordersTodayCount');
  const sales = $('#ordersTodaySales');

  if (liveCount) liveCount.textContent = String(liveOrders.length);
  if (sessionCount) sessionCount.textContent = String(currentSessionOrders.length);
  if (sales) sales.textContent = `₹${sessionSales.toLocaleString('en-IN')}`;

  board.innerHTML = renderOrderCards(filteredCurrent);
  const archivePanel = $('#ordersArchivePanel');
  const archiveToggle = $('#ordersArchiveToggle');
  const archiveCount = $('#ordersArchiveCount');
  const archiveOpenLabel = $('#ordersArchiveOpenLabel');
  const historyRangeLabel = $('#ordersHistoryRangeLabel');
  archivePanel?.classList.toggle('hidden', !state.ordersArchiveOpen);
  archiveToggle?.setAttribute('aria-expanded', String(state.ordersArchiveOpen));
  if (archiveCount) {
    const count = search || status !== 'ALL' ? filteredHistory.length : historyOrders.length;
    archiveCount.textContent = `${count} ORDER${count === 1 ? '' : 'S'}`;
  }
  if (archiveOpenLabel) archiveOpenLabel.textContent = state.ordersArchiveOpen ? 'CLOSE ↑' : 'OPEN ↓';
  if (historyRangeLabel) historyRangeLabel.textContent = state.orderHistoryRangeLabel;
  if (historyBoard) {
    historyBoard.innerHTML = state.ordersArchiveOpen
      ? renderOrderCards(filteredHistory, { archived: true })
      : '';
  }
}

function downloadOrderHistoryCsv() {
  const orders = orderHistoryRows();
  if (!orders.length) {
    toast('There are no matching order records to download.', 'bad');
    return;
  }

  const outlet = state.selectedOutlet === 'ALL'
    ? null
    : state.outlets.find(item => item.slug === state.selectedOutlet);
  const rows = [
    ['OHHO BURGERS ORDER HISTORY'],
    ['Outlet', outlet?.name || 'All Outlets'],
    ['Range', state.orderHistoryRangeLabel],
    ['Generated At', new Date().toLocaleString('en-IN')],
    [],
    ['Order Number', 'Database Order', 'Date', 'Time', 'Outlet', 'Customer', 'Mobile', 'Order Type', 'Source', 'Status', 'Payment', 'Payment Status', 'Items', 'Subtotal', 'Discount', 'Total'],
    ...orders.map(order => [
      order.order_number || '',
      order.database_order_number || '',
      new Date(order.created_at).toLocaleDateString('en-IN'),
      new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      order.outlets?.name || 'OHHO Outlet',
      order.customer_name || '',
      order.customer_phone || '',
      order.order_type || '',
      order.order_source || '',
      order.order_status || '',
      order.payment_method || '',
      order.payment_status || '',
      (order.order_items || []).map(item => `${Number(item.quantity || 0)} x ${item.item_name || 'Menu Item'}`).join(' | '),
      Number(order.subtotal || 0).toFixed(2),
      Number(order.discount || 0).toFixed(2),
      Number(order.total_amount || 0).toFixed(2)
    ])
  ];
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const rangeSlug = String(state.orderHistoryRangeLabel || 'history')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  link.href = url;
  link.download = `ohho-order-history-${rangeSlug || 'records'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isFamilyFriendsOrder(order) {
  return (
    order.order_source === 'FAMILY_FRIENDS' ||
    order.payment_method === 'COMPLIMENTARY'
  );
}

function isReportableOrder(order) {
  return order.status !== 'CANCELLED' && order.payment_status === 'PAID';
}

function formatReportMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function selectedOperationsOutletId() {
  if (state.selectedOutlet === 'ALL') return '';
  return state.outlets.find(outlet => outlet.slug === state.selectedOutlet)?.id || '';
}

function operationInRange(row, field, bounds) {
  const outletId = selectedOperationsOutletId();
  if (outletId && row.outlet_id !== outletId) return false;
  const timestamp = new Date(row[field]).getTime();
  if (bounds.invalid || Number.isNaN(timestamp)) return false;
  if (bounds.session) {
    const outlet = state.outlets.find(item => item.id === row.outlet_id);
    const openedAt = outlet?.current_session_started_at || outlet?.updated_at;
    return Boolean(outlet?.status === 'ACTIVE' && openedAt && timestamp >= new Date(openedAt).getTime());
  }
  if (bounds.sessions) return recordIsInSessions(row, field, bounds.sessions);
  const start = bounds.start instanceof Date ? bounds.start.getTime() : bounds.start;
  const end = bounds.end instanceof Date ? bounds.end.getTime() : bounds.end;
  return (!start || timestamp >= start) && (!end || timestamp < end);
}

function operationsSnapshot(bounds) {
  const orders = (state.reportOrders || []).filter(order =>
    operationInRange(order, 'created_at', bounds) && isReportableOrder(order) && !isFamilyFriendsOrder(order)
  );
  const bills = (state.inventory.bills || [])
    .filter(row => row.status !== 'VOID' && (row.receipt_status || 'RECEIVED') === 'RECEIVED')
    .map(row => ({ ...row, operation_at: row.received_at || row.supplied_at }))
    .filter(row => operationInRange(row, 'operation_at', bounds));
  const expenses = (state.inventory.expenses || []).filter(row => operationInRange(row, 'occurred_at', bounds));
  const sales = orders.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const stock = bills.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const dailyExpenses = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { orders, bills, expenses, sales, stock, dailyExpenses, net: sales - stock - dailyExpenses };
}

function operationsLedgerRows(snapshot) {
  return [
    ...snapshot.orders.map(row => ({
      type: 'NET SALE', date: row.created_at, outletId: row.outlet_id,
      detail: `Order #${row.order_number || row.id || ''}`, amount: Number(row.total || 0)
    })),
    ...snapshot.bills.map(row => ({
      type: 'STOCK SUPPLY', date: row.operation_at || row.received_at || row.supplied_at, outletId: row.outlet_id,
      detail: row.bill_number || 'Supply bill', amount: Number(row.total_amount || 0), billId: row.id
    })),
    ...snapshot.expenses.map(row => ({
      type: 'DAILY EXPENSE', date: row.occurred_at, outletId: row.outlet_id,
      detail: row.description || row.category_name || row.category || 'Expense', amount: Number(row.amount || 0)
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderCostingScreen() {
  const host = $('#costingContent');
  if (!host) return;
  const inv = state.inventory;
  const pick = (id, rows) => inventorySelectOptions($(id), rows, $(id)?.value);
  pick('#costingOutlet', (inv.outlets || []).map(o=>({value:o.id,label:o.name})));
  pick('#costingCategory', (inv.menuCategories || []).map(c=>({value:c.id,label:c.name})));
  const menus = (inv.menuItems || []).filter(m=>!m.is_archived && m.category_id === $('#costingCategory').value);
  pick('#costingMenu', menus.map(m=>({value:m.id,label:m.name})));
  const outlet = $('#costingOutlet').value;
  const mode = $('#costingMode').value;
  document.querySelectorAll('[data-cost-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.costView === mode)));
  const money = n => n === null ? 'Unavailable' : formatReportMoney(n);
  const table = rows => `<div class="cost-table"><table><thead><tr><th>Ingredient / stock item</th><th>Portion</th><th>Rate / unit</th><th>Cost</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name)}${r.costBasis ? `<small style="display:block;color:#969e8c;font-size:10px;margin-top:3px">${escapeHtml(r.costBasis)}</small>` : ''}</td><td>${inventoryQty(r.quantity)} ${escapeHtml(unitLabel(r.unit))}</td><td>${money(r.cost === null || r.priced === false || !r.quantity ? null : r.cost/r.quantity)}</td><td>${money(r.cost === null || r.priced === false ? null : r.cost)}</td></tr>`).join('')}</tbody></table></div>`;
  const historyMode = state.costingHistoryMode || 'ALL';
  document.querySelectorAll('[data-cost-history]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.costHistory === historyMode)));
  if ($('#costingHistoryLabel')) $('#costingHistoryLabel').textContent = historyMode === 'CUSTOM' ? `Sessions opened ${state.costingHistoryFrom} to ${state.costingHistoryTo}` : historyMode === 'CURRENT' ? 'Current open session' : 'All history';
  const outletOrders = (state.reportOrders || []).filter(o=>o.outlet_id===outlet && isReportableOrder(o));
  const orders = mode === 'order' ? stockHistoryRows(outletOrders, 'created_at', { mode:historyMode, outletId:outlet, sessions:inventoryHistorySessions(), from:state.costingHistoryFrom || '', to:state.costingHistoryTo || '' }) : outletOrders;
  const usage = orderUtilisation(orders,inv.movements||[],inv.items||[],inv.bills||[]);
  $('#costingMenuFilters').hidden = mode !== 'menu';
  $('#costingOrderFilter').hidden = mode !== 'order';
  if (mode === 'menu') {
    const menu = menus.find(m=>m.id===$('#costingMenu').value);
    if (!menu) { host.innerHTML='<p class="cost-empty">No menu items available in this category.</p>'; return; }
    const rows = recipeCostLines(menu.id,inv.recipes||[],inv.items||[],outlet,inv.bills||[],inv.movements||[],$('#costingService').value,'CONFIGURED');
    const complete = rows.length>0 && rows.every(r=>r.cost!==null);
    const total = complete ? rows.reduce((s,r)=>s+r.cost,0) : null;
    const price = Number(menu.price || 0);
    host.innerHTML=`<div class="cost-layout"><div><article class="cost-card cost-product"><div><span class="cost-kicker">Recipe overview</span><h2>${escapeHtml(menu.name)}</h2><p>Selling price <strong>${money(price)}</strong> · ${escapeHtml($('#costingService').selectedOptions[0].textContent)}</p></div><span class="cost-serving">1 serving</span></article><article class="cost-card"><div class="cost-card-head"><h2>Ingredient recipe</h2><span>Configured item prices · converted to stock units</span></div>${rows.length ? table(rows) : '<p>No recipe configured for this item.</p>'}<p class="cost-note">Includes service items saved in this recipe. Separate order-use stock rules are reflected in recorded order usage.</p></article></div><aside class="cost-card cost-summary"><span>PER SERVING</span><h2>Recipe cost</h2><strong class="cost-figure">${money(total)}</strong>${total !== null && price > 0 ? `<meter class="cost-meter" aria-label="Recipe cost as percentage of selling price" min="0" max="100" value="${Math.min(100, Math.max(0, total / price * 100))}"></meter><span class="cost-meter-label">${(total / price * 100).toFixed(1)}% of selling price</span>` : ''}<dl><dt>Selling price</dt><dd>${money(price)}</dd><dt>Recipe cost %</dt><dd>${total!==null&&price>0?(total/price*100).toFixed(1)+'%':'Unavailable'}</dd><dt>Balance after recipe cost</dt><dd>${money(total===null?null:price-total)}</dd></dl><p class="cost-note">Uses current item setup prices and conversions; received purchase averages are used when no configured rate exists. Labour, overhead, discounts and platform fees are excluded. This balance is not net profit.</p></aside></div>`;
  } else if (mode === 'order') {
    const query = ($('#costingOrderSearch')?.value || '').trim().toLowerCase().replace(/^#/, '');
    const status = $('#costingOrderStatus')?.value || 'all';
    const productsFor = id => (state.reportItems || []).filter(line => line.order_id === id);
    const filtered = usage.filter(e => (!query || `${e.order.order_number || e.order.id} ${productsFor(e.order.id).map(l=>l.item_name).join(' ')}`.toLowerCase().includes(query)) && (status === 'all' || (status === 'complete' ? e.complete : !e.complete))).sort((a,b)=>new Date(b.order.created_at)-new Date(a.order.created_at));
    const entry = filtered.find(e=>e.order.id===state.costingOrderId) || filtered[0];
    state.costingOrderId = entry?.order.id || null;
    const list = `<div class="order-picker" id="costingOrderList"><div class="order-count">${filtered.length} orders · available history</div>${filtered.map(e=>`<button type="button" class="order-pick" data-cost-order="${escapeHtml(e.order.id)}" aria-pressed="${e===entry}"><span>${money(Number(e.order.total || 0))}</span><strong>#${escapeHtml(e.order.order_number || e.order.id)}</strong><small>${inventoryDate(e.order.created_at)}</small><small>${escapeHtml(productsFor(e.order.id).map(l=>`${l.item_name} × ${l.quantity}`).join(', ') || 'Item details not recorded')}</small><small>${e.complete ? 'Cost available' : 'Missing usage / rates'}</small></button>`).join('')}</div>`;
    const detail = entry ? `<div><article class="cost-card"><div class="cost-card-head"><h2>Order #${escapeHtml(entry.order.order_number || entry.order.id)}</h2><span>${inventoryDate(entry.order.created_at)}</span></div><div class="order-products">${productsFor(entry.order.id).map(l=>`<span>${escapeHtml(l.item_name)} × ${inventoryQty(l.quantity)}</span>`).join('') || '<p>Menu item details not recorded.</p>'}</div><div class="order-summary-grid"><div><small>Order amount</small><strong>${money(Number(entry.order.total || 0))}</strong></div><div><small>Estimated stock cost</small><strong>${entry.complete ? money(entry.cost) : 'Not available'}</strong></div><div><small>Stock items used</small><strong>${entry.usage.length}</strong></div></div>${!entry.complete ? `<div class="order-status-note">${entry.usage.length ? 'Stock quantities are recorded, but one or more purchase rates are missing. A complete cost cannot be calculated.' : 'This order has no saved inventory deductions. Its ingredient and packaging cost cannot be reconstructed from the current recipe.'}</div>` : ''}</article><article class="cost-card"><h2>Recorded ingredients & packaging</h2>${entry.usage.length ? table(entry.usage) : '<p>No recorded stock usage for this order.</p>'}<p class="cost-note">Quantities are saved order deductions. Costs are estimates from available purchase rates; labour, overhead and platform fees are excluded.</p></article></div>` : '<p class="cost-empty">No matching orders. Try another order number, item or cost filter.</p>';
    host.innerHTML = `<div class="order-workspace">${list}${detail}</div>`;
  } else {
    const grouped=new Map();
    for(const e of usage) for(const r of e.usage){const key=r.itemId+':'+r.unit;const g=grouped.get(key)||{...r,quantity:0,cost:0,priced:true};g.quantity+=r.quantity;g.cost+=r.cost||0;g.priced=g.priced&&r.priced;grouped.set(key,g);}
    host.innerHTML=(inv.stockCategories||[]).concat([{id:null,name:'Uncategorized'}]).map(c=>{const rows=[...grouped.values()].filter(r=>c.id?r.categoryId===c.id:!(inv.stockCategories||[]).some(x=>x.id===r.categoryId));return rows.length?`<article class="cost-card"><h2>${escapeHtml(c.name)}</h2>${table(rows)}</article>`:'';}).join('')||'<p class="cost-empty">No recorded stock usage for this outlet.</p>';
  }
}

function renderUtilisation(target, bounds) {
  const node = $(target);
  if (!node) return;
  const scopeOutletId = target === '#inventoryUtilisation' ? inventorySelectedOutletId() : selectedOperationsOutletId();
  const orderRows = (state.reportOrders || []).filter(order => (!scopeOutletId || order.outlet_id === scopeOutletId) && (target === '#inventoryUtilisation' ? recordIsInOpenSessions(order, 'created_at', state.inventory.outlets) : operationInRange(order, 'created_at', bounds)) && isReportableOrder(order));
  const usage = orderUtilisation(orderRows, state.inventory.movements || [], state.inventory.items || [], state.inventory.bills || []);
  const costText = row => row.priced === false || row.cost === null ? 'Cost unavailable' : formatReportMoney(row.cost);
  const usageTable = rows => `<div class="table-scroll"><table><thead><tr><th>Stock item</th><th>Used quantity</th><th>Estimated cost</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${inventoryQty(row.quantity)} ${escapeHtml(unitLabel(row.unit,row.quantity))}</td><td>${costText(row)}</td></tr>`).join('')}</tbody></table></div>`;
  const grouped = new Map();
  for (const entry of usage) for (const row of entry.usage) {
    const key = `${entry.order.outlet_id}:${row.itemId}:${row.unit}`;
    const existing = grouped.get(key) || { ...row, outletId:entry.order.outlet_id, quantity:0, cost:0, priced:true, orders:0 };
    existing.quantity += row.quantity; existing.cost += row.cost; existing.priced &&= row.priced; existing.orders++;
    grouped.set(key,existing);
  }
  const categories = [...new Set([...grouped.values()].map(row => state.inventory.stockCategories.find(c => c.id === row.categoryId)?.name || 'Other'))];
  const stockTables = categories.map(category => {
    const rows = [...grouped.values()].filter(row => (state.inventory.stockCategories.find(c=>c.id===row.categoryId)?.name || 'Other') === category);
    return `<details><summary>${escapeHtml(category)} · ${rows.length} stock items</summary><div class="table-scroll"><table><thead><tr><th>Item</th><th>Outlet</th><th>Total used</th><th>Orders</th><th>Estimated cost</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(inventoryOutlet(row.outletId)?.name || 'Outlet')}</td><td>${inventoryQty(row.quantity)} ${escapeHtml(unitLabel(row.unit,row.quantity))}</td><td>${row.orders}</td><td>${costText(row)}</td></tr>`).join('')}</tbody></table></div></details>`;
  }).join('');
  const activeOutlets = (state.inventory.outlets || []).filter(o => !scopeOutletId || o.id === scopeOutletId);
  const productGroups = activeOutlets.map(outlet => {
    const menus = (state.inventory.menuItems || []).filter(m => !m.is_archived);
    return `<details><summary>${escapeHtml(outlet.name)} · current recipe costs</summary>${(state.inventory.menuCategories || []).map(category => {
      const categoryMenus = menus.filter(m=>m.category_id===category.id);
      if (!categoryMenus.length) return '';
      return `<details><summary>${escapeHtml(category.name)}</summary>${categoryMenus.map(menu => {
        const sold = (state.reportItems || []).filter(line => line.menu_item_id === menu.id && orderRows.some(order => order.id === line.order_id && order.outlet_id === outlet.id)).reduce((sum,line)=>sum+Number(line.quantity || 0),0);
        return `<details><summary>${escapeHtml(menu.name)} · ${sold} sold in selected sessions</summary>${['DINE_IN','TAKEAWAY'].map(type => {
          const lines = recipeCostLines(menu.id,state.inventory.recipes,state.inventory.items,outlet.id,state.inventory.bills,state.inventory.movements,type);
          const known = lines.length && lines.every(l=>l.cost !== null);
          const total = lines.reduce((sum,l)=>sum+(l.cost || 0),0);
          const percent = Number(menu.price)>0 ? total / Number(menu.price)*100 : null;
          return `<h4>${type === 'DINE_IN' ? 'Dine-in' : 'Takeaway / delivery'} · ${known ? formatReportMoney(total) : 'Recipe / cost incomplete'}</h4>${known && percent !== null ? `<p><meter min="0" max="100" value="${Math.min(100,Math.max(0,percent))}"></meter> ${percent.toFixed(1)}% of menu price (${formatReportMoney(menu.price)})</p>` : ''}${lines.length ? usageTable(lines) : '<p>No recipe configured.</p>'}`;
        }).join('')}<p>Per serving at current recipe and rates. Separate order-use stock rules, labour and overhead are excluded here; recorded order usage includes deducted service items.</p></details>`;
      }).join('')}</details>`;
    }).join('')}</details>`;
  }).join('');
  const covered = usage.filter(row=>row.usage.length).length;
  const priced = usage.filter(row=>row.complete);
  const estimate = priced.reduce((sum,row)=>sum+row.cost,0);
  const body = `<summary>Item cost &amp; utilisation</summary><div class="utilisation-metrics"><div><small>Orders with usage</small><strong>${covered} / ${usage.length}</strong></div><div><small>Fully priced orders</small><strong>${priced.length}</strong></div><div><small>Estimated ingredient cost</small><strong>${formatReportMoney(estimate)}</strong></div></div><p>Usage comes from saved order deductions. Costs are estimates from received rates available at deduction time, falling back to current configured rates. Missing records are shown, never assumed to be zero.</p><details><summary>Stock usage by category</summary>${stockTables || '<p>No recorded deductions in these sessions.</p>'}</details><details><summary>Order ingredient breakdown</summary>${usage.map(entry => {
    const products = (state.reportItems || []).filter(line=>line.order_id===entry.order.id).map(line=>`${line.item_name} × ${line.quantity}`).join(', ');
    return `<details><summary>Order #${escapeHtml(entry.order.order_number || entry.order.id)} · ${escapeHtml(inventoryOutlet(entry.order.outlet_id)?.name || 'Outlet')} · ${entry.complete ? formatReportMoney(entry.cost) + ' estimated cost' : 'Usage / cost incomplete'}</summary><p>${inventoryDate(entry.order.created_at)} · ${escapeHtml(products)}</p>${entry.usage.length ? usageTable(entry.usage) : '<p>No saved inventory deductions for this order.</p>'}</details>`;
  }).join('') || '<p>No orders in these sessions.</p>'}</details><details><summary>Menu recipe cost meters</summary>${productGroups}</details>`;
  // Preserve disclosure state across live refreshes.
  const previous = new Set([...node.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent));
  node.innerHTML = `<details class="utilisation-panel">${body}</details>`;
  node.querySelectorAll('details').forEach(d=>{d.open=previous.has(d.querySelector('summary')?.textContent);});
}

function completedSessionsForRange(range, from = '', to = '') {
  const outletId = selectedOperationsOutletId();
  const reports = outletId ? (state.salesReports || []).filter(report => report.outlet_id === outletId) : (state.salesReports || []);
  return selectCompletedSessions(reports, { range, from, to });
}

function overviewOperationsBounds() {
  if (state.overviewOperationsMode === 'SESSION') return { session: true, from: '', to: '' };
  const today = localDateInputValue();
  const from = state.overviewOperationsFrom || today;
  const to = state.overviewOperationsTo || today;
  try {
    historyBounds(from, to);
    return { ...completedSessionsForRange('CUSTOM', from, to), from, to };
  } catch {
    return { invalid: true, from, to };
  }
}

function renderOverviewOperations() {
  if (!$('#overviewOperationsSales')) return;
  const bounds = overviewOperationsBounds();
  const snapshot = operationsSnapshot(bounds);
  if ($('#overviewOperationsSales')) $('#overviewOperationsSales').textContent = formatReportMoney(snapshot.sales);
  if ($('#overviewOperationsStock')) $('#overviewOperationsStock').textContent = formatReportMoney(snapshot.stock);
  if ($('#overviewOperationsExpenses')) $('#overviewOperationsExpenses').textContent = formatReportMoney(snapshot.dailyExpenses);
  if ($('#overviewOperationsNet')) $('#overviewOperationsNet').textContent = formatReportMoney(snapshot.net);
  if ($('#overviewOperationsTitle')) $('#overviewOperationsTitle').textContent = bounds.session ? 'Current session operations' : 'Completed session operations';
  if ($('#overviewOperationsRangeLabel')) $('#overviewOperationsRangeLabel').textContent = bounds.session ? 'Current open session' : `${bounds.sessions?.length || 0} complete session${bounds.sessions?.length === 1 ? '' : 's'} · closed ${bounds.from === bounds.to ? bounds.from : `${bounds.from} to ${bounds.to}`}`;
  if ($('#overviewOperationsFrom') && bounds.from) $('#overviewOperationsFrom').value = bounds.from;
  if ($('#overviewOperationsTo') && bounds.to) $('#overviewOperationsTo').value = bounds.to;

}

function downloadOperationsHistory(snapshot, rangeLabel, filePrefix = 'operations') {
  const outletLabel = selectedOperationsOutletId()
    ? state.outlets.find(outlet => outlet.id === selectedOperationsOutletId())?.name || 'Outlet'
    : 'All Outlets';
  const rows = [
    ['OHHO BURGERS OPERATIONS HISTORY'], ['Outlet', outletLabel], ['Range', rangeLabel], ['Generated At', new Date().toLocaleString('en-IN')], [],
    ['SUMMARY'], ['Net Sales', snapshot.sales.toFixed(2)], ['Stock Supply Cost', snapshot.stock.toFixed(2)], ['Daily Expenses', snapshot.dailyExpenses.toFixed(2)], ['Operational Amount', snapshot.net.toFixed(2)], [],
    ['PAID SALES'], ['Date', 'Outlet', 'Order Number', 'Payment', 'Amount'],
    ...snapshot.orders.map(row => [inventoryDate(row.created_at), inventoryOutlet(row.outlet_id)?.name || '', row.order_number || '', row.payment_method || '', Number(row.total || 0).toFixed(2)]), [],
    ['STOCK SUPPLY BILLS'], ['Date', 'Outlet', 'Bill Number', 'Receipt Status', 'Payment Status', 'Amount'],
    ...snapshot.bills.map(row => [inventoryDate(row.supplied_at), inventoryOutlet(row.outlet_id)?.name || '', row.bill_number || '', row.receipt_status || 'RECEIVED', row.payment_status || '', Number(row.total_amount || 0).toFixed(2)]), [],
    ['DAILY EXPENSES'], ['Date', 'Outlet', 'Category', 'Description', 'Amount'],
    ...snapshot.expenses.map(row => [inventoryDate(row.occurred_at), inventoryOutlet(row.outlet_id)?.name || '', row.category_name || row.category || '', row.description || '', Number(row.amount || 0).toFixed(2)])
  ];
  downloadCsv(`ohho-${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function setDefaultCustomReportDates() {
  const from = $('#reportDateFrom');
  const to = $('#reportDateTo');
  const today = localDateInputValue();
  if (from && !from.value) from.value = today;
  if (to && !to.value) to.value = today;
}

function activateReportRange(range) {
  state.reportRange = range;
  $$('[data-report-range]').forEach(button => {
    const active = button.dataset.reportRange === range;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#customDatePanel')?.classList.toggle('hidden', range !== 'CUSTOM');
  if (range === 'CUSTOM') setDefaultCustomReportDates();
  renderReportDashboard();
}

function applySessionHistoryDates() {
  const from = $('#sessionHistoryDateFrom')?.value;
  const to = $('#sessionHistoryDateTo')?.value;
  if (!from || !to) {
    toast('Select both From and To dates.', 'bad');
    return;
  }
  if (from > to) {
    toast('From date must be before To date.', 'bad');
    return;
  }
  if ($('#reportDateFrom')) $('#reportDateFrom').value = from;
  if ($('#reportDateTo')) $('#reportDateTo').value = to;
  activateReportRange('CUSTOM');
}

function reportDateBounds() {
  const range = state.reportRange || 'SESSION';
  if (range === 'SESSION') return { start: null, end: null, session: true };
  const from = range === 'CUSTOM' ? $('#reportDateFrom')?.value || '' : '';
  const to = range === 'CUSTOM' ? $('#reportDateTo')?.value || '' : '';
  return { ...completedSessionsForRange(range, from, to), from, to };
}

function filteredSessionReports() {
  const { invalid, session, sessions } = reportDateBounds();
  if (invalid) return [];
  if (session) return [];
  return sessions || [];
}

function filteredReportOrders() {
  const { invalid, session, sessions } = reportDateBounds();
  if (invalid) return [];
  return (state.reportOrders || []).filter(order => {
    const createdAt = new Date(order.created_at).getTime();
    if (session) {
      const outlet = state.outlets.find(item => item.id === order.outlet_id);
      const startedAt = outlet?.current_session_started_at || outlet?.updated_at;
      return Boolean(
        isReportableOrder(order) &&
        outlet?.status === 'ACTIVE' &&
        startedAt &&
        createdAt >= new Date(startedAt).getTime()
      );
    }
    return isReportableOrder(order) && recordIsInSessions(order, 'created_at', sessions);
  });
}

function itemSalesTotals(orders) {
  const ordersById = new Map(orders.map(order => [order.id, order]));
  const totalsByItem = new Map();

  (state.reportItems || []).forEach(item => {
    const order = ordersById.get(item.order_id);
    if (!order) return;

    const name = String(item.item_name || 'Menu Item').trim() || 'Menu Item';
    const key = name.toLowerCase();
    const current = totalsByItem.get(key) || {
      name,
      paidQuantity: 0,
      freeQuantity: 0,
      paidSales: 0,
      freeValue: 0
    };
    const quantity = Number(item.quantity || 0);
    const value = Number(item.line_total || 0);

    if (isFamilyFriendsOrder(order)) {
      current.freeQuantity += quantity;
      current.freeValue += value;
    } else {
      current.paidQuantity += quantity;
      current.paidSales += value;
    }
    totalsByItem.set(key, current);
  });

  return [...totalsByItem.values()].sort(
    (a, b) => (b.paidQuantity + b.freeQuantity) - (a.paidQuantity + a.freeQuantity)
  );
}

function renderItemWiseSales(orders) {
  const list = $('#itemSalesList');
  if (!list) return;
  const items = itemSalesTotals(orders);
  if (!items.length) {
    list.innerHTML = '<div class="report-empty"><div><strong>No items in this range</strong><span>Paid and Family &amp; Friends items will appear here.</span></div></div>';
    return;
  }
  list.innerHTML = `
    <div class="item-sales-table">
      <div class="item-sales-head"><span>ITEM</span><span>PAID QTY</span><span>FREE QTY</span><span>TOTAL QTY</span><span>PAID SALES</span><span>FREE VALUE</span></div>
      ${items.map(item => `
        <div class="item-sales-row">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="qty">${item.paidQuantity}</span>
          <span class="qty free-qty">${item.freeQuantity}</span>
          <span class="qty">${item.paidQuantity + item.freeQuantity}</span>
          <span class="money">${formatReportMoney(item.paidSales)}</span>
          <span class="free-value">${formatReportMoney(item.freeValue)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderReportDashboard() {
  const reports = filteredSessionReports();
  const orders = filteredReportOrders();
  const paidOrders = orders.filter(order => !isFamilyFriendsOrder(order));
  const freeOrders = orders.filter(isFamilyFriendsOrder);
  const sumOrders = rows => rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const sumItems = rows => rows.reduce((sum, order) => sum + Number(order.item_count || 0), 0);
  const paymentTotal = method => sumOrders(paidOrders.filter(order => order.payment_method === method));
  const cash = paymentTotal('CASH');
  const upi = paymentTotal('UPI');
  const card = paymentTotal('CARD');
  const freeValue = sumOrders(freeOrders);
  const freeItemTotals = itemSalesTotals(freeOrders).filter(item => item.freeQuantity > 0);
  const mostGifted = freeItemTotals[0];
  const paidSales = sumOrders(paidOrders);
  const averageOrder = paidOrders.length ? paidSales / paidOrders.length : 0;
  const historyRangeLabel = $('#sessionHistoryRangeLabel');
  if (historyRangeLabel) historyRangeLabel.textContent = reportExportScope().rangeLabel;

  if ($('#reportsSessionCount')) $('#reportsSessionCount').textContent = String(reports.length);
  if ($('#reportsTotalSales')) $('#reportsTotalSales').textContent = formatReportMoney(paidSales);
  if ($('#reportsTotalOrders')) $('#reportsTotalOrders').textContent = String(paidOrders.length);
  if ($('#reportsAverageOrder')) $('#reportsAverageOrder').textContent = formatReportMoney(averageOrder);
  if ($('#reportsTotalItems')) $('#reportsTotalItems').textContent = String(sumItems(paidOrders));
  if ($('#reportsFreeItems')) $('#reportsFreeItems').textContent = String(sumItems(freeOrders));
  if ($('#legacyCashSales')) $('#legacyCashSales').textContent = formatReportMoney(cash);
  if ($('#legacyUpiSales')) $('#legacyUpiSales').textContent = formatReportMoney(upi);
  if ($('#legacyCardSales')) $('#legacyCardSales').textContent = formatReportMoney(card);
  if ($('#reportsPaymentTotal')) $('#reportsPaymentTotal').textContent = formatReportMoney(cash + upi + card);
  if ($('#reportsFreeOrders')) $('#reportsFreeOrders').textContent = String(freeOrders.length);
  if ($('#reportsFamilyItems')) $('#reportsFamilyItems').textContent = String(sumItems(freeOrders));
  if ($('#reportsFreeValue')) $('#reportsFreeValue').textContent = formatReportMoney(freeValue);
  if ($('#reportsMostGifted')) {
    $('#reportsMostGifted').textContent = mostGifted
      ? `${mostGifted.name} · ${mostGifted.freeQuantity}`
      : '—';
  }
  const operations = operationsSnapshot(reportDateBounds());
  const totalExpenses = operations.stock + operations.dailyExpenses;
  if ($('#financialSales')) $('#financialSales').textContent = formatReportMoney(paidSales);
  if ($('#financialSupply')) $('#financialSupply').textContent = formatReportMoney(operations.stock);
  if ($('#financialDailyExpenses')) $('#financialDailyExpenses').textContent = formatReportMoney(operations.dailyExpenses);
  if ($('#financialTotalExpenses')) $('#financialTotalExpenses').textContent = formatReportMoney(totalExpenses);
  if ($('#financialNet')) $('#financialNet').textContent = formatReportMoney(operations.net);
  renderCostingScreen();
  renderItemWiseSales(orders);
  renderSalesReports(reports);
}

async function loadLegacyReports() {
  const orders = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('orders')
      .select('id,order_number,outlet_id,status,payment_method,payment_status,order_source,total,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (state.selectedOutlet !== 'ALL') {
      const outlet = state.outlets.find(item => item.slug === state.selectedOutlet);
      if (outlet?.id) query = query.eq('outlet_id', outlet.id);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Unable to load session order details:', error);
      state.reportOrders = [];
      state.reportItems = [];
      return;
    }
    orders.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const itemCounts = new Map();
  state.reportItems = [];
  const orderIds = orders.map(order => order.id);

  for (let index = 0; index < orderIds.length; index += 200) {
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id,menu_item_id,quantity,item_name,line_total')
      .in('order_id', orderIds.slice(index, index + 200));

    if (itemsError) {
      console.error('Unable to load report item totals:', itemsError);
      continue;
    }

    (items || []).forEach(item => {
      state.reportItems.push(item);
      itemCounts.set(
        item.order_id,
        Number(itemCounts.get(item.order_id) || 0) + Number(item.quantity || 0)
      );
    });
  }

  state.reportOrders = orders.map(order => ({
    ...order,
    item_count: itemCounts.get(order.id) || 0
  }));
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function reportExportScope() {
  const rangeLabels = {
    SESSION: 'Current Session',
    TODAY: 'Sessions Closed Today',
    '7_DAYS': 'Sessions Closed in Last 7 Days',
    '30_DAYS': 'Sessions Closed in Last 30 Days',
    ALL: 'All Completed Sessions'
  };
  let rangeLabel = rangeLabels[state.reportRange] || 'Selected Range';

  if (state.reportRange === 'CUSTOM') {
    const from = $('#reportDateFrom')?.value || '—';
    const to = $('#reportDateTo')?.value || '—';
    rangeLabel = `Sessions Closed ${from} to ${to}`;
  }

  const outlet = state.selectedOutlet === 'ALL'
    ? null
    : state.outlets.find(item => item.slug === state.selectedOutlet);

  return {
    rangeLabel,
    outletLabel: outlet?.name || 'All Outlets',
    fileScope: String(outlet?.slug || outlet?.name || 'all-outlets')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'all-outlets'
  };
}

function exportSessionReports() {
  const orders = filteredReportOrders();
  const reports = filteredSessionReports();
  const items = itemSalesTotals(orders);

  if (!orders.length && !reports.length) {
    toast('There is no sales data to export for this range.', 'bad');
    return;
  }

  const paidOrders = orders.filter(order => !isFamilyFriendsOrder(order));
  const freeOrders = orders.filter(isFamilyFriendsOrder);
  const sumOrders = rows => rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const sumItems = rows => rows.reduce((sum, order) => sum + Number(order.item_count || 0), 0);
  const paymentTotal = method => sumOrders(
    paidOrders.filter(order => String(order.payment_method || '').toUpperCase() === method)
  );
  const paidSales = sumOrders(paidOrders);
  const paidItems = sumItems(paidOrders);
  const freeValue = sumOrders(freeOrders);
  const freeItems = sumItems(freeOrders);
  const averageOrder = paidOrders.length ? paidSales / paidOrders.length : 0;
  const cash = paymentTotal('CASH');
  const upi = paymentTotal('UPI');
  const card = paymentTotal('CARD');
  const freeItemTotals = itemSalesTotals(freeOrders).filter(item => item.freeQuantity > 0);
  const mostGifted = freeItemTotals[0];
  const { rangeLabel, outletLabel, fileScope } = reportExportScope();
  const operations = operationsSnapshot(reportDateBounds());

  const rows = [
    ['OHHO BURGERS OVERALL SALES REPORT'],
    ['Outlet', outletLabel],
    ['Report Range', rangeLabel],
    ['Generated At', new Date().toLocaleString()],
    [],
    ['SALES SUMMARY'],
    ['Metric', 'Value'],
    ['Total Paid Sales', paidSales.toFixed(2)],
    ['Paid Orders', paidOrders.length],
    ['Average Order Value', averageOrder.toFixed(2)],
    ['Paid Items', paidItems],
    ['Closed Sessions', reports.length],
    [],
    ['OPERATIONS SUMMARY'],
    ['Metric', 'Value'],
    ['Net Sales', operations.sales.toFixed(2)],
    ['Stock Supply Cost', operations.stock.toFixed(2)],
    ['Daily Expenses', operations.dailyExpenses.toFixed(2)],
    ['Operational Amount', operations.net.toFixed(2)],
    [],
    ['STOCK SUPPLY BILLS'],
    ['Date', 'Outlet', 'Bill Number', 'Receipt Status', 'Payment Status', 'Amount'],
    ...operations.bills.map(row => [inventoryDate(row.supplied_at), inventoryOutlet(row.outlet_id)?.name || '', row.bill_number || '', row.receipt_status || 'RECEIVED', row.payment_status || '', Number(row.total_amount || 0).toFixed(2)]),
    [],
    ['DAILY EXPENSES'],
    ['Date', 'Outlet', 'Category', 'Description', 'Amount'],
    ...operations.expenses.map(row => [inventoryDate(row.occurred_at), inventoryOutlet(row.outlet_id)?.name || '', row.category_name || row.category || '', row.description || '', Number(row.amount || 0).toFixed(2)]),
    [],
    ['PAYMENT COLLECTION'],
    ['Payment Mode', 'Amount'],
    ['Cash', cash.toFixed(2)],
    ['UPI', upi.toFixed(2)],
    ['Card', card.toFixed(2)],
    ['Total Paid', (cash + upi + card).toFixed(2)],
    [],
    ['FAMILY & FRIENDS / FREE FOOD'],
    ['Metric', 'Value'],
    ['Free Orders', freeOrders.length],
    ['Free Items', freeItems],
    ['Free Food Menu Value', freeValue.toFixed(2)],
    ['Most Gifted Item', mostGifted ? `${mostGifted.name} (${mostGifted.freeQuantity})` : '—'],
    [],
    ['ITEM-WISE SALES'],
    ['Item', 'Paid Quantity', 'Free Quantity', 'Total Quantity', 'Paid Sales', 'Free Food Value'],
    ...(items.length
      ? items.map(item => [
        item.name,
        item.paidQuantity,
        item.freeQuantity,
        item.paidQuantity + item.freeQuantity,
        item.paidSales.toFixed(2),
        item.freeValue.toFixed(2)
      ])
      : [['No item sales in this range']]),
    [],
    ['SESSION HISTORY'],
    ['Outlet', 'Opened', 'Closed', 'Paid Orders', 'Items Sold', 'Average Order Value', 'Cash', 'UPI', 'Card', 'Total Sales'],
    ...(reports.length
      ? reports.map(report => {
        const outlet = state.outlets.find(item => item.id === report.outlet_id);
        const orderCount = Number(report.order_count || 0);
        const grossSales = Number(report.gross_sales || 0);
        return [
          outlet?.name || 'OHHO Outlet',
          new Date(report.opened_at).toLocaleString(),
          new Date(report.closed_at).toLocaleString(),
          orderCount,
          Number(report.item_count || 0),
          (orderCount ? grossSales / orderCount : 0).toFixed(2),
          Number(report.cash_sales || 0).toFixed(2),
          Number(report.upi_sales || 0).toFixed(2),
          Number(report.card_sales || 0).toFixed(2),
          grossSales.toFixed(2)
        ];
      })
      : [['No completed sessions in this range']])
  ];

  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ohho-${fileScope}-overall-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCombinedSessionHistoryCsv() {
  const reports = filteredSessionReports();
  if (!reports.length) {
    toast('There are no session records to download for this range.', 'bad');
    return;
  }
  const { rangeLabel, outletLabel, fileScope } = reportExportScope();
  const total = reports.reduce((sum, report) => sum + Number(report.gross_sales || 0), 0);
  const rows = [
    ['OHHO BURGERS SESSION HISTORY'],
    ['Outlet', outletLabel],
    ['Range', rangeLabel],
    ['Generated At', new Date().toLocaleString('en-IN')],
    ['Sessions', reports.length],
    ['Combined Sales', total.toFixed(2)],
    [],
    ['Outlet', 'Opened', 'Closed', 'Orders', 'Items', 'Average Order', 'Cash', 'UPI', 'Card', 'Total Sales'],
    ...reports.map(report => {
      const outlet = state.outlets.find(item => item.id === report.outlet_id);
      const orderCount = Number(report.order_count || 0);
      const grossSales = Number(report.gross_sales || 0);
      return [
        outlet?.name || 'OHHO Outlet',
        new Date(report.opened_at).toLocaleString('en-IN'),
        new Date(report.closed_at).toLocaleString('en-IN'),
        orderCount,
        Number(report.item_count || 0),
        (orderCount ? grossSales / orderCount : 0).toFixed(2),
        Number(report.cash_sales || 0).toFixed(2),
        Number(report.upi_sales || 0).toFixed(2),
        Number(report.card_sales || 0).toFixed(2),
        grossSales.toFixed(2)
      ];
    })
  ];
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const rangeSlug = String(rangeLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  link.href = url;
  link.download = `ohho-${fileScope}-session-history-${rangeSlug || 'records'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function clearSelectedReportLogs() {
  if (state.profile?.role !== 'ADMIN') {
    toast('Admin access required.', 'bad');
    return;
  }

  if (state.reportRange === 'SESSION') {
    toast('Choose Today’s Sessions, Last 7 Days, Last 30 Days, Custom Sessions or All Sessions to clear completed session logs.', 'bad');
    return;
  }

  const reports = filteredSessionReports();
  if (!reports.length) {
    toast('There are no report logs in the selected range.', 'bad');
    return;
  }

  const labels = {
    TODAY: 'sessions closed today',
    '7_DAYS': 'sessions closed in the last 7 days',
    '30_DAYS': 'sessions closed in the last 30 days',
    CUSTOM: 'the selected completed sessions',
    ALL: 'all completed sessions'
  };
  const scope = state.selectedOutlet === 'ALL'
    ? 'all outlets'
    : (state.outlets.find(outlet => outlet.slug === state.selectedOutlet)?.name || 'this outlet');
  const confirmed = window.confirm(
    `Clear ${labels[state.reportRange] || 'the selected'} report logs for ${scope}?\n\nOrders, items, payments and order history will be kept.`
  );
  if (!confirmed) return;

  const button = $('#reportsClearLogBtn');
  if (!button) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'CLEARING…';

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Your session has expired. Please log in again.');
    }

    const { start, end } = reportDateBounds();
    const outlet = state.selectedOutlet === 'ALL'
      ? null
      : state.outlets.find(item => item.slug === state.selectedOutlet);
    const response = await fetch('/api/reports', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      body: JSON.stringify({
        start: start?.toISOString() || null,
        end: end?.toISOString() || null,
        outletId: outlet?.id || null,
        preserveSalesData: true
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to clear report logs.');

    await loadReports();
    toast(
      `${Number(result.deletedReportCount || 0)} report log${Number(result.deletedReportCount || 0) === 1 ? '' : 's'} cleared. Sales data was kept.`,
      'ok'
    );
  } catch (error) {
    console.error('Unable to clear report logs:', error);
    toast(error.message || 'Unable to clear report logs.', 'bad');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function loadReports() {
  await Promise.all([loadLegacyReports(), loadSalesReports()]);
  renderReportDashboard();
  renderOverviewOperations();
}

async function loadSalesReports() {
  const list = $('#salesReportsList');
  if (!list) return;

  list.innerHTML = '<div class="orders-loading">Loading sales reports…</div>';

  try {
    const pageSize = 1000;
    const reports = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = supabase
        .from('outlet_sales_reports')
        .select('id,outlet_id,opened_at,closed_at,order_count,item_count,gross_sales,cash_sales,upi_sales,card_sales,stock_received_amount,other_expense_amount,total_expense_amount,net_after_expenses,created_at')
        .order('closed_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (state.selectedOutlet !== 'ALL') {
        const outlet = state.outlets.find(o => o.slug === state.selectedOutlet);
        if (outlet?.id) query = query.eq('outlet_id', outlet.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      reports.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    state.salesReports = reports;
  } catch (error) {
    console.error('Unable to load sales reports:', error);
    state.salesReports = [];
    list.innerHTML = '<div class="orders-empty"><strong>Sales reports are not ready yet</strong><span>Apply the outlet session database migration, then close an outlet session to generate the first report.</span></div>';
  }
}

function renderSalesReports(reports = filteredSessionReports()) {
  const list = $('#salesReportsList');
  if (!list) return;

  const outletsById = new Map(state.outlets.map(outlet => [outlet.id, outlet]));
  if (!reports.length) {
    list.innerHTML = '<div class="report-empty"><div><strong>No closed sessions in this range</strong><span>A session appears here when an outlet is turned OFF.</span></div></div>';
    return;
  }

  list.innerHTML = reports.map(report => {
    const outlet = outletsById.get(report.outlet_id);
    const orderCount = Number(report.order_count || 0);
    const averageOrder = orderCount ? Number(report.gross_sales || 0) / orderCount : 0;

    return `
      <article class="session-report-card">
        <div class="session-report-main">
          <div>
            <h3>${escapeHtml(outlet?.name || 'OHHO Outlet')}</h3>
            <div class="session-report-time">
              ${formatOrderDate(report.opened_at)} · ${formatOrderTime(report.opened_at)}
              → ${formatOrderDate(report.closed_at)} · ${formatOrderTime(report.closed_at)}
            </div>
          </div>
          <div class="session-report-actions">
            <div class="session-report-total">${formatReportMoney(report.gross_sales)}</div>
            <button class="secondary session-report-download" type="button" data-download-session="${escapeHtml(report.id)}">DOWNLOAD CSV</button>
          </div>
        </div>
        <div class="session-report-metrics">
          <div><span>ORDERS</span><strong>${orderCount}</strong></div>
          <div><span>ITEMS</span><strong>${Number(report.item_count || 0)}</strong></div>
          <div><span>AVG ORDER</span><strong>${formatReportMoney(averageOrder)}</strong></div>
          <div class="payment"><span>CASH</span><strong>${formatReportMoney(report.cash_sales)}</strong></div>
          <div class="payment"><span>UPI</span><strong>${formatReportMoney(report.upi_sales)}</strong></div>
          <div class="payment"><span>CARD</span><strong>${formatReportMoney(report.card_sales)}</strong></div>
          <div><span>OHHO STOCK</span><strong>${formatReportMoney(report.stock_received_amount)}</strong></div>
          <div><span>OTHER EXPENSES</span><strong>${formatReportMoney(report.other_expense_amount)}</strong></div>
          <div><span>NET AFTER EXPENSES</span><strong>${formatReportMoney(report.net_after_expenses)}</strong></div>
        </div>
      </article>
    `;
  }).join('');

  $$('[data-download-session]', list).forEach(button => {
    button.addEventListener('click', () => downloadCompletedSessionReport(button.dataset.downloadSession));
  });
}

function downloadCompletedSessionReport(reportId) {
  const report = (state.salesReports || []).find(item => String(item.id) === String(reportId));
  if (!report) {
    toast('This session report is no longer available.', 'bad');
    return;
  }

  const openedAt = new Date(report.opened_at).getTime();
  const closedAt = new Date(report.closed_at).getTime();
  const sessionOrders = (state.reportOrders || []).filter(order => {
    const createdAt = new Date(order.created_at).getTime();
    return order.outlet_id === report.outlet_id &&
      isReportableOrder(order) &&
      createdAt >= openedAt && createdAt < closedAt;
  });
  const freeOrders = sessionOrders.filter(isFamilyFriendsOrder);
  const sumOrders = rows => rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const sumItems = rows => rows.reduce((sum, order) => sum + Number(order.item_count || 0), 0);
  const itemRows = itemSalesTotals(sessionOrders);
  const outlet = state.outlets.find(item => item.id === report.outlet_id);
  const orderCount = Number(report.order_count || 0);
  const averageOrder = orderCount ? Number(report.gross_sales || 0) / orderCount : 0;
  const sessionBills = (state.inventory.bills || []).filter(row => row.outlet_id === report.outlet_id && new Date(row.supplied_at).getTime() >= openedAt && new Date(row.supplied_at).getTime() < closedAt);
  const sessionExpenses = (state.inventory.expenses || []).filter(row => row.outlet_id === report.outlet_id && new Date(row.occurred_at).getTime() >= openedAt && new Date(row.occurred_at).getTime() < closedAt);
  const rows = [
    ['OHHO SESSION SALES REPORT'],
    ['Outlet', outlet?.name || 'OHHO Outlet'],
    ['Opened', new Date(report.opened_at).toLocaleString()],
    ['Closed', new Date(report.closed_at).toLocaleString()],
    [],
    ['Metric', 'Value'],
    ['Total Sales', Number(report.gross_sales || 0).toFixed(2)],
    ['Paid Orders', orderCount],
    ['Items Sold', Number(report.item_count || 0)],
    ['Average Order Value', averageOrder.toFixed(2)],
    ['Cash', Number(report.cash_sales || 0).toFixed(2)],
    ['UPI', Number(report.upi_sales || 0).toFixed(2)],
    ['Card', Number(report.card_sales || 0).toFixed(2)],
    ['OHHO Stock Received', Number(report.stock_received_amount || 0).toFixed(2)],
    ['Owner Daily Expenses', Number(report.other_expense_amount || 0).toFixed(2)],
    ['Total Expenses', Number(report.total_expense_amount || 0).toFixed(2)],
    ['Net After Expenses', Number(report.net_after_expenses || 0).toFixed(2)],
    ['Family & Friends Orders', freeOrders.length],
    ['Free Food Items', sumItems(freeOrders)],
    ['Free Food Menu Value', sumOrders(freeOrders).toFixed(2)],
    [],
    ['Item', 'Paid Quantity', 'Free Quantity', 'Total Quantity', 'Paid Sales', 'Free Food Value'],
    ...itemRows.map(item => [
      item.name,
      item.paidQuantity,
      item.freeQuantity,
      item.paidQuantity + item.freeQuantity,
      item.paidSales.toFixed(2),
      item.freeValue.toFixed(2)
    ]),
    [],
    ['OHHO Stock Received'],
    ['Bill','Date','Amount','Payment Status'],
    ...sessionBills.map(bill => [bill.bill_number,new Date(bill.supplied_at).toLocaleString('en-IN'),Number(bill.total_amount || 0).toFixed(2),bill.payment_status]),
    [],
    ['Owner Daily Expenses'],
    ['Description','Category','Date','Payment','Amount'],
    ...sessionExpenses.map(expense => [expense.description,expense.category,new Date(expense.occurred_at).toLocaleString('en-IN'),expense.payment_method,Number(expense.amount || 0).toFixed(2)])
  ];
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const outletSlug = String(outlet?.slug || outlet?.name || 'outlet')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  link.href = url;
  link.download = `ohho-${outletSlug}-session-${new Date(report.closed_at).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

  const clearReportLogButton = $('#reportsClearLogBtn');
  if (clearReportLogButton) {
    clearReportLogButton.style.display = role === 'ADMIN' ? '' : 'none';
  }

  const addOutletButton = $('#addNewOutletBtn');
  if (addOutletButton) {
    addOutletButton.style.display = role === 'ADMIN' ? '' : 'none';
  }

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

function startLiveDashboardRefresh() {
  if (state.liveRefreshTimer) clearInterval(state.liveRefreshTimer);
  state.liveRefreshTimer = setInterval(async () => {
    if (document.hidden || state.liveRefreshBusy || state.pos.submitting || Date.now() - dashboardLastInteractionAt < 8000) return;
    state.liveRefreshBusy = true;
    try {
      const section = state.selectedSection;
      if (['overview', 'pos', 'outlets'].includes(section)) await loadOutlets();
      if (['overview', 'orders'].includes(section)) await loadOrders({ silent: true });
      if (section === 'overview' && ['ADMIN','OWNER','MANAGER'].includes(state.profile?.role)) await loadOverviewOperationsData();
    } catch (error) {
      console.error('Unable to refresh live dashboard feed:', error);
    } finally {
      state.liveRefreshBusy = false;
    }
  }, 90000);
}

function dashboardAssetPath(root = document) {
  const script = [...root.querySelectorAll('script[src]')].find(node =>
    /dashboardApp-[^/]+\.js(?:$|\?)/.test(node.getAttribute('src') || '')
  );
  if (!script) return null;
  try {
    return new URL(script.getAttribute('src'), window.location.origin).pathname;
  } catch {
    return null;
  }
}

function dashboardHasUnsavedWork() {
  return Boolean(
    state.pos.cart.length ||
    state.orderEdit.orderId ||
    document.querySelector('.modal-backdrop.open')
  );
}

async function checkForDashboardUpdate() {
  // Avoid downloading and parsing the full dashboard while the operator is
  // scrolling or entering an order; the next background check will retry.
  if (document.hidden || Date.now() - dashboardLastInteractionAt < 12000) return;
  const currentAsset = dashboardAssetPath();
  if (!currentAsset) return;

  try {
    const response = await fetch(`/dashboard?version_check=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) return;

    const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextAsset = dashboardAssetPath(nextDocument);
    if (!nextAsset || nextAsset === currentAsset) return;

    if (dashboardHasUnsavedWork()) {
      if (!state.versionUpdatePending) {
        state.versionUpdatePending = true;
        toast('New POS version ready. Finish the current order and it will update automatically.', 'ok');
      }
      return;
    }

    if (state.versionCheckTimer) clearInterval(state.versionCheckTimer);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('app_update', Date.now());
    window.location.replace(nextUrl.toString());
  } catch (error) {
    console.warn('Unable to check for a newer POS version:', error);
  }
}

function startDashboardVersionCheck() {
  if (state.versionCheckTimer) clearInterval(state.versionCheckTimer);
  window.setTimeout(checkForDashboardUpdate, 15000);
  state.versionCheckTimer = window.setInterval(checkForDashboardUpdate, 60000);
}

function renderSettings() {
  renderCustomerReviews();
  const userName = $('#settingsUserName');
  const userRole = $('#settingsUserRole');
  const userEmail = $('#settingsUserEmail');
  const outletCount = $('#settingsOutletCount');
  const menuCount = $('#settingsMenuCount');
  const outletList = $('#settingsOutletList');

  if (userName) userName.textContent = state.profile?.name || 'OHHO Admin';
  if (userRole) userRole.textContent = state.profile?.role || '—';
  if (userEmail) userEmail.textContent = state.session?.user?.email || '—';

  const outlets = state.outlets || [];
  const openOutlets = outlets.filter(outlet => outlet.status === 'ACTIVE');
  if (outletCount) outletCount.textContent = `${openOutlets.length} / ${outlets.length}`;

  const liveMenuItems = (menuManagementState.items || []).filter(
    item => item.is_available === true && item.is_archived !== true
  );
  if (menuCount) menuCount.textContent = String(liveMenuItems.length);

  if (!outletList) return;
  if (!outlets.length) {
    outletList.innerHTML = '<div class="settings-empty">No outlet is assigned to this account.</div>';
    return;
  }

  outletList.innerHTML = outlets.map(outlet => {
    const isOpen = outlet.status === 'ACTIVE';
    const sessionStarted = outlet.current_session_started_at
      ? new Date(outlet.current_session_started_at).toLocaleString([], {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null;
    return `
      <div class="settings-outlet-row">
        <strong>${escapeHtml(outlet.name || 'OHHO Outlet')}</strong>
        <span class="hours">${escapeHtml(formatTime(outlet.opening_time))} – ${escapeHtml(formatTime(outlet.closing_time))}</span>
        <span class="session">${isOpen && sessionStarted ? `Session opened ${escapeHtml(sessionStarted)}` : 'No active sales session'}</span>
        <span class="${isOpen ? 'open' : 'closed'}">${isOpen ? '● OPEN' : 'CLOSED'}</span>
      </div>
    `;
  }).join('');

  renderSpinSettings();
}

function renderSpinSettings() {
  const panel = $('#spinSettingsPanel');
  if (!panel) return;
  const isAdmin = state.profile?.role === 'ADMIN';
  panel.hidden = !isAdmin;
  if (!isAdmin) return;
  const select = $('#spinSettingsOutlet');
  if (!select) return;
  const current = select.value || '__all__';
  select.innerHTML = `<option value="__all__">ALL OUTLETS</option>${state.outlets.map(outlet => `<option value="${escapeHtml(outlet.id)}">${escapeHtml(outlet.name)}</option>`).join('')}`;
  select.value = current === '__all__' || state.outlets.some(outlet => outlet.id === current) ? current : '__all__';
  fillSpinSettingForm();
  renderSpinHistory();
}

function renderSpinHistory() {
  const panel = $('#spinHistoryPanel');
  const target = $('#spinHistoryList');
  if (!panel || !target) return;
  const isAdmin = state.profile?.role === 'ADMIN';
  panel.hidden = !isAdmin;
  if (!isAdmin) return;
  if (!state.spinHistory.length) { target.innerHTML = '<div class="settings-empty">No spins have been recorded yet.</div>'; return; }
  target.innerHTML = state.spinHistory.map(item => {
    const noWin = String(item.label || '').toUpperCase().includes('BETTER LUCK');
    const status = noWin ? 'NO WIN' : item.status === 'REDEEMED' ? 'REDEEMED' : new Date(item.expires_at).getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';
    return `<article class="spin-history-row"><div><strong>${escapeHtml(noWin ? '—' : item.code)}</strong><span>${escapeHtml(item.outlets?.name || 'OHHO OUTLET')} · ${new Date(item.issued_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><div><b>${escapeHtml(item.label)}</b><em class="spin-status ${status.toLowerCase().replace(/\s+/g, '-')}">${status}</em></div></article>`;
  }).join('');
}

function renderCustomerReviews() {
  const panel = $('#customerReviewsPanel');
  const target = $('#customerReviewList');
  if (!panel || !target) return;
  const isAdmin = state.profile?.role === 'ADMIN';
  panel.hidden = !isAdmin;
  if (!isAdmin) return;
  if (state.customerReviewsError) { target.innerHTML = `<div class="settings-empty">${escapeHtml(state.customerReviewsError)} <button type="button" data-review-retry>Retry</button></div>`; return; }
  if (!state.customerReviews.length) { target.innerHTML = '<div class="settings-empty">No customer reviews added yet.</div>'; return; }
  target.innerHTML = state.customerReviews.map(review => `<article class="review-settings-row"><div><strong>${escapeHtml(review.customer_name)} · ${'★'.repeat(Math.max(1, Math.min(5, Number(review.rating || 5))))}</strong><span>${escapeHtml(review.review_text)}${review.location ? ` · ${escapeHtml(review.location)}` : ''}</span></div><button class="review-delete-btn" type="button" data-review-delete="${escapeHtml(review.id)}">DELETE</button></article>`).join('');
}

async function loadCustomerReviews() {
  state.customerReviews = [];
  state.customerReviewsError = '';
  renderCustomerReviews();
  if (state.profile?.role !== 'ADMIN') return;
  $('#customerReviewList').innerHTML = '<div class="settings-empty">Loading reviews…</div>';
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/menu?resource=reviews&admin=1', { headers: { Authorization: `Bearer ${sessionData?.session?.access_token || ''}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.customerReviews = result.reviews || [];
    renderCustomerReviews();
  } catch (error) {
    console.error('Unable to load customer reviews:', error);
    state.customerReviewsError = 'Could not load reviews. Please try again.';
    renderCustomerReviews();
  }
}

async function addCustomerReview() {
  if (state.profile?.role !== 'ADMIN') return;
  const customerName = $('#reviewCustomerName')?.value.trim();
  const location = $('#reviewLocation')?.value.trim();
  const reviewText = $('#reviewText')?.value.trim();
  const rating = $('#reviewRating')?.value;
  if (!customerName || !reviewText) return toast('Add the customer name and review first.', 'bad');
  const button = $('#addCustomerReviewBtn');
  button.disabled = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/menu?resource=reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData?.session?.access_token || ''}` }, body: JSON.stringify({ customerName, location, reviewText, rating }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.customerReviewsError = '';
    state.customerReviews.unshift(result.review);
    $('#reviewCustomerName').value = '';
    $('#reviewLocation').value = '';
    $('#reviewText').value = '';
    $('#reviewRating').value = '5';
    renderCustomerReviews();
    toast('Customer review added.', 'ok');
  } catch (error) {
    toast(error.message || 'Could not add review.', 'bad');
  } finally { button.disabled = false; }
}

async function deleteCustomerReview(id, button) {
  if (!id || state.profile?.role !== 'ADMIN') return;
  if (button) button.disabled = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/menu?resource=reviews', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData?.session?.access_token || ''}` }, body: JSON.stringify({ id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.customerReviews = state.customerReviews.filter(review => review.id !== id);
    renderCustomerReviews();
    toast('Customer review deleted.', 'ok');
  } catch (error) {
    toast(error.message || 'Could not delete review.', 'bad');
  } finally { if (button) button.disabled = false; }
}

function fillSpinSettingForm() {
  const outletId = $('#spinSettingsOutlet')?.value;
  const isAllOutlets = outletId === '__all__';
  const outlet = state.outlets.find(item => item.id === outletId);
  const setting = isAllOutlets ? state.spinSettings[0] : state.spinSettings.find(item => item.outlet_id === outletId);
  const prizes = cleanPrizes(setting?.prizes);
  const cards = $('#spinPrizeCards');
  const items = menuManagementState.items || [];
  const categories = new Map((menuManagementState.categories || []).map(item => [item.id, item.name]));
  cards.innerHTML = prizes.map((prize, index) => {
    const kind = prize.type === 'FREE_ITEM' ? prize.category : prize.type;
    return `<article class="spin-prize-card" data-prize-card>
      <header><span>Reward ${index + 1}</span><small>1 in 6 chance</small></header>
      <label class="spin-setting-field"><span>Reward type</span><select data-prize-type aria-label="Reward ${index + 1} type">${[['PERCENT','Percentage off'],['FLAT','Flat amount off'],['FOOD','Free food item'],['COLD_DRINK','Free cold drink'],['BEVERAGE','Free other beverage'],['NONE','Better luck next time']].map(([value,label]) => `<option value="${value}" ${value === kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="spin-setting-field" data-prize-value-wrap><span data-prize-value-label>Discount</span><input data-prize-value type="number" min="1" step="0.01" value="${Number(prize.value)}" aria-label="Reward ${index + 1} discount"></label>
      <label class="spin-setting-field" data-prize-item-wrap><span>Free item · one unit</span><select data-prize-item aria-label="Reward ${index + 1} free item"><option value="">Choose a menu item</option>${items.filter(item => item.is_available !== false || item.id === prize.menuItemId).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === prize.menuItemId ? 'selected' : ''}>${escapeHtml(categories.get(item.category_id) || 'Menu')} · ${escapeHtml(item.name)}</option>`).join('')}</select></label>
      <p data-prize-preview></p>
    </article>`;
  }).join('');
  cards.querySelectorAll('[data-prize-card]').forEach(card => {
    const update = () => {
      const kind = card.querySelector('[data-prize-type]').value;
      const free = ['FOOD','COLD_DRINK','BEVERAGE'].includes(kind);
      card.querySelector('[data-prize-value-wrap]').hidden = free || kind === 'NONE';
      card.querySelector('[data-prize-item-wrap]').hidden = !free;
      card.querySelector('[data-prize-value-label]').textContent = kind === 'PERCENT' ? 'Percentage · %' : 'Amount · ₹';
      card.querySelector('[data-prize-value]').max = kind === 'PERCENT' ? 100 : 100000;
      const select = card.querySelector('[data-prize-item]');
      const item = items.find(item => item.id === select.value);
      card.querySelector('[data-prize-preview]').textContent = free ? (item ? `Free ${item.name} · 1 unit` : 'Choose the exact item the customer receives.') : kind === 'NONE' ? 'No reward code will be issued.' : `${kind === 'FLAT' ? '₹' : ''}${card.querySelector('[data-prize-value]').value}${kind === 'PERCENT' ? '%' : ''} off the order`;
    };
    card.addEventListener('input', update); card.addEventListener('change', update); update();
  });
  if ($('#spinMinimumOrder')) $('#spinMinimumOrder').value = Number(setting?.minimum_order || setting?.minimumOrder || 0);
  if ($('#spinEnabled')) $('#spinEnabled').checked = setting?.enabled !== false;
  if ($('#spinQrLink')) $('#spinQrLink').href = isAllOutlets ? '/#spin-win' : `/spin.html?outlet=${encodeURIComponent(outlet?.slug || '')}`;
}

async function loadSpinSettings() {
  if (state.profile?.role !== 'ADMIN') return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/spin?action=settings', { headers: { Authorization: `Bearer ${sessionData?.session?.access_token || ''}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.spinSettings = result.settings || [];
    state.spinHistory = result.history || [];
    renderSpinSettings();
  } catch (error) {
    console.error('Unable to load Spin & Win settings:', error);
  }
}

async function saveSpinSettings() {
  const outletId = $('#spinSettingsOutlet')?.value;
  const allOutlets = outletId === '__all__';
  let prizes;
  try {
    prizes = [...document.querySelectorAll('[data-prize-card]')].map(card => {
      const kind = card.querySelector('[data-prize-type]').value;
      const free = ['FOOD','COLD_DRINK','BEVERAGE'].includes(kind);
      const menuItemId = card.querySelector('[data-prize-item]').value;
      const item = menuManagementState.items.find(item => item.id === menuItemId);
      return normalizePrize({ type: free ? 'FREE_ITEM' : kind, category: kind, menuItemId, value: card.querySelector('[data-prize-value]').value, label: free ? `Free ${item?.name || 'item'}` : undefined });
    });
    if (!outletId || prizes.length !== 4) throw new Error('Choose an outlet and configure four rewards.');
  } catch (error) { return toast(error.message, 'bad'); }
  const button = $('#saveSpinSettingsBtn');
  button.disabled = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch('/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData?.session?.access_token || ''}` }, body: JSON.stringify({ action: 'settings', outletId: allOutlets ? '' : outletId, allOutlets, enabled: $('#spinEnabled')?.checked, prizes, minimumOrder: $('#spinMinimumOrder')?.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const saved = Array.isArray(result.settings) ? result.settings : [{ outlet_id: outletId, ...result.settings }];
    const savedIds = new Set(saved.map(item => item.outlet_id));
    state.spinSettings = state.spinSettings.filter(item => !savedIds.has(item.outlet_id)).concat(saved);
    fillSpinSettingForm();
    toast(allOutlets ? 'Spin & Win settings saved for all outlets.' : 'Spin & Win settings saved.', 'ok');
  } catch (error) {
    toast(error.message || 'Could not save Spin & Win settings.', 'bad');
  } finally { button.disabled = false; }
}

async function startApp(session) {
  state.session = session;
  try {
    await loadProfile();
    applyRolePermissions();
    window.history.replaceState({ ohhoDashboardSection: state.selectedSection || 'overview' }, document.title, window.location.href);
    updateUserCard();
    await loadOutlets();
    const posMenuReady = loadPosMenu();
    $('#authGate')?.classList.add('hidden');
    renderSettings();
    updateDashboardContext();
    renderOverview();
    startLiveDashboardRefresh();
    startDashboardVersionCheck();

    const backgroundLoads = [
      ['POS menu', posMenuReady],
      ['recent orders', loadOrders()]
    ];
    if (['ADMIN','OWNER','MANAGER'].includes(state.profile?.role)) {
      const loadOverviewOperations = () => {
        if (state.selectedSection === 'overview') {
          loadOverviewOperationsData().catch(error => console.error('Unable to load overview operations:', error));
        }
      };
      if ('requestIdleCallback' in window) window.requestIdleCallback(loadOverviewOperations, { timeout: 7000 });
      else window.setTimeout(loadOverviewOperations, 2500);
    }
    void Promise.allSettled(backgroundLoads.map(([, task]) => task)).then(results => {
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return;
        console.error(`Unable to load ${backgroundLoads[index][0]}:`, result.reason);
        if (backgroundLoads[index][0] === 'POS menu') toast(result.reason?.message || 'Unable to load the POS menu.', 'bad');
      });
    });
  } catch (error) {
    await supabase.auth.signOut();
    setAuthError(error.message || 'Unable to authorize this account.');
    $('#authGate')?.classList.remove('hidden');
  }
}

async function init() {
  injectStyles();
  ['pointerdown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll'].forEach(eventName => {
    window.addEventListener(eventName, () => { dashboardLastInteractionAt = Date.now(); }, { passive: true });
  });
  buildAuthGate();
  buildOutletModal();
  buildStaffModal();
  buildOrderEditModal();
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


document.addEventListener('click', event => {
  const button = event.target.closest('[data-collapse-panel]');
  if (!button) return;
  const panel = document.getElementById(button.dataset.collapsePanel);
  if (!panel) return;
  const collapsed = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden', collapsed);
  button.textContent = collapsed ? 'SHOW' : 'CLOSE';
  button.setAttribute('aria-expanded', String(!collapsed));
});

const sectionDisclosures = installSectionDisclosures();

function revealAndScroll(target) { if (!target) return; sectionDisclosures.reveal(target); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

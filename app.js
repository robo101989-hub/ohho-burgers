import { supabase } from "./src/supabase.js";

const siteData = {
  ordering: { zomato: "https://www.zomato.com/shamli/ohho-burgers-shamli-locality/order", swiggy: "https://www.swiggy.com/menu/1421622?source=sharing", direct: "" },
  categories: [
    { icon: "🍔", name: "BURGERS", copy: "Juicy. Loaded. Unapologetically good.", image: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍕", name: "PIZZA", copy: "Cheesy slices made for sharing.", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=82" },
    { icon: "🥪", name: "SANDWICHES", copy: "Loaded between two perfect slices.", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍗", name: "CRISPY CHICKEN", copy: "Crunch outside. Juicy inside.", image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=82" }
  ],
  products: [
    { slug: "crispy-chicken-burger", category: "BURGERS", name: "Crispy Chicken Burger", desc: "Crispy, juicy and loaded with OHHO flavour.", price: "₹120", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { slug: "ohho-signature-chicken-burger", category: "BURGERS", name: "OHHO Signature Chicken Burger", desc: "Our signature chicken burger with big OHHO flavour.", price: "₹120", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { slug: "ohho-special-chicken-burger", category: "BURGERS", name: "OHHO Special Chicken Burger", desc: "Our loaded special chicken burger for serious cravings.", price: "₹170", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { slug: "fire-chicken-pizza", category: "PIZZAS", name: "Fire Chicken Pizza", desc: "A fiery chicken pizza made for bold cravings. 🔥", price: "₹89", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "veg-supreme-pizza", category: "PIZZAS", name: "Veg Supreme Pizza", desc: "Loaded with flavourful veggies and melty cheese.", price: "₹99", veg: true, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "classic-chicken-pizza", category: "PIZZAS", name: "Classic Chicken Pizza", desc: "Classic chicken, cheese and a satisfying crust.", price: "₹120", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "ohho-special-chicken-pizza", category: "PIZZAS", name: "OHHO Special Chicken Pizza", desc: "Cheesy, loaded and made for serious cravings.", price: "₹150", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "chicken-supreme-pizza", category: "PIZZAS", name: "Chicken Supreme Pizza", desc: "A loaded supreme pizza for the biggest appetite.", price: "₹250", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "classic-chicken-sandwich", category: "SANDWICHES", name: "Classic Chicken Sandwich", desc: "Classic chicken loaded between perfect slices.", price: "₹99", veg: false, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { slug: "ohho-special-sandwich", category: "SANDWICHES", name: "OHHO Special Sandwich", desc: "Loaded between perfect slices with big flavour.", price: "₹120", veg: false, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { slug: "crispy-chicken-bucket-half", category: "OHHO SPECIAL BUCKETS", name: "Crispy Chicken Bucket (Half)", desc: "Crunchy, juicy crispy chicken for sharing.", price: "₹150", veg: false, image: "images/crispy-chicken-bucket.jpeg" },
    { slug: "crispy-chicken-bucket-full", category: "OHHO SPECIAL BUCKETS", name: "Crispy Chicken Bucket (Full)", desc: "A full bucket of crunchy, juicy crispy chicken.", price: "₹250", veg: false, image: "images/crispy-chicken-bucket.jpeg" },
    { slug: "french-fries", category: "FRIES", name: "French Fries", desc: "Crispy golden fries made for every craving.", price: "₹59", veg: true, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { slug: "cold-coffee", category: "SIPS & ADDONS", name: "Cold Coffee", desc: "A chilled, creamy coffee to go with your meal.", price: "₹80", veg: true, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { slug: "extra-patty", category: "SIPS & ADDONS", name: "Extra Patty", desc: "Add an extra patty to make it bigger.", price: "₹70", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { slug: "extra-cheese", category: "SIPS & ADDONS", name: "Extra Cheese", desc: "Make it extra cheesy.", price: "₹30", veg: true, image: "images/ohho-special-chicken-pizza.jpeg" },
    { slug: "extra-dips", category: "SIPS & ADDONS", name: "Extra Dips", desc: "Add extra dips for more flavour.", price: "₹10", veg: true, image: "images/crispy-chicken-bucket.jpeg" }
  ],
  why: [["01", "GOOD FOOD", "Made to taste great."], ["02", "GOOD PRICE", "Everyday food without crazy prices."], ["03", "FRESH", "Quality-focused processes, every day."], ["04", "CONSISTENT", "The same happy bite, every time."], ["05", "PROVEN MODEL", "We operate before we franchise."]],
  journey: [["01", "THE IDEA", "A simple vision: good food at a good price."], ["02", "FIRST OUTLET", "We took the idea to real customers."], ["03", "LEARNING", "Everyday operations taught us what matters."], ["04", "BUILDING THE SYSTEM", "Products, process, supply chain and experience."], ["05", "PROVING THE MODEL", "Operate first. Improve continuously."], ["06", "EXPANSION", "Build with selected partners."]],
  offers: [["OHHO COMBO", "Burger + Fries + Drink"], ["BITE TOGETHER", "Family meal favourites"], ["THE BIG DEAL", "More flavour. Better value."]],
  approach: [["01", "WE LAUNCH", "We open and launch the outlet."], ["02", "WE OPERATE", "We run the operation every day."], ["03", "WE UNDERSTAND", "We learn the market and customer needs."], ["04", "WE BUILD", "We build a strong customer base."], ["05", "WE STABILIZE", "We refine and stabilize the operations."], ["06", "WE FRANCHISE", "Then we offer the proven model to partners."]],
  benefits: [["✦", "BRAND", "Build under a growing QSR brand."], ["◌", "PRODUCT", "A focused menu for mass-market appeal."], ["⌁", "OPERATIONS", "Standardised operational systems."], ["↗", "TRAINING", "Support for franchise partners."], ["◎", "MARKETING", "Central brand and marketing support."], ["+", "GROWTH", "Designed with scalability in mind."]],
  reviews: [["“", "A real customer review will live here — use this space to show the moments that make people come back.", "Customer name • City"], ["✦", "Add genuine reviews, creator content and customer photos as OHHO grows.", "Social proof placeholder"], ["♥", "Real ratings and platform feedback can be connected here later.", "Ratings placeholder"]],
  locations: [{ name: "Shamli", address: "OHHO BURGERS, Taimurshah Delhi Road, Shamli, Uttar Pradesh 247776", hours: "5:00 PM – 1:00 AM", phone: "9650443642", maps: "", zomato: String.fromCharCode(104,116,116,112,115,58,47,47,119,119,119,46,122,111,109,97,116,111,46,99,111,109,47,115,104,97,109,108,105,47,111,104,104,111,45,98,117,114,103,101,114,115,45,115,104,97,109,108,105,45,108,111,99,97,108,105,116,121,47,111,114,100,101,114), swiggy: String.fromCharCode(104,116,116,112,115,58,47,47,119,119,119,46,115,119,105,103,103,121,46,99,105,116,121,47,115,104,97,109,108,105,47,104,111,104,111,45,98,117,114,103,101,114,115,45,107,97,107,97,45,110,97,103,97,114,45,114,101,115,116,49,52,50,49,54,50,50)  }, { name: "Kairana", address: "OHHO BURGERS, besides Nawab Market, Panipat Road, Kairana, Uttar Pradesh 247774", hours: "5:00 PM – 1:00 AM", phone: "9650443642", maps: "", zomato: "", swiggy: "" }]
};
const kairanaOutlet = siteData.locations.find(outlet => outlet.name === "Kairana");
if (kairanaOutlet) kairanaOutlet.phone = "8285268786";

const $ = (selector) => document.querySelector(selector);
siteData.products.forEach(product => {
  if (product.image?.startsWith('images/')) product.image = `/${product.image}`;
});
const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("\x27", "&#039;");
const render = (selector, markup) => { const target = $(selector); if (target) target.innerHTML = markup; };
render('#categoryGrid', siteData.categories.map((c, i) => `<article class="category-card reveal delay-${i % 3}"><img loading="lazy" src="${c.image}" alt="${c.name}"/><div class="category-shade"></div><span class="category-icon">${c.icon}</span><div><h3>${c.name}</h3><p>${c.copy}</p><a href="menu.html">Explore <b>→</b></a></div></article>`).join(''));
const isMenuPage = window.location.pathname === '/menu' || window.location.pathname.endsWith('/menu.html') || window.location.pathname.endsWith('menu.html');
const favouriteIndexes = [0, 6, 9, 11];
const visibleProducts = isMenuPage ? siteData.products : favouriteIndexes.map(i => siteData.products[i]);
if (isMenuPage) {
  const menuOrder = ["BURGERS", "PIZZAS", "SANDWICHES", "OHHO SPECIAL BUCKETS", "FRIES", "SIPS & ADDONS"];
  render('#menuContent', menuOrder.map((category, i) => {
    const items = siteData.products.filter(p => p.category === category);
    return `<section class="menu-category reveal">
      <div class="menu-category-header">
        <span>0${i + 1}</span>
        <h2>${category}</h2>
      </div>
      <div class="menu-list">
        ${items.map(p => `<article class="menu-item menu-item-public" data-menu-id="${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}" data-menu-image="${p.image || ''}">
          <div class="menu-item-info">
            <h3>${p.name}</h3>
            <p>${p.desc}</p>
          </div>
          <img class="menu-item-image" loading="lazy" src="${p.image}" alt="${p.name}">
          <span class="menu-price">${p.price}</span><button class="menu-add" type="button" data-add-to-cart="${p.name}">Add</button>
        </article>`).join('')}
      </div>
    </section>`;
  }).join(''));
} else {
  render('#productGrid', visibleProducts.map((p, i) => `<article class="product-card reveal delay-${i % 3}"><div class="product-image"><img loading="lazy" src="${p.image}" alt="${p.name}"/><span class="food-dot ${p.veg ? 'veg' : 'nonveg'}"></span><button aria-label="Add ${p.name}">+</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.desc}</p></div><b>${p.price}</b></div></article>`).join(''));
}

function setupMobileProductSlideshow() {
  const carousel = $('#productGrid');
  if (!carousel) return;

  const mobile = window.matchMedia('(max-width: 860px)');
  let timer;
  const showNext = () => {
    if (!mobile.matches) return;
    const cards = [...carousel.querySelectorAll('.product-card')];
    if (cards.length < 2) return;
    const current = cards.reduce((best, card, index) =>
      Math.abs(card.offsetLeft - carousel.scrollLeft) < Math.abs(cards[best].offsetLeft - carousel.scrollLeft) ? index : best, 0);
    const nextCard = cards[(current + 1) % cards.length];
    carousel.scrollTo({ left: nextCard.offsetLeft, behavior: 'smooth' });
  };
  const start = () => {
    clearInterval(timer);
    if (mobile.matches) timer = setInterval(showNext, 4000);
  };

  ['pointerdown', 'touchstart'].forEach(event => carousel.addEventListener(event, () => clearInterval(timer), { passive: true }));
  carousel.addEventListener('pointerup', start, { passive: true });
  window.addEventListener('resize', start);
  start();
}

setupMobileProductSlideshow();
render('#whyGrid', siteData.why.map(x => `<article class="why-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#timeline', siteData.journey.map((x, i) => `<article class="timeline-item reveal"><span>${x[0]}</span><div class="timeline-dot"></div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#offerCards', siteData.offers.map((x, i) => `<article class="offer-card offer-${i} reveal"><span>LIMITED-TIME</span><h3>${x[0]}</h3><p>${x[1]}</p><b>→</b></article>`).join(''));
render('#approachList', siteData.approach.map((x, i) => `<article><span>${x[0]}</span><div><h3>${x[1]}</h3><p>${x[2]}</p></div>${i < siteData.approach.length - 1 ? '<i>↓</i>' : ''}</article>`).join(''));
render('#benefitGrid', siteData.benefits.map(x => `<article class="benefit-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
async function loadInstagramReels() {
  const target = $('#reelsGrid');
  if (!target) return;
  try {
    const refreshMinute = Math.floor(Date.now() / 60000);
    const response = await fetch(`/api/instagram/reels?refresh=${refreshMinute}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.reels) || !payload.reels.length) throw new Error('No reels');
    const reelsMarkup = payload.reels.map((reel, index) => {
      const caption = escapeHtml(reel.caption || "Fresh from OHHO Burgers");
      const thumbnail = escapeHtml(reel.thumbnailUrl);
      const player = reel.videoUrl
        ? `<video class="reel-video" autoplay muted loop playsinline preload="metadata" poster="${thumbnail}" aria-label="OHHO Instagram reel ${index + 1}"><source src="${escapeHtml(reel.videoUrl)}" type="video/mp4"></video>`
        : `<img loading="lazy" src="${thumbnail}" alt="${caption}"/>`;
      return `<article class="reel-card reveal in-view">${player}<div><small>Instagram Reel</small><p>${caption}</p><a href="${escapeHtml(reel.permalink)}" target="_blank" rel="noopener">View on Instagram ↗</a></div></article>`;
    }).join('');
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    const postsMarkup = posts.map((post, index) => {
      const caption = escapeHtml(post.caption || "Fresh from OHHO Burgers");
      return `<a class="instagram-post-card" href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener" aria-label="Open OHHO Instagram post ${index + 1}"><img loading="lazy" src="${escapeHtml(post.thumbnailUrl)}" alt="${caption}"><span>POST ↗</span></a>`;
    }).join('');
    target.innerHTML = `<section class="social-feed-group"><div class="social-feed-label"><span>01</span><h3>LATEST <em>REELS.</em></h3><p>Daily bites and customer reactions — playing right here.</p></div><div class="reels-grid">${reelsMarkup}</div></section>${postsMarkup ? `<section class="social-feed-group social-posts-group"><div class="social-feed-label"><span>02</span><h3>LATEST <em>POSTS.</em></h3><p>Photos and carousel moments from OHHO.</p></div><div class="instagram-post-grid">${postsMarkup}</div></section>` : ''}`;
  } catch {
    target.innerHTML = `<a class="reels-fallback" href="https://www.instagram.com/ohhoburgers/" target="_blank" rel="noopener"><span>◎</span><strong>See the latest from @ohhoburgers</strong><small>Open Instagram to watch our newest reels ↗</small></a>`;
  }
}
loadInstagramReels();
function formatOutletTime(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function whatsappOrderUrl(outlet) {
  const phone = String(outlet.phone || '').replace(/\D/g, '');
  if (phone.length < 10) return '';
  const indianPhone = phone.length === 10 ? `91${phone}` : phone;
  const message = `Hi OHHO Burgers, I would like to place a takeaway order from the ${outlet.name} outlet.`;
  return `https://wa.me/${indianPhone}?text=${encodeURIComponent(message)}`;
}

function renderPublicOutlets(outlets) {
  const activeOutlets = outlets.filter(outlet => outlet.website_enabled === true);
  render('#locationGrid', activeOutlets.map((outlet, index) => {
    const address = outlet.address || '';
    const hours = outlet.hours || [formatOutletTime(outlet.opening_time), formatOutletTime(outlet.closing_time)].filter(Boolean).join(' – ');
    const maps = outlet.maps_url || outlet.maps || ["https:", "//", "www.google.com/maps/search/?api=1&query="].join("") + encodeURIComponent(address);
    const whatsapp = whatsappOrderUrl(outlet);
    const zomato = outlet.zomato_url || outlet.zomato;
    const swiggy = outlet.swiggy_url || outlet.swiggy;
    return `<article class="location-card location-card-premium">
      <div class="location-visual">
        <img src="/images/ohho-food-cart.jpeg" alt="OHHO Burgers food cart at ${escapeHtml(outlet.name)}" loading="lazy" />
        <span class="location-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="location-open">NOW SERVING</span>
      </div>
      <div class="location-content">
        <p class="location-kicker">OHHO BURGERS · OUTLET</p>
        <h3>${escapeHtml(outlet.name)}</h3>
        <p class="location-address">⌖ ${escapeHtml(address)}</p>
        <div class="location-meta">
          <span>◷ ${escapeHtml(hours)}</span>
          ${outlet.phone ? `<span>☎ ${escapeHtml(outlet.phone)}</span>` : ''}
        </div>
        <div class="location-links">
          ${whatsapp ? `<a class="location-order" href="${whatsapp}" target="_blank" rel="noopener">ORDER ON WHATSAPP <b>↗</b></a>` : ''}
          <div class="location-secondary">
            <a href="${escapeHtml(maps)}" target="_blank" rel="noopener">MAPS ↗</a>
            ${outlet.phone ? `<a href="tel:${escapeHtml(outlet.phone)}">CALL ↗</a>` : ''}
            ${zomato ? `<a href="${escapeHtml(zomato)}" target="_blank" rel="noopener">ZOMATO ↗</a>` : ''}
            ${swiggy ? `<a href="${escapeHtml(swiggy)}" target="_blank" rel="noopener">SWIGGY ↗</a>` : ''}
          </div>
        </div>
      </div>
    </article>`;
  }).join('') || '<p class="location-error">No outlets are currently available on the website.</p>');

  renderOrderOutletPicker(activeOutlets);
}

function renderOrderOutletPicker(outlets) {
  const target = $('#whatsAppOutletChoices');
  if (!target) return;
  if (!outlets.length) {
    target.innerHTML = '<small>No outlet is accepting orders right now.</small>';
    return;
  }

  const showOutlet = selectedIndex => {
    const outlet = outlets[selectedIndex];
    const outletName = escapeHtml(outlet.name).toUpperCase();
    const whatsapp = whatsappOrderUrl(outlet);
    const zomato = outlet.zomato_url || outlet.zomato;
    const swiggy = outlet.swiggy_url || outlet.swiggy;
    const orderLinks = [
      whatsapp && `<a class="platform-btn" href="${whatsapp}" target="_blank" rel="noopener"><span>ORDER ON WHATSAPP</span><span>↗</span></a>`,
      zomato && `<a class="platform-btn" href="${escapeHtml(zomato)}" target="_blank" rel="noopener"><span>ORDER ON ZOMATO</span><span>↗</span></a>`,
      swiggy && `<a class="platform-btn" href="${escapeHtml(swiggy)}" target="_blank" rel="noopener"><span>ORDER ON SWIGGY</span><span>↗</span></a>`
    ].filter(Boolean).join('');

    target.innerHTML = `
      <p class="order-location-label">1. SELECT YOUR OUTLET</p>
      <div class="order-location-options">
        ${outlets.map((item, index) => `<button class="order-location-btn ${index === selectedIndex ? 'active' : ''}" type="button" data-order-outlet="${index}">${escapeHtml(item.name).toUpperCase()}</button>`).join('')}
      </div>
      <p class="order-location-label">2. ORDER FROM ${outletName}</p>
      <div class="order-links">${orderLinks || '<small>Ordering links for this outlet will be added soon.</small>'}</div>
      <small>Choose the platform you prefer. We will confirm WhatsApp orders with you.</small>`;

    target.querySelectorAll('[data-order-outlet]').forEach(button => {
      button.addEventListener('click', () => showOutlet(Number(button.dataset.orderOutlet)));
    });
  };

  showOutlet(0);
}

let homeSpinBusy = false;
let homeSpinOutlet = '';
function spinDeviceKey() {
  let key = localStorage.getItem('ohho_spin_device');
  if (!key) { key = crypto.randomUUID(); localStorage.setItem('ohho_spin_device', key); }
  return key;
}
function setHomeSpinMessage(message) { const target = $('#homeSpinMessage'); if (target) target.textContent = message; }
function setHomeSpinEligibility(minimumOrder) { const target = $('#homeSpinEligibility'); if (target) target.textContent = minimumOrder > 0 ? `SPIN ELIGIBLE ON ORDERS ₹${Number(minimumOrder).toFixed(0)}+` : 'SPIN ELIGIBLE ON ALL ORDERS'; }
function showHomeSpinReward(reward) {
  $('#homeSpinLabel').textContent = reward.label;
  $('#homeSpinCode').textContent = reward.code;
  $('#homeSpinReward').hidden = false;
}
async function checkHomeSpinOutlet() {
  const button = $('#homeSpinButton');
  const reward = $('#homeSpinReward');
  if (reward) reward.hidden = true;
  if (!homeSpinOutlet) { if (button) button.disabled = true; setHomeSpinMessage('Choose the cart where you are ordering.'); setHomeSpinEligibility(-1); return; }
  if (button) button.disabled = true;
  setHomeSpinMessage('Checking today’s OHHO rewards…');
  try {
    const response = await fetch(`/api/spin?outlet=${encodeURIComponent(homeSpinOutlet)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Spin & Win is unavailable at this outlet.');
    if (button) button.disabled = !data.enabled;
    setHomeSpinEligibility(data.minimumOrder);
    setHomeSpinMessage(data.enabled ? 'Ready. Start the spinner and show your code at the POS.' : 'Spin & Win is paused at this outlet.');
  } catch (error) {
    setHomeSpinMessage(error.message || 'Spin & Win is unavailable right now.');
  }
}
function renderHomeSpinnerOutlets(outlets) {
  const select = $('#homeSpinOutlet');
  if (!select) return;
  select.disabled = false;
  select.innerHTML = `<option value="">CHOOSE YOUR OUTLET</option>${outlets.filter(outlet => outlet.slug).map(outlet => `<option value="${escapeHtml(outlet.slug)}">${escapeHtml(outlet.name).toUpperCase()}</option>`).join('')}`;
  select.addEventListener('change', () => { homeSpinOutlet = select.value; void checkHomeSpinOutlet(); });
  $('#homeSpinButton')?.addEventListener('click', async () => {
    if (homeSpinBusy || !homeSpinOutlet) return;
    homeSpinBusy = true;
    const button = $('#homeSpinButton');
    button.disabled = true;
    $('#homeSpinReward').hidden = true;
    setHomeSpinMessage('Spinning your OHHO reward…');
    try {
      const response = await fetch('/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'spin', outlet: homeSpinOutlet, deviceKey: spinDeviceKey() }) });
      const data = await response.json();
      if (!response.ok && !data.reward && !data.outcome) throw new Error(data.error || 'Could not create your reward.');
      const segment = Number.isInteger(data.segment) ? data.segment : Math.floor(Math.random() * 6);
      $('#homeSpinWheel').style.transform = `rotate(${1800 + 30 - (segment * 60)}deg)`;
      await new Promise(resolve => setTimeout(resolve, 2800));
      if (data.outcome === 'NO_REWARD') {
        setHomeSpinMessage(data.error ? 'You have already used today’s spin at this outlet.' : 'Better luck next time — come back tomorrow for another OHHO spin.');
        return;
      }
      showHomeSpinReward(data.reward);
      setHomeSpinMessage(data.reward.status === 'REDEEMED' ? 'This code was already redeemed.' : 'Reward ready — give this code to the team before payment.');
    } catch (error) {
      setHomeSpinMessage(error.message || 'Could not spin right now. Please try again.');
      button.disabled = false;
    } finally { homeSpinBusy = false; }
  });
}

render('#locationGrid', '<p class="location-error">Loading outlets…</p>');

async function loadPublicOutlets() {
  const { data, error } = await supabase
    .from('outlets')
    .select('name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,website_enabled,created_at')
    .eq('website_enabled', true)
    .order('created_at', { ascending: true });

  if (!error) {
    // Preserve already-published marketplace links while their dashboard
    // fields are being filled in. Newly saved dashboard values always win.
    const outletsWithKnownLinks = (data || []).map(outlet => {
      const fallback = siteData.locations.find(item =>
        item.name.toLowerCase() === String(outlet.name || '').toLowerCase()
      );
      return {
        ...outlet,
        zomato_url: outlet.zomato_url || fallback?.zomato || '',
        swiggy_url: outlet.swiggy_url || fallback?.swiggy || ''
      };
    });
    renderPublicOutlets(outletsWithKnownLinks);
    renderHomeSpinnerOutlets(outletsWithKnownLinks.filter(outlet => outlet.website_enabled === true));
  } else {
    render('#locationGrid', '<p class="location-error">Unable to load outlets right now. Please refresh to try again.</p>');
    render('#whatsAppOutletChoices', '<small>Unable to load ordering outlets right now.</small>');
    setHomeSpinMessage('Unable to load outlets right now. Please refresh to try again.');
  }
}

void loadPublicOutlets();

function renderPublicMenu({ categories, items }) {
  const target = $('#menuContent');
  if (!target || !categories?.length) return;
  const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const itemsByCategory = new Map();
  items.forEach(item => {
    const categoryItems = itemsByCategory.get(item.category_id) || [];
    categoryItems.push(item);
    itemsByCategory.set(item.category_id, categoryItems);
  });

  const markup = categories.map((category, index) => {
    const categoryItems = itemsByCategory.get(category.id) || [];
    if (!categoryItems.length) return '';
    return `<section class="menu-category"><div class="menu-category-header"><span class="menu-category-number">${String(index + 1).padStart(2, '0')}</span><h2>${escapeHtml(category.name)}</h2></div><div class="menu-list">${categoryItems.map(item => `<article class="menu-item menu-item-public"><div class="menu-item-info"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || 'Made fresh with OHHO flavour.')}</p></div>${item.image_url ? `<img class="menu-item-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy">` : ''}<div class="menu-price">${money(item.price)}</div></article>`).join('')}</div></section>`;
  }).join('');

  if (markup) target.innerHTML = markup;
}

async function loadPublicMenu() {
  if (!$('#menuContent')) return;
  try {
    const response = await fetch(new URL('/api/menu', window.location.origin), { cache: 'no-store' });
    if (!response.ok) throw new Error('Menu request failed');
    renderPublicMenu(await response.json());
  } catch {
    // The static menu remains visible if the customer is temporarily offline.
  }
}

document.querySelectorAll('.menu-add,[data-cart-toggle],[data-cart-drawer],[data-cart-backdrop],[data-checkout-panel]').forEach(node => node.remove());

function renderMenuImageFallback() {
  if (!$('#menuContent')) return;
  const categoryNames = [...new Set(siteData.products.map(product => product.category))];
  const categories = categoryNames.map((name, index) => ({ id: name, name, display_order: index + 1 }));
  const items = siteData.products.map(product => ({
    category_id: product.category,
    name: product.name,
    description: product.desc,
    price: Number(String(product.price).replace(/[^\d.]/g, '')),
    image_url: product.image
  }));
  renderPublicMenu({ categories, items });
}

renderMenuImageFallback();
setTimeout(() => { void loadPublicMenu(); }, 150);

$('.menu-toggle')?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); $('.menu-toggle').setAttribute('aria-expanded', open); });
document.querySelectorAll('.mobile-nav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 30));
const watcher = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); watcher.unobserve(entry.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => watcher.observe(el));
async function submitLead(form, type) {
  const message = form.querySelector('.form-message');
  const button = form.querySelector('button[type="submit"]');
  const fields = Object.fromEntries(new FormData(form).entries());
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending…';
  message.textContent = '';

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        type,
        outletFormat: fields.format || ''
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'We could not send your message. Please try again.');
    message.textContent = type === 'FRANCHISE'
      ? 'Thank you — our franchise team will be in touch.'
      : 'Thank you — your message has been sent.';
    form.reset();
  } catch (error) {
    message.textContent = error.message || 'We could not send your message. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

const franchiseLeadForm = $('#leadForm');
const franchiseLeadIntro = franchiseLeadForm?.previousElementSibling;
if (franchiseLeadIntro && !franchiseLeadIntro.querySelector('.franchise-contact-actions')) {
  franchiseLeadIntro.insertAdjacentHTML('beforeend', `<div class="contact-actions franchise-contact-actions">
    <a href="tel:9650443642" class="contact-chip">☎ <span>Call us<br><b>9650443642</b></span></a>
    <a href="https://wa.me/919650443642" target="_blank" rel="noopener" class="contact-chip">◉ <span>WhatsApp us<br><b>9650443642</b></span></a>
    <a href="mailto:franchise@ohhoburgers.com" class="contact-chip">✉ <span>Email us<br><b>franchise@ohhoburgers.com</b></span></a>
  </div>`);
}
document.querySelectorAll('a[href="#contact"]').forEach(link => { link.href = 'franchise.html#leadForm'; });
document.querySelectorAll('a[href="#franchise"]').forEach(link => { link.href = 'franchise.html'; });
franchiseLeadForm?.addEventListener('submit', e => { e.preventDefault(); submitLead(e.currentTarget, 'FRANCHISE'); });
$('#generalForm')?.addEventListener('submit', e => { e.preventDefault(); submitLead(e.currentTarget, 'CONTACT'); });
document.querySelectorAll('.menu-tabs button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.menu-tabs button').forEach(b => b.classList.remove('active')); button.classList.add('active'); }));
document.querySelectorAll('.platform-btn').forEach(btn => btn.addEventListener('click', () => { const link = siteData.ordering[btn.dataset.platform]; if (link) window.open(link, '_blank', 'noopener'); else alert('This ordering link will be added soon.'); }));


/* OHHO_CART_LOGIC */
(() => {
  // The public menu is display-only; checkout controls are intentionally absent.
  if (!document.querySelector('[data-cart-drawer]')) return;
  const cartKey = 'ohho-cart';
  let cart = [];
  try {
    const storedCart = JSON.parse(localStorage.getItem(cartKey) || '[]');
    if (Array.isArray(storedCart)) {
      cart = storedCart
        .filter(item => item && typeof item.slug === 'string' && item.slug.trim() && typeof item.name === 'string' && item.name.trim() && Number.isFinite(Number(item.price)) && Number(item.price) > 0 && Number.isFinite(Number(item.qty)) && Number(item.qty) >= 1)
        .map(item => ({
          slug: item.slug.trim(),
          name: item.name.trim(),
          price: Number(item.price),
          qty: Math.min(99, Math.max(1, Math.floor(Number(item.qty))))
        }));
    }
  } catch {
    localStorage.removeItem(cartKey);
  }

  localStorage.setItem(cartKey, JSON.stringify(cart));

  const drawer = document.querySelector('[data-cart-drawer]');
  const backdrop = document.querySelector('[data-cart-backdrop]');
  const itemsEl = document.querySelector('[data-cart-items]');
  const totalEl = document.querySelector('[data-cart-total]');
  const countEls = document.querySelectorAll('[data-cart-count]');
  const checkoutBtn = document.querySelector('[data-checkout-open]');
  const cartTrigger = document.querySelector('[data-cart-toggle]');
  const closeBtn = document.querySelector('[data-cart-close]');

  const money = value => `₹${Number(value).toLocaleString('en-IN')}`;

  const save = () => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  };

  const totalItems = () => cart.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = () => cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const openCart = () => document.body.classList.add('cart-open');
  const closeCart = () => document.body.classList.remove('cart-open');

  const renderCart = () => {
    const count = totalItems();
    const total = totalPrice();

    countEls.forEach(el => {
      el.textContent = count;
    });

    totalEl.textContent = money(total);
    checkoutBtn.disabled = cart.length === 0;

    if (!cart.length) {
      itemsEl.innerHTML = '<li class="cart-empty">Your cart is empty.<br>Add something delicious from the menu.</li>';
      return;
    }

    itemsEl.innerHTML = cart.map((item, index) => `
      <li class="cart-line">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${money(item.price)} each</p>
        </div>
        <div class="cart-line-actions">
          <div class="quantity-control">
            <button type="button" data-cart-minus="${index}" aria-label="Decrease ${escapeHtml(item.name)}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-cart-plus="${index}" aria-label="Increase ${escapeHtml(item.name)}">+</button>
          </div>
          <b>${money(item.price * item.qty)}</b>
        </div>
      </li>
    `).join('');
  };

  const addToCart = name => {
    const product = siteData.products.find(p => p.name === name);
    if (!product) return;

    const existing = cart.find(item => item.slug === product.slug);

    if (existing) {
      if (existing.qty >= 99) {
        return;
      }
      existing.qty += 1;
    } else {
      cart.push({
        slug: product.slug,
        name: product.name,
        price: Number(String(product.price).replace(/[^\d.]/g, '')),
        qty: 1
      });
    }

    save();
    renderCart();
    openCart();
  };

  const checkoutPanel = document.querySelector('[data-checkout-panel]');
  const checkoutForm = document.querySelector('[data-checkout-form]');
  const checkoutReview = document.querySelector('[data-checkout-review]');
  const addressField = document.querySelector('[data-address-field]');
  const orderTypeField = checkoutForm?.querySelector('[name="orderType"]');

  let checkoutData = null;

  const showCheckoutForm = () => {
    if (checkoutForm) checkoutForm.hidden = false;
    if (checkoutReview) {
      checkoutReview.hidden = true;
      checkoutReview.innerHTML = '';
    }
  };

  const showCheckoutReview = () => {
    if (!checkoutForm || !checkoutReview || !checkoutData) return;

    const typeLabel = checkoutData.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup';

    checkoutReview.innerHTML = `
      <div class="cart-header">
        <div>
          <p class="eyebrow"><span></span> REVIEW ORDER</p>
          <h2>YOUR ORDER</h2>
        </div>
        <button class="cart-close" type="button" data-review-close aria-label="Close review">×</button>
      </div>

      <div class="checkout-form">
        <div class="checkout-order">
          <p>Customer</p>
          <ul>
            <li><span>Name</span><b>${escapeHtml(checkoutData.name)}</b></li>
            <li><span>Phone</span><b>${escapeHtml(checkoutData.phone)}</b></li>
            <li><span>Order Type</span><b>${typeLabel}</b></li>
            ${checkoutData.orderType === 'DELIVERY'
              ? `<li><span>Address</span><b>${escapeHtml(checkoutData.address)}</b></li>`
              : ''}
          </ul>
        </div>

        <div class="checkout-order">
          <p>Order Summary</p>
          <ul>
            ${cart.map(item => `
              <li>
                <span>${escapeHtml(item.name)} × ${Number(item.qty)}</span>
                <b>${money(item.price * item.qty)}</b>
              </li>
            `).join('')}
          </ul>
          <div>
            <span>Total</span>
            <strong>${money(totalPrice())}</strong>
          </div>
        </div>

        <button class="pill pill-yellow" type="button" data-place-order>
          Place Order <span>→</span>
        </button>

        <button class="checkout-back" type="button" data-review-back>
          ← Edit Details
        </button>

        <p class="checkout-status" data-checkout-status></p>
      </div>
    `;

    checkoutForm.hidden = true;
    checkoutReview.hidden = false;
  };

  orderTypeField?.addEventListener('change', () => {
    const delivery = orderTypeField.value === 'DELIVERY';

    if (addressField) {
      addressField.hidden = !delivery;
      addressField.querySelector('textarea')?.toggleAttribute('required', delivery);
    }
  });

  checkoutForm?.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(checkoutForm);
    const orderType = String(formData.get('orderType') || '');
    const address = String(formData.get('address') || '').trim();

    if (orderType === 'DELIVERY' && !address) {
      addressField?.querySelector('textarea')?.focus();
      return;
    }

    checkoutData = {
      name: String(formData.get('name') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      outlet: String(formData.get('outlet') || '').trim(),
      orderType,
      address
    };

    showCheckoutReview();
  });

  document.addEventListener('click', async event => {
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
      addToCart(addButton.dataset.addToCart);
      return;
    }

    const plus = event.target.closest('[data-cart-plus]');
    if (plus) {
      const index = Number(plus.dataset.cartPlus);
      if (!Number.isInteger(index) || !cart[index]) return;
      if (cart[index].qty >= 99) return;
      cart[index].qty += 1;
      save();
      renderCart();
      return;
    }

    const minus = event.target.closest('[data-cart-minus]');
    if (minus) {
      const index = Number(minus.dataset.cartMinus);
      cart[index].qty -= 1;

      if (cart[index].qty <= 0) {
        cart.splice(index, 1);
      }

      save();
      renderCart();
      return;
    }

    if (event.target.closest('[data-checkout-open]')) {
      if (!cart.length) return;
      document.body.classList.add('checkout-open');
      document.querySelector('[data-checkout-panel]')?.setAttribute('aria-hidden', 'false');
      return;
    }

    if (event.target.closest('[data-place-order]')) {
      const status = document.querySelector('[data-checkout-status]');
      const button = event.target.closest('[data-place-order]');

      if (!checkoutData || !cart.length) {
        if (status) status.textContent = 'Please review your order details.';
        return;
      }

      button.disabled = true;
      if (status) status.textContent = 'Placing your order...';

      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: checkoutData.name,
            phone: checkoutData.phone,
            outlet: checkoutData.outlet,
            orderType: checkoutData.orderType,
            address: checkoutData.address,
            items: cart.map(item => ({
              slug: item.slug,
              quantity: Number(item.qty)
            }))
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Unable to place order');
        }

        if (status) {
          status.textContent = `Order #${result.order.order_number} placed successfully!`;
        }

        cart = [];
        save();
        renderCart();
      } catch (error) {
        button.disabled = false;
        if (status) {
          status.textContent = error.message || 'Unable to place order. Please try again.';
        }
      }

      return;
    }

    if (event.target.closest('[data-review-back]')) {
      showCheckoutForm();
      return;
    }

    if (event.target.closest('[data-checkout-close]')) {
      document.body.classList.remove('checkout-open');
      document.querySelector('[data-checkout-panel]')?.setAttribute('aria-hidden', 'true');
      return;
    }

    if (event.target.closest('[data-cart-toggle]')) {
      renderCart();
      openCart();
      return;
    }

    if (event.target.closest('[data-cart-close]') || event.target.closest('[data-cart-backdrop]')) {
      closeCart();
    }
  });

  renderCart();
})();

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
  approach: [["01", "WE OPERATE", "We run our own outlets."], ["02", "WE LEARN", "We understand customers, operations and challenges."], ["03", "WE OPTIMIZE", "We improve products, processes and unit economics."], ["04", "WE PROVE", "We validate the model in the real market."], ["05", "WE SCALE", "We help franchise partners replicate the model."]],
  benefits: [["✦", "BRAND", "Build under a growing QSR brand."], ["◌", "PRODUCT", "A focused menu for mass-market appeal."], ["⌁", "OPERATIONS", "Standardised operational systems."], ["↗", "TRAINING", "Support for franchise partners."], ["◎", "MARKETING", "Central brand and marketing support."], ["+", "GROWTH", "Designed with scalability in mind."]],
  reviews: [["“", "A real customer review will live here — use this space to show the moments that make people come back.", "Customer name • City"], ["✦", "Add genuine reviews, creator content and customer photos as OHHO grows.", "Social proof placeholder"], ["♥", "Real ratings and platform feedback can be connected here later.", "Ratings placeholder"]],
  locations: [{ name: "Shamli", address: "OHHO BURGERS, Taimurshah Delhi Road, Shamli, Uttar Pradesh 247776", hours: "5:00 PM – 1:00 AM", phone: "9650443642", maps: "", zomato: String.fromCharCode(104,116,116,112,115,58,47,47,119,119,119,46,122,111,109,97,116,111,46,99,111,109,47,115,104,97,109,108,105,47,111,104,104,111,45,98,117,114,103,101,114,115,45,115,104,97,109,108,105,45,108,111,99,97,108,105,116,121,47,111,114,100,101,114), swiggy: String.fromCharCode(104,116,116,112,115,58,47,47,119,119,119,46,115,119,105,103,103,121,46,99,105,116,121,47,115,104,97,109,108,105,47,104,111,104,111,45,98,117,114,103,101,114,115,45,107,97,107,97,45,110,97,103,97,114,45,114,101,115,116,49,52,50,49,54,50,50)  }, { name: "Kairana", address: "OHHO BURGERS, besides Nawab Market, Panipat Road, Kairana, Uttar Pradesh 247774", hours: "5:00 PM – 1:00 AM", phone: "9650443642", maps: "", zomato: "", swiggy: "" }]
};

const $ = (selector) => document.querySelector(selector);
const render = (selector, markup) => { const target = $(selector); if (target) target.innerHTML = markup; };
render('#categoryGrid', siteData.categories.map((c, i) => `<article class="category-card reveal delay-${i % 3}"><img loading="lazy" src="${c.image}" alt="${c.name}"/><div class="category-shade"></div><span class="category-icon">${c.icon}</span><div><h3>${c.name}</h3><p>${c.copy}</p><a href="menu.html">Explore <b>→</b></a></div></article>`).join(''));
const isMenuPage = window.location.pathname === '/menu' || window.location.pathname.endsWith('/menu.html') || window.location.pathname.endsWith('menu.html');
const favouriteIndexes = [0, 6, 9, 11];
const visibleProducts = isMenuPage ? siteData.products : favouriteIndexes.map(i => siteData.products[i]);
if (isMenuPage) {
  const menuOrder = ["BURGERS", "PIZZAS", "SANDWICHES", "OHHO SPECIAL BUCKETS", "FRIES", "SIPS & ADDONS"];
  render('.clean-menu', menuOrder.map((category, i) => {
    const items = siteData.products.filter(p => p.category === category);
    return `<section class="menu-category reveal">
      <div class="menu-category-header">
        <span>0${i + 1}</span>
        <h2>${category}</h2>
      </div>
      <div class="menu-list">
        ${items.map(p => `<article class="menu-item" data-menu-id="${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}" data-menu-image="${p.image || ''}">
          <div>
            <h3>${p.name}</h3>
            <p>${p.desc}</p>
          </div>
          <span class="menu-price">${p.price}</span><button class="menu-add" type="button" data-add-to-cart="${p.name}">Add</button>
        </article>`).join('')}
      </div>
    </section>`;
  }).join(''));
} else {
  render('#productGrid', visibleProducts.map((p, i) => `<article class="product-card reveal delay-${i % 3}"><div class="product-image"><img loading="lazy" src="${p.image}" alt="${p.name}"/><span class="food-dot ${p.veg ? 'veg' : 'nonveg'}"></span><button aria-label="Add ${p.name}">+</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.desc}</p></div><b>${p.price}</b></div></article>`).join(''));
}
render('#whyGrid', siteData.why.map(x => `<article class="why-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#timeline', siteData.journey.map((x, i) => `<article class="timeline-item reveal"><span>${x[0]}</span><div class="timeline-dot"></div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#offerCards', siteData.offers.map((x, i) => `<article class="offer-card offer-${i} reveal"><span>LIMITED-TIME</span><h3>${x[0]}</h3><p>${x[1]}</p><b>→</b></article>`).join(''));
render('#approachList', siteData.approach.map((x, i) => `<article><span>${x[0]}</span><div><h3>${x[1]}</h3><p>${x[2]}</p></div>${i < 4 ? '<i>↓</i>' : ''}</article>`).join(''));
render('#benefitGrid', siteData.benefits.map(x => `<article class="benefit-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#reviewGrid', siteData.reviews.map(x => `<article class="review-card reveal"><span>${x[0]}</span><p>${x[1]}</p><small>${x[2]}</small></article>`).join(''));
render('#locationGrid', siteData.locations.map((x, i) => { const maps = ["https:","//","www.google.com/maps/search/?api=1&query="].join("") + encodeURIComponent(x.address); const zomato = x.zomato; const swiggy = x.swiggy; return `<article class="location-card reveal"><span>0${i + 1}</span><h3>${x.name}</h3><p>⌖ ${x.address}</p><p>◷ ${x.hours}</p><div><a href="${maps}" target="_blank" rel="noopener">Maps ↗</a><a href="tel:${x.phone}">Call ↗</a>${zomato ? `<a href="${zomato}" target="_blank" rel="noopener">Zomato ↗</a>` : ""}${swiggy ? `<a href="${swiggy}" target="_blank" rel="noopener">Swiggy ↗</a>` : ""}</div></article>`; }).join(''));

$('.menu-toggle')?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); $('.menu-toggle').setAttribute('aria-expanded', open); });
document.querySelectorAll('.mobile-nav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 30));
const watcher = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); watcher.unobserve(entry.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => watcher.observe(el));
$('#leadForm')?.addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget; form.querySelector('.form-message').textContent = 'Thanks — your interest has been received. Our team will be in touch.'; form.reset(); });
$('#generalForm')?.addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget; form.querySelector('.form-message').textContent = 'Thanks — your message has been received. We’ll get back to you soon.'; form.reset(); });
document.querySelectorAll('.menu-tabs button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.menu-tabs button').forEach(b => b.classList.remove('active')); button.classList.add('active'); }));
document.querySelectorAll('.platform-btn').forEach(btn => btn.addEventListener('click', () => { const link = siteData.ordering[btn.dataset.platform]; if (link) window.open(link, '_blank', 'noopener'); else alert('This ordering link will be added soon.'); }));


/* OHHO_CART_LOGIC */
(() => {
  const cartKey = 'ohho-cart';
  let cart = JSON.parse(localStorage.getItem(cartKey) || '[]')
    .filter(item => item && typeof item.name === 'string' && item.name.trim() && Number.isFinite(Number(item.price)) && Number(item.price) > 0 && Number.isFinite(Number(item.qty)) && Number(item.qty) >= 1)
    .map(item => ({
      name: item.name.trim(),
      price: Number(item.price),
      qty: Math.max(1, Math.floor(Number(item.qty)))
    }));

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
          <h3>${item.name}</h3>
          <p>${money(item.price)} each</p>
        </div>
        <div class="cart-line-actions">
          <div class="quantity-control">
            <button type="button" data-cart-minus="${index}" aria-label="Decrease ${item.name}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-cart-plus="${index}" aria-label="Increase ${item.name}">+</button>
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

  const checkoutForm = document.querySelector('[data-checkout-form]');
  const addressField = document.querySelector('[data-address-field]');
  const orderTypeField = checkoutForm?.querySelector('[name="orderType"]');

  let checkoutData = null;

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
    const orderType = formData.get('orderType');
    const address = String(formData.get('address') || '').trim();

    if (orderType === 'DELIVERY' && !address) {
      addressField?.querySelector('textarea')?.focus();
      return;
    }

    const reviewPanel = document.querySelector('[data-checkout-panel]');
    if (!reviewPanel) return;

    const customerName = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const outlet = String(formData.get('outlet') || '').trim();
    const deliveryAddress = String(formData.get('address') || '').trim();
    const typeLabel = orderType === 'DELIVERY' ? 'Delivery' : 'Pickup';

    checkoutData = {
      name: customerName,
      phone,
      outlet,
      orderType,
      address: deliveryAddress
    };

    reviewPanel.innerHTML = `
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
            <li><span>Name</span><b>${customerName}</b></li>
            <li><span>Phone</span><b>${phone}</b></li>
            <li><span>Order Type</span><b>${typeLabel}</b></li>
            ${orderType === 'DELIVERY' ? `<li><span>Address</span><b>${deliveryAddress}</b></li>` : ''}
          </ul>
        </div>

        <div class="checkout-order">
          <p>Order Summary</p>
          <ul>
            ${cart.map(item => `<li><span>${item.name} × ${Number(item.qty)}</span><b>${money(item.price * item.qty)}</b></li>`).join('')}
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
  });

  document.addEventListener('click', async event => {
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
      addToCart(addButton.dataset.addToCart);
      return;
    }

    const plus = event.target.closest('[data-cart-plus]');
    if (plus) {
      cart[Number(plus.dataset.cartPlus)].qty += 1;
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

    if (event.target.closest('[data-review-back]') ) {
      const panel = document.querySelector('[data-checkout-panel]');
      if (!panel || !checkoutData) return;

      panel.innerHTML = `
        <div class="cart-header">
          <div>
            <p class="eyebrow"><span></span> CHECKOUT</p>
            <h2>YOUR DETAILS</h2>
          </div>
          <button class="cart-close" type="button" data-checkout-close aria-label="Close checkout">×</button>
        </div>
        <form class="checkout-form" data-checkout-form>
          <label>
            Outlet
            <select name="outlet" required>
              <option value="shamli" ${checkoutData.outlet === "shamli" ? "selected" : ""}>Shamli</option>
              <option value="kairana" ${checkoutData.outlet === "kairana" ? "selected" : ""}>Kairana</option>
            </select>
          </label>
          <label>Name<input type="text" name="name" autocomplete="name" value="${checkoutData.name}" required></label>
          <label>Phone<input type="tel" name="phone" autocomplete="tel" value="${checkoutData.phone}" required></label>
          <label>Order Type<select name="orderType" required><option value="PICKUP" ${checkoutData.orderType === "PICKUP" ? "selected" : ""}>Pickup</option><option value="DELIVERY" ${checkoutData.orderType === "DELIVERY" ? "selected" : ""}>Delivery</option></select></label>
          <label data-address-field ${checkoutData.orderType === "DELIVERY" ? "" : "hidden"}>Address<textarea name="address" rows="3" autocomplete="street-address" ${checkoutData.orderType === "DELIVERY" ? "required" : ""}>${checkoutData.address || ""}</textarea></label>
          <button class="pill pill-yellow" type="submit">Review Order <span>→</span></button>
        </form>
      `;

      const form = panel.querySelector('[data-checkout-form]');
      const address = panel.querySelector('[data-address-field]');
      const type = form?.querySelector('[name="orderType"]');
      type?.addEventListener("change", () => {
        const delivery = type.value === "DELIVERY";
        address.hidden = !delivery;
        address.querySelector("textarea")?.toggleAttribute("required", delivery);
      });

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

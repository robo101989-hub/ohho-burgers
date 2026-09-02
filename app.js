const siteData = {
  ordering: { zomato: "", swiggy: "", direct: "" },
  categories: [
    { icon: "🍔", name: "BURGERS", copy: "Juicy. Loaded. Unapologetically good.", image: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍕", name: "PIZZA", copy: "Cheesy slices made for sharing.", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=82" },
    { icon: "🥪", name: "SANDWICHES", copy: "Loaded between two perfect slices.", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍗", name: "CRISPY CHICKEN", copy: "Crunch outside. Juicy inside.", image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=82" }
  ],
  products: [
    { name: "OHHO Classic Burger", desc: "A no-fuss, full-flavour classic.", price: "₹ —", veg: true, image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=700&q=82" },
    { name: "OHHO Cheese Burger", desc: "Melty, cheesy and made for cravings.", price: "₹ —", veg: true, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=82" },
    { name: "Loaded Chicken Burger", desc: "Serious crunch. Serious flavour.", price: "₹ —", veg: false, image: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=700&q=82" },
    { name: "Crispy Chicken Bucket", desc: "Pass the bucket. Or don't.", price: "₹ —", veg: false, image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=700&q=82" }
  ],
  why: [["01", "GOOD FOOD", "Made to taste great."], ["02", "GOOD PRICE", "Everyday food without crazy prices."], ["03", "FRESH", "Quality-focused processes, every day."], ["04", "CONSISTENT", "The same happy bite, every time."], ["05", "PROVEN MODEL", "We operate before we franchise."]],
  journey: [["01", "THE IDEA", "A simple vision: good food at a good price."], ["02", "FIRST OUTLET", "We took the idea to real customers."], ["03", "LEARNING", "Everyday operations taught us what matters."], ["04", "BUILDING THE SYSTEM", "Products, process, supply chain and experience."], ["05", "PROVING THE MODEL", "Operate first. Improve continuously."], ["06", "EXPANSION", "Build with selected partners."]],
  offers: [["OHHO COMBO", "Burger + Fries + Drink"], ["BITE TOGETHER", "Family meal favourites"], ["THE BIG DEAL", "More flavour. Better value."]],
  approach: [["01", "WE OPERATE", "We run our own outlets."], ["02", "WE LEARN", "We understand customers, operations and challenges."], ["03", "WE OPTIMIZE", "We improve products, processes and unit economics."], ["04", "WE PROVE", "We validate the model in the real market."], ["05", "WE SCALE", "We help franchise partners replicate the model."]],
  benefits: [["✦", "BRAND", "Build under a growing QSR brand."], ["◌", "PRODUCT", "A focused menu for mass-market appeal."], ["⌁", "OPERATIONS", "Standardised operational systems."], ["↗", "TRAINING", "Support for franchise partners."], ["◎", "MARKETING", "Central brand and marketing support."], ["+", "GROWTH", "Designed with scalability in mind."]],
  reviews: [["“", "A real customer review will live here — use this space to show the moments that make people come back.", "Customer name • City"], ["✦", "Add genuine reviews, creator content and customer photos as OHHO grows.", "Social proof placeholder"], ["♥", "Real ratings and platform feedback can be connected here later.", "Ratings placeholder"]],
  locations: [{ name: "OHHO outlet", address: "Outlet address coming soon", hours: "Opening hours coming soon" }, { name: "New OHHO location", address: "Your next location could be here", hours: "Details will be added soon" }]
};

const $ = (selector) => document.querySelector(selector);
const render = (selector, markup) => { const target = $(selector); if (target) target.innerHTML = markup; };
render('#categoryGrid', siteData.categories.map((c, i) => `<article class="category-card reveal delay-${i % 3}"><img loading="lazy" src="${c.image}" alt="${c.name}"/><div class="category-shade"></div><span class="category-icon">${c.icon}</span><div><h3>${c.name}</h3><p>${c.copy}</p><a href="#favourites">Explore <b>→</b></a></div></article>`).join(''));
render('#productGrid', siteData.products.map((p, i) => `<article class="product-card reveal delay-${i % 3}"><div class="product-image"><img loading="lazy" src="${p.image}" alt="${p.name}"/><span class="food-dot ${p.veg ? 'veg' : 'nonveg'}"></span><button aria-label="Add ${p.name}">+</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.desc}</p></div><b>${p.price}</b></div></article>`).join(''));
render('#whyGrid', siteData.why.map(x => `<article class="why-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#timeline', siteData.journey.map((x, i) => `<article class="timeline-item reveal"><span>${x[0]}</span><div class="timeline-dot"></div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#offerCards', siteData.offers.map((x, i) => `<article class="offer-card offer-${i} reveal"><span>LIMITED-TIME</span><h3>${x[0]}</h3><p>${x[1]}</p><b>→</b></article>`).join(''));
render('#approachList', siteData.approach.map((x, i) => `<article><span>${x[0]}</span><div><h3>${x[1]}</h3><p>${x[2]}</p></div>${i < 4 ? '<i>↓</i>' : ''}</article>`).join(''));
render('#benefitGrid', siteData.benefits.map(x => `<article class="benefit-card reveal"><span>${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join(''));
render('#reviewGrid', siteData.reviews.map(x => `<article class="review-card reveal"><span>${x[0]}</span><p>${x[1]}</p><small>${x[2]}</small></article>`).join(''));
render('#locationGrid', siteData.locations.map((x, i) => `<article class="location-card reveal"><span>0${i + 1}</span><h3>${x.name}</h3><p>⌖ ${x.address}</p><p>◷ ${x.hours}</p><div><button>Maps ↗</button><a href="tel:">Call ↗</a></div></article>`).join(''));

$('.menu-toggle')?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); $('.menu-toggle').setAttribute('aria-expanded', open); });
document.querySelectorAll('.mobile-nav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 30));
const watcher = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); watcher.unobserve(entry.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => watcher.observe(el));
$('#leadForm')?.addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget; form.querySelector('.form-message').textContent = 'Thanks — your interest has been received. Our team will be in touch.'; form.reset(); });
$('#generalForm')?.addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget; form.querySelector('.form-message').textContent = 'Thanks — your message has been received. We’ll get back to you soon.'; form.reset(); });
document.querySelectorAll('.menu-tabs button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.menu-tabs button').forEach(b => b.classList.remove('active')); button.classList.add('active'); }));
document.querySelectorAll('.platform-btn').forEach(btn => btn.addEventListener('click', () => { const link = siteData.ordering[btn.dataset.platform]; if (link) window.open(link, '_blank', 'noopener'); else alert('This ordering link will be added soon.'); }));

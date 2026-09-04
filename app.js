const siteData = {
  ordering: { zomato: "https://www.zomato.com/shamli/ohho-burgers-shamli-locality/order", swiggy: "https://www.swiggy.com/menu/1421622?source=sharing", direct: "" },
  categories: [
    { icon: "🍔", name: "BURGERS", copy: "Juicy. Loaded. Unapologetically good.", image: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍕", name: "PIZZA", copy: "Cheesy slices made for sharing.", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=82" },
    { icon: "🥪", name: "SANDWICHES", copy: "Loaded between two perfect slices.", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=700&q=82" },
    { icon: "🍗", name: "CRISPY CHICKEN", copy: "Crunch outside. Juicy inside.", image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=82" }
  ],
  products: [
    { category: "BURGERS", name: "Crispy Chicken Burger", desc: "Crispy, juicy and loaded with OHHO flavour.", price: "₹120", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { category: "BURGERS", name: "OHHO Signature Chicken Burger", desc: "Our signature chicken burger with big OHHO flavour.", price: "₹120", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { category: "BURGERS", name: "OHHO Special Chicken Burger", desc: "Our loaded special chicken burger for serious cravings.", price: "₹170", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { category: "PIZZAS", name: "Fire Chicken Pizza", desc: "A fiery chicken pizza made for bold cravings. 🔥", price: "₹89", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "PIZZAS", name: "Veg Supreme Pizza", desc: "Loaded with flavourful veggies and melty cheese.", price: "₹99", veg: true, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "PIZZAS", name: "Classic Chicken Pizza", desc: "Classic chicken, cheese and a satisfying crust.", price: "₹120", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "PIZZAS", name: "OHHO Special Chicken Pizza", desc: "Cheesy, loaded and made for serious cravings.", price: "₹150", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "PIZZAS", name: "Chicken Supreme Pizza", desc: "A loaded supreme pizza for the biggest appetite.", price: "₹250", veg: false, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "SANDWICHES", name: "Classic Chicken Sandwich", desc: "Classic chicken loaded between perfect slices.", price: "₹99", veg: false, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { category: "SANDWICHES", name: "OHHO Special Sandwich", desc: "Loaded between perfect slices with big flavour.", price: "₹120", veg: false, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { category: "OHHO SPECIAL BUCKETS", name: "Crispy Chicken Bucket (Half)", desc: "Crunchy, juicy crispy chicken for sharing.", price: "₹150", veg: false, image: "images/crispy-chicken-bucket.jpeg" },
    { category: "OHHO SPECIAL BUCKETS", name: "Crispy Chicken Bucket (Full)", desc: "A full bucket of crunchy, juicy crispy chicken.", price: "₹250", veg: false, image: "images/crispy-chicken-bucket.jpeg" },
    { category: "FRIES", name: "French Fries", desc: "Crispy golden fries made for every craving.", price: "₹59", veg: true, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { category: "SIPS & ADDONS", name: "Cold Coffee", desc: "A chilled, creamy coffee to go with your meal.", price: "₹80", veg: true, image: "images/ohho-special-chicken-sandwich.jpeg" },
    { category: "SIPS & ADDONS", name: "Extra Patty", desc: "Add an extra patty to make it bigger.", price: "₹70", veg: false, image: "images/crispy-chicken-burger.jpeg" },
    { category: "SIPS & ADDONS", name: "Extra Cheese", desc: "Make it extra cheesy.", price: "₹30", veg: true, image: "images/ohho-special-chicken-pizza.jpeg" },
    { category: "SIPS & ADDONS", name: "Extra Dips", desc: "Add extra dips for more flavour.", price: "₹10", veg: true, image: "images/crispy-chicken-bucket.jpeg" }
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
render('#productGrid', visibleProducts.map((p, i) => `<article class="product-card reveal delay-${i % 3}"><div class="product-image"><img loading="lazy" src="${p.image}" alt="${p.name}"/><span class="food-dot ${p.veg ? 'veg' : 'nonveg'}"></span><button aria-label="Add ${p.name}">+</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.desc}</p></div><b>${p.price}</b></div></article>`).join(''));
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

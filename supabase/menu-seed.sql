insert into menu_categories (name, slug, display_order)
values
  ('BURGERS', 'burgers', 1),
  ('PIZZAS', 'pizzas', 2),
  ('SANDWICHES', 'sandwiches', 3),
  ('OHHO SPECIAL BUCKETS', 'ohho-special-buckets', 4),
  ('FRIES', 'fries', 5),
  ('SIPS & ADDONS', 'sips-addons', 6)
on conflict (slug) do nothing;

insert into menu_items (category_id, name, slug, description, price, is_veg, is_available, display_order)
select c.id, v.name, v.slug, v.description, v.price, v.is_veg, true, v.display_order
from menu_categories c
join (
  values
    ('BURGERS', 'Crispy Chicken Burger', 'crispy-chicken-burger', 'Crispy, juicy and loaded with OHHO flavour.', 120, false, 1),
    ('BURGERS', 'OHHO Signature Chicken Burger', 'ohho-signature-chicken-burger', 'Our signature chicken burger with big OHHO flavour.', 120, false, 2),
    ('BURGERS', 'OHHO Special Chicken Burger', 'ohho-special-chicken-burger', 'Our loaded special chicken burger for serious cravings.', 170, false, 3),
    ('PIZZAS', 'Fire Chicken Pizza', 'fire-chicken-pizza', 'A fiery chicken pizza made for bold cravings. 🔥', 89, false, 1),
    ('PIZZAS', 'Veg Supreme Pizza', 'veg-supreme-pizza', 'Loaded with flavourful veggies and melty cheese.', 99, true, 2),
    ('PIZZAS', 'Classic Chicken Pizza', 'classic-chicken-pizza', 'Classic chicken, cheese and a satisfying crust.', 120, false, 3),
    ('PIZZAS', 'OHHO Special Chicken Pizza', 'ohho-special-chicken-pizza', 'Cheesy, loaded and made for serious cravings.', 150, false, 4),
    ('PIZZAS', 'Chicken Supreme Pizza', 'chicken-supreme-pizza', 'A loaded supreme pizza for the biggest appetite.', 250, false, 5),
    ('SANDWICHES', 'Classic Chicken Sandwich', 'classic-chicken-sandwich', 'Classic chicken loaded between perfect slices.', 99, false, 1),
    ('SANDWICHES', 'OHHO Special Sandwich', 'ohho-special-sandwich', 'Loaded between perfect slices with big flavour.', 120, false, 2),
    ('OHHO SPECIAL BUCKETS', 'Crispy Chicken Bucket (Half)', 'crispy-chicken-bucket-half', 'Crunchy, juicy crispy chicken for sharing.', 150, false, 1),
    ('OHHO SPECIAL BUCKETS', 'Crispy Chicken Bucket (Full)', 'crispy-chicken-bucket-full', 'A full bucket of crunchy, juicy crispy chicken.', 250, false, 2),
    ('FRIES', 'French Fries', 'french-fries', 'Crispy golden fries made for every craving.', 59, true, 1),
    ('SIPS & ADDONS', 'Cold Coffee', 'cold-coffee', 'A chilled, creamy coffee to go with your meal.', 80, true, 1),
    ('SIPS & ADDONS', 'Extra Patty', 'extra-patty', 'Add an extra patty to make it bigger.', 70, false, 2),
    ('SIPS & ADDONS', 'Extra Cheese', 'extra-cheese', 'Make it extra cheesy.', 30, true, 3),
    ('SIPS & ADDONS', 'Extra Dips', 'extra-dips', 'Add extra dips for more flavour.', 10, true, 4)
) as v(category_name, name, slug, description, price, is_veg, display_order)
on v.category_name = c.name
on conflict (slug) do nothing;

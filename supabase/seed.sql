-- DEVELOPMENT seed data only. Never run against production. Contains no real customer data.
insert into public.categories (id, slug, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000a1', 'fruits-vegetables', 'Fruits & Vegetables', 1),
  ('00000000-0000-0000-0000-0000000000a2', 'dairy-eggs',        'Dairy & Eggs',        2),
  ('00000000-0000-0000-0000-0000000000a3', 'snacks',            'Snacks',              3)
on conflict (id) do nothing;

insert into public.products (sku, category_id, name, brand, unit_label, price_paise, mrp_paise, stock_quantity) values
  ('FV-BAN-6',  '00000000-0000-0000-0000-0000000000a1', 'Bananas',        null,      '6 pcs',  4500,  5000, 100),
  ('FV-TOM-500','00000000-0000-0000-0000-0000000000a1', 'Tomatoes',       null,      '500 g',  3000,  3500,  80),
  ('DE-MLK-1L', '00000000-0000-0000-0000-0000000000a2', 'Toned Milk',     'FarmFresh','1 L',   6800,  6800, 150),
  ('DE-EGG-12', '00000000-0000-0000-0000-0000000000a2', 'Eggs',           'FarmFresh','12 pcs',9500, 10500,  60),
  ('SN-CHP-150','00000000-0000-0000-0000-0000000000a3', 'Potato Chips',   'Crunchy', '150 g',  3000,  3500, 200)
on conflict (sku) do nothing;

insert into public.serviceable_pincodes (pincode, area_name, city, delivery_fee_paise, min_order_paise) values
  ('560001', 'MG Road',     'Bengaluru', 2500, 9900),
  ('400001', 'Fort',        'Mumbai',    2500, 9900),
  ('110001', 'Connaught Pl','New Delhi', 2500, 9900)
on conflict (pincode) do nothing;

insert into public.coupons (code, discount_type, discount_value, max_discount_paise, min_order_paise, per_user_limit)
values ('WELCOME50', 'flat', 5000, null, 29900, 1)
on conflict (code) do nothing;

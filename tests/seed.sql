-- Two customers, one owner, two walkers. Times as the old form saved them (text).
insert into public.walkers (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Priya'),
  ('b0000000-0000-0000-0000-00000000000b', 'Tom');
insert into public.walk_types (id, label, price_pence) values
  ('solo-30', 'Solo walk, 30 min', 1400), ('solo-60', 'Solo walk, 60 min', 2200), ('group-60', 'Group walk, 60 min, up to 4 dogs', 1500);
insert into public.customers (id, user_id, full_name, phone, address, dog_name) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Carter', '07700 900101', '14 Mill Lane, Kettleby', 'Biscuit'),
  ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Ben Hughes', '07700 900202', '3 Church Row, Kettleby', 'Juno');
insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-00000000000a', 'solo-60', '2026-10-03 10:00', 2200),
  ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-00000000000a', 'solo-30', '2026-10-03 9:00', 1400);

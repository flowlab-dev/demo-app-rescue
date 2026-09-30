-- Walkwren: fixes from the review. Runs on top of 0001_init.sql and the live data.
-- Each block names the finding it closes (F1…F10, see report/).
-- One transaction: if the pre-flight check finds data it cannot convert safely, nothing changes.

begin;

-- Pre-flight. Slots were free text, and nothing stopped double bookings, so real data may hold
-- both. Rather than guess, stop and list the rows for the owner to sort out first.
do $$
declare
  bad text;
  clash text;
  r record;
begin
  -- Every slot must look like a date and time and really convert ('2026-02-30 10:00' looks right but isn't).
  for r in select id, slot from public.bookings loop
    begin
      if r.slot !~ '^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$' or split_part(split_part(r.slot, ' ', 2), ':', 1)::int > 23 then
        raise exception 'format';
      end if;
      perform r.slot::timestamp;
    exception when others then
      bad := concat_ws(', ', bad, r.id::text || ' (' || r.slot || ')');
    end;
  end loop;
  if bad is not null then
    raise exception 'Migration stopped, nothing changed. Slots that are not a date and time: %', bad;
  end if;
  select string_agg(id::text, ', ') into bad from public.bookings
    where walker_id is null or walk_type is null or status is null
       or status not in ('booked', 'cancelled', 'done')
       or walk_type not in (select id from public.walk_types);
  if bad is not null then
    raise exception 'Migration stopped, nothing changed. Bookings with a missing or unknown walker, walk type or status: %', bad;
  end if;
  with b as (select id, walker_id, walk_type, slot::timestamp s,
                    slot::timestamp + case walk_type when 'solo-30' then interval '30 min' else interval '60 min' end e
             from public.bookings where status <> 'cancelled')
  select string_agg(x.id::text || ' and ' || y.id::text, ', ') into clash
    from b x join b y on x.walker_id = y.walker_id and x.id < y.id
   where tsrange(x.s, x.e) && tsrange(y.s, y.e)
     and not (x.walk_type = 'group-60' and y.walk_type = 'group-60' and x.s = y.s);
  if clash is null then
    select string_agg(walker_id::text || ' at ' || s, ', ') into clash from (
      select walker_id, slot::timestamp s from public.bookings
       where walk_type = 'group-60' and status <> 'cancelled' group by 1, 2 having count(*) > 4) g;
  end if;
  if clash is not null then
    raise exception 'Migration stopped, nothing changed. Walkers booked twice at the same time: %', clash;
  end if;
  select string_agg(user_id::text, ', ') into bad from (
    select user_id from public.customers group by user_id having count(*) > 1) d;
  if bad is not null then
    raise exception 'Migration stopped, nothing changed. Users with more than one customer record: %', bad;
  end if;
end $$;

-- Rules the old app never had, now that the data is known to follow them.
alter table public.bookings
  alter column status set not null,
  alter column walk_type set not null,
  alter column walker_id set not null,
  add constraint bookings_status_ok check (status in ('booked', 'cancelled', 'done'));

-- F1. Customer records were readable and editable by anyone holding the public (anon) key.
revoke all on public.customers from anon, authenticated;
grant select, insert, update on public.customers to authenticated;
alter table public.customers enable row level security;
alter table public.customers add constraint customers_one_per_user unique (user_id);
create policy "customer reads own record" on public.customers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "customer creates own record" on public.customers
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "customer edits own record" on public.customers
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- F10. The price list and the walkers had no row level security: anyone could change prices,
--      add walkers or switch them all off. Now everyone can read them; only the server can change them.
alter table public.walk_types enable row level security;
alter table public.walkers enable row level security;
revoke all on public.walk_types, public.walkers from anon, authenticated;
grant select on public.walk_types, public.walkers to anon, authenticated;
create policy "everyone reads the price list" on public.walk_types for select to anon, authenticated using (true);
create policy "everyone reads walkers" on public.walkers for select to anon, authenticated using (true);
alter table public.walk_types add column duration_min integer not null default 60;
alter table public.walk_types add column max_dogs integer not null default 1;
update public.walk_types set duration_min = 30 where id = 'solo-30';
update public.walk_types set max_dogs = 4 where id = 'group-60';

-- F4. «Admin» was read from user_metadata, which every user can change about themselves.
--     app_metadata can only be set with the service key, on the server.
create or replace function public.is_admin() returns boolean
  language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
$$;
drop policy "admin sees all bookings" on public.bookings;
create policy "admin sees all bookings" on public.bookings
  for select to authenticated using ((select public.is_admin()));
create policy "admin sees all customers" on public.customers
  for select to authenticated using ((select public.is_admin()));

-- F5. Any customer could change any column of their own bookings (the price too), and with F4 other
--     people's. Now: the only change from the browser is the status — a customer may cancel their own
--     booking, the owner may set any status on any booking. Other edits go through the Supabase dashboard.
drop policy "customers update bookings" on public.bookings;
revoke all on public.bookings from anon, authenticated;
grant select, update (status) on public.bookings to authenticated;
create policy "customer cancels own booking" on public.bookings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'cancelled');
create policy "owner sets any status" on public.bookings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- F7. Slots were free text ('2026-10-03 9:00'): sorted as text, no time zone.
alter table public.bookings
  alter column slot type timestamptz using (slot::timestamp at time zone 'Europe/London');

-- F3 + F6. Bookings are created only through book_walk(): the price comes from walk_types, the slot
--          must be a whole quarter hour in the future, and a walker is never double-booked — a solo walk
--          may not overlap anything, a group walk takes up to max_dogs at the same start time.
drop policy "customers create bookings" on public.bookings;

create or replace function public.book_walk(p_walker uuid, p_walk_type text, p_slot timestamptz)
  returns public.bookings
  language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  v_type public.walk_types;
  v_end timestamptz;
  v_row public.bookings;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in to book' using errcode = '28000';
  end if;
  select id into v_customer from public.customers where user_id = (select auth.uid());
  if v_customer is null then
    raise exception 'add your details before booking' using errcode = 'P0002';
  end if;
  select * into v_type from public.walk_types where id = p_walk_type;
  if v_type.id is null then
    raise exception 'unknown walk type' using errcode = '22023';
  end if;
  if p_slot is null or not isfinite(p_slot) or p_slot > now() + interval '1 year' or p_slot <= now() or p_slot <> date_trunc('minute', p_slot)
     or extract(minute from p_slot at time zone 'Europe/London')::int % 15 <> 0 then
    raise exception 'pick a future slot on the quarter hour' using errcode = '22023';
  end if;
  if not exists (select 1 from public.walkers where id = p_walker and active) then
    raise exception 'walker not available' using errcode = '22023';
  end if;
  -- Sign-up is open and booking is free, so one account could otherwise fill every slot for a year.
  if (select count(*) from public.bookings where user_id = (select auth.uid())
      and status = 'booked' and slot > now()) >= 10 then
    raise exception 'you already have 10 walks booked; please wait until one has happened' using errcode = '22023';
  end if;
  v_end := p_slot + make_interval(mins => v_type.duration_min);

  -- One booking at a time per walker, so two people pressing «Book» together can't both win.
  perform pg_advisory_xact_lock(hashtextextended(p_walker::text, 0));
  if exists (
    select 1 from public.bookings b join public.walk_types t on t.id = b.walk_type
    where b.walker_id = p_walker and b.status <> 'cancelled'
      and tstzrange(b.slot, b.slot + make_interval(mins => t.duration_min)) && tstzrange(p_slot, v_end)
      and not (v_type.max_dogs > 1 and b.walk_type = p_walk_type and b.slot = p_slot)
  ) or (
    v_type.max_dogs > 1 and (select count(*) from public.bookings
      where walker_id = p_walker and slot = p_slot and walk_type = p_walk_type and status <> 'cancelled') >= v_type.max_dogs
  ) then
    raise exception 'that slot has just been taken' using errcode = '23505';
  end if;

  insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence)
    values (v_customer, (select auth.uid()), p_walker, p_walk_type, p_slot, v_type.price_pence)
    returning * into v_row;
  return v_row;
end $$;

-- F3/F5 may already have been used. This list is for the owner (server and dashboard only):
-- bookings whose price differs from the price list, or filed under someone else's customer record.
create view public.bookings_to_review with (security_invoker = true) as
  select b.id, b.slot, b.price_pence, t.price_pence as list_price_pence, c.full_name,
         case when c.user_id <> b.user_id then 'booked under someone else''s record'
              else 'price differs from the price list' end as reason
  from public.bookings b
  join public.walk_types t on t.id = b.walk_type
  join public.customers c on c.id = b.customer_id
  where b.price_pence <> t.price_pence or c.user_id <> b.user_id;
revoke all on public.bookings_to_review from anon, authenticated;

revoke all on function public.book_walk(uuid, text, timestamptz) from public, anon;
grant execute on function public.book_walk(uuid, text, timestamptz) to authenticated;

commit;

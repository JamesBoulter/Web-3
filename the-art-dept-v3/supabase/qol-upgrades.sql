-- The Art Dept V3 QOL upgrades
-- Run this once in Supabase SQL Editor after the original schema.sql.
-- It is safe for existing data. It adds fields/tables instead of recreating tables.

alter table public.artist_profiles
  add column if not exists profile_image_url text,
  add column if not exists banner_image_url text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists turnaround text default '';

alter table public.commission_requests
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists declined_reason text,
  add column if not exists declined_at timestamptz;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade unique,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  artist_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  details text default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_artist_idx on public.reviews(artist_id);
create index if not exists reviews_customer_idx on public.reviews(customer_id);
create index if not exists reports_status_idx on public.reports(status);
create index if not exists support_status_idx on public.support_tickets(status);

drop trigger if exists reviews_touch_updated_at on public.reviews;
create trigger reviews_touch_updated_at
before update on public.reviews
for each row execute procedure public.touch_updated_at();

drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at
before update on public.reports
for each row execute procedure public.touch_updated_at();

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
before update on public.support_tickets
for each row execute procedure public.touch_updated_at();

alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.support_tickets enable row level security;

create or replace function public.can_review_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_artist_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.orders
    where id = p_order_id
      and customer_id = p_customer_id
      and artist_id = p_artist_id
      and status in ('paid'::public.order_status, 'fulfilled'::public.order_status)
  );
$$;

drop policy if exists "public can read reviews" on public.reviews;
create policy "public can read reviews"
on public.reviews for select
using (true);

drop policy if exists "customers can review paid orders" on public.reviews;
create policy "customers can review paid orders"
on public.reviews for insert
with check (
  customer_id = auth.uid()
  and public.can_review_order(order_id, customer_id, artist_id)
);

drop policy if exists "customers update own reviews" on public.reviews;
create policy "customers update own reviews"
on public.reviews for update
using (customer_id = auth.uid() or public.is_admin())
with check (customer_id = auth.uid() or public.is_admin());

drop policy if exists "anyone can submit reports" on public.reports;
create policy "anyone can submit reports"
on public.reports for insert
with check (true);

drop policy if exists "reporters and admins can view reports" on public.reports;
create policy "reporters and admins can view reports"
on public.reports for select
using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "admins can manage reports" on public.reports;
create policy "admins can manage reports"
on public.reports for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "anyone can submit support tickets" on public.support_tickets;
create policy "anyone can submit support tickets"
on public.support_tickets for insert
with check (true);

drop policy if exists "ticket owners and admins can view support tickets" on public.support_tickets;
create policy "ticket owners and admins can view support tickets"
on public.support_tickets for select
using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "admins can manage support tickets" on public.support_tickets;
create policy "admins can manage support tickets"
on public.support_tickets for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "artists and admins can update commission requests" on public.commission_requests;
create policy "artists and admins can update commission requests"
on public.commission_requests for update
using (artist_id = auth.uid() or public.is_admin())
with check (true);

drop policy if exists "artists and admins can update orders" on public.orders;
create policy "artists and admins can update orders"
on public.orders for update
using (artist_id = auth.uid() or public.is_admin())
with check (artist_id = auth.uid() or public.is_admin());

-- The Art Department V3 commission workflow upgrade
-- Run this once in Supabase SQL Editor after the earlier V3 SQL files.
-- It is safe for existing data and only adds columns/indexes.

alter table public.commission_requests
  add column if not exists quoted_cents integer not null default 0,
  add column if not exists payment_status text not null default 'not_requested',
  add column if not exists draft_url text,
  add column if not exists draft_note text default '',
  add column if not exists draft_uploaded_at timestamptz;

alter table public.orders
  add column if not exists commission_request_id uuid references public.commission_requests(id) on delete set null;

alter table public.commission_requests
  add column if not exists payment_order_id uuid references public.orders(id) on delete set null;

create index if not exists orders_commission_request_idx on public.orders(commission_request_id);
create index if not exists commission_payment_status_idx on public.commission_requests(payment_status);

drop policy if exists "artists and admins can update commission requests" on public.commission_requests;
create policy "artists and admins can update commission requests"
on public.commission_requests for update
using (artist_id = auth.uid() or public.is_admin())
with check (true);

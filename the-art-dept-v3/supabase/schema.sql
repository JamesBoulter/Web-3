-- The Art Department V3 Supabase schema
-- Run this in Supabase SQL Editor after creating a new Supabase project.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('customer', 'artist', 'admin');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum ('active', 'paused', 'sold_out', 'removed');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('pending', 'paid', 'fulfilled', 'refunded', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum ('new', 'quoted', 'accepted', 'declined', 'completed');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role public.app_role not null default 'customer',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  handle text unique,
  bio text default '',
  categories text[] not null default '{}',
  portfolio_summary text default '',
  starting_price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_payout_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text,
  stripe_details_submitted boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  stripe_charges_enabled boolean not null default false,
  onboarding_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text default '',
  media_url text not null,
  tags text[] not null default '{}',
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  listing_type text not null,
  format text not null,
  price_cents integer not null check (price_cents >= 100),
  currency text not null default 'usd',
  image_url text not null,
  preview_image_url text,
  original_file_path text,
  is_protected boolean not null default false,
  watermark_version text,
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  artist_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  name text not null,
  email text not null,
  title text not null,
  brief text not null,
  budget_cents integer not null default 0,
  status public.request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  artist_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  platform_fee_cents integer not null,
  currency text not null default 'usd',
  status public.order_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists listings_artist_idx on public.listings(artist_id);
create index if not exists listings_status_idx on public.listings(status);
create index if not exists portfolio_artist_sort_idx on public.portfolio_items(artist_id, is_featured desc, sort_order asc, created_at desc);
create index if not exists orders_artist_idx on public.orders(artist_id);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists commission_artist_idx on public.commission_requests(artist_id);
create index if not exists commission_customer_idx on public.commission_requests(customer_id);

create or replace function public.current_app_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_unsafe_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change account roles.';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  safe_role public.app_role;
  display text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'customer');

  if requested_role = 'artist' then
    safe_role := 'artist'::public.app_role;
  else
    safe_role := 'customer'::public.app_role;
  end if;

  display := coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'Member');

  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, display, safe_role)
  on conflict (id) do nothing;

  if safe_role = 'artist'::public.app_role then
    insert into public.artist_profiles (user_id, handle)
    values (new.id, lower(regexp_replace(display, '[^a-zA-Z0-9]+', '-', 'g')))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

drop trigger if exists artist_profiles_touch_updated_at on public.artist_profiles;
create trigger artist_profiles_touch_updated_at
before update on public.artist_profiles
for each row execute procedure public.touch_updated_at();

drop trigger if exists artist_payout_accounts_touch_updated_at on public.artist_payout_accounts;
create trigger artist_payout_accounts_touch_updated_at
before update on public.artist_payout_accounts
for each row execute procedure public.touch_updated_at();

drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at
before update on public.listings
for each row execute procedure public.touch_updated_at();

drop trigger if exists commission_requests_touch_updated_at on public.commission_requests;
create trigger commission_requests_touch_updated_at
before update on public.commission_requests
for each row execute procedure public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute procedure public.touch_updated_at();

drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change
before update on public.profiles
for each row execute procedure public.prevent_unsafe_profile_role_change();

alter table public.profiles enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.artist_payout_accounts enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.listings enable row level security;
alter table public.commission_requests enable row level security;
alter table public.orders enable row level security;

drop policy if exists "public can view artist profiles" on public.profiles;
create policy "public can view artist profiles"
on public.profiles for select
using (role = 'artist'::public.app_role or id = auth.uid() or public.is_admin());

drop policy if exists "members can insert own profile" on public.profiles;
create policy "members can insert own profile"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "members can update own profile" on public.profiles;
create policy "members can update own profile"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "public can view artist profile details" on public.artist_profiles;
create policy "public can view artist profile details"
on public.artist_profiles for select
using (true);

drop policy if exists "artists manage own artist profile" on public.artist_profiles;
create policy "artists manage own artist profile"
on public.artist_profiles for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "artists and admins can view payout accounts" on public.artist_payout_accounts;
create policy "artists and admins can view payout accounts"
on public.artist_payout_accounts for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "artists and admins can manage payout accounts" on public.artist_payout_accounts;
create policy "artists and admins can manage payout accounts"
on public.artist_payout_accounts for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "public can view portfolio" on public.portfolio_items;
create policy "public can view portfolio"
on public.portfolio_items for select
using (true);

drop policy if exists "artists manage own portfolio" on public.portfolio_items;
create policy "artists manage own portfolio"
on public.portfolio_items for all
using (artist_id = auth.uid() or public.is_admin())
with check (artist_id = auth.uid() or public.is_admin());

drop policy if exists "public can view active listings" on public.listings;
create policy "public can view active listings"
on public.listings for select
using (status = 'active'::public.listing_status or artist_id = auth.uid() or public.is_admin());

drop policy if exists "artists manage own listings" on public.listings;
create policy "artists manage own listings"
on public.listings for all
using (artist_id = auth.uid() or public.is_admin())
with check (artist_id = auth.uid() or public.is_admin());

drop policy if exists "anyone can submit commission requests" on public.commission_requests;
create policy "anyone can submit commission requests"
on public.commission_requests for insert
with check (true);

drop policy if exists "owners can view commission requests" on public.commission_requests;
create policy "owners can view commission requests"
on public.commission_requests for select
using (
  customer_id = auth.uid()
  or artist_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "artists and admins can update commission requests" on public.commission_requests;
create policy "artists and admins can update commission requests"
on public.commission_requests for update
using (artist_id = auth.uid() or public.is_admin())
with check (artist_id = auth.uid() or public.is_admin());

drop policy if exists "owners can view orders" on public.orders;
create policy "owners can view orders"
on public.orders for select
using (
  customer_id = auth.uid()
  or artist_id = auth.uid()
  or public.is_admin()
);

-- Orders are inserted and updated by Netlify Functions with SUPABASE_SERVICE_ROLE_KEY.

insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('listing-originals', 'listing-originals', false)
on conflict (id) do update set public = false;

drop policy if exists "public can read portfolio media" on storage.objects;
create policy "public can read portfolio media"
on storage.objects for select
using (bucket_id = 'portfolio-media');

drop policy if exists "artists can upload own portfolio media" on storage.objects;
create policy "artists can upload own portfolio media"
on storage.objects for insert
with check (
  bucket_id = 'portfolio-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "artists can update own portfolio media" on storage.objects;
create policy "artists can update own portfolio media"
on storage.objects for update
using (
  bucket_id = 'portfolio-media'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
)
with check (
  bucket_id = 'portfolio-media'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
);

drop policy if exists "artists can delete own portfolio media" on storage.objects;
create policy "artists can delete own portfolio media"
on storage.objects for delete
using (
  bucket_id = 'portfolio-media'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
);

drop policy if exists "artists can upload own listing originals" on storage.objects;
create policy "artists can upload own listing originals"
on storage.objects for insert
with check (
  bucket_id = 'listing-originals'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "artists can read own listing originals" on storage.objects;
create policy "artists can read own listing originals"
on storage.objects for select
using (
  bucket_id = 'listing-originals'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
);

drop policy if exists "artists can update own listing originals" on storage.objects;
create policy "artists can update own listing originals"
on storage.objects for update
using (
  bucket_id = 'listing-originals'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
)
with check (
  bucket_id = 'listing-originals'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
);

drop policy if exists "artists can delete own listing originals" on storage.objects;
create policy "artists can delete own listing originals"
on storage.objects for delete
using (
  bucket_id = 'listing-originals'
  and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
);

-- Make yourself admin after your account exists:
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';

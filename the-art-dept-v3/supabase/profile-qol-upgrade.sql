-- The Art Department profile and portfolio QOL upgrade
-- Run this once in Supabase SQL Editor after the earlier V3 upgrades.
-- It is safe for existing data.

alter table public.portfolio_items
  add column if not exists tags text[] not null default '{}',
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0;

update public.portfolio_items
set sort_order = extract(epoch from created_at)::integer
where sort_order = 0;

create index if not exists portfolio_artist_sort_idx
on public.portfolio_items(artist_id, is_featured desc, sort_order asc, created_at desc);

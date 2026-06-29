-- The Art Department protected originals + watermarked previews upgrade
-- Run this once in Supabase SQL Editor after schema.sql and qol-upgrades.sql.
-- It is safe for existing data.

alter table public.listings
  add column if not exists preview_image_url text,
  add column if not exists original_file_path text,
  add column if not exists is_protected boolean not null default false,
  add column if not exists watermark_version text;

update public.listings
set preview_image_url = coalesce(preview_image_url, image_url),
    is_protected = coalesce(is_protected, false)
where preview_image_url is null;

insert into storage.buckets (id, name, public)
values ('listing-originals', 'listing-originals', false)
on conflict (id) do update set public = false;

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

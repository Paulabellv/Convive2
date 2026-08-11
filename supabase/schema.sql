-- Run this in the Supabase SQL Editor before enabling the web app connection.
create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  description text,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.archives enable row level security;

-- The archive is shared publicly for now. Replace these with authenticated-user
-- policies before publishing a private archive.
drop policy if exists "Public archive read" on public.archives;
drop policy if exists "Public archive insert" on public.archives;
drop policy if exists "Public archive update" on public.archives;
drop policy if exists "Public archive delete" on public.archives;
create policy "Public archive read" on public.archives for select using (true);
create policy "Public archive insert" on public.archives for insert with check (true);
create policy "Public archive update" on public.archives for update using (true) with check (true);
create policy "Public archive delete" on public.archives for delete using (true);

insert into storage.buckets (id, name, public)
values ('archives', 'archives', true)
on conflict (id) do nothing;

drop policy if exists "Public archive file read" on storage.objects;
drop policy if exists "Public archive file upload" on storage.objects;
drop policy if exists "Public archive file update" on storage.objects;
drop policy if exists "Public archive file delete" on storage.objects;
create policy "Public archive file read" on storage.objects for select using (bucket_id = 'archives');
create policy "Public archive file upload" on storage.objects for insert with check (bucket_id = 'archives');
create policy "Public archive file update" on storage.objects for update using (bucket_id = 'archives') with check (bucket_id = 'archives');
create policy "Public archive file delete" on storage.objects for delete using (bucket_id = 'archives');

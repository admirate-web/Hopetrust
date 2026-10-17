-- Run this in Supabase Dashboard > SQL Editor
-- Creates tables for Contact and Join Us form submissions

-- 1. Contact Submissions
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text not null,
  message text not null,
  created_at timestamptz default now()
);

-- 2. Join Us Applications
create table if not exists joinus_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  position text not null,
  cv_link text not null,
  introduction text not null,
  created_at timestamptz default now()
);

-- 3. Enable Row Level Security
alter table contact_submissions enable row level security;
alter table joinus_applications enable row level security;

-- 4. Allow anonymous inserts (public form submissions)
create policy "Allow anonymous inserts" on contact_submissions
  for insert to anon with check (true);

create policy "Allow anonymous inserts" on joinus_applications
  for insert to anon with check (true);

-- No SELECT/UPDATE/DELETE policies for anon = data only accessible via dashboard or service key

-- Newsletter subscribers: see Database/newsletter.sql. Don't recreate the old
-- table or its public insert policy here.

-- 5. Storage bucket for CV / portfolio uploads (create in Dashboard > Storage)
-- Bucket name: cv-uploads
-- Make it PUBLIC so the uploaded file URLs are accessible
insert into storage.buckets (id, name, public)
  values ('cv-uploads', 'cv-uploads', true)
  on conflict (id) do nothing;

-- Allow anonymous uploads to the cv-uploads bucket
create policy "Allow anonymous uploads" on storage.objects
  for insert to anon with check (bucket_id = 'cv-uploads');

-- Allow public reads from cv-uploads
create policy "Allow public reads" on storage.objects
  for select to anon using (bucket_id = 'cv-uploads');

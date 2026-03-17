-- Quick fix for "new row violates row-level security policy" error
-- Run this in your Supabase SQL Editor

-- Drop existing policies if they exist (to avoid conflicts)
drop policy if exists "Allow public insert on documents" on documents;
drop policy if exists "Allow public select on documents" on documents;
drop policy if exists "Allow public insert on images" on images;
drop policy if exists "Allow public select on images" on images;

-- Enable RLS on documents table
alter table documents enable row level security;

-- Create policies for documents table
create policy "Allow public insert on documents"
  on documents for insert
  to anon, authenticated
  with check (true);

create policy "Allow public select on documents"
  on documents for select
  to anon, authenticated
  using (true);

-- Enable RLS on images table
alter table images enable row level security;

-- Create policies for images table
create policy "Allow public insert on images"
  on images for insert
  to anon, authenticated
  with check (true);

create policy "Allow public select on images"
  on images for select
  to anon, authenticated
  using (true);

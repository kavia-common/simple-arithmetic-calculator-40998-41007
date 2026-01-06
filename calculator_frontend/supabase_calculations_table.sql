-- Create the `calculations` table in Supabase.
-- Run this in the Supabase Dashboard -> SQL Editor.
-- Note: `gen_random_uuid()` requires the `pgcrypto` extension (enabled by default on Supabase).

create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  a float8,
  b float8,
  operator text,
  result float8,
  created_at timestamptz default now(),
  session_id text
);

-- Optional but recommended (commented out): enable Row Level Security and allow inserts.
-- You may want different policies depending on your app requirements.
-- alter table public.calculations enable row level security;
-- create policy "allow anon insert"
--   on public.calculations
--   for insert
--   to anon
--   with check (true);

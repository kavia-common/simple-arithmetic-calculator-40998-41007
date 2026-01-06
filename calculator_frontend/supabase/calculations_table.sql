-- Create the calculations table used by the React frontend for logging calculator operations.
-- Run this in the Supabase SQL editor.

-- Enable ONE of these extensions for UUID generation:
-- Preferred (pgcrypto):
create extension if not exists pgcrypto;

-- Alternative (uuid-ossp) if you prefer uuid_generate_v4():
-- create extension if not exists "uuid-ossp";

create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  -- If using uuid-ossp instead, use:
  -- id uuid primary key default uuid_generate_v4(),

  a numeric not null,
  b numeric not null,
  operator text not null,
  result numeric not null,

  created_at timestamptz not null default now(),
  session_id text not null
);

-- Helpful indexes for common querying patterns:
create index if not exists calculations_created_at_idx on public.calculations (created_at desc);
create index if not exists calculations_session_id_idx on public.calculations (session_id);

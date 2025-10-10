-- Enable uuid and crypto extensions if not already enabled (for gen_random_uuid())
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =========================================================================
-- 1. submissions: stores each corpus listing submitted by a user
--    Note: user_id references auth.users so that deleting a user cleans up their data:contentReference[oaicite:1]{index=1}.
-- =========================================================================
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,             -- item name/title
  description     text not null,
  style           text not null,
  category        text not null,
  price           numeric(10,2) not null check (price >= 0),
  image_path      text not null,             -- path in Supabase Storage
  corpus_path     text not null,
  second_path     text not null,
  limited         boolean not null default false,
  edition_quantity integer,                  -- total copies if limited edition (null if unlimited)
  approved        boolean not null default false,
  created_at      timestamptz not null default current_timestamp
);

-- Enable Row Level Security (RLS) on submissions
alter table public.submissions enable row level security;

-- Allow anyone (even unauthenticated) to insert new submissions (uploads)
-- RIGHT
create policy "submissions_insert_public"
  on public.submissions
  for insert
  with check (true);


-- Allow reading approved items for everyone, and let owners read their own (unapproved) items
create policy "submissions_select_public_or_owner"
  on public.submissions
  for select using (
    approved = true               -- anyone can see approved listings
    OR auth.uid() = user_id       -- owners can see their own listings
  );

-- Allow owners to update their own submissions
create policy "submissions_update_owner"
  on public.submissions
  for update using (auth.uid() = user_id);

-- =========================================================================
-- 2. sales: records each successful purchase
-- =========================================================================
create table public.sales (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.submissions(id) on delete cascade,
  amount     numeric(10,2) not null check (amount >= 0),
  order_id   text not null,        -- PayPal order ID or similar
  created_at timestamptz not null default current_timestamp
);

-- Enable RLS and limit access to the owner of the item
alter table public.sales enable row level security;

-- Allow insertion of sales records (e.g., from your API) without requiring auth
create policy "sales_insert_any" on public.sales for insert
  with check (true);

-- Allow owners of the linked submission to view their sales
create policy "sales_select_owner"
  on public.sales
  for select using (
    exists (
      select 1 from public.submissions s
       where s.id = sales.item_id
         and s.user_id = auth.uid()
    )
  );

-- =========================================================================
-- 3. payout_requests: records payout requests from users
-- =========================================================================
create table public.payout_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(10,2) not null check (amount >= 0),
  method     text not null check (method in ('paypal', 'card')),
  details    jsonb not null,      -- stores PayPal email or masked card info
  status     text not null default 'pending',
  created_at timestamptz not null default current_timestamp
);

-- Enable RLS for payout requests
alter table public.payout_requests enable row level security;

-- Allow users to create payout requests for themselves
create policy "payout_insert_owner"
  on public.payout_requests
  for insert
  with check (auth.uid() = user_id);

-- Allow users to view their own payout requests
create policy "payout_select_owner"
  on public.payout_requests
  for select using (auth.uid() = user_id);

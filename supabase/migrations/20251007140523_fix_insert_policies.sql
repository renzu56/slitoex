-- Fix INSERT policies: use WITH CHECK instead of USING.

-- ---------- submissions ----------
drop policy if exists "submissions_insert_public" on public.submissions;

-- Option A: truly public inserts (no auth required)
create policy "submissions_insert_public"
  on public.submissions
  for insert
  with check (true);

-- If you prefer authenticated-only & self-owned rows, use this instead:
-- create policy "submissions_insert_owner_only"
--   on public.submissions
--   for insert
--   with check (auth.uid() = user_id);

-- SELECT: public can read approved; owners can read their own
drop policy if exists "submissions_select_public_or_owner" on public.submissions;
create policy "submissions_select_public_or_owner"
  on public.submissions
  for select
  using (approved = true OR auth.uid() = user_id);

-- UPDATE: owners can update their own
drop policy if exists "submissions_update_owner" on public.submissions;
create policy "submissions_update_owner"
  on public.submissions
  for update
  using (auth.uid() = user_id);

-- ---------- sales ----------
drop policy if exists "sales_insert_any" on public.sales;
create policy "sales_insert_any"
  on public.sales
  for insert
  with check (true);

drop policy if exists "sales_select_owner" on public.sales;
create policy "sales_select_owner"
  on public.sales
  for select
  using (
    exists (
      select 1 from public.submissions s
      where s.id = sales.item_id
        and s.user_id = auth.uid()
    )
  );

-- ---------- payout_requests ----------
drop policy if exists "payout_insert_owner" on public.payout_requests;
create policy "payout_insert_owner"
  on public.payout_requests
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "payout_select_owner" on public.payout_requests;
create policy "payout_select_owner"
  on public.payout_requests
  for select
  using (auth.uid() = user_id);

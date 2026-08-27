-- ============================================================
-- Player accounts & self-service profiles (Supabase Auth)
--
-- Adds the link between a Supabase Auth user and a player row, plus a
-- moderated "claim" queue: a player signs up, requests to claim an existing
-- player profile, and an admin approves before the account is linked. After
-- linking, the player may edit their own profile fields (via the backend,
-- which enforces which columns are editable).
-- ============================================================

-- Which auth account owns this player row (null until a claim is approved).
alter table players add column if not exists user_id uuid;
create index if not exists idx_players_user_id on players(user_id);

-- Pending/approved claims awaiting (or past) admin approval.
create table if not exists profile_claims (
  id           bigint generated always as identity primary key,
  user_id      uuid,               -- the Supabase Auth user making the claim
  email        text,               -- their login email (for admin context)
  player_name  text,               -- the player row they want to claim
  status       text default 'pending',   -- pending | approved | rejected
  created_at   timestamptz default now(),
  resolved_at  timestamptz,
  resolved_by  text                -- admin username who decided
);

-- Backend uses the service_role key (bypasses RLS); lock out anon/public.
alter table profile_claims enable row level security;

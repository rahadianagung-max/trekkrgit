-- Liga Trekkr consistency, step 2: one typed match ledger.
-- Applied to project ftkbankqixnwssfrbqyc on 2026-10-01 (migrations
-- match_ledger_from_venue_matches + match_ledger_harden).
--
-- venue_matches is already the table every source writes to (PlayRank,
-- tournaments, Ranked Event, imports, superadmin — from both the Trekkr and
-- TurnamenPadel backends). match_ledger mirrors it with typed columns and a
-- source classification, kept in sync by a trigger. Additive only: no existing
-- table, endpoint or code path changes. The trigger never blocks a
-- venue_matches write (errors become warnings).

create table if not exists public.match_ledger (
  id              bigserial primary key,
  venue_match_id  bigint not null unique,
  source          text   not null,          -- LIGA | PLAYRANK | TOURNAMENT | RANKED_EVENT | IMPORT | MANUAL | LEGACY | OTHER
  event_ref       text,                     -- tournament / RE event id when known
  venue           text,
  played_on       date,
  category        text,                     -- M | W | X | OTHER (from player genders)
  a1 text, a2 text, b1 text, b2 text,
  score_a         numeric,
  score_b         numeric,
  winner          text,                     -- A | B | DRAW | null (no score)
  source_raw      text,
  synced_at       timestamptz not null default now()
);
create index if not exists match_ledger_played_on_idx on public.match_ledger (played_on);
create index if not exists match_ledger_venue_idx on public.match_ledger (venue);
create index if not exists match_ledger_source_idx on public.match_ledger (source);
create index if not exists match_ledger_players_idx on public.match_ledger (lower(a1), lower(a2), lower(b1), lower(b2));

alter table public.match_ledger enable row level security;
revoke all on public.match_ledger from anon, authenticated;

create or replace function public.ledger_source(src text) returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(trim(src),'') = ''              then 'LEGACY'
    when src ilike 'Liga%'                        then 'LIGA'
    when src ilike 'Trekkr Tournament%'           then 'TOURNAMENT'
    when src ilike 'Trekkr Ranked Match%'
      or src ilike 'Trekkr Mexicano%'
      or src ilike 'Trekkr PlayRank%'             then 'PLAYRANK'
    when src ilike 'RE\_%'                        then 'RANKED_EVENT'
    when src ilike 'import%'                      then 'IMPORT'
    when src ilike 'superadmin%'                  then 'MANUAL'
    else 'OTHER' end $$;

create or replace function public.ledger_event_ref(src text) returns text language sql immutable set search_path = public as $$
  select coalesce(substring(src from '(EV_[A-Za-z0-9_]+)'), substring(src from 'RE_(RE_[A-Za-z0-9_]+)')) $$;

create or replace function public.ledger_num(t text) returns numeric language plpgsql immutable set search_path = public as $$
begin
  if t is null or trim(t) = '' then return null; end if;
  return trim(t)::numeric;
exception when others then return null;
end $$;

create or replace function public.ledger_date(t text) returns date language plpgsql immutable set search_path = public as $$
begin
  if t is null or trim(t) = '' then return null; end if;
  return left(trim(t), 10)::date;
exception when others then return null;
end $$;

create or replace function public.ledger_category(g1 text, g2 text, g3 text, g4 text) returns text language sql immutable set search_path = public as $$
  select case
    when upper(coalesce(g1,'')||coalesce(g2,'')||coalesce(g3,'')||coalesce(g4,'')) = 'MMMM' then 'M'
    when upper(coalesce(g1,'')||coalesce(g2,'')||coalesce(g3,'')||coalesce(g4,'')) = 'FFFF' then 'W'
    when upper(coalesce(g1,'')) <> upper(coalesce(g2,'')) and upper(coalesce(g3,'')) <> upper(coalesce(g4,''))
     and upper(coalesce(g1,'')||coalesce(g2,'')||coalesce(g3,'')||coalesce(g4,'')) ~ '^[MF]{4}$' then 'X'
    else 'OTHER' end $$;

create or replace function public.ledger_upsert_from_vm(vm public.venue_matches) returns void language plpgsql set search_path = public as $$
declare sa numeric := public.ledger_num(vm.score_t1); sb numeric := public.ledger_num(vm.score_t2);
begin
  insert into public.match_ledger as l (venue_match_id, source, event_ref, venue, played_on, category,
      a1, a2, b1, b2, score_a, score_b, winner, source_raw, synced_at)
  values (vm.id, public.ledger_source(vm.source_url), public.ledger_event_ref(vm.source_url), vm.venue,
      public.ledger_date(vm.date),
      public.ledger_category(vm.p1_team1_gender, vm.p2_team1_gender, vm.p1_team2_gender, vm.p2_team2_gender),
      nullif(trim(vm.p1_team1),''), nullif(trim(vm.p2_team1),''), nullif(trim(vm.p1_team2),''), nullif(trim(vm.p2_team2),''),
      sa, sb,
      case when sa is null or sb is null then null when sa > sb then 'A' when sb > sa then 'B' else 'DRAW' end,
      vm.source_url, now())
  on conflict (venue_match_id) do update set
      source = excluded.source, event_ref = excluded.event_ref, venue = excluded.venue, played_on = excluded.played_on,
      category = excluded.category, a1 = excluded.a1, a2 = excluded.a2, b1 = excluded.b1, b2 = excluded.b2,
      score_a = excluded.score_a, score_b = excluded.score_b, winner = excluded.winner,
      source_raw = excluded.source_raw, synced_at = now();
end $$;

create or replace function public.ledger_sync_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      delete from public.match_ledger where venue_match_id = old.id;
      return old;
    end if;
    perform public.ledger_upsert_from_vm(new);
  exception when others then
    raise warning 'match_ledger sync skipped for venue_matches id %: %', coalesce(new.id, old.id), sqlerrm;
  end;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke execute on function public.ledger_sync_trg() from public, anon, authenticated;
revoke execute on function public.ledger_upsert_from_vm(public.venue_matches) from public, anon, authenticated;

drop trigger if exists venue_matches_ledger_sync on public.venue_matches;
create trigger venue_matches_ledger_sync
  after insert or update or delete on public.venue_matches
  for each row execute function public.ledger_sync_trg();

-- Backfill every existing match (1,885 rows on 2026-10-01).
do $$ declare r public.venue_matches; begin
  for r in select * from public.venue_matches loop perform public.ledger_upsert_from_vm(r); end loop;
end $$;

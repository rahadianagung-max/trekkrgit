-- Player Passport audit (2026-10-06). Applied to project ftkbankqixnwssfrbqyc.
--
-- 1) player_tournament_history(names[]): tournaments a player actually played,
--    derived from recorded matches (Trekkr Tournament EV_* rows + imported
--    tournaments), with W/L and the event name from tournament_events or
--    tournament_archive. Read by getPlayerDetail → passport "Tournament history".
create or replace function public.player_tournament_history(p_names text[])
returns table(event_id text, event_name text, venue text, played_on date, matches int, wins int, losses int)
language sql stable set search_path = public as $$
  with names as (select distinct lower(regexp_replace(trim(n),'\s+',' ','g')) k from unnest(p_names) n where coalesce(trim(n),'')<>''),
  rows as (
    select vm.*, nullif(substring(vm.source_url from '(EV_[A-Za-z0-9_]+)'),'') ev,
      case when lower(regexp_replace(trim(vm.p1_team1),'\s+',' ','g')) in (select k from names) or lower(regexp_replace(trim(vm.p2_team1),'\s+',' ','g')) in (select k from names) then 1
           when lower(regexp_replace(trim(vm.p1_team2),'\s+',' ','g')) in (select k from names) or lower(regexp_replace(trim(vm.p2_team2),'\s+',' ','g')) in (select k from names) then 2 end side
    from venue_matches vm
    where (vm.source_url ilike 'Trekkr Tournament%' or vm.source_url ilike 'import%')
  ),
  mine as (select * from rows where side is not null),
  evname as (
    select te.event_id, te.name from tournament_events te
    union all
    select ta.event_id, ta.row_json::jsonb->>1 from tournament_archive ta where ta.source_tab='Tournament_Events'
  )
  select m.ev, coalesce((select min(e.name) from evname e where e.event_id=m.ev and coalesce(e.name,'')<>''), min(m.venue)),
         min(m.venue), min(ledger_date(m.date)), count(*)::int,
         count(*) filter (where (m.side=1 and ledger_num(m.score_t1)>ledger_num(m.score_t2)) or (m.side=2 and ledger_num(m.score_t2)>ledger_num(m.score_t1)))::int,
         count(*) filter (where (m.side=1 and ledger_num(m.score_t1)<ledger_num(m.score_t2)) or (m.side=2 and ledger_num(m.score_t2)<ledger_num(m.score_t1)))::int
  from mine m
  group by m.ev, case when m.ev is null then m.venue end
  order by min(ledger_date(m.date)) desc nulls last;
$$;
revoke execute on function public.player_tournament_history(text[]) from public, anon, authenticated;

-- 2) Data corrections applied once via execute_sql (recorded here for history):
--  a) 252 matches of 3 venue-less tournaments restored into venue_matches from
--     tournament_archive (venue = event name, source "Trekkr Tournament <EV>"):
--     HKBP Padel Tangerang Series (128), HKPI PADEL TOURNAMENT (60), NOMAGER TOURNEY (64).
--  b) 25 games of "PlayRank League – Kalbe Sport Padel FM" (live code wuaez8)
--     restored from live_sessions.data.history (W/L verified equal to ELO_Log).
--  c) 21 exact duplicate rows of the Patriot Padel Series 2026 import removed
--     (consecutive ids, identical match); copies kept in
--     public.venue_matches_dup_backup_20261006.

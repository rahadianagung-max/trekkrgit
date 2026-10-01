-- Liga Trekkr consistency, step 3 (shadow only): replay every recorded match
-- through one server-side ELO engine into public.elo_shadow, so it can be
-- compared with the live ELO_Log before anything is switched over.
-- Applied to project ftkbankqixnwssfrbqyc on 2026-10-01 (migrations
-- elo_shadow_replay + elo_shadow_run_fix + elo_shadow_actual_seed). Read-only toward live data: it
-- writes only elo_shadow. Nothing in api/sheet.js calls it.
--
-- Input = match_ledger (all 4 players + scores) UNION the 3 tournaments whose
-- matches only survive in tournament_archive (event_ids not in match_ledger).
-- Engine = exact port of rmCalcElo in api/sheet.js: team-average ELO,
-- margin 1+min(|diff|*0.04,0.3), K=60 while calibrating (n < p_calib), else
-- 40/32/24/20 by n; settled K damped by (1-0.6*opponent calibrating fraction);
-- JS Math.round; new players seeded at 1350.

create or replace view public.elo_shadow_input as
 select 'L'||ml.venue_match_id as ref, ml.played_on, 1 as src_rank, ml.venue_match_id::numeric as ord, ml.source,
        ml.a1, ml.a2, ml.b1, ml.b2, ml.score_a, ml.score_b
   from public.match_ledger ml
  where ml.a1 is not null and ml.a2 is not null and ml.b1 is not null and ml.b2 is not null
    and ml.score_a is not null and ml.score_b is not null
 union all
 select 'A'||m.id, (ev.j->>3)::date, 2, extract(epoch from (m.j->>15)::timestamptz), 'TOURNAMENT_ARCHIVE',
        ea.j->>2, ea.j->>4, eb.j->>2, eb.j->>4, public.ledger_num(m.j->>11), public.ledger_num(m.j->>12)
   from (select id, event_id, row_json::jsonb j from public.tournament_archive where source_tab='Tournament_Matches') m
   join (select event_id, row_json::jsonb j from public.tournament_archive where source_tab='Tournament_Events') ev on ev.event_id=m.event_id
   join (select event_id, row_json::jsonb j from public.tournament_archive where source_tab='Tournament_Entrants') ea on ea.event_id=m.event_id and ea.j->>1 = m.j->>9
   join (select event_id, row_json::jsonb j from public.tournament_archive where source_tab='Tournament_Entrants') eb on eb.event_id=m.event_id and eb.j->>1 = m.j->>10
  where upper(coalesce(m.j->>14,''))='DONE'
    and m.event_id not in (select distinct event_ref from public.match_ledger where event_ref is not null)
    and coalesce(ea.j->>2,'')<>'' and coalesce(ea.j->>4,'')<>'' and coalesce(eb.j->>2,'')<>'' and coalesce(eb.j->>4,'')<>'';

create table if not exists public.elo_shadow (
  player_key text primary key, name text, shadow_elo int, shadow_matches int,
  current_elo int, current_matches int, diff int, calib_matches int, run_at timestamptz not null default now()
);
alter table public.elo_shadow enable row level security;
revoke all on public.elo_shadow from anon, authenticated;
revoke all on public.elo_shadow_input from anon, authenticated;

drop function if exists public.elo_shadow_run(int);
create or replace function public.elo_shadow_run(p_calib int default 15, p_actual_seed boolean default true) returns int
language plpgsql set search_path = public as $$
declare
  m record; pk text[]; nm text[]; e int[]; n int[]; cal boolean[];
  i int; t1a numeric; t2a numeric; r1 numeric; ex1 numeric; mg numeric; kk numeric; frac numeric; d int; rr numeric; ee numeric;
  cnt int := 0;
begin
  create temp table if not exists _st (k text primary key, name text, elo int, n int) on commit drop;
  truncate _st;
  -- p_actual_seed: start each player at their real initial ELO (first ELO_Log row:
  -- new_elo - elo_change; level-based seeds 800/900/1200/1350/1500/1650/2100), so
  -- the diff isolates engine/ordering differences. false = everyone at 1350.
  if p_actual_seed then
    insert into _st (k, name, elo, n)
    select distinct on (lower(regexp_replace(trim(player),'\s+',' ','g')))
           lower(regexp_replace(trim(player),'\s+',' ','g')), trim(player),
           round(public.ledger_num(new_elo) - coalesce(public.ledger_num(elo_change),0))::int, 0
      from public.elo_log
     where coalesce(trim(player),'') <> '' and public.ledger_num(new_elo) is not null
     order by 1, id;
  end if;
  for m in select * from public.elo_shadow_input order by played_on nulls first, src_rank, ord loop
    nm := array[m.a1, m.a2, m.b1, m.b2];
    pk := array[lower(regexp_replace(trim(m.a1),'\s+',' ','g')), lower(regexp_replace(trim(m.a2),'\s+',' ','g')),
                lower(regexp_replace(trim(m.b1),'\s+',' ','g')), lower(regexp_replace(trim(m.b2),'\s+',' ','g'))];
    for i in 1..4 loop
      insert into _st as s (k, name, elo, n) values (pk[i], trim(nm[i]), 1350, 0) on conflict do nothing;
    end loop;
    select array_agg(s.elo order by x.o), array_agg(s.n order by x.o) into e, n
      from unnest(pk) with ordinality x(key, o) join _st s on s.k = x.key;
    cal := array[n[1] < p_calib, n[2] < p_calib, n[3] < p_calib, n[4] < p_calib];
    t1a := (e[1] + e[2]) / 2.0; t2a := (e[3] + e[4]) / 2.0;
    r1 := case when m.score_a > m.score_b then 1 when m.score_a < m.score_b then 0 else 0.5 end;
    mg := 1 + least(abs(m.score_a - m.score_b) * 0.04, 0.3);
    ex1 := 1 / (1 + power(10::numeric, (t2a - t1a) / 400));
    for i in 1..4 loop
      if i <= 2 then rr := r1; ee := ex1; frac := ((cal[3])::int + (cal[4])::int) / 2.0;
      else rr := 1 - r1; ee := 1 - ex1; frac := ((cal[1])::int + (cal[2])::int) / 2.0; end if;
      kk := (case when cal[i] then 60 when n[i] < 10 then 40 when n[i] < 30 then 32 when n[i] < 60 then 24 else 20 end) * mg;
      if not cal[i] then kk := kk * (1 - 0.6 * frac); end if;
      d := floor(kk * (rr - ee) + 0.5)::int;   -- JS Math.round
      update _st s set elo = s.elo + d, n = s.n + 1 where s.k = pk[i];
    end loop;
    cnt := cnt + 1;
  end loop;

  delete from public.elo_shadow;
  insert into public.elo_shadow (player_key, name, shadow_elo, shadow_matches, current_elo, current_matches, diff, calib_matches)
  select coalesce(s.k, c.k), coalesce(c.name, s.name), s.elo, s.n, c.elo, c.n,
         case when s.elo is not null and c.elo is not null then s.elo - c.elo end, p_calib
  from _st s
  full join (
    select lower(regexp_replace(trim(player),'\s+',' ','g')) k, max(player) name,
      (array_agg(round(public.ledger_num(new_elo))::int order by id desc))[1] elo,
      sum(coalesce(public.ledger_num(wins),0) + coalesce(public.ledger_num(losses),0))::int n
    from public.elo_log where coalesce(trim(player),'') <> '' group by 1
  ) c on c.k = s.k;
  return cnt;
end $$;
revoke execute on function public.elo_shadow_run(int, boolean) from public, anon, authenticated;

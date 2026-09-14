-- ============================================================
-- Trekkr → Supabase migration
-- Group 13: Eligibility match RPC (anti-ringer / anti-sandbagging)
--
-- Fuzzy-matches setiap nama peserta yang dikirim panitia ke database Trekkr
-- (elo_log untuk ELO terakhir + total menang/kalah/sesi, players untuk winner_at
-- & riwayat turnamen, calibration_flags untuk flag sandbagging). Dipakai oleh
-- endpoint POST /api/eligibility (fungsi eligibilityCheck di api/sheet.js) yang
-- lalu menghitung skor risiko per pemain. Read-only: tidak mengubah data apa pun.
--
-- Butuh ekstensi pg_trgm untuk similarity(). Dijalankan server (service key).
-- ============================================================

create extension if not exists pg_trgm;

create or replace function public.eligibility_match(p_names text[])
 returns table(input text, trekkr_name text, sim real, elo integer, wins integer, losses integer, sessions integer, winner_at text, tournaments text, calibration text)
 language sql
 stable
as $function$
  with inp as (select unnest(p_names) as input),
  norm as (select input, lower(regexp_replace(trim(input),'\s+',' ','g')) as n from inp),
  elo as (
    select distinct on (lower(regexp_replace(trim(player),'\s+',' ','g')))
      lower(regexp_replace(trim(player),'\s+',' ','g')) as n, round(new_elo::numeric)::int as elo
    from elo_log order by 1, timestamp desc
  ),
  tot as (
    select lower(regexp_replace(trim(player),'\s+',' ','g')) as n,
      sum(wins::numeric)::int as w, sum(losses::numeric)::int as l,
      count(*) filter (where session_id <> 'INITIAL') as s
    from elo_log group by 1
  )
  select nm.input, m.name, m.s,
    e.elo, t.w, t.l, t.s,
    m.winner_at, m.tournaments, cf.reason
  from norm nm
  cross join lateral (
    select p.name,
      nullif(p.winner_at,'') as winner_at,
      case when p.tournaments is not null and p.tournaments not in ('','[]') then left(p.tournaments,200) end as tournaments,
      similarity(lower(regexp_replace(trim(p.name),'\s+',' ','g')), nm.n) as s
    from players p
    order by s desc
    limit 1
  ) m
  left join elo e on e.n = lower(regexp_replace(trim(m.name),'\s+',' ','g'))
  left join tot t on t.n = lower(regexp_replace(trim(m.name),'\s+',' ','g'))
  left join lateral (
    select reason from calibration_flags c
    where lower(regexp_replace(trim(c.player),'\s+',' ','g')) = lower(regexp_replace(trim(m.name),'\s+',' ','g'))
    order by created_at desc limit 1
  ) cf on true;
$function$;

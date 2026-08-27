-- ============================================================
-- Trekkr → Supabase migration
-- Group 1: Pemain & Rating (Players, ELO_Log, Player_Auth, Claims)
--
-- Strategy: "lift-and-shift" — setiap tab di Google Sheet dibuat ulang
-- sebagai tabel di Supabase. Semua kolom dibuat bertipe TEXT dulu supaya
-- pemindahan data 100% aman & tidak ada yang hilang (persis seperti Sheet
-- yang menyimpan semuanya sebagai teks). Nanti bisa diperketat tipenya.
-- Setiap tabel diberi 1 kolom "id" otomatis sebagai kunci utama.
-- ============================================================

-- Players (Sheet tab: Players, kolom A..L)
create table if not exists players (
  id            bigint generated always as identity primary key,
  name          text,
  ig            text,
  verified      text,
  display_name  text,
  gender        text,
  region        text,
  photo_url     text,
  clubs         text,
  created_at    text,
  winner_at     text,
  tournaments   text,
  claim_email   text
);

-- ELO_Log (Sheet tab: ELO_Log, kolom A..G)
-- Kontrak field ELO tetap: player / new_elo / elo_change
create table if not exists elo_log (
  id          bigint generated always as identity primary key,
  session_id  text,
  player      text,
  new_elo     text,
  elo_change  text,
  wins        text,
  losses      text,
  timestamp   text
);

-- Player_Auth (Sheet tab: Player_Auth, kolom A..K)
create table if not exists player_auth (
  id             bigint generated always as identity primary key,
  email          text,
  player_name    text,
  password_hash  text,
  salt           text,
  status         text,
  token          text,
  token_exp      text,
  token_type     text,
  is_claim       text,
  created_at     text,
  last_login     text
);

-- Claims (Sheet tab: Claims, kolom A..E)
create table if not exists claims (
  id          bigint generated always as identity primary key,
  name        text,
  ig          text,
  session_id  text,
  status      text,
  created_at  text
);

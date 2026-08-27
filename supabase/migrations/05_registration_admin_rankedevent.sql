-- ============================================================
-- Group 5: Pendaftaran + Admin + Ranked Event
-- reg_forms, registrations, edit_requests, admins,
-- re_events, re_players, re_waves, re_matches
-- Same lift-and-shift strategy (all-text columns + id PK).
--
-- Catatan: kolom config (reg_forms) & data (registrations) menyimpan
-- teks JSON — dibiarkan bertipe text supaya aman saat pindah data.
-- ============================================================

-- RegForms (Sheet tab: RegForms, kolom A..G)
create table if not exists reg_forms (
  id                 bigint generated always as identity primary key,
  form_id            text,
  name               text,
  status             text,
  linked_tournament  text,
  config             text,
  created_at         text,
  updated_at         text
);

-- Registrations (Sheet tab: Registrations, kolom A..K)
create table if not exists registrations (
  id                  bigint generated always as identity primary key,
  reg_id              text,
  form_id             text,
  timestamp           text,
  name                text,
  gender              text,
  phone               text,
  photo_url           text,
  payment_proof_url   text,
  data                text,
  linked_tournament   text,
  status              text
);

-- Edit_Requests (Sheet tab: Edit_Requests, kolom A..L)
create table if not exists edit_requests (
  id            bigint generated always as identity primary key,
  request_id    text,
  player_name   text,
  display_name  text,
  ig            text,
  photo_url     text,
  status        text,
  created_at    text,
  resolved_at   text,
  email         text,
  gender        text,
  type          text,
  region        text
);

-- Admins (Sheet tab: Admins, kolom A..E) — data sensitif (auth)
create table if not exists admins (
  id          bigint generated always as identity primary key,
  username    text,
  password    text,
  role        text,
  venue       text,
  created_at  text
);

-- RE_Events (Ranked Event) — Sheet tab: RE_Events
create table if not exists re_events (
  id             bigint generated always as identity primary key,
  event_id       text,
  name           text,
  venue          text,
  date           text,
  start_time     text,
  status         text,
  phase          text,
  courts         text,
  match_minutes  text,
  p1_waves       text,
  p2_waves       text,
  current_wave   text,
  created_at     text,
  category       text
);

-- RE_Players — Sheet tab: RE_Players
create table if not exists re_players (
  id          bigint generated always as identity primary key,
  event_id    text,
  player_id   text,
  name        text,
  canonical   text,
  start_elo   text,
  tier        text,
  claimed_at  text,
  status      text,
  level       text,
  gender      text
);

-- RE_Waves — Sheet tab: RE_Waves
create table if not exists re_waves (
  id          bigint generated always as identity primary key,
  event_id    text,
  wave        text,
  phase       text,
  start_time  text,
  status      text,
  rest_ids    text
);

-- RE_Matches — Sheet tab: RE_Matches
create table if not exists re_matches (
  id          bigint generated always as identity primary key,
  event_id    text,
  match_id    text,
  wave        text,
  phase       text,
  tier        text,
  court       text,
  a1          text,
  a2          text,
  b1          text,
  b2          text,
  score_a     text,
  score_b     text,
  status      text,
  scorer      text,
  updated_at  text
);

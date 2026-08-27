-- ============================================================
-- Group 4: Turnamen
-- competitions, tracked_events, tournament_leads,
-- tournament_events, tournaments, tournament_entrants,
-- tournament_groups, tournament_matches, form_responses
-- Same lift-and-shift strategy (all-text columns + id PK).
--
-- Catatan: tab League_Series ada di daftar tapi belum dipakai di kode
-- (kolom belum terdefinisi), jadi ditunda ke langkah pindah-data.
-- ============================================================

-- Competitions (Sheet tab: Competitions)
create table if not exists competitions (
  id            bigint generated always as identity primary key,
  slug          text,
  type          text,
  source_venue  text,
  name          text,
  location      text,
  logo_url      text,
  status        text
);

-- Tracked_Events (Sheet tab: Tracked_Events)
create table if not exists tracked_events (
  id          bigint generated always as identity primary key,
  month_year  text,
  name        text,
  location    text,
  logo_url    text,
  url         text
);

-- Tournament_Leads (Sheet tab: Tournament_Leads)
create table if not exists tournament_leads (
  id               bigint generated always as identity primary key,
  lead_id          text,
  timestamp        text,
  tournament_name  text,
  location         text,
  pic_name         text,
  phone            text,
  email            text,
  message          text,
  status           text
);

-- Tournament_Events (Sheet tab: Tournament_Events)
create table if not exists tournament_events (
  id             bigint generated always as identity primary key,
  event_id       text,
  name           text,
  venue          text,
  date           text,
  start_time     text,
  num_courts     text,
  match_minutes  text,
  created_at     text
);

-- Tournaments (Sheet tab: Tournaments)
create table if not exists tournaments (
  id                    bigint generated always as identity primary key,
  tournament_id         text,
  event_id              text,
  category              text,
  level                 text,
  format                text,
  group_size_target     text,
  advancers_per_group   text,
  status                text,
  admin_username        text,
  created_at            text
);

-- Tournament_Entrants (Sheet tab: Tournament_Entrants)
create table if not exists tournament_entrants (
  id            bigint generated always as identity primary key,
  tournament_id text,
  entrant_id    text,
  player1_name  text,
  player1_ig    text,
  player2_name  text,
  player2_ig    text,
  seed_elo      text,
  is_new_p1     text,
  is_new_p2     text,
  created_at    text
);

-- Tournament_Groups (Sheet tab: Tournament_Groups)
create table if not exists tournament_groups (
  id            bigint generated always as identity primary key,
  tournament_id text,
  category      text,
  group_label   text,
  entrant_id    text,
  player1_name  text,
  player2_name  text,
  seed_elo      text
);

-- Tournament_Matches (Sheet tab: Tournament_Matches)
create table if not exists tournament_matches (
  id             bigint generated always as identity primary key,
  tournament_id  text,
  match_id       text,
  stage          text,
  group_label    text,
  bracket        text,
  round          text,
  court          text,
  slot_index     text,
  scheduled_time text,
  entrant_a      text,
  entrant_b      text,
  score_a        text,
  score_b        text,
  winner         text,
  status         text,
  updated_at     text
);

-- Form_Responses (Sheet tab: Form_Responses)
create table if not exists form_responses (
  id            bigint generated always as identity primary key,
  timestamp     text,
  category      text,
  player1_name  text,
  player1_ig    text,
  player2_name  text,
  player2_ig    text,
  contact_wa    text
);

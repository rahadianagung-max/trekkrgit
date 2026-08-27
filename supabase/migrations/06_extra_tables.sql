-- ============================================================
-- Group 6: Tabel tambahan yang ada di Google Sheet asli tapi belum
-- terdaftar di kode (api/sheet.js), plus perbaikan tournament_leads.
-- Same lift-and-shift strategy (all-text columns + id PK).
-- ============================================================

-- tournament_leads: skema di kode berbeda dari Sheet asli. Tabel lama
-- (dari Group 4) masih kosong, jadi aman dibuat ulang sesuai Sheet.
drop table if exists tournament_leads;
create table tournament_leads (
  id               bigint generated always as identity primary key,
  timestamp        text,
  name             text,
  whatsapp         text,
  email            text,
  tournament_date  text,
  participants     text,
  category         text,
  venue            text,
  city             text,
  package          text,
  notes            text,
  status           text,
  tournament_days  text,
  hours_per_day    text,
  courts           text
);

-- ClaimRequests (Sheet tab: ClaimRequests)
create table if not exists claim_requests (
  id          bigint generated always as identity primary key,
  claim_id    text,
  player      text,
  name        text,
  whatsapp    text,
  ig          text,
  type        text,
  status      text,
  created_at  text
);

-- Calculator_Leads (Sheet tab: Calculator_Leads)
create table if not exists calculator_leads (
  id          bigint generated always as identity primary key,
  timestamp   text,
  lead_id     text,
  name        text,
  email       text,
  source      text,
  user_agent  text,
  status      text
);

-- Calculator_Results (Sheet tab: Calculator_Results)
create table if not exists calculator_results (
  id                        bigint generated always as identity primary key,
  timestamp                 text,
  lead_id                   text,
  name                      text,
  email                     text,
  mode                      text,
  format_priority           text,
  input_unit                text,
  target_pairs              text,
  hours_available           text,
  courts                    text,
  court_rate_per_hour       text,
  total_pairs               text,
  total_players             text,
  categories_count          text,
  categories_detail         text,
  total_matches             text,
  total_duration_min        text,
  total_duration_label      text,
  court_hours_optimal       text,
  court_hours_optimal_2     text,
  estimated_court_cost      text,
  potential_saving          text,
  has_bye                   text,
  options_considered        text,
  services_requested        text,
  interested_in_management  text,
  status                    text
);

-- Draw_Log (Sheet tab: Draw_Log)
create table if not exists draw_log (
  id             bigint generated always as identity primary key,
  timestamp      text,
  draw_id        text,
  tournament_id  text,
  n              text,
  pot            text,
  group_label    text,
  pair_id        text,
  at_time        text
);

-- Tournament_Archive (Sheet tab: Tournament_Archive) — 1.395 baris arsip
create table if not exists tournament_archive (
  id           bigint generated always as identity primary key,
  archived_at  text,
  event_id     text,
  source_tab   text,
  row_json     text
);

-- Banners (Sheet tab: Banners) — "order" kata khusus SQL, pakai display_order
create table if not exists banners (
  id            bigint generated always as identity primary key,
  display_order text,
  active        text,
  tag           text,
  title         text,
  subtitle      text,
  cta_label     text,
  target_url    text
);

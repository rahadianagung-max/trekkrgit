-- ============================================================
-- Group 3: Venue (Venues, Venue_Leads, + gabungan tab Venue_*)
-- Same lift-and-shift strategy (all-text columns + id PK).
--
-- Catatan: di Google Sheet, hasil match tiap venue ada di tab terpisah
-- (Venue_<Nama>). Di sini semuanya digabung ke satu tabel `venue_matches`
-- dengan tambahan kolom `venue` untuk membedakan asal venue-nya.
-- ============================================================

-- Venues directory (Sheet tab: Venues, kolom A..I)
create table if not exists venues (
  id           bigint generated always as identity primary key,
  name         text,
  location     text,
  region       text,
  schedule     text,
  prize_pool   text,
  contact      text,
  logo_url     text,
  created_at   text,
  register_url text
);

-- Venue_Leads (Sheet tab: Venue_Leads, kolom A..H)
create table if not exists venue_leads (
  id               bigint generated always as identity primary key,
  lead_id          text,
  timestamp        text,
  pic_name         text,
  venue_community  text,
  region           text,
  whatsapp         text,
  email            text,
  status           text
);

-- Venue match results — gabungan dari semua tab Venue_<Nama> (kolom A..M),
-- ditambah kolom `venue` untuk menandai venue asal tiap baris.
create table if not exists venue_matches (
  id                bigint generated always as identity primary key,
  venue             text,
  week              text,
  date              text,
  p1_team1          text,
  p2_team1          text,
  p1_team2          text,
  p2_team2          text,
  score_t1          text,
  score_t2          text,
  p1_team1_gender   text,
  p2_team1_gender   text,
  p1_team2_gender   text,
  p2_team2_gender   text,
  source_url        text
);

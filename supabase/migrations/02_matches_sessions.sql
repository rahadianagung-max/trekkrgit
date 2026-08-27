-- ============================================================
-- Group 2: Main & Sesi (Sessions, PlayRank_Active, Schedule)
-- Same lift-and-shift strategy as Group 1 (all-text columns + id PK).
-- ============================================================

-- Sessions (Sheet tab: Sessions, kolom A..I)
create table if not exists sessions (
  id            bigint generated always as identity primary key,
  session_id    text,
  session_name  text,
  source_url    text,
  format        text,
  sub_format    text,
  venue         text,
  player_count  text,
  match_count   text,
  created_at    text
);

-- PlayRank_Active (Sheet tab: PlayRank_Active, kolom A..M)
create table if not exists playrank_active (
  id          bigint generated always as identity primary key,
  event_id    text,
  title       text,
  venue       text,
  level       text,
  gender      text,
  format      text,
  week_start  text,
  week_end    text,
  status      text,
  players     text,
  leader      text,
  url         text,
  highlight   text
);

-- Schedule (Sheet tab: Schedule, kolom A..N)
create table if not exists schedule (
  id                bigint generated always as identity primary key,
  sched_id          text,
  type              text,
  venue             text,
  area              text,
  date              text,
  start_time        text,
  end_time          text,
  courts            text,
  capacity          text,
  booked            text,
  price_per_player  text,
  status            text,
  whatsapp_url      text,
  note              text
);

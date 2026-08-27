-- ============================================================
-- Group 7: Penyesuaian skema agar cocok dengan yang DIPAKAI kode
-- (api/sheet.js). Beberapa tab di sheet berkembang melebihi header
-- aslinya; kita samakan supaya tidak ada fitur yang jebol.
-- ============================================================

-- 1) Tournament_Events: kode membaca/menulis kolom A..M (13), bukan A..H (8).
--    Tambahkan 5 kolom yang hilang. (Tabel ini kosong, jadi aman.)
alter table tournament_events add column if not exists status   text;
alter table tournament_events add column if not exists format   text;
alter table tournament_events add column if not exists category text;
alter table tournament_events add column if not exists url      text;
alter table tournament_events add column if not exists highlight text;

-- 2) Tournament_Leads: tabel hasil migrasi (15 kolom) berasal dari form
--    turnamenpadel/Google Form — BEDA dari yang dipakai kode Trekkr.
--    Simpan data lama sebagai *_legacy, lalu buat tabel baru sesuai kode.
alter table if exists tournament_leads rename to tournament_leads_legacy;

create table tournament_leads (
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

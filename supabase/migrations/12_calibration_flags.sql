-- ============================================================
-- Trekkr → Supabase migration
-- Group 12: Calibration flags (PlayRank Step 5)
--
-- Menyimpan flag pemain yang performanya dominan saat window kalibrasi
-- (indikasi salah-seed / sandbagging) supaya admin bisa review / re-seed lebih
-- awal. Diisi server saat saveSession (jalur server-authoritative), dedup per
-- pemain selama status masih 'open'. Diakses server (service key); RLS aktif.
-- ============================================================

create table if not exists calibration_flags (
  id          bigint generated always as identity primary key,
  player      text,
  reason      text,          -- mis. 'dominant-calibration'
  gain        text,          -- kenaikan ELO dari ELO pertama
  win_rate    text,          -- persen kemenangan karier (0..100)
  matches     text,          -- jumlah match karier saat di-flag
  elo         text,          -- ELO saat di-flag
  status      text default 'open',   -- 'open' | 'resolved'
  created_at  timestamptz default now()
);

alter table calibration_flags enable row level security;
